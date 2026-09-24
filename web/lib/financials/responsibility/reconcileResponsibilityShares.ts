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

    const percentTotal = used
        .filter((s) => s.method === "percentage")
        .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    if (percentTotal > 100) {
        return { ok: false, message: `The percentages total ${percentTotal}%.` };
    }
    if (used.some((s) => s.method !== "remainder" && !(Number(s.amount) >= 0))) {
        return { ok: false, message: "Every share needs a number." };
    }

    const hasPercent = used.some((s) => s.method === "percentage");
    if (hasPercent && percentTotal < 100 && remainders.length === 0) {
        return { ok: true, message: `${100 - percentTotal}% is not assigned to anyone.` };
    }
    return { ok: true, message: null };
}

