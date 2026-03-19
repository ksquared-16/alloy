# Campaign: FIRSTFREE4X60

## Entry URLs

- **Home with campaign:** `/?campaign=firstfree4x60`
- **Alias (redirect):** `/offers/firstfree4x60` → `/?campaign=firstfree4x60` (QRs and short links)

There is **no dedicated offer landing page**. The homepage loads; the global **QuoteModal** opens automatically (via `FirstFreeCampaignHomeFlow`).

## Campaign mode

- Query param: `campaign=firstfree4x60` (constant `FIRSTFREE4X60_CAMPAIGN_QUERY` in `web/lib/campaigns/firstFree4x60.ts`).
- Discount program code (for validation): `FIRSTFREE4X60` (`FIRSTFREE4X60_DISCOUNT_PROGRAM_CODE`).
- Client session after T&C: `sessionStorage` key `alloy_campaign_firstfree4x60_v1` (JSON `FirstFree4x60SessionV1`).
- **Quote modal:** `openModal({ defaultService: "cleaning", campaignQuoteFlow: "firstfree4x60", onCampaignQuoteComplete })` (`web/lib/quoteModal.tsx`). `QuoteModal` shows a **deal callout** at the top of the cleaning form and renders `CleaningQuickQuoteForm` with `campaignQuoteMode={{ id: "firstfree4x60" }}` (recurring-only).

## Quote → terms → booking

1. User lands on home with `?campaign=firstfree4x60` → quote modal opens (cleaning, campaign flow).
2. **`CleaningQuickQuoteForm`** saves `alloy_quote_v1` (with `quote_input`) + `alloy_booking_prefill`, then closes the modal and **`onCampaignQuoteComplete`** runs: merge prefill (`mergeFirstFreeCampaignBookingPrefill`), Meta `Lead`, open **`FirstFreeTermsModal`** (second modal, same overlay/shell pattern as quote).
3. User accepts T&C → `validateDiscountCodeForBooking` POSTs to **`${NEXT_PUBLIC_API_BASE_URL}/discounts/validate`** with code `FIRSTFREE4X60`. On success, prefill gets discount fields; navigate to **`{booking path}?campaign=firstfree4x60`** (e.g. `/book-v2?campaign=firstfree4x60`).

## Assumptions / blockers

- **External API:** `/discounts/validate` must accept program code `FIRSTFREE4X60` (or an equivalent legacy code returned from your backend). If validation fails, the user sees an error on the T&C step and cannot auto-continue.
- **Service role / DB:** No new Supabase reads in this pass; program linkage is assumed to exist in your discount system behind the Python API.

## Manual test

1. Open `/?campaign=firstfree4x60` or `/offers/firstfree4x60` — home loads; quote modal opens; deal callout visible.
2. Submit **Get my recurring quote** — modal closes; **Offer terms** modal opens; `alloy_quote_v1` populated.
3. Accept T&C — Network: `POST .../discounts/validate`; then navigate to `/book-v2?campaign=firstfree4x60` (or configured booking path).
4. Confirm discount UI shows applied; frequency chips exclude One-time.
5. Open `/book-v2` without `campaign` — one-time and normal flows unchanged.
