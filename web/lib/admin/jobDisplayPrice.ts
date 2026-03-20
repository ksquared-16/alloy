/**
 * Canonical admin display price for jobs: net amount after job-level discount (cents).
 * Aligns with ledger/payment math: gross basis minus discount capped at gross.
 *
 * **Canonical field:** `display_total_cents` (integer cents). Table/list `_price_display` is
 * `display_total_cents / 100` (dollars) for existing money formatters.
 */

export type JobPriceInput = {
  gross_price_cents?: number | null;
  estimated_total_cents?: number | null;
  discount_amount?: number | string | null;
  discounted?: boolean | null;
};

export function computeJobGrossBasisCents(row: JobPriceInput): number | null {
  const g = row.gross_price_cents;
  const e = row.estimated_total_cents;
  if (g != null && Number.isFinite(Number(g))) return Math.max(0, Math.round(Number(g)));
  if (e != null && Number.isFinite(Number(e))) return Math.max(0, Math.round(Number(e)));
  return null;
}

/** Final customer-facing job total in cents (after discount), or null if no basis. */
export function computeJobDisplayTotalCents(row: JobPriceInput): number | null {
  const gross = computeJobGrossBasisCents(row);
  if (gross == null) return null;
  const flagged = row.discounted === true;
  const rawDisc = row.discount_amount != null ? Number(row.discount_amount) : 0;
  const hasDiscount = flagged || (Number.isFinite(rawDisc) && rawDisc > 0);
  if (!hasDiscount) return gross;
  const d = Math.max(0, Math.round(Number.isFinite(rawDisc) ? rawDisc : 0));
  return Math.max(0, gross - Math.min(d, gross));
}
