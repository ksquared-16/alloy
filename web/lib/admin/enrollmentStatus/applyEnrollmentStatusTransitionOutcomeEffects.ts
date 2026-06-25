/**
 * Apply configured stage operating outcome side effects after manual Change Enrollment Status.
 * Reuses executeStageOperatingOutcome + onChildDispositionEntrySpawnWorkIntent — no duplicated automation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
    EnrollmentStatusDestinationKey,
    EnrollmentStatusTransitionScope,
} from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";
import {
    findBpDestinationOption,
    resolveBpEnrollmentStatusDestinations,
} from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionBpResolver";
import {
    executeStageOperatingOutcome,
    STAGE_OUTCOME_MANUAL_TRANSITION_SKIP_TARGET_KINDS,
    type StageOutcomeExecutionResult,
} from "@/lib/lifecycle/executeStageOperatingOutcome";
import { DOMAIN_LIFECYCLE_SYSTEM_ACTOR_USER_ID } from "@/lib/lifecycle/emitDomainLifecycleStatusChangedEvent";
import { onChildDispositionEntrySpawnWorkIntent } from "@/lib/lifecycle/onChildDispositionEntrySpawnWorkIntent";
import type { OnStageEntrySpawnWorkIntentResult } from "@/lib/lifecycle/onStageEntrySpawnWorkIntent";
import { resolveOpportunityDepartmentId } from "@/lib/opportunities/resolveOpportunityDepartmentId";
import { resolveEffectiveStageOperatingPlan } from "@/lib/lifecycle/resolveEffectiveStageOperatingPlan";
import { outcomeRulesForKey } from "@/lib/lifecycle/stageOperatingPlanV1";

export type ApplyEnrollmentStatusTransitionOutcomeEffectsInput = {
    supabase: SupabaseClient;
    orgId: string;
    userId?: string | null;
    departmentId?: string | null;
    scope: EnrollmentStatusTransitionScope;
    destinationKey: EnrollmentStatusDestinationKey;
    targetStatusKey: string;
    previousStatusKey: string | null;
    /** When known from modal / queue context. */
    outcomeKey?: string | null;
    sourceBuilderStageKey?: string | null;
    builderStageKey?: string | null;
};

export type ApplyEnrollmentStatusTransitionOutcomeEffectsResult = {
    outcome_execution: StageOutcomeExecutionResult | null;
    stage_entry_spawn: OnStageEntrySpawnWorkIntentResult | null;
    outcome_key: string | null;
    source_builder_stage_key: string | null;
    errors: string[];
};

const STAGE_PLAN_LOOKUP_KEYS: Record<string, readonly string[]> = {
    decision: ["decision", "decision_pending"],
    tour: ["tour", "tour_completed", "tour_scheduled"],
    qualification: ["qualification"],
    lead: ["lead", "new_lead"],
};

async function loadDepartmentMetadata(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
): Promise<Record<string, unknown> | null> {
    const { data, error } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", departmentId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error || !data) return null;
    const md = (data as { metadata?: unknown }).metadata;
    return md != null && typeof md === "object" && !Array.isArray(md)
        ? (md as Record<string, unknown>)
        : {};
}

function resolveOutcomeKey(
    explicit: string | null | undefined,
    destinationKey: EnrollmentStatusDestinationKey,
): string | null {
    const trimmed = explicit?.trim();
    if (trimmed) return trimmed;
    if (destinationKey === "waitlist") return "waitlist";
    if (destinationKey === "enrollment") return "enrolling";
    if (destinationKey === "closed_withdrawn") return "declined";
    if (destinationKey === "enrolled") return "enrollment_complete";
    return null;
}

function resolvePlanForOutcomeExecution(
    departmentMetadata: Record<string, unknown>,
    sourceBuilderStageKey: string,
    outcomeKey: string,
): { plan: NonNullable<ReturnType<typeof resolveEffectiveStageOperatingPlan>["plan"]>; stageKey: string } | null {
    const candidates = STAGE_PLAN_LOOKUP_KEYS[sourceBuilderStageKey] ?? [sourceBuilderStageKey];
    for (const stageKey of candidates) {
        const { plan } = resolveEffectiveStageOperatingPlan({
            departmentMetadata,
            builderStageKey: stageKey,
        });
        if (plan && outcomeRulesForKey(plan, outcomeKey).length > 0) {
            return { plan, stageKey };
        }
    }
    return null;
}

export async function applyEnrollmentStatusTransitionOutcomeEffects(
    input: ApplyEnrollmentStatusTransitionOutcomeEffectsInput,
): Promise<ApplyEnrollmentStatusTransitionOutcomeEffectsResult> {
    const orgId = input.orgId.trim();
    const opportunityId = input.scope.opportunityId.trim();
    const ocmId = input.scope.opportunityCustomerMemberId?.trim() ?? null;
    const userId = input.userId?.trim() || DOMAIN_LIFECYCLE_SYSTEM_ACTOR_USER_ID;
    const errors: string[] = [];

    if (!orgId || !opportunityId) {
        return {
            outcome_execution: null,
            stage_entry_spawn: null,
            outcome_key: null,
            source_builder_stage_key: null,
            errors: ["missing_scope"],
        };
    }

    let departmentId = input.departmentId?.trim() ?? null;
    if (!departmentId) {
        const { data: opp } = await input.supabase
            .from("opportunities")
            .select("work_unit_id, metadata")
            .eq("id", opportunityId)
            .eq("org_id", orgId)
            .maybeSingle();
        if (opp) {
            departmentId = await resolveOpportunityDepartmentId(input.supabase, orgId, {
                metadata: (opp as { metadata?: unknown }).metadata,
                work_unit_id: (opp as { work_unit_id?: unknown }).work_unit_id,
            });
        }
    }

    if (!departmentId) {
        return {
            outcome_execution: null,
            stage_entry_spawn: null,
            outcome_key: null,
            source_builder_stage_key: null,
            errors: [],
        };
    }

    const departmentMetadata = await loadDepartmentMetadata(input.supabase, orgId, departmentId);
    if (!departmentMetadata) {
        return {
            outcome_execution: null,
            stage_entry_spawn: null,
            outcome_key: null,
            source_builder_stage_key: null,
            errors: ["department_load_failed"],
        };
    }

    const grain = ocmId && input.scope.grain !== "case" ? "child" : "case";
    const bpResolved = resolveBpEnrollmentStatusDestinations({
        departmentMetadata,
        currentStatusKey: input.previousStatusKey,
        grain,
        builderStageKey: input.sourceBuilderStageKey ?? input.builderStageKey,
    });
    const bpDestination = findBpDestinationOption(
        bpResolved.destinations,
        input.destinationKey,
        input.targetStatusKey,
    );

    const outcomeKey = resolveOutcomeKey(
        input.outcomeKey ?? bpDestination?.outcomeKey,
        input.destinationKey,
    );
    const sourceBuilderStageKey =
        input.sourceBuilderStageKey?.trim() ||
        bpResolved.currentBuilderStageKey ||
        input.builderStageKey?.trim() ||
        null;

    let outcome_execution: StageOutcomeExecutionResult | null = null;
    if (outcomeKey && sourceBuilderStageKey) {
        const resolvedPlan = resolvePlanForOutcomeExecution(
            departmentMetadata,
            sourceBuilderStageKey,
            outcomeKey,
        );
        if (resolvedPlan) {
            const journey_segment =
                resolvedPlan.plan.journey_segment === "child" || grain === "child" ? "child" : "family";
            outcome_execution = await executeStageOperatingOutcome({
                supabase: input.supabase,
                orgId,
                userId,
                departmentId,
                plan: resolvedPlan.plan,
                outcomeKey,
                subject: {
                    journey_segment,
                    opportunity_id: opportunityId,
                    opportunity_customer_member_id: ocmId,
                    placement_candidate_id: input.scope.placementCandidateId ?? null,
                },
                skipTargetKinds: STAGE_OUTCOME_MANUAL_TRANSITION_SKIP_TARGET_KINDS,
            });
            if (outcome_execution.errors.length) {
                errors.push(...outcome_execution.errors);
            }
        }
    }

    let stage_entry_spawn: OnStageEntrySpawnWorkIntentResult | null = null;
    if (ocmId && input.scope.grain !== "case") {
        const previous = input.previousStatusKey?.trim() ?? null;
        const next = input.targetStatusKey.trim();
        if (previous !== next) {
            stage_entry_spawn = await onChildDispositionEntrySpawnWorkIntent({
                supabase: input.supabase,
                orgId,
                userId,
                opportunityId,
                previousStatusKey: previous,
                nextStatusKey: next,
            });
            if (stage_entry_spawn.action === "skipped" && stage_entry_spawn.reason === "instantiate_failed") {
                errors.push(stage_entry_spawn.reason);
            }
        }
    }

    return {
        outcome_execution,
        stage_entry_spawn,
        outcome_key: outcomeKey,
        source_builder_stage_key: sourceBuilderStageKey,
        errors,
    };
}
