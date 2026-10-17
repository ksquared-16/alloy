/**
 * WHO A FAMILY DECISION IS ABOUT: every child on the lead, with their journey where they have one.
 *
 * The Decision surface enumerated enrollment JOURNEYS (`process_instances`). But a child gets a
 * journey only when they first stand in a child-grain stage; a child added through Add Child or
 * Create Lead has a participation (`opportunity_customer_members`) and no journey until then. At
 * Decision — the very step that gives each child their first path — the children therefore did not
 * exist: deployed, a two-child family's "Review each child's path" rendered no rows, nothing could be
 * offered, waitlisted or enrolled, and the completion gate said the lead "has no children on it yet".
 *
 * So the participants are the participations, and a journey, where one exists, supplies the child's
 * durable state. A child with no journey is live and undecided (`state: null`), which is exactly what
 * the vocabulary says `null` means.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { readEnrollmentInstancesForLead, type ProcessInstanceRow } from "@/lib/process/processInstances";

export type FamilyDecisionParticipant = {
    customer_member_id: string;
    /** The child's journey, when they have one yet. */
    process_instance_id: string | null;
    state: string | null;
};

export type FamilyDecisionParticipantsRead =
    | { ok: true; participants: FamilyDecisionParticipant[]; journeys: ProcessInstanceRow[] }
    | { ok: false; error: string };

export async function readFamilyDecisionParticipants(
    supabase: SupabaseClient,
    args: { orgId: string; opportunityId: string },
): Promise<FamilyDecisionParticipantsRead> {
    const journeys = await readEnrollmentInstancesForLead(supabase, args);
    if (!journeys.ok) return journeys;

    const { data, error } = await supabase
        .from("opportunity_customer_members")
        .select("customer_member_id")
        .eq("org_id", args.orgId)
        .eq("opportunity_id", args.opportunityId);
    if (error) return { ok: false, error: error.message };
    if (!Array.isArray(data)) return { ok: false, error: "participations could not be read" };

    const byChild = new Map<string, FamilyDecisionParticipant>();
    for (const row of journeys.rows) {
        const id = row.subject_id?.trim();
        if (!id || byChild.has(id)) continue;
        byChild.set(id, { customer_member_id: id, process_instance_id: row.id, state: row.state?.trim() || null });
    }
    for (const row of data as { customer_member_id?: string | null }[]) {
        const id = row.customer_member_id?.trim();
        if (!id || byChild.has(id)) continue;
        byChild.set(id, { customer_member_id: id, process_instance_id: null, state: null });
    }
    return { ok: true, participants: [...byChild.values()], journeys: journeys.rows };
}
