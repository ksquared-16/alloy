/**
 * WHETHER A CANONICAL BILLING PERIOD IS ALREADY BILLED — one fact, read one way.
 *
 * ── THE DEFECT THIS EXISTS TO END ─────────────────────────────────────────────────────────────
 *
 * Generation learned this lesson once already: it used to call `created`, `recalculated` and
 * `unchanged` all "generated", so re-running a period reported five generated while creating
 * nothing. That was fixed on the EXECUTE side and the vocabulary — generated / unchanged /
 * already_posted — has been right there ever since.
 *
 * PREVIEW kept the bug. It hardcoded `unchanged: 0, alreadyPosted: 0` and emitted `generated` for
 * every due period, reasoning that "a preview writes nothing, so it has no converged drafts of its
 * own to report". That sentence conflates two different things: what THIS preview created, and
 * what ALREADY EXISTS. Measured on deployed staging, it told an operator "Generate 5 · $925.00"
 * for five weekly periods that already carried drafts, and "Generate 1 · $1,450.00" for a month
 * already POSTED. Execution would have created nothing at all.
 *
 * That is worse than a cosmetic miscount. An activation census built on it concluded that
 * switching automatic billing on would bill $2,375.00 when the true figure was zero — a preview
 * that overstates mutation makes every safety decision downstream of it wrong in the dangerous
 * direction.
 *
 * So convergence is read HERE, once, and both the preview and the outstanding-period reader ask
 * this module rather than each carrying their own idea of what "already billed" means.
 *
 * ── WHY A DRAFT COUNTS ────────────────────────────────────────────────────────────────────────
 *
 * A draft tuition charge is work generation already did; re-running the period answers `unchanged`
 * against it. Treating a draft as unbilled would make a healthy assignment look permanently behind
 * and would eventually push it over the automatic catch-up bound for no reason.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type TuitionChargeConvergence = {
    chargeId: string;
    status: string;
    amountCents: number;
    /** `already_posted` once it has left draft: settled money is not re-generated. */
    outcomeKind: "unchanged" | "already_posted";
};

/** Agreement plus the period's service date — the pair generation converges on. */
export function tuitionConvergenceKey(agreementId: string, serviceDate: string): string {
    return `${agreementId}::${serviceDate}`;
}

/**
 * Every tuition charge standing against these agreements, indexed by agreement and service date.
 *
 * One query rather than one per period: an assignment with a year of weekly periods would
 * otherwise issue fifty round trips to answer a single question.
 */
export async function readTuitionChargeConvergence(
    supabase: SupabaseClient,
    orgId: string,
    agreementIds: readonly string[],
): Promise<Map<string, TuitionChargeConvergence>> {
    const index = new Map<string, TuitionChargeConvergence>();
    const ids = [...new Set(agreementIds.filter((id) => typeof id === "string" && id.length > 0))];
    if (ids.length === 0) return index;

    const { data } = await supabase
        .from("charges")
        .select("id, billable_source_id, service_date, status, amount_cents")
        .eq("org_id", orgId)
        .eq("billable_source_type", "enrollment_agreement")
        .eq("charge_category", "tuition")
        .in("billable_source_id", ids);

    for (const row of ((data ?? []) as Array<{
        id: string; billable_source_id: string; service_date: string; status: string; amount_cents: number;
    }>)) {
        const key = tuitionConvergenceKey(row.billable_source_id, row.service_date);
        const posted = row.status !== "draft";
        const existing = index.get(key);
        /* Posted wins over draft: a settled period is answered from the settled row. */
        if (existing && existing.outcomeKind === "already_posted" && !posted) continue;
        index.set(key, {
            chargeId: row.id,
            status: row.status,
            amountCents: row.amount_cents,
            outcomeKind: posted ? "already_posted" : "unchanged",
        });
    }
    return index;
}
