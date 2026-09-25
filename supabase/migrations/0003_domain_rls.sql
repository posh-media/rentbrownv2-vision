-- RentBrown V2 — Phase 3B domain RLS
-- Posture (same as 0001): least privilege. Clients SELECT a narrow set of
-- rows/columns; there are NO client INSERT/UPDATE/DELETE policies on any
-- domain table. All authoritative mutation happens via SECURITY DEFINER
-- functions (service role today; Phase 4+ engine RPCs).
--
-- Column-level grants additionally hide internal fields:
--   properties.address          — exact address never leaves the server
--   property_documents.storage_path, review_note, reviewed_by — internals

-- ── Enable RLS ───────────────────────────────────────────────────────────────

alter table public.properties            enable row level security;
alter table public.property_documents    enable row level security;
alter table public.property_updates      enable row level security;
alter table public.investment_plans      enable row level security;
alter table public.investment_rounds     enable row level security;
alter table public.investments           enable row level security;
alter table public.investment_events     enable row level security;
alter table public.admin_config          enable row level security;
alter table public.admin_config_history  enable row level security;
alter table public.audit_log             enable row level security;

-- ── Privileges: strip defaults, grant narrowly ──────────────────────────────

-- Supabase grants broad table privileges to anon/authenticated by default;
-- claw them back everywhere, then re-grant SELECT only where intended.
revoke all on public.properties           from anon, authenticated;
revoke all on public.property_documents   from anon, authenticated;
revoke all on public.property_updates     from anon, authenticated;
revoke all on public.investment_plans     from anon, authenticated;
revoke all on public.investment_rounds    from anon, authenticated;
revoke all on public.investments          from anon, authenticated;
revoke all on public.investment_events    from anon, authenticated;
revoke all on public.admin_config         from anon, authenticated;
revoke all on public.admin_config_history from anon, authenticated;
revoke all on public.audit_log            from anon, authenticated;

-- Public-safe column lists (address/storage internals excluded).
grant select (
  id, slug, name, property_type, summary, description,
  area, city, state, location_label, images,
  operator_name, operator_description, highlights, revenue_model,
  publication_status, created_by, created_at, updated_at
) on public.properties to anon, authenticated;

grant select (
  id, property_id, document_type, title, summary,
  status, version, reviewed_at, created_at, updated_at
) on public.property_documents to anon, authenticated;

grant select on public.property_updates      to anon, authenticated;
grant select on public.investment_plans      to anon, authenticated;
grant select on public.investment_rounds     to anon, authenticated;
grant select on public.investments           to authenticated;
grant select on public.investment_events     to authenticated;
grant select on public.admin_config          to authenticated;
grant select on public.admin_config_history  to authenticated;
grant select on public.audit_log             to authenticated;

-- ── SELECT policies ─────────────────────────────────────────────────────────

-- Properties: public sees published; catalogue-capable admins see all.
create policy properties_public_select
  on public.properties for select to anon, authenticated
  using (publication_status = 'PUBLISHED');

create policy properties_admin_select
  on public.properties for select to authenticated
  using (public.has_admin_role(array['SUPPORT','OPERATIONS_ADMIN','SUPER_ADMIN']::public.admin_role[]));

-- Documents: public sees reviewable/verified evidence on published properties
-- (UPLOADED never surfaces — it hasn't entered review).
create policy property_documents_public_select
  on public.property_documents for select to anon, authenticated
  using (
    status in ('IN_REVIEW', 'VERIFIED')
    and exists (
      select 1 from public.properties p
      where p.id = property_id and p.publication_status = 'PUBLISHED'
    )
  );

create policy property_documents_admin_select
  on public.property_documents for select to authenticated
  using (public.has_admin_role(array['SUPPORT','OPERATIONS_ADMIN','SUPER_ADMIN']::public.admin_role[]));

-- Updates follow their parent property's publication.
create policy property_updates_public_select
  on public.property_updates for select to anon, authenticated
  using (
    exists (
      select 1 from public.properties p
      where p.id = property_id and p.publication_status = 'PUBLISHED'
    )
  );

create policy property_updates_admin_select
  on public.property_updates for select to authenticated
  using (public.has_admin_role(array['SUPPORT','OPERATIONS_ADMIN','SUPER_ADMIN']::public.admin_role[]));

-- Plans: public sees published; admins see all.
create policy investment_plans_public_select
  on public.investment_plans for select to anon, authenticated
  using (status = 'PUBLISHED');

create policy investment_plans_admin_select
  on public.investment_plans for select to authenticated
  using (public.has_admin_role(array['SUPPORT','OPERATIONS_ADMIN','SUPER_ADMIN']::public.admin_role[]));

-- Rounds: public sees rounds of published plans.
create policy investment_rounds_public_select
  on public.investment_rounds for select to anon, authenticated
  using (
    exists (
      select 1 from public.investment_plans p
      where p.id = plan_id and p.status = 'PUBLISHED'
    )
  );

create policy investment_rounds_admin_select
  on public.investment_rounds for select to authenticated
  using (public.has_admin_role(array['SUPPORT','OPERATIONS_ADMIN','SUPER_ADMIN']::public.admin_role[]));

-- Investments: owner reads own; admin roles with investments.read see all.
create policy investments_select_own
  on public.investments for select to authenticated
  using (auth.uid() = user_id);

create policy investments_admin_select
  on public.investments for select to authenticated
  using (public.has_admin_role(array['SUPPORT','OPERATIONS_ADMIN','FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]));

-- Events: owner reads events on their own investments; admins read all.
create policy investment_events_select_own
  on public.investment_events for select to authenticated
  using (
    exists (
      select 1 from public.investments i
      where i.id = investment_id and i.user_id = auth.uid()
    )
  );

create policy investment_events_admin_select
  on public.investment_events for select to authenticated
  using (public.has_admin_role(array['SUPPORT','OPERATIONS_ADMIN','FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]));

-- Config: policies.read roles (KYC_REVIEWER excluded).
create policy admin_config_select
  on public.admin_config for select to authenticated
  using (public.has_admin_role(array['SUPPORT','OPERATIONS_ADMIN','FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]));

create policy admin_config_history_select
  on public.admin_config_history for select to authenticated
  using (public.has_admin_role(array['SUPPORT','OPERATIONS_ADMIN','FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]));

-- Audit: audit.read roles only.
create policy audit_log_select
  on public.audit_log for select to authenticated
  using (public.has_admin_role(array['SUPPORT','FINANCE_ADMIN','SUPER_ADMIN']::public.admin_role[]));

-- No INSERT/UPDATE/DELETE policies anywhere on domain tables — clients cannot
-- write. profiles keeps its Phase 2 grants; the new verification columns are
-- absent from the column-level UPDATE grant, so they are server-only.

-- ── Admin read functions for internally-scoped columns ──────────────────────
-- Column grants hide address/storage internals from every client role
-- (including admins, who share the `authenticated` role). These definers are
-- the intended read path for the admin app's detail screens.

-- Explicit PL/pgSQL guards (not WHERE-clause predicates): an inlined/stable
-- predicate can be mis-optimised under nested SECURITY DEFINER contexts.
create or replace function public.admin_get_property(p_id uuid)
returns setof public.properties
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.has_admin_role(array['SUPPORT','OPERATIONS_ADMIN','SUPER_ADMIN']::public.admin_role[]) then
    return;
  end if;
  return query select * from public.properties where id = p_id;
end;
$$;

create or replace function public.admin_get_property_documents(p_property_id uuid)
returns setof public.property_documents
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.has_admin_role(array['SUPPORT','OPERATIONS_ADMIN','SUPER_ADMIN']::public.admin_role[]) then
    return;
  end if;
  return query select * from public.property_documents where property_id = p_property_id;
end;
$$;

-- Function EXECUTE privileges: callers must be authenticated.
revoke execute on function public.set_admin_config(text, jsonb, text, text) from public, anon;
revoke execute on function public.get_admin_config(text[]) from public, anon;
revoke execute on function public.admin_get_property(uuid) from public, anon;
revoke execute on function public.admin_get_property_documents(uuid) from public, anon;

grant execute on function public.set_admin_config(text, jsonb, text, text) to authenticated;
grant execute on function public.get_admin_config(text[]) to authenticated;
grant execute on function public.admin_get_property(uuid) to authenticated;
grant execute on function public.admin_get_property_documents(uuid) to authenticated;
