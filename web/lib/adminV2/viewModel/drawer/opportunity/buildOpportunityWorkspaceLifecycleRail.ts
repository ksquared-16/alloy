import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import { effectiveStageKeyAssignment } from "@/lib/lifecycle/enrollmentOperatorStage";
import {
    activeLifecycleProcess,
    activeStagesForProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { stageKeyFromLifecycleWorkUnitMetadata } from "@/lib/lifecycle/lifecycleStageWorkUnit";

export type OpportunityWorkspaceLifecycleRail = {
    stages: Array<{ key: string; label: string }>;
    current_stage_key: string | null;
};

function trimOrNull(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s ? s : null;
}

/**
 * Builder-owned dept lifecycle order for drawer rail (matches /settings/lifecycle + pill deck order).
 */
export function buildOpportunityWorkspaceLifecycleRail(params: {
    departmentMetadata: unknown;
    statusKey: string | null;
    statusDefs: StatusDefinitionRow[];
    workUnitMetadata: unknown;
}): OpportunityWorkspaceLifecycleRail | null {
    const builder = lifecycleBuilderFromDepartmentMetadata(params.departmentMetadata);
    const process = builder ? activeLifecycleProcess(builder) : null;
    if (!process) return null;

    const stages = activeStagesForProcess(process).map((s) => ({
        key: s.key.trim(),
        label: (s.label ?? s.key).trim() || s.key.trim(),
    }));
    if (stages.length < 2) return null;

    const stageKeys = stages.map((s) => s.key);
    let currentStageKey: string | null = null;

    const sk = trimOrNull(params.statusKey);
    if (sk) {
        const def = params.statusDefs.find((d) => d.status_key === sk);
        const { stage } = effectiveStageKeyAssignment(sk, def?.metadata ?? null, stageKeys);
        if (stage) currentStageKey = stage;
    }

    if (!currentStageKey) {
        const fromWu = stageKeyFromLifecycleWorkUnitMetadata(params.workUnitMetadata);
        if (fromWu && stageKeys.includes(fromWu)) currentStageKey = fromWu;
    }

    return { stages, current_stage_key: currentStageKey };
}
