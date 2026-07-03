/**
 * process_instances — the generic runtime primitive for a running operational journey.
 *
 * A Process Instance is a SUBJECT moving through a PROCESS within a CONTEXT. It owns the
 * runtime position (`stage_key`), durable `state`, and domain participation payload (`metadata`).
 * For Enrollment it REPLACES opportunity_customer_members (OCM) as the runtime owner of child
 * participation. OCM is a temporary legacy data source only (see the OCM removal plan).
 *
 * Doctrine: Lead/opportunity is context; Child is subject; Process Instance is the journey;
 * Work attaches to the instance; Outcomes move the instance; Work Views read instances.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";

export const PROCESS_INSTANCES_TABLE = "process_instances" as const;

/** Enrollment subject/context vocabulary (generic table, enrollment binding). */
export const ENROLLMENT_SUBJECT_TYPE = "child" as const;
export const ENROLLMENT_CONTEXT_TYPE = "opportunity" as const;

/** Durable enrollment process state (replaces OCM.outcome_status_key). null = in-process pre-outcome. */
export type EnrollmentProcessState =
    | "waitlisted"
    | "enrolling"
    | "enrolled"
    | "withdrawn"
    | "not_enrolling";

export type ProcessInstanceRow = {
    id: string;
    org_id: string;
    process_key: string;
    subject_type: string;
    subject_id: string;
    context_type: string | null;
    context_id: string | null;
    stage_key: string | null;
    state: string | null;
    close_reason_key: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string | null;
};

/** Enrollment participation payload carried in metadata (canonical fields; no OCM dependency). */
export type EnrollmentParticipationMetadata = {
    start_date?: string | null;
    schedule_type?: string | null;
    program_category_id?: string | null;
    location_id?: string | null;
    program_room_cohort_key?: string | null;
    notes?: string | null;
};

/** Build the insert row for an enrollment process instance (one per child per lead). */
export function buildEnrollmentProcessInstanceInsert(args: {
    orgId: string;
    /** child = customer_members.id */
    subjectId: string;
    /** lead = opportunities.id */
    contextId: string;
    /** Initial stage; a brand-new lead's child rides the family track → null until a decision. */
    stageKey?: string | null;
    /** Initial durable state; null at intake (no enrollment outcome yet). */
    state?: EnrollmentProcessState | null;
    participation?: EnrollmentParticipationMetadata;
}): Record<string, unknown> {
    const metadata: Record<string, unknown> = { source: "create_lead" };
    for (const [k, v] of Object.entries(args.participation ?? {})) {
        if (v !== undefined && v !== null && v !== "") metadata[k] = v;
    }
    return {
        org_id: args.orgId,
        process_key: ENROLLMENT_PROCESS_KEY,
        subject_type: ENROLLMENT_SUBJECT_TYPE,
        subject_id: args.subjectId,
        context_type: ENROLLMENT_CONTEXT_TYPE,
        context_id: args.contextId,
        stage_key: args.stageKey ?? null,
        state: args.state ?? null,
        metadata,
    };
}

/** Create an enrollment process instance for a child on a lead. Idempotent on the unique scope. */
export async function createEnrollmentProcessInstance(
    supabase: SupabaseClient,
    args: Parameters<typeof buildEnrollmentProcessInstanceInsert>[0],
): Promise<{ id: string | null; error?: string }> {
    const row = buildEnrollmentProcessInstanceInsert(args);
    const { data, error } = await supabase
        .from(PROCESS_INSTANCES_TABLE)
        .upsert(row, { onConflict: "org_id,process_key,subject_id,context_id", ignoreDuplicates: true })
        .select("id")
        .maybeSingle();
    if (error) return { id: null, error: error.message };
    return { id: data ? String((data as { id: string }).id) : null };
}

/** Move a process instance's stage (outcome execution is the only caller). */
export async function moveProcessInstanceStage(
    supabase: SupabaseClient,
    args: { orgId: string; instanceId: string; stageKey: string },
): Promise<{ error?: string }> {
    const { error } = await supabase
        .from(PROCESS_INSTANCES_TABLE)
        .update({ stage_key: args.stageKey, updated_at: new Date().toISOString() })
        .eq("id", args.instanceId)
        .eq("org_id", args.orgId);
    return error ? { error: error.message } : {};
}

/** Set a process instance's durable state (+ optional close reason). Outcome execution only. */
export async function setProcessInstanceState(
    supabase: SupabaseClient,
    args: { orgId: string; instanceId: string; state: EnrollmentProcessState; closeReasonKey?: string | null },
): Promise<{ error?: string }> {
    const patch: Record<string, unknown> = { state: args.state, updated_at: new Date().toISOString() };
    if (args.closeReasonKey !== undefined) patch.close_reason_key = args.closeReasonKey;
    const { error } = await supabase
        .from(PROCESS_INSTANCES_TABLE)
        .update(patch)
        .eq("id", args.instanceId)
        .eq("org_id", args.orgId);
    return error ? { error: error.message } : {};
}

/**
 * Move a child's enrollment instance stage by scope (opportunity + child), not by instance id —
 * the outcome executor knows the lead + child, and this targets exactly that sibling's instance.
 */
export async function moveEnrollmentInstanceStageByScope(
    supabase: SupabaseClient,
    args: { orgId: string; opportunityId: string; customerMemberId: string; stageKey: string },
): Promise<{ moved: number; error?: string }> {
    const { data, error } = await supabase
        .from(PROCESS_INSTANCES_TABLE)
        .update({ stage_key: args.stageKey, updated_at: new Date().toISOString() })
        .eq("org_id", args.orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("context_id", args.opportunityId)
        .eq("subject_id", args.customerMemberId)
        .select("id");
    if (error) return { moved: 0, error: error.message };
    return { moved: (data ?? []).length };
}

/** Set a child's enrollment instance durable state (+ close reason) by scope (opportunity + child). */
export async function setEnrollmentInstanceStateByScope(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        opportunityId: string;
        customerMemberId: string;
        state: EnrollmentProcessState;
        closeReasonKey?: string | null;
    },
): Promise<{ moved: number; error?: string }> {
    const patch: Record<string, unknown> = { state: args.state, updated_at: new Date().toISOString() };
    if (args.closeReasonKey !== undefined) patch.close_reason_key = args.closeReasonKey;
    const { data, error } = await supabase
        .from(PROCESS_INSTANCES_TABLE)
        .update(patch)
        .eq("org_id", args.orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("context_id", args.opportunityId)
        .eq("subject_id", args.customerMemberId)
        .select("id");
    if (error) return { moved: 0, error: error.message };
    return { moved: (data ?? []).length };
}

/** Resolve a child's enrollment process-instance id by scope (opportunity + child). */
export async function getEnrollmentInstanceIdByScope(
    supabase: SupabaseClient,
    args: { orgId: string; opportunityId: string; customerMemberId: string },
): Promise<string | null> {
    const { data } = await supabase
        .from(PROCESS_INSTANCES_TABLE)
        .select("id")
        .eq("org_id", args.orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("context_id", args.opportunityId)
        .eq("subject_id", args.customerMemberId)
        .maybeSingle();
    const id = (data as { id?: string } | null)?.id;
    return typeof id === "string" && id.trim() ? id.trim() : null;
}

/** Read a child's current enrollment instance state by scope (for transition events). */
export async function readEnrollmentInstanceState(
    supabase: SupabaseClient,
    args: { orgId: string; opportunityId: string; customerMemberId: string },
): Promise<string | null> {
    const { data } = await supabase
        .from(PROCESS_INSTANCES_TABLE)
        .select("state")
        .eq("org_id", args.orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("context_id", args.opportunityId)
        .eq("subject_id", args.customerMemberId)
        .maybeSingle();
    return (data as { state?: string | null } | null)?.state ?? null;
}

/** Read enrollment process instances for a lead (Work View / drawer child list). */
export async function listEnrollmentInstancesForLead(
    supabase: SupabaseClient,
    args: { orgId: string; opportunityId: string },
): Promise<ProcessInstanceRow[]> {
    const { data, error } = await supabase
        .from(PROCESS_INSTANCES_TABLE)
        .select("*")
        .eq("org_id", args.orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("context_id", args.opportunityId);
    if (error) return [];
    return (data ?? []) as ProcessInstanceRow[];
}

/** Read enrollment process instances in a stage (child-grain Work View membership). */
export async function listEnrollmentInstancesForStage(
    supabase: SupabaseClient,
    args: { orgId: string; stageKey: string },
): Promise<ProcessInstanceRow[]> {
    const { data, error } = await supabase
        .from(PROCESS_INSTANCES_TABLE)
        .select("*")
        .eq("org_id", args.orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("stage_key", args.stageKey);
    if (error) return [];
    return (data ?? []) as ProcessInstanceRow[];
}
