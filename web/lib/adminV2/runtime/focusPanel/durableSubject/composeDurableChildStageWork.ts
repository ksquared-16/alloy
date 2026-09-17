import "server-only";

/**
 * THE CHILD'S OWN STAGE WORK, on the child's own record.
 *
 * A child moved to Enrolling through the real Process had an explicit `process_instances.stage_key`,
 * a published stage operating plan and a bound operator action — and no surface that rendered any of
 * it. The family Process Card correctly refuses: the CASE is at Decision while the CHILD is at
 * Enrolling, and a case-grain card that showed the child's work would collapse the grain distinction
 * the Decision slices exist to protect. So the child's record has to be able to answer for itself.
 *
 * ── WHY THE QUEUE COULD NOT ANSWER IT ──
 *
 * The provisioning answer refuses a subject that is not on the work view's evaluated page:
 * "refusing to substitute a different subject". That refusal is right — a queue page is a page — but
 * it means a KNOWN child cannot be worked unless a queue happens to be rowing them. Work Views are
 * discovery; they must not be the only way to instantiate operational subject context.
 *
 * ── NOTHING HERE PROJECTS STAGE WORK ──
 *
 * `resolveOpportunityStageWorkSlice` does, and it already accepts the child-grain identity
 * (`customerMemberId`, `opportunityCustomerMemberId`, `processInstanceId`) it needs to project a
 * child's work rather than a family's. This module only RESOLVES THE ADDRESS — which journey, which
 * stage, which episode, which department — and hands it over. One projection, two hosts.
 *
 * ── THE STAGE IS THE CHILD'S, EXPLICITLY ──
 *
 * `builderStageKey` comes from the child's own `process_instances.stage_key` and from nowhere else.
 * No enrollment-disposition fallback and no inference from the family's stage: the explicit key is
 * now authoritative, and reading it is the whole reason this composes correctly where the family
 * card cannot.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import {
    CONCLUDED_ENROLLMENT_PROCESS_STATES,
    ENROLLMENT_PARTICIPATION_CONTEXT_TYPE,
} from "@/lib/process/processInstances";
import { resolveCurrentEnrollmentBusinessProcessRevision } from "@/lib/process/resolveEnrollmentBusinessProcessRevision";
import { resolveOpportunityStageWorkSlice } from "@/lib/adminV2/viewModel/drawer/opportunity/resolveOpportunityStageWorkSlice";
import type { OpportunityStageWorkSlice } from "@/lib/adminV2/viewModel/drawer/opportunity/resolveOpportunityStageWorkSlice";

export type DurableChildStageWork = {
    /** The process this child is running. */
    processKey: string;
    /** The child's OWN stage — `process_instances.stage_key`, never the family's. */
    stageKey: string;
    /** The episode, so Current Work executes against the right one. */
    processInstanceId: string;
    /** The child's participation — the journey's anchor. */
    opportunityCustomerMemberId: string | null;
    /** The acquisition episode, when the family came through one. Null is legitimate. */
    opportunityId: string | null;
    departmentId: string | null;
    slice: OpportunityStageWorkSlice;
};

type InstanceRow = {
    id: string;
    stage_key: string | null;
    state: string | null;
    context_id: string | null;
    context_type: string | null;
};

const concluded = (state: string | null): boolean =>
    CONCLUDED_ENROLLMENT_PROCESS_STATES.includes((state ?? "").trim().toLowerCase());

/**
 * Compose the child's stage work, or null when there is nothing to compose.
 *
 * Null is an ANSWER — a child with no journey, or one whose journey has not reached a stage, has no
 * Process card to render, and inventing one would assert work that does not exist.
 */
export async function composeDurableChildStageWork(params: {
    supabase: SupabaseClient;
    orgId: string;
    customerMemberId: string;
}): Promise<DurableChildStageWork | null> {
    const orgId = params.orgId.trim();
    const customerMemberId = params.customerMemberId.trim();
    if (!orgId || !customerMemberId) return null;

    const { data } = await params.supabase
        .from("process_instances")
        .select("id, stage_key, state, context_id, context_type")
        .eq("org_id", orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("subject_id", customerMemberId);

    const rows = ((data ?? []) as InstanceRow[]).filter((r) => (r.stage_key ?? "").trim());
    if (!rows.length) return null;
    // A re-enrolling child can hold more than one; the OPEN one is what an operator works, and a
    // concluded row must never displace it.
    const instance = rows.find((r) => !concluded(r.state)) ?? null;
    if (!instance) return null;

    const stageKey = (instance.stage_key ?? "").trim();
    if (!stageKey) return null;

    /*
     * The journey anchors to the participation, so `context_id` is an OCM id — not an Opportunity.
     * The acquisition episode is reachable THROUGH the participation, which is the same "either
     * anchor" reading the rest of Enrollment converged on; assuming `context_id` is an opportunity is
     * exactly the defect that class keeps producing.
     */
    const ocmId =
        (instance.context_type ?? "").trim() === ENROLLMENT_PARTICIPATION_CONTEXT_TYPE
            ? (instance.context_id ?? "").trim() || null
            : null;
    let opportunityId =
        (instance.context_type ?? "").trim() === "opportunity"
            ? (instance.context_id ?? "").trim() || null
            : null;

    if (ocmId && !opportunityId) {
        const { data: ocm } = await params.supabase
            .from("opportunity_customer_members")
            .select("opportunity_id")
            .eq("org_id", orgId)
            .eq("id", ocmId)
            .maybeSingle();
        opportunityId = ((ocm as { opportunity_id?: string | null } | null)?.opportunity_id ?? "").trim() || null;
    }

    // D-96 owns which department governs an Enrollment journey; asking it is not a second opinion.
    const pin = await resolveCurrentEnrollmentBusinessProcessRevision(params.supabase, orgId, {
        opportunityId,
    });
    const departmentId = pin.departmentId ?? null;

    const slice = await resolveOpportunityStageWorkSlice({
        supabase: params.supabase,
        orgId,
        // The projection still reads the case's operational rows; the CHILD identity below is what
        // narrows the work to this participant.
        opportunityId: opportunityId ?? "",
        departmentId,
        stageKey,
        customerMemberId,
        opportunityCustomerMemberId: ocmId,
        processInstanceId: instance.id,
    });

    return {
        processKey: ENROLLMENT_PROCESS_KEY,
        stageKey,
        processInstanceId: instance.id,
        opportunityCustomerMemberId: ocmId,
        opportunityId,
        departmentId,
        slice,
    };
}
