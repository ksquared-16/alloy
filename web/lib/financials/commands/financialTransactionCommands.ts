/**
 * ── THE FINANCIAL TRANSACTION COMMANDS, OWNED ONCE ─────────────────────────────────────────────
 *
 * Two surfaces show the same ledger — the Focus Panel's Details card and Financials → Accounts —
 * and an operator must be able to do the same things to a transaction on both. The temptation is
 * to give the second surface its own Reverse, its own Post, its own eligibility rule; that is how a
 * product ends up with two answers to "can this charge be reversed" and two writers that drift.
 *
 * So: the canonical action keys, the eligibility model and the single execution path live here.
 * Hosts own PLACEMENT. Financials owns COMMAND SEMANTICS. Nothing in this module renders.
 */

/** The canonical actions a ledger row can raise. Spelled once, so no host can invent a variant. */
export const FINANCIAL_TRANSACTION_ACTIONS = {
    post: "charge.post",
    reverse: "charge.reverse",
    adjust: "billing.adjust_account",
    reverseAdjustment: "billing.reverse_adjustment",
    movePayment: "payment.reverse_application",
    applyPayment: "payment.apply",
    /*
     * WHO OWES THIS ONE OBLIGATION — the charge-grain half of responsibility.
     *
     * `billing.configure_responsibility` answers "what arrangement should apply", and it is
     * account-grain and effective-dated. These two answer a different question: how THIS eligible
     * obligation is divided under the arrangement in force. They existed as registered commands
     * with no operator surface at all, so an operator could say who should be responsible and had
     * no way to resolve an obligation under what they had just said.
     */
    resolveResponsibility: "billing.resolve_responsibility",
    reallocateResponsibility: "billing.reallocate_responsibility",
} as const;

export type FinancialTransactionCommandKind = keyof typeof FINANCIAL_TRANSACTION_ACTIONS;

/**
 * WHAT A TRANSACTION OFFERS — the read model's answer, restated nowhere.
 *
 * `offersPost` and `offersReverse` are decided server-side against the charge's lifecycle, and a
 * surface that re-derived them from a status string would be a second eligibility authority. The
 * only rule expressed here is the one relating the two: a charge that may be reversed is a standing
 * obligation, so it is also the charge an adjustment can reduce.
 */
export type FinancialTransactionEligibilityInput = {
    chargeId: string | null;
    offersPost?: boolean;
    offersReverse?: boolean;
};

export type FinancialTransactionEligibility = {
    post: boolean;
    reverse: boolean;
    adjust: boolean;
};

export function financialTransactionEligibility(
    row: FinancialTransactionEligibilityInput,
): FinancialTransactionEligibility {
    const hasCharge = Boolean(row.chargeId);
    const reverse = hasCharge && row.offersReverse === true;
    return {
        post: hasCharge && row.offersPost === true,
        reverse,
        /* Reverse and Adjust are two readings of one eligibility: the charge stands. */
        adjust: reverse,
    };
}

export type FinancialCommandEntity = { entityType: string; entityId: string };

export type FinancialCommandResult =
    | { ok: true; preview: { summary: string; changes: string[] } | null }
    | { ok: false; error: string };

/**
 * THE ONE EXECUTION PATH.
 *
 * Every financial command from every host goes through `/api/admin/actions/execute` with the
 * canonical action key — preview and execute alike. A host that fetched this route itself would be
 * a second executor with its own error handling and its own idea of what a refusal looks like.
 */
export async function executeFinancialCommand(input: {
    action: FinancialTransactionCommandKind;
    entity: FinancialCommandEntity;
    payload: Record<string, unknown>;
    mode: "preview" | "execute";
}): Promise<FinancialCommandResult> {
    try {
        const res = await fetch("/api/admin/actions/execute", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                action_key: FINANCIAL_TRANSACTION_ACTIONS[input.action],
                entity_type: input.entity.entityType,
                entity_id: input.entity.entityId,
                mode: input.mode,
                ...(input.mode === "execute" ? { confirmation: { confirmed: true } } : {}),
                payload: input.payload,
            }),
        });
        const json = (await res.json()) as {
            ok?: boolean;
            error?: string | { message?: string };
            data?: {
                execution_result?: {
                    preview?: { summary?: string; changes?: string[] };
                    /* A domain outcome, for the commands that answer with one. */
                    kind?: string;
                    reason?: string;
                    detail?: string;
                };
            };
        };
        if (!json?.ok) {
            const err = typeof json?.error === "string" ? json.error : json?.error?.message;
            return { ok: false, error: err || "The action was refused." };
        }
        /*
         * ── AN ENVELOPE THAT SUCCEEDED IS NOT AN OPERATION THAT HAPPENED ─────────────────────
         *
         * `ok` here means the route ran the action; it says nothing about what the action DECIDED.
         * The responsibility commands answer with a domain outcome, and two of those outcomes mean
         * nothing was written: `refused` (the engine would not divide this obligation) and
         * `reallocation_required` (the arrangement in force would divide a posted charge
         * differently, which needs an explicit decision).
         *
         * Measured: resolving a $25.00 obligation against an arrangement whose fixed shares total
         * $500.00 returned HTTP 200, ok:true, and `{"kind":"refused","reason":"fixed_exceeds_net",
         * "detail":"fixed 50000 over net 2500"}`. The caller read `ok` and closed its surface, so an
         * operator pressed Confirm, watched the command dismiss, and was told nothing at all — the
         * exact failure the reverse command's own notes warn about. The refusal is the answer and
         * it belongs in front of the operator.
         */
        const outcome = json?.data?.execution_result;
        if (outcome?.kind === "refused" || outcome?.kind === "reallocation_required") {
            return { ok: false, error: outcome.detail || outcome.reason || "The action was refused." };
        }
        const p = outcome?.preview;
        return { ok: true, preview: p?.summary ? { summary: p.summary, changes: p.changes ?? [] } : null };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}

/**
 * WHICH RESPONSIBILITY COMMAND THIS ROW CAN RAISE — from the state the ledger already shows.
 *
 * ── THE THREE STATES ARE NOT TWO ─────────────────────────────────────────────────────────────
 *
 * `not-allocated` (no allocation exists), `unassigned` (an allocation exists naming nobody) and
 * `named` are genuinely different, and the first two both mean the same thing to an operator:
 * nobody owes this yet, so RESOLVE it. A row that already names a party is not resolved again —
 * changing it moves what one real person owes another, which is REALLOCATION and needs a reason.
 *
 * ── AND ONE STATE OFFERS NOTHING ─────────────────────────────────────────────────────────────
 *
 * `responsibilityApplies === false` is a reduction: responsibility belongs to the charge it
 * reduces, not to the credit. Offering Resolve there would invite an operator to divide a discount.
 */
export type FinancialResponsibilityEligibilityInput = {
    chargeId: string | null;
    /** False on a row where the question does not arise at all — a reduction. */
    responsibilityApplies?: boolean;
    /** The party already named on this obligation, if any. */
    responsibleParty?: string | null;
};

export type FinancialResponsibilityEligibility = { resolve: boolean; reallocate: boolean };

export function financialResponsibilityEligibility(
    row: FinancialResponsibilityEligibilityInput,
): FinancialResponsibilityEligibility {
    const hasCharge = Boolean(row.chargeId);
    if (!hasCharge || row.responsibilityApplies === false) return { resolve: false, reallocate: false };
    const named = Boolean((row.responsibleParty ?? "").trim());
    /* Exactly one of the two is ever offered: a row is either divided or it is not. */
    return { resolve: !named, reallocate: named };
}
