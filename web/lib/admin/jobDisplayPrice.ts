/**
 * Canonical admin / payment math for job prices: **integer cents** only.
 *
 * **Canonical net total:** `display_total_cents` (and list `_price_display` = that / 100 in dollars).
 *
 * `jobs.discount_amount` is **intended to be cents** (admin resolver, fixed book-v2 writes).
 * Legacy rows may store **dollars** (e.g. `66.25` from book-v2) or **whole dollars** as integers (`66`);
 * `normalizeJobDiscountAmountToCents` normalizes for display and payment math.
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

/**
 * Interpret `jobs.discount_amount` as cents for math.
 * - Values with a fractional part are treated as **dollars** (× 100), e.g. 66.25 → 6625.
 * - Whole numbers: if `n * 100 <= gross` and `n <= floor(gross/100)`, treat as **whole dollars** (legacy), else **cents**.
 * - Integer “dollar overflow” (e.g. 300 off a $265 job): if `n > gross/100`, `n * 100 > gross`, and `n <= 1000`, treat as dollars capped at gross.
 */
export function normalizeJobDiscountAmountToCents(
  discountRaw: number | string | null | undefined,
  grossCents: number
): number {
  const g = Math.max(0, Math.round(Number(grossCents) || 0));
  const raw = Number(discountRaw ?? 0);
  if (!Number.isFinite(raw) || raw <= 0 || g === 0) return 0;

  const frac = Math.abs(raw % 1);
  if (frac > 1e-9) {
    return Math.min(g, Math.max(0, Math.round(raw * 100)));
  }

  const n = Math.round(raw);
  if (n <= 0) return 0;
  if (n > g) return g;

  const maxWholeDollars = Math.floor(g / 100);
  if (n * 100 <= g && n <= maxWholeDollars) {
    return Math.min(g, n * 100);
  }

  if (n > maxWholeDollars && n * 100 > g && n <= 1000) {
    return Math.min(g, n * 100);
  }

  return Math.min(g, n);
}

/** Final customer-facing job total in cents (after discount), or null if no basis. */
export function computeJobDisplayTotalCents(row: JobPriceInput): number | null {
  const gross = computeJobGrossBasisCents(row);
  if (gross == null) return null;
  const flagged = row.discounted === true;
  const rawDisc = row.discount_amount != null ? Number(row.discount_amount) : 0;
  const hasDiscount = flagged || (Number.isFinite(rawDisc) && rawDisc > 0);
  if (!hasDiscount) return gross;
  const d = normalizeJobDiscountAmountToCents(row.discount_amount, gross);
  return Math.max(0, gross - Math.min(d, gross));
}
