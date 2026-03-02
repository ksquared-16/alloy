/**
 * Validate a discount code for a job and compute discount_amount (cents).
 * Used by POST/PATCH jobs to ensure code is active, in date range, and (when applicable) matches job vertical.
 * Returns { error: string } or { discount_amount_cents: number; code: string }.
 */

type DiscountCodeRow = {
    id: string;
    code: string | null;
    is_active: boolean | null;
    discount_type: string | null;
    discount_value: number | string | null;
    applies_to_vertical_slug: string | null;
    starts_at: string | null;
    ends_at: string | null;
};

export function computeDiscountCents(
    gross_price_cents: number,
    codeRow: DiscountCodeRow
): number {
    const gross = Math.max(0, Math.round(gross_price_cents));
    const type = String(codeRow.discount_type ?? "").trim().toLowerCase();
    const val = codeRow.discount_value;
    if (type === "percent") {
        const percent = Math.min(100, Math.max(0, Number(val) ?? 0));
        return Math.round(gross * percent / 100);
    }
    if (type === "fixed") {
        const dollars = Number(val) ?? 0;
        const cents = Math.round(dollars * 100);
        return Math.min(gross, Math.max(0, cents));
    }
    return 0;
}

export function validateDiscountCodeForJob(
    codeRow: DiscountCodeRow | null,
    gross_price_cents: number,
    job_vertical_slug: string | null
): { error: string } | { discount_amount_cents: number; code: string } {
    if (!codeRow) {
        return { error: "Discount code not found" };
    }
    if (codeRow.is_active !== true) {
        return { error: "Discount code is not active" };
    }
    const now = new Date().toISOString();
    if (codeRow.starts_at != null && codeRow.starts_at > now) {
        return { error: "Discount code is not yet valid" };
    }
    if (codeRow.ends_at != null && codeRow.ends_at < now) {
        return { error: "Discount code has expired" };
    }
    const appliesTo = (codeRow.applies_to_vertical_slug ?? "").trim() || null;
    if (appliesTo && job_vertical_slug !== appliesTo) {
        return { error: "Discount code does not apply to this job's vertical" };
    }
    const discount_amount_cents = computeDiscountCents(gross_price_cents, codeRow);
    return {
        discount_amount_cents,
        code: codeRow.code ?? "",
    };
}
