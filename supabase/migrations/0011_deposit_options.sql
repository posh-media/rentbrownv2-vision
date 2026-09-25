-- RentBrown V2 — Phase 5B: authenticated deposit init options.
-- Investors cannot read admin_config (0010 seeds provider secrets as
-- markers only — none of it is investor-visible anyway). The deposit UI
-- still needs to know which providers are enabled and the current
-- limits, so this SECURITY DEFINER returns the non-secret subset only:
-- enabled flags, currency, min, optional max/expiry (null when unconfigured).

create or replace function public.deposit_options()
returns jsonb language plpgsql stable security definer
set search_path = public
as $$
declare
  v_min  bigint;
  v_max  bigint;
  v_exp  int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  v_min := public.config_number('deposit.min_minor.NGN');

  -- Optional policies: only surfaced when configured AND active — the API
  -- returns null rather than inventing a cap/expiry.
  select case when jsonb_typeof(value) = 'number' then (value#>>'{}')::bigint else null end
    into v_max
    from public.admin_config
   where key = 'payment.deposit.max_minor' and is_active;
  select case when jsonb_typeof(value) = 'number' then (value#>>'{}')::int else null end
    into v_exp
    from public.admin_config
   where key = 'payment.deposit.expiry_minutes' and is_active;

  return jsonb_build_object(
    'currency',        'NGN',
    'min_minor',       v_min,
    'max_minor',       v_max,
    'expiry_minutes',  v_exp,
    'providers',       jsonb_build_object(
      'PAYSTACK', public.config_bool('payment.provider.paystack.enabled'),
      'KORAPAY',  public.config_bool('payment.provider.korapay.enabled')));
end $$;

grant execute on function public.deposit_options() to authenticated;

comment on function public.deposit_options() is
  'Non-secret deposit init options for the investor UI (provider enablement + limits). Phase 5B.';
