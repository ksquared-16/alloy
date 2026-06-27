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
import {
    ENROLLMENT_STAGE_QUEUE_KEYS,
    operatorWorkUnitKeyForPipelineQueueKey,
} from "@/lib/lifecycle/enrollmentProcessStageQueueKeys";
import { isLifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { operatorWorkUnitHrefFromKey } from "@/lib/admin/canonicalOperatorRoutes";
import {
    extractDrawerLifecycleExecutionLanes,
    extractPipelineExecutionLanes,
} from "@/lib/workspace/extractPipelineExecutionLanes";
import { pickDeptPipelineWorkUnit } from "@/lib/workspace/pickDeptPipelineWorkUnit";
import { tryLoadWorkUnitQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import {
    operatorOperationalPerspectivesEnabled,
} from "@/lib/adminV2/runtime/configurationRuntimeConvergenceFlag";
import {
    deriveOperationalViewsFromQueueDefinition,
} from "@/lib/adminV2/runtime/perspective/mergeOperationalViewMetadata";
import { resolveOperationalViewsForWorkUnit } from "@/lib/adminV2/runtime/perspective/resolveStageOperationalViews";
import type {
    OperationalSurfaceStory,
    OperationalSurfaceWorkLineData,
} from "@/lib/admin/enrollmentOperationalSurfaceLanding";
import {
    applyEnrollmentOperationalSurfaceFields,
    buildEnrollmentOperationalSurfaceFields,
    isEnrollmentLifecycleCard,
} from "@/lib/admin/enrollmentOperationalSurfaceLanding";

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
    /** Optional OIP performance preview — server-resolved formatted values. */
    performanceMetrics?: readonly {
        label: string;
        value: string;
        target?: string | null;
        status?: string | null;
    }[];
    /** Enrollment Operational Surface — cover page story (enrollment only). */
    operationalStory?: OperationalSurfaceStory;
    /** Enrollment Operational Surface — enterable work lines (enrollment only). */
    todaysWork?: readonly OperationalSurfaceWorkLineData[];
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

function operatorQueuesFromLifecycleBuilderMetadata(
    departmentMetadata: unknown,
    processId?: string | null
): OperatorLifecycleWorkQueuePreview[] {
    const config = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    if (!config) return [];
    const resolvedProcessId = processId?.trim() || config.active_process_id;
    const process =
        (resolvedProcessId
            ? config.processes.find((p) => p.id === resolvedProcessId && p.is_active)
            : null) ??
        config.processes.find((p) => p.is_active) ??
        null;
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

function operatorQueuesFromLifecycleBuilder(
    entry: LifecycleCatalogEntry,
    departmentsById: Map<string, OperatorLifecycleDepartmentRow>,
): OperatorLifecycleWorkQueuePreview[] {
    const dept = departmentsById.get(entry.department_id);
    return operatorQueuesFromLifecycleBuilderMetadata(dept?.metadata, entry.process_id);
}

function workViewNavEntriesForDepartment(args: {
    departmentId: string;
    departmentMetadata: unknown;
    workUnits: OperatorLifecycleWorkUnitRow[];
}): OperatorLifecycleWorkQueuePreview[] {
    const forDept = args.workUnits.filter(
        (wu) => wu.department_id === args.departmentId && wu.is_active !== false,
    );
    const pipelineWu = pickDeptPipelineWorkUnit(forDept, args.departmentId);
    const stageWu = forDept.find((wu) => isLifecycleStageWorkUnitKey(wu.key)) ?? null;
    const targetWu = pipelineWu ?? stageWu;
    if (!targetWu) return [];
    const platformKey = (targetWu.key ?? "").trim();
    if (!platformKey) return [];

    const fromConfig = resolveOperationalViewsForWorkUnit({
        departmentMetadata: args.departmentMetadata,
        workUnitMetadata: null,
        queueDefinition: targetWu.queue_definition,
    });
    const views =
        fromConfig.length > 0 ?
            fromConfig.filter((row) => row.visible_in_rail !== false)
        :   deriveOperationalViewsFromQueueDefinition(targetWu.queue_definition);

    return [...views]
        .sort(
            (a, b) =>
                (a.display_order ?? Number.MAX_SAFE_INTEGER) - (b.display_order ?? Number.MAX_SAFE_INTEGER)
                || a.queue_key.localeCompare(b.queue_key),
        )
        .map((row) => {
            // Phase 2 route canonicalization: each work-view lane resolves to its own operator
            // work-unit slug (`/workspace/work-unit/:slug`), matching the builder/pipeline nav path.
            // The previous dept/uuid preview href routed through `/adminV2`→`/admin` and produced
            // duplicate dept-route RSC loads per click (plus an unrouted `/workspace/dept/…` 404).
            const laneKey = operatorWorkUnitKeyForPipelineQueueKey(row.queue_key) ?? platformKey;
            return {
                label: row.label?.trim() || row.queue_key,
                platformKey: laneKey,
                href: operatorWorkUnitHrefFromKey(laneKey),
            };
        });
}

/**
 * Sidebar + work-unit pill stage list — pipeline lanes when configured, else builder stages.
 * Keeps operator nav and work-unit header pills aligned.
 */
export function resolveOperatorLifecycleWorkQueueNavEntriesForDepartment(args: {
    departmentId: string;
    departmentMetadata: unknown;
    workUnits: OperatorLifecycleWorkUnitRow[];
    processId?: string | null;
}): OperatorLifecycleWorkQueuePreview[] {
    if (operatorOperationalPerspectivesEnabled()) {
        const workViewEntries = workViewNavEntriesForDepartment(args);
        if (workViewEntries.length) return workViewEntries;
    }

    const forDept = args.workUnits.filter(
        (wu) => wu.department_id === args.departmentId && wu.is_active !== false,
    );
    const pipelineWu = pickDeptPipelineWorkUnit(forDept, args.departmentId);
    if (pipelineWu) {
        const fromPipeline = pipelineExecutionQueues(pipelineWu);
        if (fromPipeline.length) return fromPipeline;
    }

    const fromBuilder = operatorQueuesFromLifecycleBuilderMetadata(
        args.departmentMetadata,
        args.processId ?? null
    );
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

function workQueuesForDepartment(
    entry: LifecycleCatalogEntry,
    departmentId: string,
    workUnits: OperatorLifecycleWorkUnitRow[],
    departmentsById: Map<string, OperatorLifecycleDepartmentRow>,
): OperatorLifecycleWorkQueuePreview[] {
    const dept = departmentsById.get(entry.department_id);
    return resolveOperatorLifecycleWorkQueueNavEntriesForDepartment({
        departmentId,
        departmentMetadata: dept?.metadata,
        workUnits,
        processId: entry.process_id,
    });
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
            const dept = departmentsById.get(entry.department_id);

            const baseCard: OperatorLifecycleLandingCard = {
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

            if (!isEnrollmentLifecycleCard(baseCard)) {
                return baseCard;
            }

            const enrollmentFields = buildEnrollmentOperationalSurfaceFields({
                card: baseCard,
                departmentMetadata: dept?.metadata,
                workUnits: args.workUnits,
            });
            return applyEnrollmentOperationalSurfaceFields(baseCard, enrollmentFields);
        })
        .sort((a, b) => a.label.localeCompare(b.label));
}
