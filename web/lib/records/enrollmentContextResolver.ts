/**
 * Does this household have a LIVE enrollment episode a new child could legitimately join?
 *
 * ── WHY NOT "THE NEWEST OPPORTUNITY" ──
 *
 * A household accumulates Opportunities: the 2025 enrollment that completed, the 2024 enquiry that
 * went nowhere. Attaching a 2026 sibling to any of them would say the platform believes that
 * episode is still running — it would reopen finished history, put a settled family back into work
 * views, and make the sibling's journey a continuation of an enrolment that already ended.
 *
 * ── THE POLICY ──
 *
 * An Opportunity is a live episode when a journey is actually RUNNING inside it: at least one
 * `process_instances` row for the household's children whose state has not concluded. That reads
 * canonical runtime truth rather than a per-tenant status vocabulary, and it answers the operator's
 * real question — "is this family mid-enrolment right now?"
 *
 * A second, independent signal can only DISQUALIFY: if the Opportunity's Work Unit exists and is
 * inactive, the episode is over regardless of what its journeys say. That is how the platform
 * already models a closed enrollment case.
 *
 * Absence of a live episode is an ordinary answer. It means the sibling's journey runs
 * context-free — not that one should be manufactured.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { CONCLUDED_ENROLLMENT_PROCESS_STATES } from "@/lib/process/processInstances";

export type LiveEnrollmentContext = {
    opportunityId: string;
    /** Children whose running journeys make this episode live — evidence, not decoration. */
    runningSubjectIds: string[];
};

export type ResolveLiveEnrollmentContextResult = {
    /** Null = no live episode. The journey should run context-free. */
    context: LiveEnrollmentContext | null;
    /** Every household opportunity considered, for operator-facing explanation. */
    consideredOpportunityIds: string[];
};

function concluded(state: string | null | undefined): boolean {
    return CONCLUDED_ENROLLMENT_PROCESS_STATES.includes((state ?? "").trim().toLowerCase());
}

export async function resolveLiveEnrollmentContextForHousehold(
    supabase: SupabaseClient,
    orgId: string,
    customerId: string
): Promise<ResolveLiveEnrollmentContextResult> {
    const household = (customerId ?? "").trim();
    if (!orgId?.trim() || !household) return { context: null, consideredOpportunityIds: [] };

    const { data: oppRows, error: oppErr } = await supabase
        .from("opportunities")
        .select("id, work_unit_id")
        .eq("org_id", orgId)
        .eq("customer_id", household);
    if (oppErr) throw new Error(oppErr.message);

    const opportunities = (oppRows ?? []) as { id: string; work_unit_id: string | null }[];
    const consideredOpportunityIds = opportunities.map((o) => o.id);
    if (opportunities.length === 0) return { context: null, consideredOpportunityIds };

    // Work Unit inactivity DISQUALIFIES an episode. It never qualifies one — a live-looking unit
    // says nothing about whether this family is still enrolling.
    const workUnitIds = [...new Set(opportunities.map((o) => o.work_unit_id).filter(Boolean))] as string[];
    const inactiveWorkUnits = new Set<string>();
    if (workUnitIds.length > 0) {
        const { data: units, error: unitErr } = await supabase
            .from("work_units")
            .select("id, is_active")
            .eq("org_id", orgId)
            .in("id", workUnitIds);
        if (unitErr) throw new Error(unitErr.message);
        for (const u of (units ?? []) as { id: string; is_active: boolean | null }[]) {
            if (u.is_active === false) inactiveWorkUnits.add(u.id);
        }
    }

    const eligible = opportunities.filter(
        (o) => !(o.work_unit_id && inactiveWorkUnits.has(o.work_unit_id))
    );
    if (eligible.length === 0) return { context: null, consideredOpportunityIds };

    const { data: piRows, error: piErr } = await supabase
        .from("process_instances")
        .select("context_id, subject_id, state")
        .eq("org_id", orgId)
        .eq("subject_type", "child")
        .in(
            "context_id",
            eligible.map((o) => o.id)
        );
    if (piErr) throw new Error(piErr.message);

    const runningByOpportunity = new Map<string, string[]>();
    for (const pi of (piRows ?? []) as {
        context_id: string | null;
        subject_id: string | null;
        state: string | null;
    }[]) {
        const oppId = (pi.context_id ?? "").trim();
        const subjectId = (pi.subject_id ?? "").trim();
        if (!oppId || !subjectId || concluded(pi.state)) continue;
        runningByOpportunity.set(oppId, [...(runningByOpportunity.get(oppId) ?? []), subjectId]);
    }

    // Deterministic when a household somehow has two live episodes: the one with the most running
    // journeys, then by id. Picking arbitrarily would make the sibling's context depend on row order.
    const live = [...runningByOpportunity.entries()].sort(
        (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])
    )[0];
    if (!live) return { context: null, consideredOpportunityIds };

    return {
        context: { opportunityId: live[0], runningSubjectIds: [...new Set(live[1])] },
        consideredOpportunityIds,
    };
}
