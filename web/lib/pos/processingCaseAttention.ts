import type { SupabaseClient } from "@supabase/supabase-js";

import { PROCESSING_ACTIONABLE_STATUSES, isProcessingActionableStatus } from "@/lib/pos/processingActionableWork";

/**
 * NEW / UNWORKED — what arrived and no operator has acted on yet.
 *
 * Not a status and not an age. A case is UNWORKED while it is actionable (`PROCESSING_ACTIONABLE_STATUSES`)
 * and carries no operator-authored decision: no identity resolution or correction an operator recorded
 * (`processing_resolutions.decided_by = 'operator'` — engine decisions at intake do not count), and no
 * form created from it (`form_draft_created` — the detected draft preview is automatic and is not). Opening
 * or reading a case is not working it.
 *
 * This is the Processing nav badge (the operator-actionable "new work" count) and the queue's "New"
 * marker — one rule, both surfaces. Approval concludes the case, so it leaves the count.
 */
export function isProcessingCaseUnworked(input: {
    status: string | null | undefined;
    operatorWorked: boolean;
    formDraftStarted?: boolean;
}): boolean {
    return isProcessingActionableStatus(input.status) && !input.operatorWorked && !input.formDraftStarted;
}

const PAGE = 1000;

/** Of these cases, the ones an operator has recorded a decision on. */
export async function loadOperatorWorkedCaseIds(
    supabase: SupabaseClient,
    orgId: string,
    caseIds: readonly string[],
): Promise<Set<string>> {
    const worked = new Set<string>();
    for (let i = 0; i < caseIds.length; i += 200) {
        const chunk = caseIds.slice(i, i + 200);
        const { data, error } = await supabase
            .from("processing_resolutions")
            .select("case_id")
            .eq("org_id", orgId)
            .eq("decided_by", "operator")
            .in("case_id", chunk);
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as Array<{ case_id: string }>) worked.add(row.case_id);
    }
    return worked;
}

function formDraftStarted(metadata: unknown): boolean {
    if (!metadata || typeof metadata !== "object") return false;
    const m = metadata as Record<string, unknown>;
    return Boolean(m.form_draft_created);
}

/** How many actionable cases are still NEW / UNWORKED, org-wide. */
export async function countUnworkedProcessingCases(supabase: SupabaseClient, orgId: string): Promise<number> {
    const cases: Array<{ id: string; status: string; metadata: unknown }> = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
            .from("processing_cases")
            .select("id, status, metadata")
            .eq("org_id", orgId)
            .in("status", PROCESSING_ACTIONABLE_STATUSES)
            // A case whose family or child no longer exists is evidence, not work: never counted as new.
            .eq("processing_case_subject_removed", false)
            .order("id", { ascending: true })
            .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as Array<{ id: string; status: string; metadata: unknown }>;
        cases.push(...rows);
        if (rows.length < PAGE) break;
    }
    const worked = await loadOperatorWorkedCaseIds(supabase, orgId, cases.map((c) => c.id));
    return cases.filter((c) =>
        isProcessingCaseUnworked({ status: c.status, operatorWorked: worked.has(c.id), formDraftStarted: formDraftStarted(c.metadata) }),
    ).length;
}

/** Per-row UNWORKED flags for a loaded queue page. */
export async function loadUnworkedFlags(
    supabase: SupabaseClient,
    orgId: string,
    rows: ReadonlyArray<{ id: string; status: string; formDraftSummary?: { generatedFormId?: string | null } | null }>,
): Promise<Record<string, true>> {
    const candidates = rows.filter((r) => isProcessingActionableStatus(r.status));
    const worked = await loadOperatorWorkedCaseIds(supabase, orgId, candidates.map((r) => r.id));
    const out: Record<string, true> = {};
    for (const r of candidates) {
        if (isProcessingCaseUnworked({ status: r.status, operatorWorked: worked.has(r.id), formDraftStarted: Boolean(r.formDraftSummary?.generatedFormId) })) {
            out[r.id] = true;
        }
    }
    return out;
}
