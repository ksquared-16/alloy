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
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createEnrollmentProcessInstance } from "@/lib/process/processInstances";
import { resolveLiveEnrollmentContextForHousehold } from "@/lib/records/enrollmentContextResolver";
import { RecordCreationError } from "@/lib/records/recordCreationErrors";

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

    const created = await createEnrollmentProcessInstance(supabase, {
        orgId,
        subjectId: customerMemberId,
        contextId: opportunityId,
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

    return {
        processInstanceId: created.id,
        customerMemberId,
        customerId,
        opportunityId,
        contextOutcome: opportunityId ? "joined_live_episode" : "context_free",
        reused: created.reused === true,
    };
}
