-- 0015 — Phase 6B follow-up: pg-safeupdate compatibility for post_journal.
--
-- Hosted Supabase enables pg-safeupdate, which rejects the unconditional
--   delete from pg_temp.ledger_post_lines;
-- inside post_journal (0005). The hosted deposit/adjustment paths hit
-- "DELETE requires a WHERE clause" — a hosted-only failure invisible to the
-- embedded-PG verifier. This is an identical redefinition with a WHERE true
-- clause; no semantics change.

create or replace function public.post_journal(
  p_journal_type        public.journal_type,
  p_currency            public.currency_code,
  p_lines               jsonb,
  p_reference           text default null,
  p_idempotency_key     text default null,
  p_entity_type         text default null,
  p_entity_id           text default null,
  p_actor_kind          text default 'SYSTEM',
  p_initiated_by        uuid default null,
  p_request_id          text default null,
  p_description         text default '',
  p_metadata            jsonb default '{}'::jsonb,
  p_reverses_journal_id uuid default null
)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_j          public.journal_entries;
  v_line       record;
  v_key        text;
  v_owner      uuid;
  v_bucket     public.wallet_bucket;
  v_syskind    public.system_account_kind;
  v_account_id uuid;
  v_uid        uuid;
  v_delta      bigint;
  v_col        text;
  v_after      bigint;
  v_n          int;
  v_dr         bigint;
  v_cr         bigint;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency_key is required';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'p_lines must be a JSON array of at least 2 lines';
  end if;

  -- single-authority flag: wallets may only be written from here on
  perform set_config('app.ledger_posting', '1', true);

  -- Idempotent header insert. A retry (same key) returns the committed
  -- journal without re-posting a single line.
  insert into public.journal_entries
    (reference, idempotency_key, journal_type, currency, reverses_journal_id,
     entity_type, entity_id, initiated_by, actor_kind, request_id, description, metadata)
  values (
    coalesce(p_reference, 'JRN-' || upper(substr(md5(gen_random_uuid()::text), 1, 12))),
    p_idempotency_key, p_journal_type, p_currency, p_reverses_journal_id,
    p_entity_type, p_entity_id, p_initiated_by, p_actor_kind, p_request_id,
    p_description, p_metadata)
  on conflict (idempotency_key) do nothing
  returning * into v_j;

  if v_j.id is null then
    select * into v_j from public.journal_entries where idempotency_key = p_idempotency_key;
    return v_j;  -- replay: one financial effect, committed once
  end if;

  -- Staging for resolved lines (transaction-scoped).
  create temp table if not exists pg_temp.ledger_post_lines (
    seq         bigint generated always as identity,
    account_id  uuid not null,
    kind        public.ledger_account_kind not null,
    owner       uuid,
    bucket      public.wallet_bucket,
    syskind     public.system_account_kind,
    direction   public.entry_direction not null,
    amount_minor bigint not null
  ) on commit drop;
  -- pg-safeupdate: a bare DELETE without WHERE is rejected on hosted.
  delete from pg_temp.ledger_post_lines where true;

  -- Resolve + lazily provision accounts; keys are logical (no currency) —
  -- the journal currency selects the account, so cross-currency lines are
  -- structurally unreachable.
  for v_line in
    select * from jsonb_to_recordset(p_lines)
      as x(account_key text, direction public.entry_direction, amount_minor bigint)
  loop
    if v_line.amount_minor is null or v_line.amount_minor <= 0 then
      raise exception 'ledger amounts must be positive integers';
    end if;

    if v_line.account_key ~* '^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(available|reserved|bonus|pending)$' then
      v_owner   := split_part(v_line.account_key, ':', 2)::uuid;
      v_bucket  := upper(split_part(v_line.account_key, ':', 3))::public.wallet_bucket;
      v_syskind := null;
      v_key     := 'user:' || v_owner::text || ':' || lower(v_bucket::text) || ':' || p_currency::text;
      insert into public.ledger_accounts (key, kind, owner_user_id, bucket, currency)
        values (v_key, 'USER', v_owner, v_bucket, p_currency)
        on conflict (key) do nothing;
      select id into v_account_id from public.ledger_accounts where key = v_key;
    elsif v_line.account_key ~* '^system:[a-z_]+$' then
      v_syskind := upper(split_part(v_line.account_key, ':', 2))::public.system_account_kind;
      v_key     := 'system:' || lower(v_syskind::text) || ':' || p_currency::text;
      select id into v_account_id from public.ledger_accounts where key = v_key;
      if v_account_id is null then
        raise exception 'unknown system account: %', v_key;
      end if;
      v_owner := null; v_bucket := null;
    else
      raise exception 'invalid account key: %', v_line.account_key;
    end if;

    insert into pg_temp.ledger_post_lines
      (account_id, kind, owner, bucket, syskind, direction, amount_minor)
    values
      (v_account_id, case when v_owner is null then 'SYSTEM'::public.ledger_account_kind else 'USER'::public.ledger_account_kind end,
       v_owner, v_bucket, v_syskind, v_line.direction, v_line.amount_minor);
  end loop;

  -- Early balance check (deferred trigger re-verifies at COMMIT).
  select count(*),
         coalesce(sum(amount_minor) filter (where direction = 'DEBIT'), 0),
         coalesce(sum(amount_minor) filter (where direction = 'CREDIT'), 0)
    into v_n, v_dr, v_cr
    from pg_temp.ledger_post_lines;
  if v_dr <> v_cr then
    raise exception 'journal is unbalanced: DR % <> CR %', v_dr, v_cr;
  end if;

  -- Journal-type shape gate: balanced ≠ valid.
  perform public.assert_journal_shape(p_journal_type, p_reverses_journal_id, v_j.id);

  -- Wallet provisioning + serialization: lock the (user,currency) row for
  -- the rest of this transaction; concurrent postings queue here.
  select owner into v_uid from pg_temp.ledger_post_lines where owner is not null limit 1;
  if v_uid is not null then
    insert into public.wallets (user_id, currency)
      values (v_uid, p_currency)
      on conflict (user_id, currency) do nothing;
    perform 1 from public.wallets
      where user_id = v_uid and currency = p_currency
      for update;
  end if;

  -- Apply lines in caller order: USER lines move bucket columns and record
  -- the post-line snapshot; SYSTEM lines are contra-only.
  for v_line in select * from pg_temp.ledger_post_lines order by seq loop
    v_after := null;
    if v_line.kind = 'USER' then
      v_col   := lower(v_line.bucket::text) || '_minor';
      v_delta := case when v_line.direction = 'CREDIT'
                      then v_line.amount_minor else -v_line.amount_minor end;
      execute format(
        'update public.wallets set %I = %I + $1 where user_id = $2 and currency = $3 returning %I',
        v_col, v_col, v_col)
        using v_delta, v_uid, p_currency
        into v_after;  -- CHECK >= 0 rejects insufficient funds
    end if;
    insert into public.ledger_entries
      (journal_id, account_id, direction, amount_minor, balance_after_minor)
    values
      (v_j.id, v_line.account_id, v_line.direction, v_line.amount_minor, v_after);
  end loop;

  return v_j;
end;
$$;
