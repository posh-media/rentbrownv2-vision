-- RentBrown V2 — Phase 2 foundation
-- Identity: app profiles, unique usernames, referral attribution, admin roles.
-- Financial tables are intentionally NOT created here (Phases 4+).
--
-- Security posture: least privilege. Clients may read their own profile and
-- update ONLY (username, display_name, phone). account_status, referral_code
-- and referred_by are server-managed. admin_roles grants happen via the
-- service role only — no client write path exists.

create extension if not exists citext;

-- ── Enums ────────────────────────────────────────────────────────────────────

create type public.account_status as enum ('ACTIVE', 'RESTRICTED', 'SUSPENDED', 'CLOSED');
create type public.admin_role as enum ('SUPPORT', 'KYC_REVIEWER', 'OPERATIONS_ADMIN', 'FINANCE_ADMIN', 'SUPER_ADMIN');

-- ── Reserved usernames ───────────────────────────────────────────────────────

create table public.reserved_usernames (
  username citext primary key
);

insert into public.reserved_usernames (username) values
  ('admin'), ('administrator'), ('support'), ('help'), ('rentbrown'), ('official'),
  ('system'), ('root'), ('moderator'), ('mod'), ('api'), ('www'), ('app'), ('mail'),
  ('noreply'), ('security'), ('billing'), ('settings'), ('staff'), ('team'),
  ('null'), ('undefined'), ('anonymous'), ('kyc'), ('finance'), ('ops'), ('legal');

-- ── Profiles ─────────────────────────────────────────────────────────────────

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      citext not null unique,
  display_name  text not null,
  phone         text,
  account_status public.account_status not null default 'ACTIVE',
  referral_code text not null unique,
  referred_by   uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint username_format check (username ~ '^[a-z0-9][a-z0-9_]{2,19}$')
);

create index profiles_referred_by_idx on public.profiles (referred_by);

comment on table public.profiles is
  'Application profile. Identity lives in auth.users; nothing financial lives here.';

-- ── Admin roles ──────────────────────────────────────────────────────────────

create table public.admin_roles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       public.admin_role not null,
  granted_by uuid references auth.users (id),
  granted_at timestamptz not null default now()
);

comment on table public.admin_roles is
  'Admin authorization is a role grant, never an isAdmin flag.';

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- Is the given user an admin? SECURITY DEFINER so policies can call it without
-- exposing admin_roles rows to non-admins.
create or replace function public.is_admin(check_user uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_roles where user_id = check_user
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_roles where user_id = auth.uid()
  );
$$;

-- The caller's own admin role, or null. Used by the admin app after sign-in.
create or replace function public.current_admin_role()
returns public.admin_role
language sql stable security definer
set search_path = ''
as $$
  select role from public.admin_roles where user_id = auth.uid();
$$;

-- Username normalization used by the signup trigger: lowercase, strip invalid
-- characters, collapse repeats. Clients validate too, but the DB enforces.
create or replace function public.normalize_username(raw text)
returns text
language sql immutable
set search_path = ''
as $$
  select substring(
    regexp_replace(lower(coalesce(raw, '')), '[^a-z0-9_]+', '', 'g')
    from '^[a-z0-9][a-z0-9_]{1,18}'
  );
$$;

-- Reject reserved usernames on insert/update (format is a column CHECK).
create or replace function public.assert_username_allowed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.reserved_usernames where username = new.username) then
    raise exception 'username is reserved';
  end if;
  return new;
end;
$$;

create trigger profiles_username_reserved
  before insert or update of username on public.profiles
  for each row execute function public.assert_username_allowed();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Stable unique referral code: RB- + 8 chars, unambiguous alphabet.
create or replace function public.generate_referral_code()
returns text
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
  i int;
begin
  loop
    code := 'RB-';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where referral_code = code);
  end loop;
  return code;
end;
$$;

-- Profile creation on signup. Runs as the function owner (RLS bypassed),
-- so clients never need an insert policy on profiles.
-- user_metadata keys consumed: username, display_name, full_name, phone,
-- referral_code (attribution — looked up against existing codes).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  base_username text;
  candidate text;
  suffix int := 0;
  referrer uuid;
begin
  base_username := public.normalize_username(
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    )
  );
  if base_username is null or length(base_username) < 3 then
    base_username := 'user';
  end if;

  -- Resolve collisions deterministically: base, base2, base3, …
  candidate := base_username;
  while exists (select 1 from public.profiles where username = candidate)
        or exists (select 1 from public.reserved_usernames where username = candidate) loop
    suffix := suffix + 1;
    candidate := substring(base_username from 1 for greatest(1, 20 - length(suffix::text))) || suffix::text;
    if suffix > 9999 then
      candidate := 'user_' || replace(new.id::text, '-', '')::text;
      exit;
    end if;
  end loop;

  if new.raw_user_meta_data ? 'referral_code' then
    select id into referrer
      from public.profiles
      where referral_code = upper(new.raw_user_meta_data ->> 'referral_code');
  end if;

  insert into public.profiles (id, username, display_name, phone, referral_code, referred_by)
  values (
    new.id,
    candidate,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      candidate
    ),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    public.generate_referral_code(),
    referrer
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Row Level Security ───────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.admin_roles enable row level security;
alter table public.reserved_usernames enable row level security;

-- Profiles: users read/update their own row; admins read all.
-- Column privileges restrict WHAT clients may update (not status/referral data).
create policy profiles_select_own
  on public.profiles for select
  using (auth.uid() = id);

create policy profiles_select_admin
  on public.profiles for select
  using (public.is_admin());

revoke update on public.profiles from authenticated;
grant update (username, display_name, phone) on public.profiles to authenticated;

create policy profiles_update_own
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No client INSERT/DELETE on profiles — rows come from handle_new_user.

-- Admin roles: a user may read ONLY their own grant (to learn their role).
create policy admin_roles_select_own
  on public.admin_roles for select
  using (auth.uid() = user_id);

-- No client write policies on admin_roles or reserved_usernames.
