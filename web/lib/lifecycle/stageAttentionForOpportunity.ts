/**
 * Resolve stage operating plan attention for an opportunity (sync wrapper).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReadinessResult } from "@/lib/completion/readinessTypes";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import {
    evaluateStageOperatingPlanAttention,
    operationalTaskRowToStageAttentionSnapshot,
    type StageAttentionTaskSnapshot,
} from "@/lib/lifecycle/evaluateStageOperatingPlanAttention";
import { effectiveStageKeyAssignment } from "@/lib/lifecycle/enrollmentOperatorStage";
import {
    activeLifecycleProcess,
    configuredStageKeysForMetadata,
    findStage,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    projectStagePlanToAttentionReasons,
    type ProjectedStageAttentionReason,
} from "@/lib/lifecycle/stageOperatingPlanAttentionProjection";
import { resolveStageOperatingPlanForStage, type StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { OpportunityAttentionEntityInput } from "@/lib/opportunities/opportunityAttentionResolver";
import type { ReadinessAttentionProjectionProfileV1 } from "@/lib/opportunities/readinessAttentionProjectionProfile";

export type { StageAttentionTaskSnapshot };

export function resolveEffectiveStageOperatingPlanForAttention(
    departmentMetadata: Record<string, unknown> | null,
    builderStageKey: string,
): StageOperatingPlanV1 | null {
    if (!departmentMetadata || !builderStageKey.trim()) return null;

    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    const process = activeLifecycleProcess(builder);
    const stageRecord = process ? findStage(process, builderStageKey) : null;
    const explicit = resolveStageOperatingPlanForStage(stageRecord ?? {}, builderStageKey);
    if (explicit) return explicit;

    if (process?.key === "enrollment") {
        return defaultStageOperatingPlanForEnrollmentStage(builderStageKey);
    }

    return null;
}

function stageEnteredMsForOpportunity(
    opportunity: OpportunityAttentionEntityInput,
    rowContext?: { lastStatusTransitionAtIso?: string | null } | null,
    nowMs?: number,
): number {
    const iso =
        rowContext?.lastStatusTransitionAtIso?.trim() ||
        opportunity.updated_at?.trim() ||
        opportunity.created_at?.trim() ||
        null;
    if (iso) {
        const parsed = Date.parse(iso);
        if (Number.isFinite(parsed)) return parsed;
    }
    return nowMs ?? Date.now();
}

/**
 * Evaluate stage_operating_plan_v1.attention_rules for an opportunity.
 * Returns undefined when evaluation cannot run (legacy behavior preserved).
 */
export function tryEvaluateStageAttentionForOpportunity(input: {
    opportunity: OpportunityAttentionEntityInput;
    departmentMetadata?: Record<string, unknown> | null;
    tasks?: StageAttentionTaskSnapshot[];
    readiness?: ReadinessResult | null;
    readinessProfile?: ReadinessAttentionProjectionProfileV1 | null;
    rowContext?: { lastStatusTransitionAtIso?: string | null } | null;
    nowMs?: number;
}): ProjectedStageAttentionReason[] | undefined {
    try {
        const statusKey = input.opportunity.status_key?.trim();
        if (!statusKey || !input.departmentMetadata) return undefined;

        const stageKeys = configuredStageKeysForMetadata(input.departmentMetadata);
        const { stage: builderStageKey } = effectiveStageKeyAssignment(
            statusKey,
            input.opportunity.metadata,
            stageKeys,
        );
        if (!builderStageKey) return undefined;

        const plan = resolveEffectiveStageOperatingPlanForAttention(
            input.departmentMetadata,
            builderStageKey,
        );
        if (!plan?.attention_rules?.length) return undefined;

        const nowMs = input.nowMs ?? Date.now();
        const fired = evaluateStageOperatingPlanAttention({
            plan,
            builderStageKey,
            nowMs,
            stageEnteredMs: stageEnteredMsForOpportunity(input.opportunity, input.rowContext, nowMs),
            tasks: input.tasks ?? [],
            readiness: input.readiness,
            readinessProfile: input.readinessProfile,
        });

        return projectStagePlanToAttentionReasons(fired);
    } catch {
        return undefined;
    }
}

/** Batch-load open operational tasks for stage attention evaluation. */
export async function loadStageAttentionTasksByOpportunityId(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityIds: readonly string[];
}): Promise<Map<string, StageAttentionTaskSnapshot[]>> {
    const out = new Map<string, StageAttentionTaskSnapshot[]>();
    const ids = params.opportunityIds.map((id) => id.trim()).filter(Boolean);
    if (!ids.length) return out;

    const { data, error } = await params.supabase
        .from("operational_tasks")
        .select("entity_id, due_at, status, metadata, created_at")
        .eq("org_id", params.orgId)
        .eq("entity_type", "opportunities")
        .in("entity_id", ids as string[])
        .eq("status", "open");

    if (error || !data) return out;

    for (const row of data) {
        const oid = String((row as { entity_id?: string }).entity_id ?? "").trim();
        if (!oid) continue;
        const list = out.get(oid) ?? [];
        list.push(
            operationalTaskRowToStageAttentionSnapshot(
                row as {
                    due_at?: string | null;
                    status?: string | null;
                    metadata?: Record<string, unknown> | null;
                    created_at?: string | null;
                },
            ),
        );
        out.set(oid, list);
    }

    return out;
}
