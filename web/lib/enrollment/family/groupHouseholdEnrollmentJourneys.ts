/**
 * WHICH CHILD JOURNEYS ARE THIS FAMILY'S ENROLLMENT — read, never stored.
 *
 * The family view used to exist only for a household with a live Opportunity episode, and only for
 * the children still running in it:
 *
 *   - a child started context-free (Start Enrollment with no live episode anchors to a participation
 *     whose `opportunity_id` is null) was in no episode, so a household enrolling that way had no
 *     family view — and, because the payment surface reads the same family, could not pay;
 *   - a child who reached Enrolled dropped out of the family the moment it happened, so "Ava —
 *     Enrolled, Ben — Waitlist, Charlie — Enrolling" could never be shown together.
 *
 * Two readings, one rule each:
 *
 *   EPISODE   When the household has a live episode, the family is that episode's children —
 *             running AND concluded — because that is the enrolment the family is in. A child
 *             enrolled years ago in a different episode is not part of it.
 *   HOUSEHOLD When there is no live episode, the family is the household's children with a
 *             RUNNING Enrollment journey. Without an episode there is no boundary for concluded
 *             journeys, so none are shown rather than every one the household ever had.
 *
 * Every journey stays its own: one instance per child is chosen (the running one, else the latest),
 * nothing is merged, and children outside the household are never included.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveLiveEnrollmentContextForHousehold } from "@/lib/records/enrollmentContextResolver";
import { enrollmentContextIdsForOpportunities } from "@/lib/enrollment/completion/resolveEnrollmentJourneyContext";
import { CONCLUDED_ENROLLMENT_PROCESS_STATES } from "@/lib/process/processInstances";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";

export type HouseholdJourneyInstance = {
    readonly id: string;
    readonly subject_id: string | null;
    readonly state: string | null;
    readonly stage_key: string | null;
    readonly created_at?: string | null;
};

export type HouseholdEnrollmentGrouping = {
    /** The episode's Opportunity, or null when the family is grouped by household alone. */
    readonly opportunityId: string | null;
    readonly basis: "episode" | "household";
    /** One journey per child, each the child's own. */
    readonly instances: readonly HouseholdJourneyInstance[];
};

export function journeyIsConcluded(state: string | null | undefined): boolean {
    return CONCLUDED_ENROLLMENT_PROCESS_STATES.includes((state ?? "").trim().toLowerCase());
}

/** One journey per child: the running one, else the most recently created. Pure. */
export function onePerChild(rows: readonly HouseholdJourneyInstance[]): HouseholdJourneyInstance[] {
    const byChild = new Map<string, HouseholdJourneyInstance>();
    for (const row of rows) {
        const child = (row.subject_id ?? "").trim();
        if (!child) continue;
        const held = byChild.get(child);
        if (!held) {
            byChild.set(child, row);
            continue;
        }
        const heldRunning = !journeyIsConcluded(held.state);
        const rowRunning = !journeyIsConcluded(row.state);
        if (rowRunning && !heldRunning) byChild.set(child, row);
        else if (rowRunning === heldRunning && (row.created_at ?? "") > (held.created_at ?? "")) byChild.set(child, row);
    }
    return [...byChild.values()];
}

export async function groupHouseholdEnrollmentJourneys(
    supabase: SupabaseClient,
    input: { readonly orgId: string; readonly customerId: string },
): Promise<HouseholdEnrollmentGrouping | null> {
    const { orgId, customerId } = input;

    // The household's children — the only subjects that can ever appear.
    const { data: memberRows, error: memberErr } = await supabase
        .from("customer_members")
        .select("id")
        .eq("org_id", orgId)
        .eq("customer_id", customerId);
    if (memberErr) throw new Error(memberErr.message);
    const householdChildren = new Set(((memberRows ?? []) as { id: string }[]).map((m) => m.id));
    if (householdChildren.size === 0) return null;

    const select = "id, subject_id, state, stage_key, created_at, process_key, subject_type";
    const ownedEnrollment = (rows: unknown[] | null) =>
        ((rows ?? []) as Array<HouseholdJourneyInstance & { process_key?: string | null; subject_type?: string | null }>)
            .filter((r) => (r.subject_type ?? "child") === "child")
            .filter((r) => !r.process_key || r.process_key === ENROLLMENT_PROCESS_KEY)
            .filter((r) => householdChildren.has((r.subject_id ?? "").trim()));

    const live = await resolveLiveEnrollmentContextForHousehold(supabase, orgId, customerId);
    if (live.context) {
        const { contextIds } = await enrollmentContextIdsForOpportunities(supabase, orgId, [live.context.opportunityId]);
        const { data, error } = await supabase
            .from("process_instances")
            .select(select)
            .eq("org_id", orgId)
            .in("context_id", contextIds.length > 0 ? contextIds : ["-"]);
        if (error) throw new Error(error.message);
        const instances = onePerChild(ownedEnrollment(data));
        if (instances.length > 0) return { opportunityId: live.context.opportunityId, basis: "episode", instances };
    }

    const { data, error } = await supabase
        .from("process_instances")
        .select(select)
        .eq("org_id", orgId)
        .in("subject_id", [...householdChildren]);
    if (error) throw new Error(error.message);
    const running = onePerChild(ownedEnrollment(data)).filter((r) => !journeyIsConcluded(r.state));
    if (running.length === 0) return null;
    return { opportunityId: null, basis: "household", instances: running };
}
