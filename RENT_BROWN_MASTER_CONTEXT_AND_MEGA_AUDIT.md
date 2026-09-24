# RENT BROWN — Master Context, Mega Audit, and Rebuild Blueprint

**Document date:** 2026-09-15  
**Current project:** RentBrown (`rent-brown-q02wq3`)  
**Current implementation:** FlutterFlow-generated Flutter application with Firebase  
**Proposed rebuild:** React Native + Expo + TypeScript with a provider-neutral backend  
**Purpose:** Authoritative engineering/product handoff for a clean rebuild. This is not marketing copy and is not evidence of legal or regulatory compliance.

## Evidence labels

- **CONFIRMED** — explicitly established by the owner or prior approved project work.
- **OBSERVED** — directly found in the refreshed FlutterFlow project/generated code on the document date.
- **RECOMMENDED** — proposed engineering direction; not an existing product decision.
- **UNKNOWN** — evidence is insufficient.
- **DECISION REQUIRED** — founder, product, business, finance, compliance, or legal input is required.

## Sources reviewed

- Current FlutterFlow typed project SDK (`lib/flutterflow_project/`).
- Current generated Flutter runtime (`generated_code/lib/`).
- Current Firebase schema exports, rules, indexes, and functions (`generated_code/firebase/`).
- `RENT_BROWN_PROJECT_AUDIT.md`.
- `RENT_BROWN_ARCHITECTURE_REVIEW.md`.
- `RENT_BROWN_FIREBASE_SCHEMA.md`.
- Historical Devin workspace transcript summary at `C:/Users/Welcome Sir/AppData/Roaming/devin/cli/summaries/history_bbf7f08fe60a4dbc.md`.
- Current remote FlutterFlow status after the latest context refresh.

---

# 1. Executive Summary

## Current verdict

**OBSERVED:** RENT BROWN is a visually substantial product prototype, not a production property-investment system. The refreshed project has **52 pages, 53 components, 14 Firestore collection definitions, 5 enums, 3 data structs, and 3 app-state fields**. This differs from the original audit's 64-page/52-component count because pages were removed or consolidated and two components were added after that audit.

**OBSERVED:** The current version is no longer completely auth-empty. Email/password registration, login, password reset, logout infrastructure, a small amount of profile persistence, and two property collection queries now exist. These are meaningful changes from the first audit.

**OBSERVED:** The core financial platform is still not implemented. There is no server-side investment engine, atomic slot allocation, payment verification, financial ledger writer, withdrawal processor, ROI settlement, maturity scheduler, KYC decision engine, notification dispatcher, or effective admin RBAC. API groups and action blocks remain empty. Cloud Functions contain only an auth-deletion handler and an unused generic API proxy.

**CRITICAL OBSERVATION:** Signup currently creates a wallet from the client with a hardcoded `withdrawableBalance: 500.0`. That is a direct client-authored financial credit and must never be reproduced. The generated Firestore rules also allow unrestricted client access to wallets, plans, KYC submissions, notifications, referrals, and audit logs. The exported rules disagree with the top-level schema by treating several financial collections as user subcollections.

**RECOMMENDED:** Rebuild rather than translate generated Flutter code. Preserve product journeys, visual language, content structure, and reusable UI concepts. Replace the data and backend architecture with a modular monolith using PostgreSQL, a double-entry ledger, transactional slot reservation, asynchronous jobs/outbox delivery, and provider adapters. React Native/Expo should be an API consumer, never the authority for money or investment state.

## Readiness matrix

| Area                       | Current status                               | Production verdict                |
| -------------------------- | -------------------------------------------- | --------------------------------- |
| Visual/product exploration | UI implemented across most intended journeys | Preserve selectively              |
| Authentication             | Partially implemented                        | Needs redesign/hardening          |
| Property browsing          | Partially backend-connected                  | Needs query/filter/error redesign |
| Investments                | UI only                                      | Not implemented                   |
| Slot allocation            | Schema concept only                          | Not implemented                   |
| Wallet                     | Client-created placeholder balance           | Unsafe; rebuild                   |
| Ledger/accounting          | Schema only                                  | Not implemented                   |
| Deposits/payments          | UI/schema only                               | Not implemented                   |
| Withdrawals/payouts        | UI/schema only                               | Not implemented                   |
| ROI/maturity               | UI/schema only                               | Not implemented                   |
| KYC                        | UI/schema only                               | Not implemented                   |
| Admin                      | UI only, no effective RBAC                   | Unsafe; rebuild                   |
| Notifications              | UI/schema only                               | Not implemented                   |
| Referrals/rewards          | UI/schema only                               | Not implemented                   |
| Legal/trust content        | Static draft pages                           | Requires professional review      |
| Security                   | Exported rules unsafe/inconsistent           | Not production-ready              |
| Testing/operations         | No product tests/monitoring evidence         | Not production-ready              |

---

# 2. RENT BROWN Product Definition

**CONFIRMED:** RENT BROWN presents properties or property-associated businesses as investment opportunities. Users participate by purchasing a finite quantity of investment **slots**.

**CONFIRMED example:**

```text
Property/opportunity: Fotal
Total slots: 50
Price per slot: ₦1,000
Total configured capacity: ₦50,000
User purchase: 2 slots
Principal: ₦2,000
Configured ROI for the complete term: 50%
Expected profit: ₦1,000
Expected maturity value: ₦3,000
Configured duration example: 8 hours
```

**CONFIRMED:** Once available capacity is exhausted, no additional purchase may succeed. At completion/maturity, occupied capacity is intended to become available again.

**UNKNOWN:** The precise legal meaning of a slot. It may be a contractual participation unit, revenue-sharing unit, debt-like instrument, security, beneficial interest, or another arrangement. The software must not label it ownership/equity/shareholding unless legal documents establish that meaning.

**TARGET USERS — UNKNOWN:** The UI suggests retail investors in Nigeria (NGN defaults, Nigerian profile data), but supported countries, investor categories, age restrictions, and accreditation/sophistication requirements are not established.

---

# 3. Business/Product Model

## Established

- **CONFIRMED:** A property has finite configured capacity represented as slots.
- **CONFIRMED:** Users may acquire one or more slots.
- **CONFIRMED:** Each offer has a slot price, ROI percentage, and duration.
- **CONFIRMED:** ROI applies to the configured complete duration, not automatically per hour/day/week.
- **CONFIRMED:** Underlying properties/businesses are expected to generate service or operating revenue.
- **CONFIRMED:** Investor returns are intended to relate to the investment arrangement around that activity.

## Not established

- **DECISION REQUIRED:** Who legally owns the property and operating company?
- **DECISION REQUIRED:** What contractual right does a slot grant?
- **DECISION REQUIRED:** Is ROI fixed, targeted, variable, capped, or guaranteed? “Expected” should be used unless legally supportable.
- **DECISION REQUIRED:** How does actual business revenue affect the promised/expected payout?
- **DECISION REQUIRED:** How are losses, shortfalls, defaults, downtime, disputes, and delayed payment treated?
- **DECISION REQUIRED:** Which entity receives investor funds and which entity owes payouts?
- **DECISION REQUIRED:** What fees, taxes, withholding, reserves, and insurance apply?
- **DECISION REQUIRED:** Which jurisdictions and currencies are supported?

**LEGAL WARNING:** No reviewed evidence establishes securities, collective-investment, crowdfunding, lending, AML, KYC, consumer-protection, tax, custody, money-transmission, or data-protection compliance. Technical implementation must wait on qualified legal/compliance design for the launch jurisdictions.

---

# 4. Investment Model

## Recommended domain separation

- `Property` — stable physical/business opportunity information.
- `InvestmentPlan` — versioned offer terms: capacity, slot price, ROI, duration, eligibility, availability window.
- `InvestmentReservation` — short-lived hold on capacity and funds/payment intent.
- `Investment` — accepted user position with immutable economic snapshots.
- `LedgerTransaction`/`LedgerEntry` — monetary consequences.

A property must not directly carry mutable offer terms as its only source of truth. A property may have multiple sequential plans/rounds without rewriting historical positions.

## Investment state machine

```text
RESERVED
  ├─ payment/funding succeeds atomically → ACTIVE
  ├─ timeout → EXPIRED
  ├─ explicit cancellation before funding → CANCELLED
  └─ processing failure → FAILED

ACTIVE
  ├─ maturity reached → MATURITY_DUE
  ├─ authorized early exit (only if product permits) → EXIT_PENDING
  └─ exceptional correction → REVIEW_REQUIRED

MATURITY_DUE
  ├─ settlement succeeds → COMPLETED
  └─ retryable settlement failure → SETTLEMENT_PENDING

SETTLEMENT_PENDING
  ├─ retry succeeds → COMPLETED
  └─ manual intervention → REVIEW_REQUIRED
```

`MATURED` should not imply money was credited. Distinguish “term elapsed” (`MATURITY_DUE`) from “settlement completed” (`COMPLETED`). Never delete failed or cancelled positions.

---

# 5. Slot Architecture

## Chosen direction

**RECOMMENDED:** Quantity-based positions and counters, not one row/document per slot.

Per plan:

```text
total_slots
available_slots
reserved_slots
allocated_slots = total_slots - available_slots - reserved_slots
version
```

Individual slots add write volume and identity semantics without product benefit. A user's position stores `slot_quantity`.

## Atomic reservation

Use one serializable database transaction:

1. Lock the investment-plan row (`SELECT ... FOR UPDATE`) or perform a compare-and-swap update.
2. Confirm plan is open and within its availability window.
3. Confirm KYC/account/limits.
4. Confirm `available_slots >= requested_slots`.
5. Create reservation with a unique client idempotency key and expiry.
6. Decrement available and increment reserved.
7. Reserve wallet funds in the same transaction when wallet-funded, or link a payment intent when externally funded.
8. Commit.

Confirmation transaction converts reserved capacity to allocated capacity and creates the active investment. Expiry releases capacity. Constraints must enforce non-negative counters and `available + reserved <= total`.

**Concurrency test:** Two requests for the last slot must result in exactly one success, one deterministic capacity error, and no negative counters.

---

# 6. ROI Model

**CONFIRMED:** ROI is the return for the full configured duration.

```text
principal = slot_quantity × slot_price
profit = principal × roi_rate
expected_maturity_value = principal + profit
```

For 2 × ₦1,000 at 50%: principal ₦2,000; profit ₦1,000; expected maturity ₦3,000.

**RECOMMENDED representation:**

- Money: integer minor units (`200000` kobo), never JavaScript floating point.
- ROI: integer basis points (`5000` = 50%) or exact decimal in PostgreSQL (`NUMERIC(9,6)`). Basis points are sufficient only if product precision is limited to 0.01 percentage point.
- Snapshot on investment: slot price, slot quantity, principal, ROI, duration, expected profit, expected maturity, currency, plan version, fee/tax terms.
- Authoritative settlement: backend recomputes from immutable snapshots using deterministic decimal/integer arithmetic.

**DECISION REQUIRED:** Rounding policy, fee/tax order, whether expected profit can differ from actual profit, and how underperformance/losses are represented.

---

# 7. Duration/Maturity Model

## Storage

```text
duration_value: positive integer
duration_unit: HOURS | DAYS | WEEKS | MONTHS | YEARS
starts_at: UTC timestamp
matures_at: UTC timestamp
completed_at: nullable UTC timestamp
```

Duration belongs to `InvestmentPlan`; value/unit and calculated timestamps are snapshotted onto `Investment` when activated.

## Calculation rules

- Hours/days/weeks can be elapsed-duration arithmetic.
- Months/years require calendar arithmetic, not `30 days`/`365 days` assumptions.
- **DECISION REQUIRED:** End-of-month rule (e.g. Jan 31 + 1 month), leap-day rule, and business-day/holiday adjustment.
- Server clock calculates and persists `starts_at` and `matures_at` once.
- Store UTC instants. Store an optional business timezone only when calendar/legal schedules need it. Clients localize for display only.

## Processing

A durable scheduler enqueues due investment IDs. Workers claim rows with locking, check status and an idempotent settlement key, write ledger settlement, mark completion, release slots, and emit an outbox event in one transaction. Retries must be safe; duplicate jobs must not duplicate credit.

---

# 8. Wallet & Financial Model

## Recommended accounts

A wallet is not one mutable number. At minimum each user/currency needs logical accounts:

- available/withdrawable cash;
- reserved cash;
- pending incoming cash;
- bonus available;
- bonus restricted (if vesting/usage rules exist).

“Available” and “withdrawable” may be the same initially, but naming must reflect policy. If deposits can be invested before they can be withdrawn, separate them.

## Balance strategy

**RECOMMENDED:** Double-entry ledger is authoritative; cached account balances are maintained transactionally for fast reads.

- Every financial event creates one ledger transaction and balanced debit/credit entries.
- Sum of entries for each currency must balance to zero across the ledger.
- Cached balances update in the same database transaction.
- Completed entries are immutable.
- Corrections use reversal/adjustment transactions linked to originals.
- Daily automated reconciliation compares cached balances, ledger sums, provider settlements, and bank statements.

Example internal accounts include user cash liability, user reserved liability, platform clearing, payment-provider receivable, payout payable, investment principal escrow/allocated capital, ROI expense/payable, bonus expense/liability, and fee revenue. Exact accounting treatment requires a finance professional.

---

# 9. Transaction/Ledger Model

## Core structures

`ledger_transactions`:

- UUID/ULID primary key;
- immutable type/status/currency/reference;
- idempotency key with unique scope;
- actor and subject IDs;
- related aggregate IDs;
- provider reference;
- occurred/created/posted/reversed timestamps;
- metadata with redaction/size limits.

`ledger_entries`:

- primary key;
- transaction ID;
- account ID;
- direction (`DEBIT`/`CREDIT`);
- positive integer amount in minor units;
- currency;
- running balance snapshot (optional but useful);
- created timestamp.

`wallet_accounts`:

- owner, currency, account type;
- cached balance;
- status/version;
- unique owner+currency+type.

## Requirements

- No update/delete of posted ledger entries.
- Unique idempotency constraints.
- Foreign keys and check constraints.
- Reference IDs safe to expose publicly must differ from internal sequential IDs.
- Administrative adjustments require reason, evidence, dual authorization above a threshold, and audit event.
- Metadata cannot replace normalized required relationships.

---

# 10. Deposit Model

```text
CREATED → PROVIDER_PENDING → VERIFIED → CREDITED
                    ├─ FAILED
                    ├─ CANCELLED
                    └─ EXPIRED
CREDITED → REVERSED (chargeback/refund when applicable)
```

1. Client requests a deposit intent with amount/currency/method/idempotency key.
2. Backend validates policy and creates provider intent through `PaymentProvider`.
3. Client completes provider UI.
4. Signed webhook—not client redirect—confirms outcome.
5. Backend stores webhook event uniquely, verifies amount/currency/reference, and posts ledger credit atomically.
6. Duplicate webhook returns success without reposting.
7. Reconciliation finds provider-success/backend-pending discrepancies.

Do not credit from a client callback. Do not expose provider secret keys. Preserve raw webhook payload only with encryption, retention, and redaction controls.

---

# 11. Withdrawal Model

```text
REQUESTED → FUNDS_RESERVED → REVIEW_PENDING → APPROVED → PROCESSING → COMPLETED
      ├─ validation failure → REJECTED
      ├─ user cancellation (policy-limited) → CANCELLED + RELEASED
      └─ provider failure → FAILED + RELEASED/REVERSED
```

Recommended request transaction atomically moves value from available to reserved. Approval does not subtract again. Successful provider settlement moves reserved liability to payout clearing. Failure releases reserved funds through a new ledger transaction.

Requirements:

- idempotency at request and provider-disbursement layers;
- verified payout method ownership;
- KYC/account/limits/risk checks;
- cooldown and velocity controls;
- provider webhook or polling confirmation;
- reasoned admin decisions and audit logs;
- maker-checker approval for high-risk amounts;
- no client-controlled status transitions.

**DECISION REQUIRED:** Whether review is always manual, threshold/risk based, or fully automatic.

---

# 12. Payout/Earnings Model

- Investment principal return and profit are separate ledger transaction types.
- “Expected earnings” derives from investment snapshots.
- “Realized earnings” derives only from posted profit entries.
- “Lifetime earnings” is a query/materialized report, not a user-editable field.
- A withdrawal is an external payout workflow; a separate generic `payouts` table becomes useful only if multiple aggregates can initiate provider transfers independently.
- **RECOMMENDED:** Introduce `payout_attempts` under withdrawals if provider retries need distinct references/statuses. Do not overwrite previous attempts.

**DECISION REQUIRED:** Source/funding/reserve policy for ROI, payout delays, loss treatment, tax withholding, and investor statements.

---

# 13. KYC Model

## Current state

**OBSERVED:** User and admin KYC pages exist. Schema contains user KYC summary and `kycSubmissions`. No verification function/provider flow/admin decision logic is present. Current exported rules allow unrestricted access to `kycSubmissions`, creating severe privacy and approval-tampering risk.

## Recommended model

- `kyc_cases`: user, provider, requested/current tier, status, submitted/reviewed/expired timestamps, reason codes.
- `kyc_checks`: provider check references and results; one case may have multiple attempts.
- `kyc_documents`: document type, encrypted storage key/provider token, retention status—never public URL.
- `kyc_decisions`: reviewer, decision, reason, policy version, timestamp.

State machine: `DRAFT → SUBMITTED → IN_REVIEW → APPROVED | REJECTED | MORE_INFO_REQUIRED | EXPIRED`; rejected/more-info cases support resubmission without deleting history.

Data requirements: encryption, least privilege, private storage, malware/content checks, signed short-lived URLs, retention/deletion policy, data-subject request process, admin access logging, and no KYC documents in analytics/logging.

---

# 14. Referral/Rewards Model

## Current state

**OBSERVED:** `ReferralDashboard` and `RewardsBonuses` contain designed/static statistics and referral concepts. User legacy fields and a `referrals` collection exist. No attribution, qualification, payout, anti-fraud, or ledger logic exists.

## Recommended model

- Immutable referral attribution: referrer, referred user, code snapshot, campaign, attributed timestamp.
- Qualification events: KYC completion, first settled deposit, first active investment, or another explicit business rule.
- Rewards create ledger transactions into a dedicated bonus account.
- Bonus use/withdrawability is policy-driven and versioned.
- Fraud controls: self-referral prevention, device/payment-instrument linkage, velocity limits, duplicate identity detection, cooling period, chargeback clawback, campaign caps, manual review.

**DECISION REQUIRED:** Attribution window, qualification event, reward amount/formula, caps, expiry, vesting, and whether bonus is withdrawable.

---

# 15. Notification Model

## Events to support

- investment reservation/activation/maturity/settlement/failure;
- deposit pending/success/failure/reversal;
- withdrawal request/approval/processing/success/failure;
- KYC submission/more-info/approval/rejection/expiry;
- property/plan material updates;
- security events (new login, password/email change, payout-method change);
- referral qualification/reward;
- admin communications.

## Architecture

Domain transaction writes an outbox event. Background workers deliver through adapters:

- in-app notification store;
- Expo Push initially, replaceable through `PushProvider`;
- transactional email adapter;
- SMS adapter only for justified high-value events.

Track user preferences, legal/transactional overrides, locale, delivery attempts, provider IDs, read state, and deduplication key. Do not block financial transactions on notification delivery.

---

# 16. Property Model

Recommended fields/groups:

- identity: ID, slug, public name, status;
- description: summary, details, category/type;
- location: redacted/public location and optional private exact address;
- media: ordered images/video with accessibility metadata;
- business: operator/service description, operating model, risk disclosures;
- valuation/capacity: currency and independently reviewed values where applicable;
- ownership/issuer references;
- publication and version timestamps;
- document/proof associations.

Investment economics belong to `investment_plans`, not directly to property. Material edits after investment should create versions or disclosure events rather than silently rewriting historical facts.

---

# 17. Property Proof & Transparency

## Observed UI intent

`PropertyProofPage`, document cards, proof cards, media components, company information, and earnings reports show a clear intended trust/transparency layer. Current content is primarily static/mock.

## Recommended disclosure surface

- issuer/operator identity;
- property/business description and location appropriate for disclosure;
- ownership/lease/title evidence status;
- independently verifiable document metadata;
- offer capacity, sold/reserved/available slots;
- term, ROI definition, fee/tax/risk disclosures;
- historical performance clearly labeled and never implied as guaranteed future performance;
- material updates and document version history;
- underlying revenue reports where legally and contractually appropriate;
- source, reviewer, date, expiry, and verification status for each proof item.

Documents need access classification, hashes, versioning, expiration, review state, and auditability. Never imply that uploading a document proves legitimacy without review.

---

# 18. Admin System

## Current UI areas

- `AdminDashboard`
- `AdminUserManagement`
- `AdminKYCApproval`
- `AdminPropertyManagement`
- `AdminAddEditProperty`
- `AdminInvestmentManagement`
- `AdminDepositManagement`
- `AdminContentManagement`

No dedicated withdrawal-management page is currently listed; this is a functional gap.

## Recommended RBAC

Roles should be composable permissions, not only `isAdmin`:

- support read-only;
- KYC reviewer;
- property editor/publisher;
- finance operator;
- withdrawal approver;
- compliance/auditor;
- system administrator;
- super-admin/break-glass.

Enforce permissions in backend policy checks. UI hiding is convenience only. Require MFA for staff, shorter sessions, device/session visibility, IP/risk controls where appropriate, and immutable audit logs. High-risk actions should support maker-checker separation.

Admin actions include user restrictions, KYC decisions, property/plan drafts and publication, investment monitoring (not arbitrary editing), deposit reconciliation, withdrawal approval, ledger adjustments under control, reports, content/configuration, and audit review.

---

# 19. Authentication & Authorization

## Current observation

Firebase email/password signup, login, password reset, logout infrastructure, and auth-aware initial routing now exist. Signup updates a user record and creates a wallet. Email verification UI exists, but end-to-end enforcement is not established. Route definitions show no clear per-route `requireAuth` declarations; direct-route protection and admin authorization remain unproven.

Signup contains data-quality defects: two email controllers are used inconsistently, display name concatenates name and an email-controller value, `uid` is written as an empty string, and wallet funding is client-authored.

## Recommended abstraction

The client depends on an `AuthSession` interface and backend-issued API session/token contract, not directly on Firebase-specific objects throughout features. An identity adapter may initially use Firebase Auth, Auth0, Cognito, Clerk, or another provider. Backend maps external subject IDs to internal user IDs and remains authoritative for account status and permissions.

Requirements: verified email policy, secure token validation, refresh/revocation, MFA for admins, optional user MFA, rate limiting, credential-stuffing protection, session/device management, account recovery, audit events, and generic login error messages.

---

# 20. Complete Current UI Audit

## Page inventory (current 52-page project)

Status applies to the refreshed project, not the original 2026-08 audit.

| Page                      | Purpose/role/journey                      | Current status and dependencies                                                                           | Rebuild disposition                                                            |
| ------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Onboarding                | New-user introduction                     | UI implemented; auth-aware root sends logged-out users here                                               | Preserve concepts; redesign concise mobile onboarding                          |
| WebOnboarding             | Public desktop/marketing landing          | UI + live unfiltered property query                                                                       | Web should likely be separate responsive site; reuse content/design            |
| SignUp                    | Registration                              | Partial Firebase Auth/user/wallet write; unsafe hardcoded ₦500-like balance and malformed profile mapping | Rebuild completely                                                             |
| LogIn                     | Email/password login                      | Firebase Auth wired                                                                                       | Rebuild with provider-neutral auth service                                     |
| ForgotPassword            | Password reset                            | Firebase reset call wired; observed state sets `emailSent = false` after send, likely UI bug              | Rebuild/fix                                                                    |
| VerifyEmail               | Verification instructions                 | UI exists; enforcement unknown                                                                            | Preserve flow; backend/session enforcement required                            |
| AccountRestricted         | Restricted-account explanation            | Primarily static                                                                                          | Preserve as state-driven screen                                                |
| Dashboard                 | User overview                             | Mostly hardcoded/mock; prior invalid/stale query history                                                  | Preserve information architecture; rebuild data projections                    |
| InvestmentMarketplace     | Browse properties                         | Live `properties` stream; filtering/pagination/status gating not established                              | Preserve; redesign query/API states                                            |
| PropertyDetails           | Property view via `propertyDoc` reference | One actual route parameter now exists; data-binding extent mixed                                          | Preserve; use stable property ID/deep link                                     |
| ListingDetail             | Alternate property detail                 | Mock/static duplicate                                                                                     | Merge into PropertyDetails                                                     |
| NewScreen2                | Alternate property detail/WIP             | Mock/static duplicate                                                                                     | Remove or merge                                                                |
| NewScreen1                | Educational/tutorial listing              | UI only; role in journey unclear                                                                          | Product review; merge into learning/content hub or remove                      |
| InvestmentCheckout        | Select amount/slots                       | UI only; no trusted quote/reservation                                                                     | Preserve journey; rebuild around server quote                                  |
| InvestmentConfirmation    | PIN/review confirmation                   | UI only; no secure authorization                                                                          | Replace with biometric/device confirmation where justified; server idempotency |
| InvestmentSuccess         | Purchase receipt                          | Static/mock                                                                                               | Preserve as server-result receipt                                              |
| MyInvestments             | Position list                             | Static/mock                                                                                               | Preserve; API pagination and filters                                           |
| MyInvestmentDetail        | Position/timeline/earnings                | Static/mock                                                                                               | Preserve; server projection and disclosures                                    |
| PortfolioDashboard        | Aggregate holdings/charts                 | Static/mock                                                                                               | Preserve selectively; derived backend reports                                  |
| MyWallet                  | Balances/actions                          | Static/mock                                                                                               | Preserve visual concept; rebuild financial semantics                           |
| Deposit                   | Funding form                              | UI only                                                                                                   | Preserve; provider-driven intent flow                                          |
| Withdraw                  | Withdrawal form                           | UI only/static destinations                                                                               | Preserve; verified method + reservation flow                                   |
| TransactionHistory        | Mobile history variant                    | Static/mock                                                                                               | Merge with TransactionHistory2 into responsive history                         |
| TransactionHistory2       | Table/desktop history variant             | Empty/UI-only                                                                                             | Merge; admin/user variants can share primitives                                |
| PaymentInformation        | Payout method management                  | Static/mock                                                                                               | Preserve; tokenize sensitive destinations                                      |
| WalletEarnings            | Earnings summary/chart                    | Static/mock                                                                                               | Merge with portfolio/reporting where appropriate                               |
| EarningsReports           | Detailed reports                          | UI only                                                                                                   | Preserve after legal/accounting requirements defined                           |
| RewardsBonuses            | Bonus summary                             | Static/mock                                                                                               | Preserve only after policy decision                                            |
| ReferralDashboard         | Referral attribution/stats                | Static/mock                                                                                               | Preserve only after policy/fraud design                                        |
| Notifications             | Notification inbox                        | Static/mock                                                                                               | Preserve; outbox-backed service                                                |
| MyProfile                 | Profile display                           | Static/mixed                                                                                              | Preserve                                                                       |
| EditProfile               | Profile form                              | Firestore update action exists but writes an empty update payload in observed generated code              | Rebuild/fix                                                                    |
| Settings                  | Preferences/logout                        | Logout action exists; persistence largely absent                                                          | Preserve; split account/security/preferences cleanly                           |
| SecuritySettings          | Password/PIN UI                           | Mostly UI only                                                                                            | Preserve security intent; redesign against identity provider                   |
| UserProfileKYC            | User KYC status/tier/limits               | Static/mock                                                                                               | Preserve; provider/backend-driven                                              |
| AboutUs                   | Company story                             | Static content                                                                                            | Carry forward only reviewed copy                                               |
| HowItWorks                | Product explainer                         | Static content                                                                                            | Carry forward after business/legal model is finalized                          |
| ContactUs                 | Contact/support form                      | UI only                                                                                                   | Preserve with ticket/email backend and abuse controls                          |
| CompanyInformation        | Registration/company details              | Static claims                                                                                             | Legal verification required before reuse                                       |
| TermsOfService            | Terms                                     | Static draft                                                                                              | Replace with counsel-approved versioning/acceptance                            |
| CookiePolicy              | Cookie/privacy-related content            | Static draft; no separate current Privacy Policy page observed                                            | Legal review; add required privacy/data notices                                |
| PropertyProofPage         | Proof/documents/transparency              | Static/mock                                                                                               | Preserve strongly; redesign with provenance/versioning                         |
| Page404ErrorPage          | Not-found                                 | UI only                                                                                                   | React Navigation/Expo Router fallback                                          |
| Page500ErrorPage          | Generic server error                      | UI only                                                                                                   | Replace with error boundaries/retry states                                     |
| AdminDashboard            | Admin overview                            | UI only; no effective RBAC                                                                                | Rebuild as separate protected admin web app if possible                        |
| AdminUserManagement       | Search/manage users                       | UI only                                                                                                   | Rebuild with permission/audit controls                                         |
| AdminKYCApproval          | KYC review                                | UI only                                                                                                   | Rebuild with least privilege and evidence controls                             |
| AdminPropertyManagement   | Property catalogue admin                  | UI only                                                                                                   | Rebuild                                                                        |
| AdminAddEditProperty      | Property/plan form                        | UI only                                                                                                   | Rebuild with drafts/versioning/validation                                      |
| AdminInvestmentManagement | Investment monitoring                     | UI only                                                                                                   | Rebuild; restrict mutation powers                                              |
| AdminDepositManagement    | Deposit review/reconciliation             | UI only                                                                                                   | Rebuild as finance operations                                                  |
| AdminContentManagement    | Content/FAQ/media administration          | UI only; no clear content backend                                                                         | Decide CMS versus internal module                                              |

## Major components

| Component group  | Existing components                                                                                                | Audit/disposition                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Property         | `PropertyCard`, `PropertyMiniCard`, `PropertyRowRefined`, `PropertyMediaItem`, `MediaThumbnail`                    | Preserve visual hierarchy; consolidate variants and bind typed view models  |
| Investment       | `InvestmentCard0fe9fbb1`, `InvestmentItem`, `InvestmentTableRow`, `CheckoutSummaryRow`, `RoiBadge`, `TimelineNode` | Preserve concepts; rename opaque generated component and standardize states |
| Wallet/reporting | `BalanceCard`, `FinancialRow`, `EarningsTableRow`, `SummaryItem`, `SummaryRow`, `SummaryStatCard`                  | Preserve primitives; never calculate authoritative money in components      |
| Status           | `StatusPill`, `StatusPillCustom`, `StatusBadgeF2f9f2e85b9c6ebc`                                                    | Consolidate into one semantic status component                              |
| KYC/proof        | `KycListItem`, `DocCard`, `DocCardItem`, `DocProofCard`, `DetailField`                                             | Preserve; add sensitivity/access states                                     |
| Navigation       | `desktopNav`, `NavItem`, `NavLink`, duplicate local nav links, `FooterSection`                                     | Redesign for Expo Router; remove duplicates                                 |
| Forms/security   | `InputField`, `PinSlot`, `SecurityBullet`, `AccountDetailRow`, `paymentMethod`                                     | Preserve behavior concepts; use accessible form primitives                  |
| Content          | `ContentListItem`, `ContentTabItem`, `FaqItem`, `VideoCard`, `TermsSection`, `TocItem`, `PolicyNavItem`            | Reuse only reviewed content; consider CMS                                   |
| Marketing        | `OnboardingStep`, `TestimonialCard`, `TeamMember`, `IndicatorDot`                                                  | Preserve selectively; validate claims/testimonials                          |
| Profile/admin    | `ProfileHeader`, `LocalUserRow`, filters/dropdowns                                                                 | Preserve patterns, enforce server authorization                             |

## Navigation audit

- Root route is auth-aware: logged-in → `Dashboard`, logged-out → `Onboarding`.
- `PropertyDetails` accepts a property document reference; `ForgotPassword` accepts email. Most screens lack meaningful route parameters.
- Intended journeys exist visually, but action wiring remains sparse.
- No reliable role-aware admin route guard was observed.
- Duplicated mobile/web/detail/history pages reveal prototype iteration rather than a settled information architecture.
- Loading is present on live property streams, but systematic empty/error/offline states are absent.

---

# 21. User Journeys

## New user

Recommended: install/open → onboarding → sign up → verify email/phone as policy requires → accept versioned terms → KYC eligibility prompt → fund wallet or browse first → select opportunity → obtain server quote → reserve/fund → receipt → active position.

Current: onboarding/auth UI exists and email signup works, but profile creation is malformed, wallet is credited client-side, KYC is not enforced, and investment flow is static.

## Existing user

Login → dashboard projection → marketplace/portfolio/wallet → position details/earnings → withdrawal. Current login works; downstream state is mostly mock.

## Investment

Browse → property/proof → plan terms/risks → choose slots → server quote → idempotent reservation → wallet/provider funding → atomic activation → active timeline → maturity due → settlement → completed receipt and released capacity.

## Deposit

Enter amount/method → backend intent → provider UI → signed webhook → verification → ledger credit → notification/history. Current flow stops at UI.

## Withdrawal

Choose verified destination → enter amount → server validation → reserve funds → risk/review → provider transfer → completion or release/reversal. Current flow stops at UI.

## KYC

Draft/upload → submit → provider/admin review → approved/rejected/more-info → resubmit as a new attempt → expiry/reverification. Current user/admin pages are not connected.

## Admin

Login with MFA → role-scoped dashboard → queue/task detail → evidence review/action → reason/confirmation → backend policy → audit record → notification. Financial corrections and high-value withdrawals require stronger approval controls.

---

# 22. Existing Firebase Audit

## Current schema

**OBSERVED collections:** `users`, `properties`, `transactions`, `deposits`, `withdrawals`, `investments`, `appConfig`, `wallets`, `investmentPlans`, `payoutMethods`, `kycSubmissions`, `notifications`, `referrals`, `auditLogs`.

The schema foundation added minor-unit fields, basis points, plan separation, references, idempotency fields, and timestamps. Legacy doubles and duplicate fields remain for compatibility.

## Current usage

- Live property queries: marketplace and web onboarding.
- Auth: email signup/login/reset; logout infrastructure.
- Signup: user update and wallet create.
- Edit profile: update call with no observed populated fields.
- Core financial collections: no trusted writer/business logic.

## Rules contradiction

The schema defines financial collections as top-level, while current generated rules match `transactions`, `deposits`, `withdrawals`, `investments`, and `wallets` under `/users/{parent}/...`. Other collections have `allow ...: if true`. This repeats the version-1 path inconsistency.

A prior session created and reportedly deployed stricter Firestore rules, but the latest FlutterFlow pull regenerated the local rules back to an unsafe shape. **UNKNOWN:** whether the live Firebase rules still contain the previously deployed baseline or were later overwritten. The repository snapshot cannot establish live deployment state. Treat live security as unverified until inspected directly in Firebase.

## Firebase services

- Firebase Auth now present.
- Firestore present.
- Storage rules present; prior attempt reported Storage had not been initialized at that time. Current live status is unknown.
- Index file is empty.
- Functions: only `onUserDeleted` deletes the user document; it does not safely archive/anonymize financial history.
- API manager has an empty call map.
- Payment/OneSignal/LangChain libraries in function dependencies are unused and do not prove integration.

---

# 23. Existing Architecture Audit

## Strengths

- Broad product surface and coherent visual exploration.
- Reusable components for major domain concepts.
- Property/plan/investment/wallet/transaction separation was introduced in schema work.
- Minor-unit and basis-point concepts were introduced.
- Auth and property reads progressed beyond the original static prototype.

## Weaknesses

- Generated client and Firebase schema/rules remain tightly coupled.
- Business invariants are not represented in executable backend code.
- Legacy and new schema coexist, producing multiple possible sources of truth.
- UI writes financial state directly.
- Firestore hierarchy differs between generated models/rules.
- Empty indexes cannot support planned operational queries at scale.
- No durable job processing, outbox, webhook inbox, reconciliation, or observability.
- Generated-code dependency/build issues were previously observed (`font_awesome_flutter`/`page_transition` incompatibility with installed Flutter).

---

# 24. Security Audit

| Risk                               | Current evidence                                               | Required rebuild control                                             |
| ---------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| Client financial manipulation      | Signup creates wallet with `500.0`; permissive wallet rules    | Server-only ledger posting; no client balance writes                 |
| IDOR/cross-user data               | Rules path mismatch and public collections                     | API authorization on every resource; ownership policies; tests       |
| Admin privilege escalation         | No effective RBAC/route gating                                 | Backend permission system, trusted claims, MFA, audit                |
| KYC exposure/tampering             | Public KYC collection rules and public user storage read       | Private encrypted storage, scoped URLs, least privilege              |
| Slot race                          | No allocator                                                   | Serializable transaction/row lock + constraints                      |
| Replay/duplicate operation         | No business idempotency implementation                         | Unique idempotency keys and request-result replay                    |
| Duplicate webhook                  | No webhook endpoints                                           | Signature verification, webhook inbox unique provider event ID       |
| Ledger tampering                   | No ledger writer; public transaction rules                     | Append-only server-owned ledger                                      |
| Withdrawal fraud                   | UI only                                                        | Fund reservation, risk controls, verified destination, maker-checker |
| Secret leakage                     | No discovered committed keys in audited code; many unused SDKs | Secret manager, least privilege, rotation, dependency cleanup        |
| Rate abuse                         | No evidence                                                    | API gateway/middleware rate limits and abuse monitoring              |
| Session/account abuse              | Basic Firebase auth only                                       | verification, MFA/admin controls, revocation/device sessions         |
| Audit deletion                     | Audit collection publicly writable                             | immutable backend-only audit store and retention                     |
| User deletion destroys evidence    | Function deletes user doc                                      | anonymization/retention policy preserving legally required ledgers   |
| Data poisoning/report manipulation | Public plan/referral/notification writes                       | server-only write paths and schema validation                        |

Additional controls: TLS, encryption at rest, field-level redaction, CSP for web admin, dependency scanning, SAST, mobile certificate pinning only if operationally manageable, secure logging, anomaly alerts, backups/PITR, incident response, and periodic access reviews.

---

# 25. Scalability Audit

## Simple reliable starting point

- Modular monolith API, not microservices.
- Managed PostgreSQL with transactions, constraints, indexes, backups, and read replicas later.
- Redis only when needed for rate limits/cache/queues.
- Durable queue/job runner for maturity, notifications, reconciliation, and provider polling.
- Object storage + CDN for public media; private signed access for KYC.
- Cursor pagination on properties, investments, transactions, and admin queues.

## Scale paths

- Partition/archive ledger by time only after measured need.
- Use read models/materialized views for dashboards and reports.
- Search starts with indexed PostgreSQL text/trigram; external search only when requirements justify it.
- Maturity workers claim batches with `FOR UPDATE SKIP LOCKED`.
- Outbox/inbox patterns decouple providers without losing events.
- Cache public property catalogue with explicit invalidation/versioning.
- Avoid unbounded real-time subscriptions for all financial history.

---

# 26. Testing Strategy

## Unit

- integer money arithmetic and formatting;
- ROI and rounding policy;
- month/year maturity edge cases;
- state transition guards;
- slot and limit validation;
- fee/tax formulas;
- permissions/policy rules.

## Integration

- account/wallet bootstrap;
- deposit webhook → balanced ledger → wallet cache;
- wallet-funded investment reservation/activation;
- external-payment investment activation;
- maturity settlement and slot release;
- withdrawal reserve/success/failure release;
- refund/reversal;
- KYC/admin decisions and audit/outbox.

## Concurrency/idempotency

- two users buy last slot;
- same investment request repeated concurrently;
- same withdrawal repeated;
- duplicate/out-of-order provider webhooks;
- maturity worker retries/crashes after commit;
- simultaneous wallet debit requests.

## Security

- unauthenticated and expired tokens;
- cross-user resource access;
- ordinary user calls admin endpoints;
- forged amount/status/ROI/maturity;
- payout-method substitution;
- webhook signature/replay attacks;
- mass-assignment and metadata injection;
- KYC signed-URL expiration.

## Frontend/E2E

Use Jest/Vitest for pure TypeScript, React Native Testing Library for screens/components, MSW for API contracts, and Maestro or Detox for critical mobile journeys. Backend tests run against real PostgreSQL containers and provider sandbox contracts. Financial invariants should use property-based tests.

---

# 27. LESSONS LEARNED FROM VERSION 1

1. A complete-looking screen is not a feature.
2. Financial balances cannot be initialized or mutated by the client.
3. A schema without server invariants creates false confidence.
4. Collection names/paths must be canonical across app, rules, backend, and docs.
5. Compatibility fields become dangerous if authority is not explicit.
6. Firestore is not automatically wrong, but relational financial workflows fit PostgreSQL constraints and transactions better.
7. Admin UI without backend authorization is a liability.
8. KYC metadata and evidence cannot use broad public rules.
9. Generated rules can regress after tool synchronization; security policy needs an owned source and deployment pipeline.
10. Payment SDK dependencies are not payment integration.
11. “Expected ROI” copy can create legal/product risk if terms and downside are unresolved.
12. Duplicate page/component variants signal unsettled information architecture.
13. Auth success does not imply correct profile provisioning; current signup mappings prove this.
14. User deletion must not erase immutable financial/audit obligations.
15. No launch should occur without reconciliation, idempotency, audit logs, monitoring, and concurrency tests.
16. Generated Flutter code should not be mechanically ported to React Native; carry product intent, not accidental implementation.

---

# 28. What Is Complete

- **OBSERVED:** Broad UI design exploration for user, admin, investment, wallet, trust, and content journeys.
- **OBSERVED:** Consistent brown/neutral brand palette and component patterns.
- **OBSERVED:** Email/password login/signup/reset plumbing exists.
- **OBSERVED:** Root routing reacts to logged-in state.
- **OBSERVED:** Property collection rendering exists in two surfaces.
- **OBSERVED:** A richer conceptual Firestore schema exists.
- **CONFIRMED:** Slot/ROI/duration examples and core product concept are established.

“Complete” here means present as prototype/design, not production-ready.

# 29. What Is Incomplete

Investment execution, slot reservation, payment verification, ledger, wallet authority, withdrawal processing, maturity settlement, KYC, RBAC, admin operations, notifications, referrals, reconciliation, analytics, reporting, error/empty/offline states, legal content, automated tests, CI/CD, monitoring, and operational runbooks.

# 30. What Is Wrong

- Client-issued wallet value.
- Unsafe/inconsistent generated rules.
- Empty UID and malformed signup field mappings.
- Legacy floating-point financial fields.
- Multiple sources of truth.
- Top-level/subcollection contradictions.
- No posted ledger or balancing invariant.
- No atomic investment aggregate operation.
- Publicly writable sensitive/admin collections.
- No effective admin authorization.
- Static data presented as if real.
- Empty indexes/functions/API integration.
- Direct user deletion incompatible with financial record retention.

# 31. What Should Be Preserved

- Product concept and explicit examples, subject to legal validation.
- Brown/cream visual identity: primary `#5D4037`, secondary `#8D6E63`, light background `#FFFDF8`, dark text `#2D2624`, green success `#388E3C`.
- Plus Jakarta Sans typography direction.
- Property cards, investment summaries, wallet summaries, proof/document surfaces, status badges, and timeline concepts.
- Marketplace → details/proof → checkout/review → receipt journey.
- Portfolio, transaction history, KYC, notifications, profile/settings, and admin product scope.
- Property/plan separation and immutable snapshots.

# 32. What Should Be Rebuilt

Auth provisioning, all backend APIs, database, ledger/wallet, payments, investment/slot engine, withdrawals, maturity jobs, KYC, RBAC/admin, notifications, referrals, reporting, storage security, navigation guards, forms, validation, state handling, tests, deployment, and observability.

# 33. What Should Be Removed

- Generated Flutter source as a new-app dependency.
- Client financial writes and starter credit.
- Duplicate detail/history/status/nav component variants after design consolidation.
- Legacy money doubles and financial fields on users.
- Unused payment/AI/media dependencies.
- Public sensitive rules.
- Empty generic API proxy.
- WIP `NewScreen1`/`NewScreen2` unless product explicitly retains their content.
- Unverified legal/company/performance claims.

# 34. Open Product Questions

- Exact slot meaning and customer promise.
- Fixed versus variable/actual return.
- Early exit/cancellation/transferability.
- Minimum/maximum holdings and concentration limits.
- Slot release after maturity and behavior of closed plans.
- KYC tiers and feature/amount gates.
- Bonus usage, withdrawal, expiry, and vesting.
- Notification channel preferences.
- Public/private property data.
- Single versus multiple currencies/countries.

# 35. Open Business Questions

- Issuer/operator/property ownership structure.
- Revenue source and payout reserve model.
- Payment, payout, banking, KYC, email/SMS providers.
- Fees, taxes, commissions, chargebacks, losses, defaults.
- Admin operating model and approval thresholds.
- Customer support, dispute, refund, and incident processes.
- Expected launch scale and service-level objectives.

# 36. Open Legal/Compliance Questions

- Instrument classification and offering permissions.
- Investor eligibility and disclosures.
- AML/KYC/sanctions/PEP obligations.
- Custody/money-transmission/payment licensing implications.
- Marketing and return/guarantee language.
- Data controller/processor roles and cross-border transfers.
- KYC/financial/audit retention.
- Terms, privacy notice, cookie/analytics consent.
- Tax statements and withholding.
- Electronic signatures and evidence of consent.
- Complaint, cooling-off, cancellation, insolvency, and wind-down treatment.

# 37. Recommended React Native Architecture

## Stack

- Expo managed workflow with development builds; prebuild only when native integrations require it.
- TypeScript strict mode.
- Expo Router for file-based navigation/deep links.
- TanStack Query for server state/cache/retries.
- Zustand only for small cross-screen client/UI state; avoid duplicating server state.
- React Hook Form + Zod for forms and shared contract validation.
- Generated OpenAPI client behind feature services.
- Expo SecureStore for refresh/session secrets; never AsyncStorage for sensitive tokens.
- Expo Notifications behind an app adapter.
- Sentry (or equivalent) with PII scrubbing; analytics behind a provider interface.
- `expo-image`, document picker/image picker, and backend-issued signed upload URLs.

## Principles

- Feature-oriented modules.
- Domain types independent of API/generated DTOs.
- Money serialized as strings or integer minor units, never JS decimals.
- Mutations use idempotency keys.
- Offline is read-cache only for financial screens; never queue money-moving commands silently.
- Explicit loading, empty, stale, retry, partial, and error states.
- Accessibility, reduced motion, dynamic text, and screen-reader labels from the start.
- Admin should preferably be a separate web application, not bundled into the consumer mobile app.

# 38. Recommended Backend Architecture

## Initial shape: modular monolith

- TypeScript backend (NestJS or Fastify with disciplined modules) or another team-approved typed server platform.
- PostgreSQL as transactional source of truth.
- REST/OpenAPI initially; GraphQL is unnecessary unless demonstrated.
- Background worker and durable queue.
- Redis for queue/rate limiting only when required.
- Object storage adapter.
- Transactional outbox and webhook inbox.

Modules: Identity, Users, Authorization, Properties, Investment Plans, Investments/Reservations, Wallet/Ledger, Payments/Deposits, Withdrawals/Payouts, KYC, Referrals/Rewards, Notifications, Admin, Audit, Reporting.

Provider ports:

```text
IdentityProvider
PaymentProvider
PayoutProvider
KycProvider
ObjectStorageProvider
NotificationProvider (push/email/SMS)
Clock
IdGenerator
Database transaction/repository interfaces
```

Provider DTOs stay inside infrastructure adapters. Domain/application services operate on internal commands/results. Do not create abstraction for its own sake: abstract external providers and persistence boundaries where replacement/testing value is real.

# 39. Recommended Database Architecture

## Preferred database

**RECOMMENDED:** PostgreSQL for the financial and investment core. Firebase may remain for identity, push, analytics, or a transitional read layer, but domain logic should not depend on Firestore documents.

## Core tables

| Table                                  | Core fields                                                             | Ownership/mutability                 | Important indexes/constraints                     |
| -------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------- |
| `users`                                | id UUID, external_subject, email, profile, account_status               | profile mutable; status server/admin | unique external subject/email; status index       |
| `roles`, `permissions`, `user_roles`   | normalized RBAC                                                         | server/admin only                    | unique assignments                                |
| `properties`                           | id, slug, content/status/operator/version                               | admin/versioned                      | unique slug; status+published_at                  |
| `property_documents`                   | property, type, storage key, hash, review/version                       | admin/server                         | property+status/type                              |
| `investment_plans`                     | property, currency, slot price, counters, ROI, duration, status/version | server/admin; counters transactional | checks on counters/money/duration; status+window  |
| `investment_reservations`              | user, plan, quantity, amount, expiry, status, idempotency               | server                               | unique user/idempotency; status+expires_at        |
| `investments`                          | user, plan/property, immutable snapshots, dates/status                  | server only                          | user+status+created; status+matures_at            |
| `wallet_accounts`                      | user, currency, account type, cached balance/version                    | server only                          | unique user+currency+type                         |
| `ledger_transactions`                  | type/status/currency/idempotency/references/timestamps                  | append-only server                   | unique scoped idempotency/reference               |
| `ledger_entries`                       | transaction, account, debit/credit, amount                              | immutable server                     | transaction/account/created indexes; amount check |
| `deposit_intents`                      | user, provider, amount, status, references                              | server                               | provider reference unique; user+created           |
| `webhook_events`                       | provider, event ID, hash/status/payload reference                       | server                               | unique provider+event ID                          |
| `withdrawals`                          | user, destination, amounts, status, review                              | server                               | user+status; status+created                       |
| `payout_attempts`                      | withdrawal, provider reference, attempt/status                          | server                               | provider reference unique                         |
| `payout_methods`                       | user, provider token, masked fields/status                              | user request/server verification     | user+status/default uniqueness                    |
| `kyc_cases/checks/documents/decisions` | provider refs, status, encrypted storage refs                           | restricted                           | user+status; review queue indexes                 |
| `referrals`, `reward_grants`           | attribution/qualification/reward                                        | server                               | unique referred user; campaign/referrer           |
| `notifications`, `delivery_attempts`   | user/event/channel/read/delivery                                        | server/user read state               | user+created/read                                 |
| `outbox_events`                        | aggregate/event/payload/status                                          | server                               | status+next_attempt                               |
| `audit_events`                         | actor/action/target/redacted diff/request                               | append-only                          | target/time, actor/time, request ID               |
| `terms_versions`, `user_consents`      | document hash/version/acceptance                                        | immutable evidence                   | unique user+terms version                         |

Use row-level security only as defense in depth if the team can operate it correctly; API authorization remains mandatory. Database migrations are version-controlled and forward-tested.

# 40. Recommended Repository/Code Structure

A monorepo keeps contracts and domain packages aligned:

```text
apps/
  mobile/                 # Expo consumer app
  admin-web/              # protected operations console
  api/                    # HTTP application
  worker/                 # jobs, outbox, reconciliation
packages/
  domain/                 # money, ROI, duration, state machines; no framework imports
  contracts/              # OpenAPI schemas/generated types or shared Zod contracts
  database/               # schema, migrations, query/repository implementations
  providers/              # payment/KYC/storage/notification adapters
  ui/                     # cross-app design tokens/primitives where practical
  config/                 # typed environment configuration
  observability/          # logging, metrics, tracing, redaction
  test-utils/             # factories, containers, fake providers
infra/
  environments/
  ci/
docs/
```

Within mobile, organize by feature (`auth`, `properties`, `investments`, `wallet`, `kyc`, `profile`) with `screens`, `components`, `hooks`, `api`, `schemas`, and tests. Avoid global `services/` dumping grounds and avoid repository interfaces inside every trivial screen.

# 41. Recommended Development Phases

## Phase A — Product/legal definition

**Goal:** Make the product implementable and marketable truthfully.  
**Work:** slot instrument, return/loss terms, jurisdictions, KYC, fees/tax, cancellation, provider shortlist, disclosures.  
**Deliverables:** approved PRD, lifecycle/state diagrams, legal/compliance requirements, glossary.  
**Dependency:** founder + counsel + finance/compliance.  
**Done:** no critical financial/legal behavior remains ambiguous.

## Phase B — Architecture and threat model

**Goal:** Lock boundaries/invariants before screens.  
**Work:** ADRs, threat model, data classification, OpenAPI conventions, ledger chart, idempotency, RBAC.  
**Done:** reviewed architecture and executable invariant test plan.

## Phase C — Platform foundation

**Backend:** repo, CI, environments, PostgreSQL migrations, auth adapter, observability, secrets.  
**Frontend:** Expo shell, design tokens, navigation, API client, error handling.  
**Security:** least privilege, dependency/secret scanning.  
**Done:** deployable dev/staging health/auth skeleton.

## Phase D — Identity/profile/KYC foundation

User lifecycle, consent versions, profile, admin MFA/RBAC, KYC provider sandbox, private uploads, audit. Tests cover cross-user/admin escalation.

## Phase E — Property catalogue and transparency

Property/plan drafts, publishing, proof documents, marketplace/detail/search/pagination, admin editor, versioning. No investing yet.

## Phase F — Ledger and wallet core

Double-entry ledger, cached balances, invariants, reconciliation, admin read-only views. No external deposits until balancing/property tests pass.

## Phase G — Deposits

Provider abstraction, intents, signed webhook inbox, crediting, reconciliation, mobile provider flow, failure/support views.

## Phase H — Investment reservation/activation

Server quote, atomic capacity/fund reservation, idempotent activation/expiry/refund. Concurrency tests are release-blocking.

## Phase I — Maturity and earnings

Calendar rules, scheduler/worker, idempotent settlement, principal/profit ledger entries, slot release, statements/notifications.

## Phase J — Withdrawals/payouts

Verified destinations, reserves, risk/review, provider adapter, attempts, release/reversal, maker-checker and audit.

## Phase K — Referrals/notifications/reporting

Only after business policies are approved. Outbox delivery, reward ledger, reports/exports.

## Phase L — Hardening and launch

Pen test, load/concurrency tests, disaster recovery, provider reconciliation drills, support/admin runbooks, app-store/privacy assets, staged rollout.

Each phase requires code, migrations, security review, automated tests, operational documentation, staging acceptance, and explicit definition-of-done evidence.

# 42. Rebuild Strategy

## Carry forward

- Screenshots/design references, colors, typography, copy structure, components and journeys.
- Product examples and confirmed slot/term semantics.
- Schema report as historical rationale, not as a database migration target.
- Approved property media/content after provenance review.

## Discard

- Generated Flutter code as implementation foundation.
- Current Firestore rules and client financial actions.
- Prototype/test financial records unless independently verified.
- Legacy collection shapes/doubles/duplicate fields.
- Unused dependencies and duplicate/WIP pages.

## Data migration

**UNKNOWN:** Whether meaningful production data exists. Inventory Firebase Auth users, Firestore documents, Storage objects, and provider records before migration. Classify as test, content, identity, financial, or regulated data.

- Property content can be transformed after editorial/legal review.
- Auth accounts may be migrated or federated depending on provider capabilities and password portability.
- Financial balances must never be copied without reconciling evidence and creating controlled opening ledger entries.
- KYC documents require lawful basis, consent/provider terms, secure transfer, and retention review.
- Test/prototype data should usually be discarded.

Use rehearsed migration scripts, immutable source exports, checksums/counts, reconciliation reports, rollback/cutover plans, and a controlled freeze window.

# 43. Definition of Done

RENT BROWN is not production-ready until:

- product/legal terms are approved;
- every financial mutation is server-authorized and ledger-backed;
- ledger entries balance and reconcile to cached balances/providers;
- last-slot and duplicate-request tests pass;
- payment/payout webhooks are verified and idempotent;
- KYC/privacy controls and retention are approved;
- admin RBAC/MFA/audit/maker-checker controls work;
- user journeys use real backend state with loading/empty/error/accessibility states;
- migrations, backups, PITR, disaster recovery, alerts, and runbooks are tested;
- security testing and independent review have no unresolved critical findings;
- staging acceptance uses provider sandboxes and production-like infrastructure;
- App Store/Play/privacy/legal artifacts are approved;
- no client can modify balance, ROI, maturity, capacity, status, KYC outcome, or transaction history.

# 44. Final Recommendations

1. Do not port FlutterFlow code; rebuild domain-first.
2. Resolve the legal/business model before implementing ROI promises or taking funds.
3. Use PostgreSQL and a double-entry ledger for the core; keep Firebase only behind replaceable boundaries where useful.
4. Build a modular monolith, not microservices.
5. Separate the consumer mobile app from the admin web console.
6. Implement auth/RBAC/data classification before financial workflows.
7. Make slot reservation, wallet funding, and investment activation one coherent transactional process.
8. Treat webhooks, jobs, and client retries as duplicates by default.
9. Preserve the visual identity and strongest product journeys, but consolidate duplicate screens/components.
10. Verify live Firebase rules immediately if version 1 remains accessible; the refreshed generated rules are unsafe even though a prior session reported deploying a stricter baseline.
11. Remove the client-created starter wallet credit immediately in any maintained version-1 environment; do not use it as migration data.
12. Stop after this audit and obtain founder/product/legal approval before beginning the rebuild.

---

## Appendix A — Current contradictions that must not be silently resolved

| Topic                | Earlier evidence                                                                                   | Current evidence                                                        | Correct treatment                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Page/component count | Original audit: ~64/52; later schema phase: 53/51                                                  | Current remote: 52/53                                                   | Current count is authoritative for UI inventory; historical counts show ongoing edits |
| Authentication       | Original audit: absent, no package                                                                 | Current generated code: Firebase Auth signup/login/reset                | Mark partial, not complete                                                            |
| Firestore use        | Original audit: zero queries/writes                                                                | Current: property queries, signup/profile/wallet writes                 | Mark narrowly partial                                                                 |
| Security rules       | Prior schema task reported secure Firestore rules deployed                                         | Latest FlutterFlow-generated local rules are unsafe/inconsistent        | Live state unknown; inspect Firebase directly before any version-1 use                |
| Schema topology      | Architecture review suggested some subcollections; schema report implemented top-level collections | Generated rules still assume several user subcollections                | New rebuild should use PostgreSQL canonical relations; version-1 mismatch is a defect |
| Wallet authority     | Schema report says wallets server-controlled/minor units                                           | Signup writes legacy wallet balance `500.0` client-side                 | Runtime behavior is unsafe and overrides architectural intent                         |
| Schema names         | New 14-collection schema exists                                                                    | Legacy fields/enums/structs remain                                      | Treat legacy fields as prototype compatibility only                                   |
| Storage              | Prior deployment attempt said Storage not initialized                                              | Current exported rules exist but initialization/live deployment unknown | Verify service/live policy separately                                                 |

## Appendix B — Environment and deployment recommendation

- Separate cloud accounts/projects/databases for development, staging, and production; never environment flags in one database.
- Typed configuration validated at startup; public Expo variables contain no secrets.
- Secrets in managed secret storage with rotation and audit.
- CI: format/lint/typecheck/unit/integration/migration/security/build gates.
- CD: immutable backend images/artifacts, reviewed migrations, staged/health-checked deploys.
- Database: automated backups, PITR, restore drills, migration lock/expand-contract strategy.
- Mobile: EAS Build profiles per environment, signed builds, store release channels, controlled Expo Updates with runtime version compatibility and rollback.
- Monitoring: API latency/error rate, queue lag, webhook failures, reconciliation breaks, ledger invariant failures, maturity backlog, withdrawal/deposit anomalies, auth abuse, admin actions.
- Logs/traces use request/correlation IDs and strict PII/secret redaction.

## Appendix C — Design-system migration notes

**Preserve:** warm brown palette, cream surface, clear cards, recognizable ROI/status badges, dashboard summaries, property imagery, Plus Jakarta Sans hierarchy.  
**Improve:** contrast/accessibility testing, semantic tokens, consistent spacing/radii, consolidated component variants, skeleton/empty/error states, mobile-first navigation, responsive admin tables, typed status colors, currency formatting.  
**Redesign:** PIN confirmation, dense web-oriented screens on mobile, hardcoded charts, unverified “verified/return” claims, any UI implying funds moved before server confirmation.  
**Do not copy:** generated widget nesting, zero-size spacer containers, duplicate local components, arbitrary hardcoded dimensions, static success states, and mock financial values in production builds.
