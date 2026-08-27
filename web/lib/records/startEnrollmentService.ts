/**
 * Start Enrollment — begin the governed journey for a child who already exists.
 *
 * ── WHAT IT CREATES, AND WHAT IT REFUSES TO ──
 *
 * One `process_instances` row, subject = `customer_members.id`. Nothing else.
 *
 * It does NOT create an Opportunity. The previous slice deferred this action precisely because
 * `createEnrollmentProcessInstance` demanded one — a code-level requirement mistaken for a platform
 * one, since `context_id` has always been nullable and documented "generic, optional". Inventing an
 * Opportunity to satisfy a helper would manufacture an acquisition episode that never happened and
 * would put a settled family back into acquisition work views.
 *
 * It does NOT materialise the durable trio. Agreement, placement and schedule are what the journey
 * produces when it reaches its outcome — writing them here would claim the child is in care because
 * someone pressed Start.
 *
 * ── CONTEXT IS RESOLVED, NEVER FABRICATED ──
 *
 * If the household has a genuinely live episode, the journey joins it as context. Otherwise it runs
 * context-free, which the schema has always permitted. A completed 2025 enrolment is never reopened
 * to give a 2026 sibling somewhere to live.
 * @see enrollmentContextResolver.ts
 *
 * ── B1: STARTING ALSO REALIZES THE PARTICIPANT OBJECTIVE ──
 *
 * Starting Enrollment now creates (or resumes) the participant session and access link that realize
 * the journey, derived from the governing revision's Form requirements. Public links are an access
 * mechanism; this service stays the lifecycle authority.
 *
 * The realization is ADDITIVE and never fatal. A tenant whose Enrollment stage requires no Forms, or
 * whose journey is unpinned, still gets a legitimately started journey — it simply has no participant
 * packet yet, and `participantLaunch` names why in a code rather than throwing. Refusing to start a
 * journey because there is nothing to send a parent would be this service enforcing a Forms
 * precondition on a lifecycle transaction.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    createEnrollmentProcessInstance,
    ENROLLMENT_PARTICIPATION_CONTEXT_TYPE,
} from "@/lib/process/processInstances";
import { ensureOpportunityCustomerMemberParticipation } from "@/lib/lifecycle/ensureOpportunityCustomerMemberParticipation";
import { ENROLLING_CHILD_STATUS_KEY } from "@/lib/lifecycle/enrollmentProcessStatusVocabulary";
import { resolveLiveEnrollmentContextForHousehold } from "@/lib/records/enrollmentContextResolver";
import { RecordCreationError } from "@/lib/records/recordCreationErrors";
import {
    launchParticipantEnrollment,
    type ParticipantLaunchValue,
} from "@/lib/enrollment/participantLaunch/launchParticipantEnrollment";

export type StartEnrollmentInput = {
    orgId: string;
    /** The durable child subject — `customer_members.id`, never `person_id`. */
    customerMemberId: string;
    /**
     * Operator override: run context-free even if a live episode exists. The default is to use the
     * live episode, because a family mid-enrolment is one episode, not several.
     */
    forceContextFree?: boolean;
};

export type StartEnrollmentResult = {
    processInstanceId: string;
    customerMemberId: string;
    customerId: string;
    /** Null = context-free, which is a legitimate journey and not a degraded one. */
    opportunityId: string | null;
    contextOutcome: "joined_live_episode" | "context_free";
    /** True when an open journey already existed and was returned instead of a second one. */
    reused: boolean;
    /**
     * The participant objective this start realized, or the reason it realized none.
     *
     * Always present, never thrown: "the journey started and there is nothing to send yet" is a real
     * and legitimate outcome, and reporting it as a code beats reporting it as a failure to start.
     */
    participantLaunch:
        | { realized: true; value: ParticipantLaunchValue }
        | { realized: false; code: string; detail: string };
};

type ChildRow = { id: string; customer_id: string | null; display_name: string | null };

export async function startEnrollment(
    supabase: SupabaseClient,
    input: StartEnrollmentInput
): Promise<StartEnrollmentResult> {
    const orgId = (input.orgId ?? "").trim();
    if (!orgId) throw new RecordCreationError("invalid_input", "orgId is required");
    const customerMemberId = (input.customerMemberId ?? "").trim();
    if (!customerMemberId) {
        throw new RecordCreationError("invalid_input", "Select the child to start enrollment for");
    }

    const { data, error } = await supabase
        .from("customer_members")
        .select("id, customer_id, display_name")
        .eq("org_id", orgId)
        .eq("id", customerMemberId)
        .eq("relationship", "child")
        .maybeSingle();
    if (error) throw new RecordCreationError("db_error", error.message);
    const child = data as ChildRow | null;
    if (!child) {
        throw new RecordCreationError("not_found", "Child record not found in this organization");
    }
    const customerId = (child.customer_id ?? "").trim();
    if (!customerId) {
        throw new RecordCreationError(
            "invalid_state",
            "This child has no household, so there is no enrollment context to resolve"
        );
    }

    const resolved = input.forceContextFree
        ? { context: null }
        : await resolveLiveEnrollmentContextForHousehold(supabase, orgId, customerId);
    const opportunityId = resolved.context?.opportunityId ?? null;

    /*
     * THE ENROLLMENT PARTICIPATION IS ESTABLISHED HERE, NOT AT COMPLETION.
     *
     * `opportunity_customer_members` is the durable owner of a child's Enrollment state, and a
     * journey needs that subject from its first moment — not conjured at the end, when the outcome
     * would have nowhere to write. With a live episode this reuses the participation that episode
     * already has; without one it creates a context-free participation and STILL creates no
     * Opportunity, which is the whole point of the preceding paragraph.
     *
     * `enrolling` is the child track's own starting state. The ensurer is find-or-create, so an
     * existing participation keeps whatever state it already holds — starting a journey never
     * rewinds an episode that is further along.
     */
    const participation = await ensureOpportunityCustomerMemberParticipation({
        supabase,
        orgId,
        opportunityId,
        customerMemberId,
        source: "enrollment_start",
        outcomeStatusKey: ENROLLING_CHILD_STATUS_KEY,
    });

    /*
     * THE JOURNEY ANCHORS TO THE PARTICIPATION, whether or not acquisition brought the family here.
     *
     * One context shape for Enrollment. Anchoring to the Opportunity could not describe a
     * context-free enrolment at all, and keeping both shapes would leave every downstream consumer
     * guessing which one a given journey used. The Opportunity is still reachable — it is on the
     * participation — and `resolveEnrollmentJourneyContext` still reads journeys written under the
     * older shape, so this converges without a flag day.
     *
     * Reuse also improves: the instance is now deduped by EPISODE rather than by acquisition
     * episode or by bare subject, which is the grain a journey actually has.
     */
    const created = await createEnrollmentProcessInstance(supabase, {
        orgId,
        subjectId: customerMemberId,
        contextId: participation.ocmId,
        contextType: ENROLLMENT_PARTICIPATION_CONTEXT_TYPE,
        // Where the family came from — kept distinct from what the journey anchors to, so the
        // D-96 department pin still resolves canonically.
        acquisitionOpportunityId: opportunityId,
        // No stage: the journey's configured entry decides position. Stamping one here would be
        // this service inventing a place in a process it does not own.
        stageKey: null,
        // No outcome: nothing has happened yet.
        state: null,
        source: "enrollment_start",
    });
    if (created.error) throw new RecordCreationError("db_error", created.error);
    if (!created.id) {
        throw new RecordCreationError("db_error", "Could not start the enrollment process");
    }

    const launched = await launchParticipantEnrollment(supabase, {
        orgId,
        processInstanceId: created.id,
        customerId,
        opportunityId,
    });

    return {
        processInstanceId: created.id,
        customerMemberId,
        customerId,
        opportunityId,
        /** The durable Enrollment subject this journey belongs to. */
        enrollmentParticipationId: participation.ocmId,
        participationCreated: participation.created,
        contextOutcome: opportunityId ? "joined_live_episode" : "context_free",
        reused: created.reused === true,
        participantLaunch: launched.ok
            ? { realized: true, value: launched.value }
            : { realized: false, code: launched.refusal.code, detail: launched.refusal.detail },
    };
}
