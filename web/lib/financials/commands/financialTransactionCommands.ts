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
            data?: { execution_result?: { preview?: { summary?: string; changes?: string[] } } };
        };
        if (!json?.ok) {
            const err = typeof json?.error === "string" ? json.error : json?.error?.message;
            return { ok: false, error: err || "The action was refused." };
        }
        const p = json?.data?.execution_result?.preview;
        return { ok: true, preview: p?.summary ? { summary: p.summary, changes: p.changes ?? [] } : null };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}
