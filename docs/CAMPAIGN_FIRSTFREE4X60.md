# Campaign: FIRSTFREE4X60 (`/offers/firstfree4x60`)

## Route

- **Landing:** `/offers/firstfree4x60` (copy + CTA only; quote opens in global modal)
- **Booking handoff:** `{NEXT_PUBLIC_BOOKING_PATH or /book-v2}?campaign=firstfree4x60`

## Campaign mode

- Query param: `campaign=firstfree4x60` (constant `FIRSTFREE4X60_CAMPAIGN_QUERY` in `web/lib/campaigns/firstFree4x60.ts`).
- Discount program code (for validation): `FIRSTFREE4X60` (`FIRSTFREE4X60_DISCOUNT_PROGRAM_CODE`).
- Client session after T&C: `sessionStorage` key `alloy_campaign_firstfree4x60_v1` (JSON `FirstFree4x60SessionV1`).
- **Modal:** `openModal({ defaultService: "cleaning", campaignQuoteFlow: "firstfree4x60", onCampaignQuoteComplete })` (`web/lib/quoteModal.tsx`). `QuoteModal` renders `CleaningQuickQuoteForm` with `campaignQuoteMode={{ id: "firstfree4x60" }}` (recurring-only).

## Quote → booking handoff

1. **Landing CTA** opens the shared **QuoteModal**; **`CleaningQuickQuoteForm`** saves `alloy_quote_v1` (with `quote_input`) + `alloy_booking_prefill`, then `onCampaignQuoteComplete` advances the landing page to the T&C step.
2. Optional: full-page **`CleaningQuoteForm`** still supports `campaignQuoteMode` for other entry points (not used on this landing page).
3. `alloy_booking_prefill` is merged on the landing page with `campaign`, `discount_program_code`, `campaign_source`.
4. After T&C, `validateDiscountCodeForBooking` POSTs to **`${NEXT_PUBLIC_API_BASE_URL}/discounts/validate`** with code `FIRSTFREE4X60`. On success, prefill gets `discount_code`, `discount_code_id`, `discount_amount`, `quote_total`.

## Assumptions / blockers

- **External API:** `/discounts/validate` must accept program code `FIRSTFREE4X60` (or an equivalent legacy code returned from your backend). If validation fails, the user sees an error on the T&C step and cannot auto-continue.
- **Service role / DB:** No new Supabase reads in this pass; program linkage is assumed to exist in your discount system behind the Python API.

## Manual test

1. Open `/offers/firstfree4x60` — campaign copy + CTA; click **Get my recurring quote** → same global quote modal as elsewhere.
2. In modal: recurring-only frequency; submit — modal closes; T&C step appears; `alloy_quote_v1` populated.
3. Accept T&C — Network: `POST .../discounts/validate`; then navigate to `/book-v2?campaign=firstfree4x60`.
4. Confirm discount UI shows applied; frequency chips exclude One-time.
5. Open `/book-v2` without `campaign` — one-time and normal flows unchanged.
