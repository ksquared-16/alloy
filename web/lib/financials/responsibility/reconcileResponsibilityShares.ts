/**
 * DOES THIS RESPONSIBILITY ARRANGEMENT RECONCILE — and if not, WHICH INPUT is the problem.
 *
 * Extracted from the panel so the answer can be tested as the pure rule it is. It moved for a
 * reason: the empty case told operators to "name at least one responsible party" while a party
 * was plainly listed in front of them, because the rule could only see that no SHARE carried a
 * value and had one sentence for every way that could happen. A message that names the wrong
 * missing input is worse than no message — it sends the operator to fix something that is not
 * broken while Confirm stays disabled.
 *
 * It is not a second rulebook. `configureResponsibilityArrangement` still refuses a total over
 * 100%, a second remainder and a duplicate party; this states the same rules early enough to be
 * useful, and nothing here is weaker than what the service enforces.
 */

/** How a party's share is expressed — the canonical vocabulary, not this module's. */
export type ResponsibilityShareMethod = "percentage" | "fixed" | "remainder";

export type ShareDraft = {
    responsiblePartyId: string;
    name: string;
    /** Their relationship to the account, shown so the operator knows which person this is. */
    roleLabel: string | null;
    /**
     * How this party's share is expressed. The canonical authority has always accepted all three;
     * what was missing was anywhere for an operator to say which one they meant.
     */
    method: ResponsibilityShareMethod;
    /**
     * What the operator typed: cents for `fixed`, whole percent for `percentage`, ignored for
     * `remainder` — a remainder is defined by the others, so there is nothing to type.
     */
    amount: string;
};


/**
 * WHETHER THIS ARRANGEMENT RECONCILES, said in the operator's terms before they press Confirm.
 *
 * The canonical service refuses a total over 100%, a second remainder, and a duplicate party — so
 * this is not a second rulebook, it is the same rules stated early enough to be useful. A form
 * that let an operator fill in 70/40 and then showed them a server error would be making them
 * discover a rule the product already knew.
 */
export function reconcileResponsibilityShares(shares: readonly ShareDraft[]): { ok: boolean; message: string | null } {
    const used = shares.filter((s) => s.method === "remainder" || s.amount.trim() !== "");
    if (used.length === 0) {
        /*
         * ── THE MESSAGE MUST NAME THE INPUT THAT IS ACTUALLY MISSING ────────────────────────
         *
         * "Name at least one responsible party" was told to operators who had already named one.
         * Every party on the account is a row — there is no control for adding one — so the empty
         * case is almost never "nobody is listed"; it is "the listed party has no share typed
         * yet". The operator read a disabled Confirm beside an instruction to do the one thing
         * they had done, with nothing pointing at the blank Amount field.
         *
         * Nothing is weakened: this is the same refusal, and the same `ok: false`. Only the
         * sentence changed, and it now changes with the method the rows are actually set to, so
         * it points at the field that will satisfy it.
         */
        if (shares.length === 0) return { ok: false, message: "Name at least one responsible party." };
        const methods = new Set(shares.map((s) => s.method));
        const message =
            methods.size === 1 && methods.has("percentage")
                ? "Enter a percentage for at least one responsible party."
                : methods.size === 1 && methods.has("fixed")
                  ? "Enter an amount for at least one responsible party."
                  : "Enter a share for at least one responsible party.";
        return { ok: false, message };
    }

    const remainders = used.filter((s) => s.method === "remainder");
    if (remainders.length > 1) return { ok: false, message: "Only one party can take the remainder." };

    /*
     * W7-F039: PERCENTAGES IN BASIS POINTS — the unit the service stores — so 33.33 + 66.67 is
     * exactly 10,000 and never a float that is 0.0000001 short.
     */
    const bp = (s: ShareDraft) => Math.round((Number(s.amount) || 0) * 100);
    const percentTotalBp = used.filter((s) => s.method === "percentage").reduce((sum, s) => sum + bp(s), 0);
    const pct = (b: number) => `${Number((b / 100).toFixed(2))}%`;
    if (used.some((s) => s.method !== "remainder" && !(Number(s.amount) >= 0))) {
        return { ok: false, message: "Every share needs a number." };
    }
    if (percentTotalBp > 10_000) {
        return { ok: false, message: `${pct(percentTotalBp - 10_000)} over 100%` };
    }

    /*
     * ── W7-F039: AN ALL-PERCENTAGE SPLIT IS EXACTLY 100% ───────────────────────────────────────
     *
     * When every party is a percentage, the split is the whole charge or it is not finished: a
     * blank or short split saves an arrangement that quietly leaves part of every charge owed by
     * nobody. Fixed amounts and a remainder keep their own rules (a fixed share can legitimately
     * cover part of an obligation — Scenario 62), so this binds only the all-percentage case.
     */
    const allPercentage = shares.length > 0 && shares.every((s) => s.method === "percentage");
    if (allPercentage) {
        const blank = shares.filter((s) => s.amount.trim() === "");
        if (blank.length && percentTotalBp === 10_000) {
            return { ok: false, message: `Allocate a percentage to ${blank.map((b) => b.name).join(" and ")} by reducing one or more existing shares.` };
        }
        if (percentTotalBp < 10_000) {
            return { ok: false, message: `${pct(10_000 - percentTotalBp)} remaining to allocate` };
        }
        return { ok: true, message: null };
    }

    const hasPercent = used.some((s) => s.method === "percentage");
    if (hasPercent && percentTotalBp < 10_000 && remainders.length === 0) {
        return { ok: true, message: `${pct(10_000 - percentTotalBp)} is not assigned to anyone.` };
    }
    return { ok: true, message: null };
}


/**
 * W7-F039 — TWO PARTIES, ONE NUMBER. With exactly two percentage shares, typing one sets the other
 * to what makes 100%, in basis points so nothing drifts. With three or more nothing is moved for the
 * operator — silently taking percentage from someone is a decision only they can make.
 */
export function balanceTwoPartySplit(shares: readonly ShareDraft[], editedIndex: number, typed: string): ShareDraft[] {
    const next = shares.map((s, j) => (j === editedIndex ? { ...s, amount: typed } : s));
    if (next.length !== 2 || !next.every((s) => s.method === "percentage")) return next;
    const value = Number(typed);
    if (typed.trim() === "" || !Number.isFinite(value) || value < 0 || value > 100) return next;
    const otherBp = 10_000 - Math.round(value * 100);
    const other = editedIndex === 0 ? 1 : 0;
    next[other] = { ...next[other]!, amount: String(Number((otherBp / 100).toFixed(2))) };
    return next;
}
