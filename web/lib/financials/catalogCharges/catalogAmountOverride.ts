/**
 * A CATALOG CHARGE'S AMOUNT, OVERRIDDEN FOR THAT ONE CHARGE.
 *
 * Operator request (2026-11-02): a charge defaults to the Catalog price, and an authorized user may
 * change the amount of THAT charge before submitting — the Catalog item and every existing charge
 * stay as they are. Pure: the command validates with it, the surfaces parse input with it, and the
 * writer records what it returns.
 *
 * ── WHO MAY ─────────────────────────────────────────────────────────────────────────────────
 *
 * Charging something other than the configured price is the adjustment authority `fin.adjust`
 * (`financialReductionActions`: "otherwise everyone who can bill can also forgive"), not the
 * `fin.write` that adds a charge at its price. Admin and ops hold both by default.
 *
 * ── WHAT IS REFUSED ─────────────────────────────────────────────────────────────────────────
 *
 * Whole cents only (the currency's precision — every amount here is integer cents of a two-decimal
 * currency); never negative; never zero — `charges.amount_cents <> 0` is a database rule, and a
 * charge forgiven is a waiver or an adjustment recorded against it, which stays the separate act it
 * already is; never an amount past exact integer precision (`Number.isSafeInteger` — the only
 * technical bound: `charges.amount_cents` is a bigint with no ceiling, and no business ceiling is
 * configured); and never without a reason, the same three-character rule every manual adjustment has.
 */

export const CATALOG_AMOUNT_OVERRIDE_PERMISSION = "fin.adjust" as const;

export const CATALOG_AMOUNT_OVERRIDE_REASON_MIN = 3;
export const CATALOG_AMOUNT_OVERRIDE_REASON_MAX = 500;

export type CatalogAmountOverride = { amountCents: number; reason: string };

export type CatalogAmountOverrideParse =
    | { ok: true; override: CatalogAmountOverride | null }
    | { ok: false; code: string; message: string; field: string };

/**
 * The command's reading of `payload.amount_override` (`{ amount_cents, reason }`). Absent is no
 * override. A number is required — a string, a fraction of a cent or an object of another shape is
 * refused, never coerced, because a coerced amount is not the one the operator saw.
 */
export function parseCatalogAmountOverride(raw: unknown): CatalogAmountOverrideParse {
    if (raw === undefined || raw === null) return { ok: true, override: null };
    if (typeof raw !== "object" || Array.isArray(raw)) {
        return { ok: false, code: "amount_override_invalid", message: "The amount override is not readable.", field: "amount_override" };
    }
    const src = raw as Record<string, unknown>;
    const cents = src.amount_cents;
    if (typeof cents !== "number" || !Number.isFinite(cents)) {
        return { ok: false, code: "amount_override_invalid", message: "Enter the charge amount.", field: "amount_override.amount_cents" };
    }
    if (!Number.isInteger(cents)) {
        return { ok: false, code: "amount_override_precision", message: "The amount must be in whole cents.", field: "amount_override.amount_cents" };
    }
    if (cents < 0) {
        return { ok: false, code: "amount_override_negative", message: "A charge amount cannot be negative. To credit the account, use an adjustment.", field: "amount_override.amount_cents" };
    }
    if (cents === 0) {
        return {
            ok: false,
            code: "amount_override_zero",
            message: "A charge cannot be $0.00. To forgive this fee, add it and then waive or adjust it.",
            field: "amount_override.amount_cents",
        };
    }
    if (!Number.isSafeInteger(cents)) {
        return { ok: false, code: "amount_override_out_of_range", message: "That amount is too large to record exactly.", field: "amount_override.amount_cents" };
    }
    const reason = typeof src.reason === "string" ? src.reason.trim() : "";
    if (reason.length < CATALOG_AMOUNT_OVERRIDE_REASON_MIN) {
        return { ok: false, code: "amount_override_reason_required", message: "Say why this charge differs from the Catalog price.", field: "amount_override.reason" };
    }
    if (reason.length > CATALOG_AMOUNT_OVERRIDE_REASON_MAX) {
        return { ok: false, code: "amount_override_reason_too_long", message: `Keep the reason under ${CATALOG_AMOUNT_OVERRIDE_REASON_MAX} characters.`, field: "amount_override.reason" };
    }
    return { ok: true, override: { amountCents: cents, reason } };
}

/**
 * A typed amount (`"30"`, `"30.5"`, `"1,250.00"`, `"$30.50"`) as whole cents, or null when it is not
 * one: more than two decimals, a sign, or anything else. Never rounds — `"30.555"` is not an amount.
 */
export function centsFromAmountInput(input: string): number | null {
    const s = input.trim().replace(/^\$/, "").replace(/,/g, "");
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
    const [whole, frac = ""] = s.split(".");
    const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
    return Number.isSafeInteger(cents) ? cents : null;
}

/**
 * What a charge records about its override, beside `metadata.catalog_item` (which keeps the Catalog
 * price it was offered at): the original price, the final amount, who and why.
 */
export function catalogAmountOverrideRecord(args: {
    catalogAmountCents: number;
    override: CatalogAmountOverride;
    actorUserId: string | null;
    at: string;
}) {
    return {
        catalog_amount_cents: args.catalogAmountCents,
        amount_cents: args.override.amountCents,
        difference_cents: args.override.amountCents - args.catalogAmountCents,
        reason: args.override.reason,
        actor_user_id: args.actorUserId,
        at: args.at,
    };
}

export type CatalogAmountOverrideRecord = ReturnType<typeof catalogAmountOverrideRecord>;
