-- RentBrown V2 — Phase 10A: Bachs deposit RPC surface.
-- Adds currency support to request_deposit (Bachs collects USD; Paystack/
-- KoraPay remain NGN-only) and extends deposit_options with per-currency
-- provider visibility. Provider webhook + init live in Edge Functions; every
-- monetary decision stays server-side.

-- ── request_deposit (authenticated) ─────────────────────────────────────────
-- Supersedes request_deposit(bigint, payment_provider, text, text) from 0008 —
-- same semantics plus p_currency. Clients retry on the same idempotency key.

drop function public.request_deposit(bigint, public.payment_provider, text, text);

create or replace function public.request_deposit(
  p_amount_minor    bigint,
  p_provider        public.payment_provider,
  p_currency        public.currency_code,
  p_idempotency_key text,
  p_request_id      text default null
)
returns public.deposits
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid;
  v_min   numeric;
  v_max   numeric;
  v_exp   numeric;
  v_dep   public.deposits;
  v_status text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'authentication required';
  end if;
  select account_status into v_status from public.profiles where id = v_uid;
  if v_status is distinct from 'ACTIVE' then
    raise exception 'account is not active';
  end if;

  -- Provider → currency corridors. Paystack/KoraPay remain NGN-only (D-5.8);
  -- Bachs is the USD rail (USD card + supported crypto corridors settle to
  -- the USD wallet — no cross-currency crediting).
  if p_provider in ('PAYSTACK','KORAPAY') and p_currency <> 'NGN' then
    raise exception 'ERR_CURRENCY: provider % supports NGN deposits only', p_provider;
  end if;
  if p_provider = 'BACHS' and p_currency <> 'USD' then
    raise exception 'ERR_CURRENCY: provider % supports USD deposits only', p_provider;
  end if;
  if not public.config_bool('payment.provider.' || lower(p_provider::text) || '.enabled') then
    raise exception 'provider % is not available', p_provider;
  end if;

  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'ERR_AMOUNT: amount must be a positive integer minor-unit value';
  end if;
  v_min := public.config_number('deposit.min_minor.' || p_currency::text);
  if v_min is not null and p_amount_minor < v_min then
    raise exception 'ERR_AMOUNT: minimum deposit is % minor units', v_min;
  end if;
  -- Optional cap: enforced only when configured active (no invented default).
  v_max := public.config_number('payment.deposit.max_minor');
  if v_max is not null and p_amount_minor > v_max then
    raise exception 'ERR_AMOUNT: maximum deposit is % minor units', v_max;
  end if;

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency_key is required';
  end if;

  perform set_config('app.deposit_write', '1', true);

  -- Optional expiry window — set only when configured.
  v_exp := public.config_number('payment.deposit.expiry_minutes');

  insert into public.deposits
    (reference, idempotency_key, user_id, currency, amount_minor, provider,
     request_id, expires_at, initiated_at)
  values (
    'DEP-' || upper(substr(md5(gen_random_uuid()::text), 1, 12)),
    'dep:init:' || v_uid::text || ':' || p_idempotency_key,
    v_uid, p_currency, p_amount_minor, p_provider, p_request_id,
    case when v_exp is not null then now() + (v_exp || ' minutes')::interval end,
    now())
  on conflict (idempotency_key) do nothing
  returning * into v_dep;

  if v_dep.id is null then
    select * into v_dep from public.deposits
      where idempotency_key = 'dep:init:' || v_uid::text || ':' || p_idempotency_key;
    return v_dep;  -- client retry converges to the same deposit
  end if;

  insert into public.deposit_events
    (deposit_id, from_status, to_status, source, request_id, note)
  values (v_dep.id, null, 'INITIATED', 'USER', p_request_id, 'deposit requested');

  return v_dep;
end;
$$;

revoke execute on function public.request_deposit(bigint, public.payment_provider, public.currency_code, text, text) from public, anon;
grant  execute on function public.request_deposit(bigint, public.payment_provider, public.currency_code, text, text) to authenticated;

-- ── deposit_options (authenticated) ─────────────────────────────────────────
-- Supersedes 0011: adds BACHS + a per-currency view so the UI can offer the
-- USD rail only when the provider is enabled. Existing keys are unchanged for
-- backwards compatibility with already-deployed clients.

create or replace function public.deposit_options()
returns jsonb language plpgsql stable security definer
set search_path = public
as $$
declare
  v_min_ngn bigint;
  v_min_usd bigint;
  v_max     int;
  v_exp     int;
  v_paystack boolean;
  v_korapay  boolean;
  v_bachs    boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  v_min_ngn := public.config_number('deposit.min_minor.NGN');
  v_min_usd := public.config_number('deposit.min_minor.USD');

  select case when jsonb_typeof(value) = 'number' then (value#>>'{}')::bigint else null end
    into v_max
    from public.admin_config
   where key = 'payment.deposit.max_minor' and is_active;

  select case when jsonb_typeof(value) = 'number' then (value#>>'{}')::int else null end
    into v_exp
    from public.admin_config
   where key = 'payment.deposit.expiry_minutes' and is_active;

  v_paystack := public.config_bool('payment.provider.paystack.enabled');
  v_korapay  := public.config_bool('payment.provider.korapay.enabled');
  v_bachs    := public.config_bool('payment.provider.bachs.enabled');

  return jsonb_build_object(
    'currency',        'NGN',
    'min_minor',       v_min_ngn,
    'max_minor',       v_max,
    'expiry_minutes',  v_exp,
    'providers',       jsonb_build_object(
      'PAYSTACK', v_paystack,
      'KORAPAY',  v_korapay,
      'BACHS',    v_bachs),
    -- Per-currency corridor map: provider id → enabled for that currency.
    'currencies', jsonb_build_object(
      'NGN', jsonb_build_object(
        'min_minor', v_min_ngn,
        'providers', jsonb_build_object('PAYSTACK', v_paystack, 'KORAPAY', v_korapay)),
      'USD', jsonb_build_object(
        'min_minor', v_min_usd,
        'providers', jsonb_build_object('BACHS', v_bachs))));
end $$;

comment on function public.deposit_options() is
  'Non-secret deposit init options for the investor UI: provider enablement,
   per-currency corridors and limits. Phase 5B + Phase 10A (Bachs USD rail).';
