-- 0012 — Phase 6B: test catalogue seed + seed_tag provenance column.
--
-- Inserts the six fictional mock properties/plans/rounds into the real domain
-- tables so the investor app can exercise the REAL investment flow. Every row
-- carries seed_tag = 'p6-catalogue-fixtures' so the set is enumerable, auditable
-- and deletable as a unit. NULL = genuine catalogue data.
--
-- SAFETY:
--   * No wallets, balances, deposits, ledger rows, investments or events.
--   * Fictional markers ("(fictional)", "in this prototype") preserved verbatim.
--   * Seeded statuses are real lifecycle states — OPEN rounds are investable
--     by test users with genuinely funded wallets.
--   * DELETE order for removal (FK RESTRICT blocks delete once investments
--     exist): investment_events → investments → rounds → plans → properties.
--     `delete … where seed_tag = 'p6-catalogue-fixtures'` on each table.

-- ── seed_tag provenance ─────────────────────────────────────────────────────

alter table public.properties        add column if not exists seed_tag text;
alter table public.investment_plans  add column if not exists seed_tag text;
alter table public.investment_rounds add column if not exists seed_tag text;

comment on column public.properties.seed_tag is
  'Fixture provenance marker. NULL = real catalogue. ''p6-catalogue-fixtures''
   = Phase 6B test data, removable as a set.';
comment on column public.investment_plans.seed_tag is
  'Fixture provenance marker. NULL = real catalogue.';
comment on column public.investment_rounds.seed_tag is
  'Fixture provenance marker. NULL = real catalogue.';

-- properties has column-list grants (0003); extend them for the new column.
-- plans/rounds/investments have table-level grants → new columns are covered.
grant select (seed_tag) on public.properties to anon, authenticated;

-- ── Properties ──────────────────────────────────────────────────────────────
-- Mirrors packages/mock-data/src/fixtures/catalogue.ts verbatim (fictional).

insert into public.properties
  (slug, name, property_type, summary, description, area, city, state,
   location_label, images, operator_name, operator_description, highlights,
   revenue_model, publication_status, seed_tag)
values
  ('the-terraces-ikoyi', 'The Terraces, Ikoyi', 'Serviced residential apartments',
   'Twelve fully serviced two-bedroom apartments let to corporate tenants on annual leases.',
   'The Terraces is a completed, fully occupied residential block of twelve serviced apartments in Old Ikoyi. Units are let to corporate tenants on 12-month leases with rent paid annually in advance. The operator manages facilities, security and tenant relations under a fixed-fee agreement.',
   'Ikoyi', 'Lagos', 'Lagos', 'Ikoyi, Lagos',
   array['ikoyi-residences','lekki-courts','wuse-square'],
   'Brownstone Living Ltd (fictional)',
   'Residential operator managing 140 serviced units across Lagos in this prototype.',
   array['100% occupancy for the last 24 months','Rent collected annually in advance','Independent valuation completed Jul 2026','Facilities managed under fixed-fee agreement'],
   'Investor returns are funded from annual rental income received in advance, held in a designated collections account.',
   'PUBLISHED', 'p6-catalogue-fixtures'),

  ('palm-court-lekki', 'Palm Court, Lekki', 'Residential development (final phase)',
   'Final finishing phase of eight terrace duplexes, six already pre-sold with deposits received.',
   'Palm Court is a gated cluster of eight four-bedroom terraces in Lekki Phase 1. Structural work is complete; this round funds finishing and external works. Six units are pre-sold with 30% deposits held in escrow, and completion payments fund the maturity value.',
   'Lekki Phase 1', 'Lagos', 'Lagos', 'Lekki Phase 1, Lagos',
   array['lekki-courts','ikoyi-residences'],
   'Coastline Developments (fictional)',
   'Residential developer with four completed Lekki schemes in this prototype.',
   array['Structure complete, finishing phase only','6 of 8 units pre-sold','Deposits held in escrow','Quantity surveyor cost schedule reviewed'],
   'Maturity value is funded from completion payments on pre-sold units and the sale of the two remaining units.',
   'PUBLISHED', 'p6-catalogue-fixtures'),

  ('wuse-square-residences', 'Wuse Square Residences', 'Rental apartments',
   'Twenty studio and one-bedroom apartments let to young professionals in central Abuja.',
   'Wuse Square is an occupied block of twenty compact apartments a short walk from the Wuse II commercial district. Rents are collected annually and the block has maintained above 95% occupancy since 2023.',
   'Wuse II', 'Abuja', 'FCT', 'Wuse II, Abuja',
   array['wuse-square','ikoyi-residences'],
   'Capital Homes Management (fictional)',
   'Abuja lettings and facilities operator in this prototype.',
   array['95%+ occupancy since 2023','Compact units with strong demand','Two prior rounds settled on time'],
   'Investor returns are funded from annual rental income collected in advance.',
   'PUBLISHED', 'p6-catalogue-fixtures'),

  ('harbour-view-suites', 'Harbour View Suites', 'Short-let serviced suites',
   'Sixteen serviced suites operated for corporate short-let stays near the Port Harcourt business district.',
   'Harbour View is a purpose-built short-let block of sixteen suites serving corporate travellers. The operator holds framework agreements with three energy-sector employers that account for the majority of nights sold.',
   'Old GRA', 'Port Harcourt', 'Rivers', 'Old GRA, Port Harcourt',
   array['ikoyi-residences','wuse-square'],
   'Riverside Hospitality (fictional)',
   'Short-let operator with two Port Harcourt properties in this prototype.',
   array['Corporate framework agreements in place','68% average occupancy over 12 months','Insurance cover reviewed'],
   'Investor returns are funded from short-let operating income under the operator agreement, with a reserve held by the issuer.',
   'PUBLISHED', 'p6-catalogue-fixtures'),

  ('bodija-gardens', 'Bodija Gardens', 'Purpose-built student housing',
   'Forty-room student residence beside the University of Ibadan with sessional rent paid in advance.',
   'Bodija Gardens is a forty-room student residence with shared kitchens and study areas. Rooms are let per academic session with rent paid in advance, and the residence has been fully let for the last three sessions.',
   'Bodija', 'Ibadan', 'Oyo', 'Bodija, Ibadan',
   array['lekki-courts','wuse-square'],
   'Campus Living Partners (fictional)',
   'Student accommodation operator in this prototype.',
   array['Fully let for three consecutive sessions','Sessional rent paid in advance','Low entry slot price'],
   'Investor returns are funded from sessional rent collected in advance.',
   'PUBLISHED', 'p6-catalogue-fixtures'),

  ('maitama-heights', 'Maitama Heights', 'Premium residential apartments',
   'Eight premium three-bedroom apartments let to diplomatic and corporate tenants.',
   'Maitama Heights is a low-rise block of eight premium apartments. Tenancies are with diplomatic missions and corporate occupiers on two-year leases. The round opens in October after document review completes.',
   'Maitama', 'Abuja', 'FCT', 'Maitama, Abuja',
   array['wuse-square','lekki-courts','ikoyi-residences'],
   'Brownstone Living Ltd (fictional)',
   'Residential operator managing 140 serviced units across Lagos and Abuja in this prototype.',
   array['Two-year corporate leases','Premium location','Documents under review before opening'],
   'Investor returns are funded from lease income received in advance under two-year corporate tenancies.',
   'PUBLISHED', 'p6-catalogue-fixtures')
on conflict (slug) do nothing;

-- ── Property documents ──────────────────────────────────────────────────────
-- VERIFIED requires reviewed_by (auth.users FK) + reviewed_at. If no auth user
-- exists yet (bare dev database) the documents are seeded IN_REVIEW instead —
-- never weakening verified_needs_reviewer.

do $$
declare
  v_reviewer uuid;
begin
  select id into v_reviewer from auth.users order by created_at limit 1;

  insert into public.property_documents
    (property_id, document_type, title, summary, status, version,
     reviewed_by, reviewed_at)
  select p.id, d.document_type::public.property_document_type, d.title,
         d.summary,
         case when v_reviewer is null or d.mock_status = 'PENDING_REVIEW'
              then 'IN_REVIEW'::public.property_document_status
              else 'VERIFIED'::public.property_document_status end,
         d.version,
         case when d.mock_status = 'PENDING_REVIEW' then null else v_reviewer end,
         case when d.mock_status = 'PENDING_REVIEW' then null else d.reviewed_at end
    from (values
      -- The Terraces
      ('the-terraces-ikoyi','TITLE','Title search summary','Summary of registered title and encumbrance search for the Ikoyi parcel.','VERIFIED','v1.0','2026-07-14T09:00:00Z'::timestamptz),
      ('the-terraces-ikoyi','VALUATION','Independent valuation','Open-market valuation prepared by a registered estate surveyor.','VERIFIED','v1.0','2026-07-21T09:00:00Z'::timestamptz),
      ('the-terraces-ikoyi','INSPECTION','Site inspection report','Dated inspection covering condition, occupancy and facilities.','VERIFIED','v1.0','2026-08-02T09:00:00Z'::timestamptz),
      ('the-terraces-ikoyi','OPERATOR_AGREEMENT','Operator agreement','Fixed-fee management agreement between the issuer and the operator.','VERIFIED','v1.0','2026-06-30T09:00:00Z'::timestamptz),
      -- Palm Court
      ('palm-court-lekki','TITLE','Title search summary','Registered title summary for the Lekki Phase 1 plot.','VERIFIED','v1.0','2026-01-20T09:00:00Z'::timestamptz),
      ('palm-court-lekki','COST_SCHEDULE','Project cost schedule','Quantity surveyor''s finishing-phase cost schedule and contingency.','VERIFIED','v1.0','2026-02-11T09:00:00Z'::timestamptz),
      ('palm-court-lekki','INSPECTION','Site progress report','Monthly progress report with dated photographs.','VERIFIED','v7.0','2026-09-05T09:00:00Z'::timestamptz),
      ('palm-court-lekki','LEGAL_OPINION','Legal opinion','Opinion on pre-sale agreements and escrow arrangements.','VERIFIED','v1.0','2026-02-25T09:00:00Z'::timestamptz),
      -- Wuse Square
      ('wuse-square-residences','TITLE','Title search summary','Registered title summary for the Wuse II plot.','VERIFIED','v1.0','2025-11-03T09:00:00Z'::timestamptz),
      ('wuse-square-residences','VALUATION','Independent valuation','Valuation by a registered estate surveyor.','VERIFIED','v1.0','2025-11-18T09:00:00Z'::timestamptz),
      ('wuse-square-residences','INSPECTION','Site inspection report','Condition and occupancy inspection.','VERIFIED','v3.0','2026-04-10T09:00:00Z'::timestamptz),
      -- Harbour View
      ('harbour-view-suites','TITLE','Title search summary','Registered title summary for the Old GRA parcel.','VERIFIED','v1.0','2026-06-02T09:00:00Z'::timestamptz),
      ('harbour-view-suites','INSURANCE','Insurance schedule','Building and public-liability cover summary.','VERIFIED','v1.0','2026-06-15T09:00:00Z'::timestamptz),
      ('harbour-view-suites','OPERATOR_AGREEMENT','Operator agreement','Operating agreement and reserve arrangements.','VERIFIED','v1.0','2026-06-20T09:00:00Z'::timestamptz),
      ('harbour-view-suites','INSPECTION','Site inspection report','Condition and occupancy inspection.','VERIFIED','v1.0','2026-08-28T09:00:00Z'::timestamptz),
      -- Bodija Gardens
      ('bodija-gardens','TITLE','Title search summary','Registered title summary for the Bodija plot.','VERIFIED','v1.0','2026-07-30T09:00:00Z'::timestamptz),
      ('bodija-gardens','VALUATION','Independent valuation','Valuation by a registered estate surveyor.','VERIFIED','v1.0','2026-08-06T09:00:00Z'::timestamptz),
      ('bodija-gardens','INSPECTION','Site inspection report','Condition and occupancy inspection.','VERIFIED','v1.0','2026-08-20T09:00:00Z'::timestamptz),
      -- Maitama Heights (title verified; valuation still in review)
      ('maitama-heights','TITLE','Title search summary','Registered title summary for the Maitama parcel.','VERIFIED','v1.0','2026-09-12T09:00:00Z'::timestamptz),
      ('maitama-heights','VALUATION','Independent valuation','Valuation in progress; publication expected before the round opens.','PENDING_REVIEW','draft','2026-09-12T09:00:00Z'::timestamptz)
    ) as d(slug, document_type, title, summary, mock_status, version, reviewed_at)
    join public.properties p on p.slug = d.slug
   where p.seed_tag = 'p6-catalogue-fixtures'
     and not exists (
       select 1 from public.property_documents x
        where x.property_id = p.id and x.title = d.title);

  -- ── Property updates ────────────────────────────────────────────────────
  insert into public.property_updates (property_id, title, body, published_at, created_by)
  select p.id, u.title, u.body, u.published_at, v_reviewer
    from (values
      ('the-terraces-ikoyi','Round 2 opened','Capacity of 500 slots released after Round 1 closed fully subscribed.','2026-09-01T08:00:00Z'::timestamptz),
      ('the-terraces-ikoyi','Annual leases renewed','All twelve tenancies renewed for the 2026/27 lease year.','2026-08-15T08:00:00Z'::timestamptz),
      ('palm-court-lekki','Finishing 80% complete','Tiling and joinery complete in six units; external works underway.','2026-09-05T08:00:00Z'::timestamptz),
      ('wuse-square-residences','Round 3 fully subscribed','All 2,000 slots allocated. The next round will be announced after maturity.','2026-05-04T08:00:00Z'::timestamptz),
      ('harbour-view-suites','Round 1 open','First RentBrown round for this property. 1,000 slots released.','2026-09-10T08:00:00Z'::timestamptz),
      ('maitama-heights','Round scheduled','Round 1 is scheduled to open on 15 October 2026 once the valuation is published.','2026-09-12T08:00:00Z'::timestamptz)
    ) as u(slug, title, body, published_at)
    join public.properties p on p.slug = u.slug
   where p.seed_tag = 'p6-catalogue-fixtures'
     and not exists (
       select 1 from public.property_updates x
        where x.property_id = p.id and x.title = u.title);
end $$;

-- ── Investment plans ────────────────────────────────────────────────────────
-- Duration conversion approved in Phase 6A (D-6.x): 730 h per mock month.

insert into public.investment_plans
  (property_id, name, currency, slot_price_minor, roi_bps, duration_hours,
   min_slots, max_slots_per_user, investment_fee_bps, terms, risk_disclosures,
   status, seed_tag)
select p.id, t.name, 'NGN'::public.currency_code, t.slot_price_minor, t.roi_bps,
       t.duration_hours, t.min_slots, t.max_slots_per_user, 0,
       array[
         'Principal is allocated to the round on activation and cannot be withdrawn before maturity.',
         'The stated return applies to the full term, not per month.',
         'Principal and expected profit are credited to your available balance at settlement after maturity.',
         'No investment fee is charged. Withdrawal fees are shown before you confirm a withdrawal.'],
       t.extra_risks,
       'PUBLISHED', 'p6-catalogue-fixtures'
  from (values
    -- slot prices in kobo: ₦100,000 / ₦50,000 / ₦10,000 / ₦25,000 / ₦10,000 / ₦250,000
    ('the-terraces-ikoyi','Residential income note',10000000::bigint,1650,8760,1,50,
      '{}'::text[]),
    ('palm-court-lekki','Development finance note',5000000::bigint,1400,6570,2,100,
      array['Development finance carries completion risk; pre-sale deposits are held in escrow.']::text[]),
    ('wuse-square-residences','Rental yield note',1000000::bigint,1250,4380,5,500,
      '{}'::text[]),
    ('harbour-view-suites','Short-let income note',2500000::bigint,1500,5840,2,200,
      array['Short-let income varies with occupancy; a reserve is held by the issuer.']::text[]),
    ('bodija-gardens','Rental yield note',1000000::bigint,1300,4380,1,300,
      '{}'::text[]),
    ('maitama-heights','Residential income note',25000000::bigint,1700,13140,1,20,
      '{}'::text[])
  ) as t(slug, name, slot_price_minor, roi_bps, duration_hours, min_slots, max_slots_per_user, extra_risks)
  join public.properties p on p.slug = t.slug
 where p.seed_tag = 'p6-catalogue-fixtures'
   and not exists (
     select 1 from public.investment_plans x
      where x.property_id = p.id and x.name = t.name and x.seed_tag = 'p6-catalogue-fixtures');

-- Add the shared risk disclosure set — kept as a second statement so the VALUES
-- list above stays readable.
with base_risks as (
  select array[
    'Returns are expected, not guaranteed. Settlement depends on the issuer meeting its obligations.',
    'Property income and completion timelines can be delayed.',
    'This prototype does not offer financial products; all figures are illustrative.']::text[] as r
)
update public.investment_plans ip
   set risk_disclosures = coalesce(base_risks.r, '{}'::text[]) || coalesce(ip.risk_disclosures, '{}'::text[])
  from base_risks
 where ip.seed_tag = 'p6-catalogue-fixtures'
   and not (ip.risk_disclosures @> array['This prototype does not offer financial products; all figures are illustrative.']);

-- ── Investment rounds ───────────────────────────────────────────────────────
-- Statuses preserved from the mock to exercise every UI/rejection path.

insert into public.investment_rounds
  (plan_id, round_number, status, total_slots, allocated_slots, reserved_slots,
   slot_price_minor, currency, opens_at, closes_at,
   projected_start_at, projected_maturity_at, opened_at, closed_at, seed_tag)
select pl.id, r.round_number, r.status::public.investment_round_status,
       r.total_slots, r.allocated_slots, r.reserved_slots,
       pl.slot_price_minor, 'NGN'::public.currency_code,
       r.opens_at, r.closes_at, r.projected_start_at, r.projected_maturity_at,
       case when r.status in ('OPEN','NEARING_CAPACITY','SOLD_OUT','CLOSED','SETTLED')
            then r.opens_at end,
       case when r.status in ('SOLD_OUT','CLOSED','SETTLED')
            then r.closes_at end,
       'p6-catalogue-fixtures'
  from (values
    ('the-terraces-ikoyi','Residential income note',2,'OPEN',500,332,8,
     '2026-09-01T08:00:00Z'::timestamptz,'2026-10-31T17:00:00Z'::timestamptz,
     '2026-09-30T00:00:00Z'::timestamptz,'2027-09-30T00:00:00Z'::timestamptz),
    ('palm-court-lekki','Development finance note',2,'NEARING_CAPACITY',1200,1086,6,
     '2026-08-01T08:00:00Z'::timestamptz,'2026-10-15T17:00:00Z'::timestamptz,
     '2026-10-15T00:00:00Z'::timestamptz,'2027-07-15T00:00:00Z'::timestamptz),
    ('wuse-square-residences','Rental yield note',3,'SOLD_OUT',2000,2000,0,
     '2026-04-15T08:00:00Z'::timestamptz,'2026-05-04T17:00:00Z'::timestamptz,
     '2026-05-02T00:00:00Z'::timestamptz,'2026-11-02T00:00:00Z'::timestamptz),
    ('harbour-view-suites','Short-let income note',1,'OPEN',1000,322,18,
     '2026-09-10T08:00:00Z'::timestamptz,'2026-11-30T17:00:00Z'::timestamptz,
     '2026-12-01T00:00:00Z'::timestamptz,'2027-08-01T00:00:00Z'::timestamptz),
    ('bodija-gardens','Rental yield note',1,'OPEN',3000,340,20,
     '2026-09-20T08:00:00Z'::timestamptz,'2026-11-15T17:00:00Z'::timestamptz,
     '2026-11-16T00:00:00Z'::timestamptz,'2027-05-16T00:00:00Z'::timestamptz),
    ('maitama-heights','Residential income note',1,'SCHEDULED',200,0,0,
     '2026-10-15T08:00:00Z'::timestamptz,'2026-12-15T17:00:00Z'::timestamptz,
     '2026-12-16T00:00:00Z'::timestamptz,'2028-06-16T00:00:00Z'::timestamptz)
  ) as r(slug, plan_name, round_number, status, total_slots, allocated_slots,
         reserved_slots, opens_at, closes_at, projected_start_at, projected_maturity_at)
  join public.properties p on p.slug = r.slug
  join public.investment_plans pl
    on pl.property_id = p.id and pl.name = r.plan_name
 where pl.seed_tag = 'p6-catalogue-fixtures'
   and not exists (
     select 1 from public.investment_rounds x
      where x.plan_id = pl.id and x.round_number = r.round_number
        and x.seed_tag = 'p6-catalogue-fixtures');
