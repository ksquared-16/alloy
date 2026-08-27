import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import { resolveStageAnnotations } from "@/lib/adminV2/runtime/focusPanel/businessProcess/stageAnnotationProjections";
import { effectiveStageKeyAssignment } from "@/lib/lifecycle/enrollmentOperatorStage";
import {
    activeLifecycleProcess,
    activeStagesForProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { stageKeyFromLifecycleWorkUnitMetadata } from "@/lib/lifecycle/lifecycleStageWorkUnit";

export type OpportunityWorkspaceLifecycleRail = {
    stages: Array<{
        key: string;
        label: string;
        /**
         * The stage's resolved annotation slots — at most two, already turned from configured
         * projection KEYS into operator-facing strings. Empty when the stage configures none or
         * when its projections have nothing to say about this particular record.
         */
        support?: string[];
    }>;
    current_stage_key: string | null;
    /**
     * The configured process's OWN NAME — "Enrollment", not "Waitlist".
     *
     * Already resolved here to read the stages, and carried so the Business Process card can title
     * itself with the process rather than falling back to its registered card key. Without it the
     * card titled itself from `businessProcess.label`, which is the STAGE label, and read "WAITLIST"
     * directly above a rail whose current column already said Waitlist.
     */
    process_name?: string | null;
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
    /**
     * The record the annotations are ABOUT. Optional: a caller with no record still gets the rail,
     * just without supporting detail — the stages are configuration, the annotations are truth.
     */
    record?: Record<string, unknown> | null;
    /** Labels the record carries only as ids, resolved once by the caller. */
    annotationLabels?: { locationLabel?: string | null; ownerLabel?: string | null };
}): OpportunityWorkspaceLifecycleRail | null {
    const builder = lifecycleBuilderFromDepartmentMetadata(params.departmentMetadata);
    const process = builder ? activeLifecycleProcess(builder) : null;
    if (!process) return null;

    const annotationInput = {
        record: params.record ?? {},
        labels: params.annotationLabels ?? {},
    };
    const stages = activeStagesForProcess(process).map((s) => {
        const support = params.record
            ? resolveStageAnnotations(s.stage_annotations_v1?.slots, annotationInput)
            : [];
        return {
            key: s.key.trim(),
            label: (s.label ?? s.key).trim() || s.key.trim(),
            ...(support.length ? { support } : {}),
        };
    });
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

    return { stages, current_stage_key: currentStageKey, process_name: trimOrNull(process.name) };
}
