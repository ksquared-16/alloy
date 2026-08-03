/**
 * Canonical stage operating plan resolution — single source for spawn, projection, and automation.
 */

import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import {
    activeLifecycleProcess,
    findStage,
    lifecycleBuilderFromDepartmentMetadata,
    type LifecycleBuilderStageRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    resolveStageOperatingPlanForStage,
    type StageOperatingPlanV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";

export type EffectiveStageOperatingPlanSource = "explicit" | "enrollment_default" | null;

export type EffectiveStageOperatingPlanResult = {
    plan: StageOperatingPlanV1 | null;
    source: EffectiveStageOperatingPlanSource;
    stageRecord: LifecycleBuilderStageRecord | null;
    processKey: string | null;
};

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

/** Resolve the effective operating plan for a builder stage (explicit metadata or enrollment default). */
export function resolveEffectiveStageOperatingPlan(params: {
    departmentMetadata: Record<string, unknown> | null | undefined;
    builderStageKey: string | null | undefined;
}): EffectiveStageOperatingPlanResult {
    const stageKey = trimOrNull(params.builderStageKey);
    if (!stageKey) {
        return { plan: null, source: null, stageRecord: null, processKey: null };
    }

    const departmentMetadata =
        params.departmentMetadata != null &&
        typeof params.departmentMetadata === "object" &&
        !Array.isArray(params.departmentMetadata)
            ? params.departmentMetadata
            : {};

    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    const process = activeLifecycleProcess(builder);
    const stageRecord = process ? findStage(process, stageKey) : null;
    const explicit = resolveStageOperatingPlanForStage(stageRecord ?? {}, stageKey);
    if (explicit) {
        return {
            plan: explicit,
            source: "explicit",
            stageRecord,
            processKey: process?.key ?? null,
        };
    }

    /**
     * CODE DEFAULTS MAY NEVER DEFINE A TRANSITION (decision D1, Law 2).
     *
     * This fallback used to hand back the code default WHOLE, for every configured tenant. So
     * `lead_to_tour` could be resolved out of `defaultEnrollmentStageOperatingPlans.ts` and
     * masquerade as persisted tenant configuration: the editor showed no such transition (it reads
     * the draft), the publish validator had nothing to check (the config genuinely lacked it), and
     * execution moved a subject through a transition nobody had authored. Two definers for one
     * identity is what made the Lead→Tour failure unfalsifiable.
     *
     * ISOLATED rather than deleted. The default still supplies work templates, outcomes and
     * attention rules — a separate Law 2 question, and one whose migration path (materialize the
     * defaults into tenant config as an audited publish) has not run yet. Deleting it wholesale
     * would break behaviour that has nothing to do with transitions.
     *
     * What it may NEVER supply is movement: `stripTransitionsFromDefaultPlan` empties
     * `outgoing_transitions` and drops every `move_to_stage` target, so a stage move can only ever
     * come from persisted configuration. An empty (not absent) transition collection also means
     * `resolveStageTransitionExecutionTargets` refuses any move that somehow survives, rather than
     * falling through to the legacy `stage_key` path.
     */
    if (process?.key === ENROLLMENT_PROCESS_KEY || !process) {
        const fallback = defaultStageOperatingPlanForEnrollmentStage(stageKey);
        if (fallback) {
            return {
                plan: stripTransitionsFromDefaultPlan(fallback),
                source: "enrollment_default",
                stageRecord,
                processKey: process?.key ?? null,
            };
        }
    }

    return { plan: null, source: null, stageRecord, processKey: process?.key ?? null };
}

/**
 * A code-default plan with every movement removed.
 *
 * Transitions are tenant-owned identities. A default plan may describe what work exists and what
 * outcomes it can have; it may not decide where a subject goes.
 */
function stripTransitionsFromDefaultPlan(plan: StageOperatingPlanV1): StageOperatingPlanV1 {
    return {
        ...plan,
        // Empty, not absent: absent means "legacy plan, bare stage_key moves are executable".
        outgoing_transitions: [],
        outcome_rules: (plan.outcome_rules ?? []).flatMap((rule) => {
            const targets = (rule.targets ?? []).filter((t) => t.kind !== "move_to_stage");
            // A rule whose only purpose was movement disappears with it rather than becoming a
            // rule that silently does nothing.
            return targets.length ? [{ ...rule, targets }] : [];
        }),
    };
}
