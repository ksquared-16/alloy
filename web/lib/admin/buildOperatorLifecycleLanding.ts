/**
 * Build operator lifecycle landing + nav from lifecycle catalog and work-unit config.
 */

import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";
import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import {
    activeStagesForProcess,
    lifecycleBuilderFromDepartmentMetadata,
    lifecycleWorkspaceTileDescription,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ENROLLMENT_STAGE_QUEUE_KEYS } from "@/lib/lifecycle/enrollmentProcessStageQueueKeys";
import { isLifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { operatorWorkUnitHrefFromKey } from "@/lib/admin/canonicalOperatorRoutes";
import {
    extractDrawerLifecycleExecutionLanes,
    extractPipelineExecutionLanes,
} from "@/lib/workspace/extractPipelineExecutionLanes";
import { pickDeptPipelineWorkUnit } from "@/lib/workspace/pickDeptPipelineWorkUnit";
import { tryLoadWorkUnitQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";

/** Default operator queue when configured on the enrollment pipeline. */
export const OPERATOR_DEFAULT_ENTRY_QUEUE_KEY = "new_leads" as const;

export type OperatorLifecycleWorkQueuePreview = {
    label: string;
    platformKey: string;
    href: string;
};

export type OperatorLifecycleLandingCard = {
    id: string;
    departmentId: string;
    processKey: string;
    label: string;
    description: string;
    entryHref: string;
    workQueues: OperatorLifecycleWorkQueuePreview[];
    stageCount: number;
    /** Populated when department queue summaries are available; otherwise null (UI shows —). */
    activeRecordCount: number | null;
    /** Populated when needs-attention lane summaries are available; otherwise null (UI shows —). */
    needsAttentionCount: number | null;
};

export type OperatorLifecycleWorkUnitRow = {
    id: string;
    department_id: string;
    key: string;
    name: string;
    queue_definition: unknown;
    is_active?: boolean | null;
};

export type OperatorLifecycleDepartmentRow = {
    id: string;
    metadata: unknown;
};

function isOperatorVisibleLifecycle(entry: LifecycleCatalogEntry): boolean {
    if (!entry.workspace.user_has_access) return false;
    if (!entry.workspace.department_is_active) return false;
    if (!entry.workspace.visible_in_workspace_api) return false;
    return entry.workspace.runtime_status === "visible" || entry.workspace.runtime_status === "name_mismatch";
}

function processDescriptionForEntry(
    entry: LifecycleCatalogEntry,
    departmentsById: Map<string, OperatorLifecycleDepartmentRow>,
): string {
    const dept = departmentsById.get(entry.department_id);
    const config = lifecycleBuilderFromDepartmentMetadata(dept?.metadata);
    const process = config.processes.find((p) => p.id === entry.process_id && p.is_active);
    return lifecycleWorkspaceTileDescription(process?.description, entry.lifecycle_name);
}

function pipelineExecutionQueues(
    pipelineWu: { queue_definition: unknown },
): OperatorLifecycleWorkQueuePreview[] {
    const bundle = tryLoadWorkUnitQueueDefinitionBundle(pipelineWu.queue_definition);
    if (!bundle) return [];
    const primaryLanes = extractPipelineExecutionLanes(bundle.def);
    const lanes = primaryLanes.length > 0 ? primaryLanes : extractDrawerLifecycleExecutionLanes(bundle.def);
    return lanes.map((lane) => ({
        label: lane.label,
        platformKey: lane.key,
        href: operatorWorkUnitHrefFromKey(lane.key),
    }));
}

function operatorQueuesFromLifecycleBuilder(
    entry: LifecycleCatalogEntry,
    departmentsById: Map<string, OperatorLifecycleDepartmentRow>,
): OperatorLifecycleWorkQueuePreview[] {
    const dept = departmentsById.get(entry.department_id);
    const config = lifecycleBuilderFromDepartmentMetadata(dept?.metadata);
    const process = config.processes.find((p) => p.id === entry.process_id && p.is_active);
    if (!process) return [];

    return activeStagesForProcess(process).map((stage) => {
        const stageKey = stage.key.trim().toLowerCase();
        const mappedKeys = ENROLLMENT_STAGE_QUEUE_KEYS[stageKey as LifecycleOperatorStage];
        const platformKey = mappedKeys?.[0] ?? stage.key;
        return {
            label: stage.label,
            platformKey,
            href: operatorWorkUnitHrefFromKey(platformKey),
        };
    });
}

function workQueuesForDepartment(
    entry: LifecycleCatalogEntry,
    departmentId: string,
    workUnits: OperatorLifecycleWorkUnitRow[],
    departmentsById: Map<string, OperatorLifecycleDepartmentRow>,
): OperatorLifecycleWorkQueuePreview[] {
    const forDept = workUnits.filter(
        (wu) => wu.department_id === departmentId && wu.is_active !== false,
    );
    const pipelineWu = pickDeptPipelineWorkUnit(forDept, departmentId);
    if (pipelineWu) {
        const fromPipeline = pipelineExecutionQueues(pipelineWu);
        if (fromPipeline.length) return fromPipeline;
    }

    const fromBuilder = operatorQueuesFromLifecycleBuilder(entry, departmentsById);
    if (fromBuilder.length) return fromBuilder;

    return forDept
        .filter(
            (wu) =>
                (wu.key ?? "").trim().toLowerCase() !== "needs_attention" &&
                !isLifecycleStageWorkUnitKey(wu.key),
        )
        .map((wu) => ({
            label: wu.name?.trim() || wu.key,
            platformKey: wu.key,
            href: operatorWorkUnitHrefFromKey(wu.key),
        }));
}

function resolveDefaultEntryQueue(
    queues: OperatorLifecycleWorkQueuePreview[],
): OperatorLifecycleWorkQueuePreview | null {
    if (!queues.length) return null;
    const preferred = queues.find(
        (q) => q.platformKey.trim().toLowerCase() === OPERATOR_DEFAULT_ENTRY_QUEUE_KEY,
    );
    return preferred ?? queues[0] ?? null;
}

export function buildOperatorLifecycleLandingCards(args: {
    catalogEntries: LifecycleCatalogEntry[];
    departments: OperatorLifecycleDepartmentRow[];
    workUnits: OperatorLifecycleWorkUnitRow[];
}): OperatorLifecycleLandingCard[] {
    const departmentsById = new Map(args.departments.map((d) => [d.id, d] as const));

    return args.catalogEntries
        .filter(isOperatorVisibleLifecycle)
        .map((entry) => {
            const workQueues = workQueuesForDepartment(
                entry,
                entry.department_id,
                args.workUnits,
                departmentsById,
            );
            const defaultQueue = resolveDefaultEntryQueue(workQueues);
            const entryHref = defaultQueue?.href ?? operatorWorkUnitHrefFromKey(OPERATOR_DEFAULT_ENTRY_QUEUE_KEY);

            return {
                id: entry.id,
                departmentId: entry.department_id,
                processKey: entry.process_key,
                label: entry.lifecycle_name.trim() || entry.process_key,
                description: processDescriptionForEntry(entry, departmentsById),
                entryHref,
                workQueues,
                stageCount: entry.stage_count,
                activeRecordCount: null,
                needsAttentionCount: null,
            };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
}
