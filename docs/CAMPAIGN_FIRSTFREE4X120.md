# Campaign: FIRSTFREE4X120 (First Service Free — 4 visits in 120 days)

## Entry URLs

- **Home with campaign:** `/?campaign=firstfree4x120`
- **Canonical short link:** `/offers/firstfree4x120` → `/?campaign=firstfree4x120`
- **Legacy:** `/?campaign=firstfree4x60` and `/offers/firstfree4x60` still open the same flow (redirects or query alias).

Constants: `web/lib/campaigns/firstFree4x120.ts`.

## Rules (product)

- **4** qualifying visits within **120** days; recurring standard cleaning (**weekly, bi-weekly, or monthly**).
- Discount program code in app + DB after migration: **`FIRSTFREE4X120`** (replaces `FIRSTFREE4X60`).
- Commitment window in DB: `discount_program_commitment_rules.timeframe_days = 120` (see migration `20260328120000_firstfree4x120_discount_program.sql`).

## Flow summary

1. `FirstFreeCampaignHomeFlow` opens quote modal with `campaignQuoteFlow: "firstfree4x120"`.
2. `CleaningQuickQuoteForm` → `quote-start` → terms → `validate-promo` with `FIRSTFREE4X120` → booking path with `?campaign=firstfree4x120`.
3. `BookV2Client` / legacy `BookClient`: prefill + promo hydration; campaign mode hides one-time where applicable.

Validation uses **`/api/book-v2/validate-promo`** (not legacy Python `/discounts/validate`).
