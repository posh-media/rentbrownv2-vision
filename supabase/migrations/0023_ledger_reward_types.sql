-- 0023 — Phase 9B part 2: ledger enum + shape extensions for rewards.
--
--   journal_type        += REWARD_REVERSAL, REWARD_RECOVERY
--   system_account_kind += REWARD_RECEIVABLE
--
-- Shape relaxations (Phase 9A §ledger integration):
--   HOLD          user debit legs may now include BONUS (reward-funded
--                 withdrawals/investments); credit leg stays RESERVED.
--   HOLD_RELEASE  mirror — credit legs may include BONUS.
--   REWARD_REVERSAL  clawback of issued reward value: CR REWARD_EXPENSE funded
--                 by DR BONUS and/or AVAILABLE (value still held) and/or
--                 DR REWARD_RECEIVABLE (value already spent → debt).
--   REWARD_RECOVERY  settle a receivable: DR BONUS/AVAILABLE, CR RECEIVABLE.
--
-- The REWARD_RECEIVABLE system account rows are seeded in 0024 — a freshly
-- added enum value cannot be used inside the same transaction that adds it.

alter type public.journal_type add value 'REWARD_REVERSAL';
alter type public.journal_type add value 'REWARD_RECOVERY';
alter type public.system_account_kind add value 'REWARD_RECEIVABLE';

-- ── assert_journal_shape — relaxed holds + reward reversal shapes ────────────

create or replace function public.assert_journal_shape(
  p_type public.journal_type,
  p_reverses uuid,
  p_self uuid
)
returns void
language plpgsql stable
set search_path = ''
as $$
declare
  v_usr_dr text[]; v_usr_cr text[];
  v_sys_dr text[]; v_sys_cr text[];
  v_lines int; v_owners int;
  v_orig_type public.journal_type;
  ok boolean;
begin
  select count(*), count(distinct owner) into v_lines, v_owners
    from pg_temp.ledger_post_lines;

  if v_lines < 2 then
    raise exception 'journal requires at least 2 lines';
  end if;
  if v_owners > 1 then
    raise exception 'a journal may touch at most one user wallet';
  end if;

  select coalesce(array_agg(bucket::text    order by bucket::text)    filter (where kind = 'USER'   and direction = 'DEBIT'),  '{}'),
         coalesce(array_agg(bucket::text    order by bucket::text)    filter (where kind = 'USER'   and direction = 'CREDIT'), '{}'),
         coalesce(array_agg(syskind::text   order by syskind::text)   filter (where kind = 'SYSTEM' and direction = 'DEBIT'),  '{}'),
         coalesce(array_agg(syskind::text   order by syskind::text)   filter (where kind = 'SYSTEM' and direction = 'CREDIT'), '{}')
    into v_usr_dr, v_usr_cr, v_sys_dr, v_sys_cr
    from pg_temp.ledger_post_lines;

  ok := case p_type
    -- external funds confirmed → spendable
    when 'FUNDING_CREDIT' then
      v_sys_dr = '{DEPOSITS_CLEARING}' and v_usr_cr = '{AVAILABLE}'
      and v_sys_cr = '{}' and v_usr_dr = '{}'
    -- refund of an external credit → spendable
    when 'REFUND' then
      v_sys_dr = '{DEPOSITS_CLEARING}' and v_usr_cr = '{AVAILABLE}'
      and v_sys_cr = '{}' and v_usr_dr = '{}'
    -- external funds seen, not yet confirmed
    when 'PENDING_CREDIT' then
      v_sys_dr = '{DEPOSITS_CLEARING}' and v_usr_cr = '{PENDING}'
      and v_sys_cr = '{}' and v_usr_dr = '{}'
    -- pending deposit confirmed → spendable
    when 'PENDING_CONFIRM' then
      v_usr_dr = '{PENDING}' and v_usr_cr = '{AVAILABLE}'
      and v_sys_dr = '{}' and v_sys_cr = '{}'
    -- commitment: available and/or bonus → reserved
    when 'HOLD' then
      v_usr_dr <> '{}' and v_usr_dr <@ '{AVAILABLE,BONUS}'::text[]
      and v_usr_cr = '{RESERVED}'
      and v_sys_dr = '{}' and v_sys_cr = '{}'
    -- commitment released: reserved → original bucket(s)
    when 'HOLD_RELEASE' then
      v_usr_dr = '{RESERVED}'
      and v_usr_cr <> '{}' and v_usr_cr <@ '{AVAILABLE,BONUS}'::text[]
      and v_sys_dr = '{}' and v_sys_cr = '{}'
    -- bonus becomes spendable
    when 'BONUS_RELEASE' then
      v_usr_dr = '{BONUS}' and v_usr_cr = '{AVAILABLE}'
      and v_sys_dr = '{}' and v_sys_cr = '{}'
    -- reserved funds consumed by an outgoing payout
    when 'HOLD_DEBIT' then
      v_usr_dr = '{RESERVED}' and v_sys_cr = '{PAYOUTS_CLEARING}'
      and v_sys_dr = '{}' and v_usr_cr = '{}'
    -- wallet-funded investment: reserved → principal payable
    when 'INVESTMENT_DEBIT' then
      v_usr_dr = '{RESERVED}' and v_sys_cr = '{INVESTMENT_PRINCIPAL_PAYABLE}'
      and v_sys_dr = '{}' and v_usr_cr = '{}'
    -- payout with optional fee split (gross reserved → net payout + fee revenue)
    when 'EXTERNAL_PAYOUT' then
      v_usr_dr = '{RESERVED}' and v_sys_cr <> '{}'
      and v_sys_cr <@ '{PAYOUTS_CLEARING,FEE_REVENUE}'::text[]
      and v_sys_dr = '{}' and v_usr_cr = '{}'
    -- maturity: payable(s) → user available (principal and/or profit legs)
    when 'MATURITY_CREDIT' then
      v_usr_cr = '{AVAILABLE}' and v_sys_dr <> '{}'
      and v_sys_dr <@ '{INVESTMENT_PRINCIPAL_PAYABLE,INVESTMENT_PROFIT_PAYABLE}'::text[]
      and v_sys_cr = '{}' and v_usr_dr = '{}'
    when 'REWARD_CREDIT' then
      v_sys_dr = '{REWARD_EXPENSE}' and v_usr_cr = '{BONUS}'
      and v_sys_cr = '{}' and v_usr_dr = '{}'
    -- reward clawback: CR expense, funded by still-held reward value
    -- (BONUS/AVAILABLE debits) and/or a receivable for value already spent
    when 'REWARD_REVERSAL' then
      v_sys_cr = '{REWARD_EXPENSE}'
      and v_usr_cr = '{}'
      and v_usr_dr <@ '{AVAILABLE,BONUS}'::text[]
      and v_sys_dr <@ '{REWARD_RECEIVABLE}'::text[]
      and (v_usr_dr <> '{}' or v_sys_dr <> '{}')
    -- receivable settlement: reward value / available value repays debt
    when 'REWARD_RECOVERY' then
      v_sys_cr = '{REWARD_RECEIVABLE}'
      and v_usr_dr <> '{}' and v_usr_dr <@ '{AVAILABLE,BONUS}'::text[]
      and v_usr_cr = '{}' and v_sys_dr = '{}'
    when 'FEE_DEBIT' then
      v_usr_dr = '{AVAILABLE}' and v_sys_cr = '{FEE_REVENUE}'
      and v_sys_cr = '{}' and v_usr_cr = '{}'
    -- one user bucket line + ADJUSTMENTS contra, opposite directions
    when 'ADMIN_ADJUSTMENT' then
      v_lines = 2 and (
        (v_sys_dr = '{ADJUSTMENTS}' and array_length(v_usr_cr, 1) = 1
           and v_sys_cr = '{}' and v_usr_dr = '{}')
        or
        (v_sys_cr = '{ADJUSTMENTS}' and array_length(v_usr_dr, 1) = 1
           and v_sys_dr = '{}' and v_usr_cr = '{}')
      )
    else null
  end case;

  if p_type = 'REVERSAL' then
    if p_reverses is null then
      raise exception 'REVERSAL requires reverses_journal_id';
    end if;
    select journal_type into v_orig_type
      from public.journal_entries where id = p_reverses;
    if v_orig_type is null then
      raise exception 'journal % not found for reversal', p_reverses;
    end if;
    if v_orig_type = 'REVERSAL' then
      raise exception 'cannot reverse a REVERSAL journal';
    end if;
    if exists (select 1 from public.journal_entries
                where reverses_journal_id = p_reverses and id <> p_self) then
      raise exception 'journal % is already reversed', p_reverses;
    end if;
    -- provided lines must be the exact direction-mirror of the original
    ok := not exists (
        select account_id, direction, amount_minor from pg_temp.ledger_post_lines
        except
        select account_id,
               case direction when 'DEBIT' then 'CREDIT'::public.entry_direction else 'DEBIT'::public.entry_direction end,
               amount_minor
          from public.ledger_entries where journal_id = p_reverses
      ) and not exists (
        select account_id,
               case direction when 'DEBIT' then 'CREDIT'::public.entry_direction else 'DEBIT'::public.entry_direction end,
               amount_minor
          from public.ledger_entries where journal_id = p_reverses
        except
        select account_id, direction, amount_minor from pg_temp.ledger_post_lines
      );
  end if;

  if ok is distinct from true then
    raise exception 'journal type % does not permit this account/direction shape', p_type;
  end if;
end;
$$;

comment on function public.assert_journal_shape is
  'Journal-type shape contract. Phase 9B relaxed HOLD/HOLD_RELEASE so a hold
   may debit BONUS (reward-funded spend) in addition to AVAILABLE, and added
   REWARD_REVERSAL (clawback: CR REWARD_EXPENSE / DR held buckets or
   REWARD_RECEIVABLE) and REWARD_RECOVERY (receivable settlement).';
