/**
 * Materialize durable operational truth from a completed Enrollment process instance (CHILDCARE domain —
 * the reference implementation of the generic platform pattern Process Instance → Outcome → Materialize).
 *
 * The Process Instance owns the JOURNEY. On enrollment completion it CREATES the durable operational
 * facts (child_enrollment_agreements + child_placements + schedule_assignments) and then records
 * provenance back onto itself. It does NOT permanently own the operational facts — the Agreement does.
 *
 * Fact source order (Task 3): process_instance.metadata → placement_candidates → OCM (temporary fallback).
 * The Agreement/Placement/Schedule are the source of truth once materialized; OCM is never the model.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveEnrollmentJourneyContext } from "@/lib/enrollment/completion/resolveEnrollmentJourneyContext";
import {
    ENROLLMENT_SUBJECT_TYPE,
    PROCESS_INSTANCES_TABLE,
    getEnrollmentInstanceIdByScope,
    type ProcessInstanceRow,
} from "@/lib/process/processInstances";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import {
    applyChildEnrollmentMaterialization,
    type ChildEnrollmentTrioResult,
    type ResolvedEnrollmentFacts,
} from "@/lib/childcareOperational/materializeChildEnrollment";

export const PROCESS_INSTANCE_ENROLLMENT_SOURCE_KEY = "process_instance_enrollment";

function trimOrNull(v: unknown): string | null {
    const s = v != null ? String(v).trim() : "";
    return s || null;
}

/** Which source each fact came from — for telemetry + tests. */
export type EnrollmentFactSources = Record<string, "process_instance" | "placement_candidate" | "ocm" | "opportunity" | "default">;

export type MaterializeEnrollmentResult = {
    ok: boolean;
    skipped: boolean;
    reason?: string;
    error?: string;
    process_instance_id: string;
    customer_member_id?: string | null;
    opportunity_id?: string | null;
    agreement_id?: string | null;
    trio?: ChildEnrollmentTrioResult;
    fact_sources?: EnrollmentFactSources;
};

type ResolveInput = {
    supabase: SupabaseClient;
    orgId: string;
    pi: ProcessInstanceRow;
    todayYmd: string;
};

/** Resolve enrollment facts with precedence: process instance → placement_candidates → OCM → opportunity. */
export async function resolveEnrollmentFactsForProcessInstance(
    input: ResolveInput,
): Promise<{ facts: ResolvedEnrollmentFacts | null; sources: EnrollmentFactSources; reason?: string }> {
    const { supabase, orgId, pi, todayYmd } = input;
    /*
     * The acquisition Opportunity comes from the canonical graph, not from `context_id`.
     *
     * Reading the context id directly was safe only while every Enrollment journey anchored to an
     * Opportunity. With a participation-anchored journey it would query `opportunities` and
     * `placement_candidates` by an OCM id — matching nothing, and silently producing "insufficient
     * facts" for an enrolment whose facts were all present.
     */
    const journey = await resolveEnrollmentJourneyContext(input.supabase, { orgId: input.orgId, processInstance: pi });
    const customerMemberId = journey.customerMemberId ?? trimOrNull(pi.subject_id);
    const opportunityId = journey.opportunityId;
    if (!customerMemberId) return { facts: null, sources: {}, reason: "missing_subject" };

    const meta = (pi.metadata ?? {}) as Record<string, unknown>;
    const sources: EnrollmentFactSources = {};

    // OCM is NOT a normal fact source. It is consulted only behind an explicit legacy flag (old data);
    // new leads never require it. Primary sources: process_instance.metadata → placement_candidates →
    // opportunity defaults.
    const useOcmFallback = process.env.ALLOY_ENROLLMENT_MATERIALIZE_OCM_FALLBACK === "1";

    const [candRes, cmRes, oppRes, ocmRes] = await Promise.all([
        opportunityId
            ? supabase
                  .from("placement_candidates")
                  .select("program_room_cohort_key, start_date, site_id")
                  .eq("org_id", orgId)
                  .eq("opportunity_id", opportunityId)
                  .eq("customer_member_id", customerMemberId)
                  .maybeSingle()
            : Promise.resolve({ data: null }),
        supabase.from("customer_members").select("person_id").eq("org_id", orgId).eq("id", customerMemberId).maybeSingle(),
        opportunityId
            ? supabase.from("opportunities").select("customer_id, location_id").eq("org_id", orgId).eq("id", opportunityId).maybeSingle()
            : Promise.resolve({ data: null }),
        useOcmFallback && opportunityId
            ? supabase
                  .from("opportunity_customer_members")
                  .select("id, program_category_id, program_room_cohort_key, location_id, schedule_type, start_date, person_id")
                  .eq("org_id", orgId)
                  .eq("opportunity_id", opportunityId)
                  .eq("customer_member_id", customerMemberId)
                  .maybeSingle()
            : Promise.resolve({ data: null }),
    ]);
    const cand = (candRes.data ?? null) as Record<string, unknown> | null;
    const cm = (cmRes.data ?? null) as Record<string, unknown> | null;
    const opp = (oppRes.data ?? null) as Record<string, unknown> | null;
    const ocm = (ocmRes.data ?? null) as Record<string, unknown> | null; // null unless legacy flag set

    /** Pick the first non-empty value across sources, recording provenance. */
    const pick = (field: string, chain: Array<[EnrollmentFactSources[string], unknown]>): string | null => {
        for (const [src, val] of chain) {
            const t = trimOrNull(val);
            if (t) {
                sources[field] = src;
                return t;
            }
        }
        return null;
    };

    const siteLocationId = pick("siteLocationId", [
        ["process_instance", meta.site_location_id ?? meta.location_id],
        ["placement_candidate", cand?.site_id],
        ["ocm", ocm?.location_id],
        ["opportunity", opp?.location_id],
    ]);
    if (!siteLocationId) return { facts: null, sources, reason: "missing_site_location_id" };

    const startDate =
        pick("startDate", [
            ["process_instance", meta.start_date],
            ["placement_candidate", cand?.start_date],
            ["ocm", ocm?.start_date],
        ]) ?? ((sources.startDate = "default"), todayYmd);

    const facts: ResolvedEnrollmentFacts = {
        customerMemberId,
        siteLocationId,
        startDate,
        programCategoryId: pick("programCategoryId", [
            ["process_instance", meta.program_category_id],
            ["ocm", ocm?.program_category_id],
        ]),
        roomLocationId: pick("roomLocationId", [
            ["process_instance", meta.room_location_id ?? meta.program_room_cohort_key],
            ["placement_candidate", cand?.program_room_cohort_key],
            ["ocm", ocm?.program_room_cohort_key],
        ]),
        schedulePatternId: pick("schedulePatternId", [["process_instance", meta.schedule_pattern_id]]),
        scheduleType: pick("scheduleType", [
            ["process_instance", meta.schedule_type],
            ["ocm", ocm?.schedule_type],
        ]),
        endDate: trimOrNull(meta.end_date),
        opportunityCustomerMemberId: trimOrNull(ocm?.id),
        personId: trimOrNull(cm?.person_id) ?? trimOrNull(ocm?.person_id),
        billing: (meta.billing as Record<string, unknown> | undefined) ?? null,
        funding: (meta.funding as Record<string, unknown> | undefined) ?? null,
    };
    return { facts, sources };
}

/**
 * Canonical materialization boundary: materialize durable operational facts from a process instance id.
 * Idempotent — reuses existing agreement/placement/schedule and re-stamps provenance.
 */
export async function materializeEnrollmentFromProcessInstance(
    supabase: SupabaseClient,
    input: {
        processInstanceId: string;
        orgId: string;
        userId?: string | null;
        todayYmd?: string;
        /** Configured terminal/completed stage to stamp on the instance (optional). */
        completedStageKey?: string | null;
        emitEvents?: boolean;
        correlationId?: string | null;
    },
): Promise<MaterializeEnrollmentResult> {
    const todayYmd = input.todayYmd ?? new Date().toISOString().slice(0, 10);
    const base: MaterializeEnrollmentResult = { ok: false, skipped: false, process_instance_id: input.processInstanceId };

    const { data: piData, error: piErr } = await supabase
        .from(PROCESS_INSTANCES_TABLE)
        .select("*")
        .eq("org_id", input.orgId)
        .eq("id", input.processInstanceId)
        .maybeSingle();
    if (piErr) return { ...base, error: piErr.message };
    if (!piData) return { ...base, skipped: true, reason: "process_instance_not_found" };
    const pi = piData as ProcessInstanceRow;

    /*
     * An Enrollment journey about a child. The CONTEXT is no longer required to be an Opportunity.
     *
     * This gate demanded `context_type === "opportunity"`, so the moment a journey anchored to its
     * Enrollment Participation it was skipped as "not an enrollment process" — and the line below
     * would have written that participation's id into `opportunity_id`. A legitimate context-free
     * enrolment could never have materialised at all.
     */
    if (pi.process_key !== ENROLLMENT_PROCESS_KEY || pi.subject_type !== ENROLLMENT_SUBJECT_TYPE) {
        return { ...base, skipped: true, reason: "not_enrollment_child_process" };
    }
    const journey = await resolveEnrollmentJourneyContext(supabase, { orgId: input.orgId, processInstance: pi });

    const { facts, sources, reason } = await resolveEnrollmentFactsForProcessInstance({ supabase, orgId: input.orgId, pi, todayYmd });
    base.customer_member_id = journey.customerMemberId;
    // The Opportunity comes from the PARTICIPATION, never from the context id — which is exactly
    // what would have put an OCM id in this field.
    base.opportunity_id = journey.opportunityId;
    base.fact_sources = sources;
    if (!facts) return { ...base, skipped: true, reason: reason ?? "insufficient_facts" };

    const trio = await applyChildEnrollmentMaterialization(supabase, {
        orgId: input.orgId,
        opportunityId: journey.opportunityId,
        customerId: null, // agreement.customer_id derived by the service when null
        facts,
        todayYmd,
        sourceKey: PROCESS_INSTANCE_ENROLLMENT_SOURCE_KEY,
        actorUserId: input.userId,
        emitEvents: input.emitEvents,
        correlationId: input.correlationId,
        agreementMetadata: { materialized_from: "process_instance", process_instance_id: pi.id },
    });

    const agreementId = trio.agreement.id ?? null;
    if (trio.agreement.outcome === "error") {
        return { ...base, ok: false, error: trio.agreement.error, trio, agreement_id: agreementId };
    }

    // Provenance back-stamp (NOT operational facts): link the journey to the durable record + mark terminal.
    const nowIso = new Date().toISOString();
    const nextMeta = {
        ...(pi.metadata ?? {}),
        enrollment_agreement_id: agreementId,
        materialized_at: nowIso,
    };
    const patch: Record<string, unknown> = { metadata: nextMeta, updated_at: nowIso };
    if (pi.state !== "enrolled") patch.state = "enrolled";
    const completedStage = trimOrNull(input.completedStageKey);
    if (completedStage && pi.stage_key !== completedStage) {
        patch.stage_key = completedStage;
        patch.stage_entered_at = nowIso;
    }
    await supabase.from(PROCESS_INSTANCES_TABLE).update(patch).eq("id", pi.id).eq("org_id", input.orgId);

    return { ...base, ok: true, agreement_id: agreementId, trio };
}

/**
 * Scope convenience: materialize from (opportunity + child) by resolving the process-instance id first.
 * Used by the outcome executor, which knows the lead + child but not the instance id.
 */
export async function materializeEnrollmentForChildScope(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        opportunityId: string;
        customerMemberId: string;
        userId?: string | null;
        todayYmd?: string;
        completedStageKey?: string | null;
        emitEvents?: boolean;
        correlationId?: string | null;
    },
): Promise<MaterializeEnrollmentResult | null> {
    const processInstanceId = await getEnrollmentInstanceIdByScope(supabase, {
        orgId: input.orgId,
        opportunityId: input.opportunityId,
        customerMemberId: input.customerMemberId,
    });
    if (!processInstanceId) return null;
    return materializeEnrollmentFromProcessInstance(supabase, {
        processInstanceId,
        orgId: input.orgId,
        userId: input.userId,
        todayYmd: input.todayYmd,
        completedStageKey: input.completedStageKey,
        emitEvents: input.emitEvents,
        correlationId: input.correlationId,
    });
}
