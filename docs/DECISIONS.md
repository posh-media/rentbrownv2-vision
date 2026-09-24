# Decisions

Append-only log of product/platform decisions. Newest entries at the bottom.

## D-001 Referral signup reward default = ₦1,500 (2026-09)

The authoritative default **signup** referral reward is **₦1,500** (150,000 minor
units), superseding the historical ₦5,000 figure carried in the old repository.

Referral policy distinguishes four separate values — never conflate them:

- **Signup reward** — fixed ₦1,500 credited when a referred user qualifies.
- **Qualifying deposit** — the referred user's first deposit must reach ₦50,000.
- **Deposit-referral rate** — 1% (100 bps) of the referred user's qualifying deposits.
- **Deposit-referral cap** — up to ₦10,000 per referred user.

The deposit-referral rate/cap and qualifying deposit are illustrative mock
defaults pending confirmation. Unrelated ₦5,000 values (minimum withdrawal,
investment limits, deposit amounts) are unchanged.

Status: accepted · Scope: `ReferralPolicy` in `@rentbrown/types`, mock fixtures,
referral surfaces on web and mobile.
