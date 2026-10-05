/**
 * THE OPERATOR'S ECONOMIC INTENT, AND THE ONE PLACE IT BECOMES A SIGNED AMOUNT.
 *
 * ── WHY THIS MODULE EXISTS ───────────────────────────────────────────────────────────────────
 *
 * The economic model is canonically SIGNED: negative reduces what a family owes, positive
 * increases it. That is right, and inverting it anywhere downstream is how two surfaces start
 * disagreeing about money.
 *
 * What was wrong was asking the OPERATOR to hold that convention. The Adjustment panel asked for a
 * "Type" — `credit` or `adjustment` — and then, only for `adjustment`, a direction. The sign was
 * computed as:
 *
 *     const raises = adjustCategory === "adjustment" && adjustDirection === "increase";
 *
 * So an operator who chose `credit` and then `increase` got a REDUCTION, silently: the direction
 * they had just stated was discarded because the category outranked it. The two controls encoded
 * one decision twice and disagreed about which half won.
 *
 * There is one decision — WHICH WAY DOES THE FAMILY'S BALANCE MOVE — and this module is the only
 * place it becomes a sign. `charge_category` is derived from it rather than asked for, because the
 * category was never the operator's question: a reduction IS a credit and an increase IS an
 * adjustment, and making them choose taught them the storage taxonomy before they could give money
 * back.
 *
 * ── SHARED BY PREVIEW AND EXECUTE ────────────────────────────────────────────────────────────
 *
 * Both paths convert through here, so a preview cannot describe one direction while execute writes
 * the other. The canonical services keep taking signed cents; nothing below them changes.
 */

/** Which way the family's balance moves. The operator's whole decision. */
export type AdjustmentDirection = "reduce" | "increase";

export const ADJUSTMENT_DIRECTIONS: readonly AdjustmentDirection[] = ["reduce", "increase"];

/** What an operator reads on the control. Never "credit", never a sign. */
export function adjustmentDirectionLabel(direction: AdjustmentDirection): string {
    return direction === "reduce" ? "Reduce what the family owes" : "Increase what the family owes";
}

/**
 * The canonical category for a direction.
 *
 * `credit` and `adjustment` are both members of `MANUAL_REDUCTION_CATEGORIES`, so this names an
 * existing taxonomy rather than widening one. `discount` is deliberately unreachable from here: a
 * manual discount would land in the same bucket as a configured one and nothing on a surface could
 * tell an operator which was policy and which was somebody's decision.
 */
export function chargeCategoryForDirection(direction: AdjustmentDirection): "credit" | "adjustment" {
    return direction === "reduce" ? "credit" : "adjustment";
}

/** The direction a signed amount already represents — for reading history back. */
export function directionFromSignedCents(amountCents: number): AdjustmentDirection {
    return amountCents < 0 ? "reduce" : "increase";
}

/**
 * The operator typed an ABSOLUTE amount. This is where it gains its sign.
 *
 * Returns null for anything that is not a usable positive amount of money — an empty field, a
 * negative, a zero, a word. A null is "nothing to preview yet", never "zero cents".
 *
 * A LEADING MINUS IS REFUSED rather than absorbed. Accepting `-25` from a field labelled
 * "Increase what the family owes by" would let the typed sign silently contradict the stated
 * direction, which is the exact confusion this module exists to end.
 */
export function parseAdjustmentMagnitudeCents(entered: string): number | null {
    const cleaned = (entered ?? "").replace(/[$,\s]/g, "");
    /*
     * ── THE WHOLE STRING MUST BE ONE AMOUNT, not merely start with one ────────────────────────
     *
     * A character-class filter is not enough, and the suite caught it: `2.5.1` contains only
     * digits and dots, so it passed, and `Number.parseFloat` stopped at the second dot and
     * returned 2.5 — a mistyped amount becoming $2.50 of real money with no sign anything was
     * wrong. `parseFloat`'s prefix behaviour is the hazard here, so the shape is matched in full
     * before any number is read.
     *
     * At most two decimal places, because cents are the unit. `25.005` is not a hair under
     * 25.01 — it is an amount nobody can pay, and rounding it silently would decide for them.
     */
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
    const value = Number.parseFloat(cleaned);
    if (!Number.isFinite(value) || value <= 0) return null;
    const cents = Math.round(value * 100);
    return cents > 0 ? cents : null;
}

/**
 * THE CONVERSION. One direction, one positive magnitude, one signed amount.
 *
 * `magnitudeCents` must already be positive — the parser above is what produces one. A caller that
 * hands this a signed value is told so rather than having its sign quietly honoured.
 */
export function signedCentsForIntent(args: {
    direction: AdjustmentDirection;
    magnitudeCents: number;
}): number {
    const magnitude = args.magnitudeCents;
    if (!Number.isInteger(magnitude) || magnitude <= 0) {
        throw new Error("An adjustment magnitude must be a whole number of cents greater than zero.");
    }
    return args.direction === "reduce" ? -magnitude : magnitude;
}
