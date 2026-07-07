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
import {
    operatorWorkUnitHrefFromKey,
    operatorWorkUnitHrefFromWorkViewSlug,
} from "@/lib/admin/canonicalOperatorRoutes";
import { workViewRouteKeyFromLabel } from "@/lib/admin/workUnitRouteSlug";
import { savedWorkViewsFromDepartmentMetadata } from "@/lib/lifecycle/resolveWorkViewRuntimeContext";
import {
    extractDrawerLifecycleExecutionLanes,
    extractPipelineExecutionLanes,
} from "@/lib/workspace/extractPipelineExecutionLanes";
import {
    pickDeptPipelineWorkUnit,
    pickDeptWorkViewHostWorkUnit,
} from "@/lib/workspace/pickDeptPipelineWorkUnit";
import { resolveWorkViewCanonicalLocation } from "@/lib/workspace/resolveWorkViewCanonicalLocation";
import type { WorkViewGrainBucket } from "@/lib/lifecycle/stageGrainV1";
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
    /** Optional Work View mission line from `work_views_v1` — presentation only, not a metric. */
    description?: string | null;
    platformKey: string;
    href: string;
    /**
     * Configured Work View identity + canonical count/rows location — present on work-view
     * entries only (`resolveWorkViewCanonicalLocation`). The Workspace tile resolves its
     * per-view counts from (host_work_unit_id, base_queue_key, work_view_id) — the SAME
     * source the Work Unit pill counts and rendered rows read, so the numbers agree.
     */
    work_view_id?: string | null;
    host_work_unit_id?: string | null;
    base_queue_key?: string | null;
    /** Label-derived route key (platform `_` form) — `href`'s slug; the active-state match key. */
    route_key?: string | null;
    /**
     * Secondary, decision-supporting operational signals for this view — records needing
     * attention / overdue, from the operational projection's already-fetched base rows
     * (`computeWorkViewOperationalSignals`). Undefined until the client rollup pass resolves
     * them (or when base rows are unavailable); null-safe consumers show no indicator then.
     */
    attention_count?: number | null;
    overdue_count?: number | null;
    /** Grain breakdown from operational projection rows — null when unresolved. */
    primary_grain_count?: number | null;
    supporting_grain_count?: number | null;
    primary_grain_kind?: WorkViewGrainBucket | null;
    supporting_grain_kind?: WorkViewGrainBucket | null;
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

/**
 * Legacy/migration artifact process names must never reach an operator surface (e.g.
 * "Enrollment (legacy)"). DEFENSE-IN-DEPTH only — the primary fix is data cleanup
 * (cleanupEnrollmentLifecycleProcesses removes the stray process from department metadata). Does
 * NOT gate on runtime_status=name_mismatch, which can be a legitimately renamed live process.
 */
export function isLegacyArtifactProcessName(name: string | null | undefined): boolean {
    return /\(legacy\)/i.test((name ?? "").trim());
}

/**
 * Render-boundary sanitizer: strip a trailing "(legacy)"/"(legacy copy)" artifact marker from a
 * process name so a dirty data row can NEVER print "Enrollment (legacy)" to an operator, even if it
 * slips past the upstream visibility filter. Returns the cleaned name (e.g. "Enrollment") or null
 * when nothing meaningful remains. Belt-and-suspenders — data cleanup is still the primary fix.
 */
export function stripLegacyArtifactMarker(name: string | null | undefined): string | null {
    const cleaned = (name ?? "")
        .replace(/\s*\((?:legacy|legacy\s+copy|migrated)\)\s*/gi, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
    return cleaned || null;
}

function isOperatorVisibleLifecycle(entry: LifecycleCatalogEntry): boolean {
    if (!entry.workspace.user_has_access) return false;
    if (!entry.workspace.department_is_active) return false;
    if (!entry.workspace.visible_in_workspace_api) return false;
    if (isLegacyArtifactProcessName(entry.lifecycle_name)) return false;
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
    // Shared host precedence (pipeline WU, else lifecycle-stage WU) — same helper the
    // work-view slug resolver uses, so nav hrefs and slug resolution agree on the host.
    const targetWu = pickDeptWorkViewHostWorkUnit(args.workUnits, args.departmentId);
    if (!targetWu) return [];
    const platformKey = (targetWu.key ?? "").trim();
    if (!platformKey) return [];

    // Materialization (Work View runtime materialization): every configured, visible Work View becomes
    // its own nav item — ordering + visibility + label come straight from the saved config, and EVERY
    // view routes to its own work-view slug (`/workspace/work-unit/:viewSlug`, path routing only —
    // no lane-slug branch, no `?work_view=` query routing). The by-slug resolver maps the view slug
    // back to its host work unit and selects the configured view. A view without a configured label
    // is a config bug — it is omitted rather than surfaced as a raw internal id.
    const savedWorkViews = savedWorkViewsFromDepartmentMetadata(args.departmentMetadata).filter(
        (view) => view.visible_in_runtime !== false && !!view.label?.trim(),
    );
    if (savedWorkViews.length) {
        return [...savedWorkViews]
            .sort(
                (a, b) =>
                    (a.display_order ?? Number.MAX_SAFE_INTEGER) - (b.display_order ?? Number.MAX_SAFE_INTEGER)
                    || a.label.localeCompare(b.label),
            )
            .flatMap((view) => {
                // Slug from the configured LABEL, never the internal id (ids survive renames —
                // "Active Pipeline" can carry id `new_work_view_2`; see workViewRouteKeyFromLabel).
                const routeKey = workViewRouteKeyFromLabel(view.label);
                if (!routeKey) return [];
                // Canonical location: host unit + base lane the view's count/rows are defined
                // on — the same host the slug in `href` resolves to (shared precedence).
                const canonical = resolveWorkViewCanonicalLocation(
                    view,
                    args.workUnits,
                    args.departmentId,
                );
                const mission = view.mission?.trim() || null;
                return [
                    {
                        label: view.label.trim(),
                        ...(mission ? { description: mission } : {}),
                        platformKey: view.id,
                        href: operatorWorkUnitHrefFromWorkViewSlug(routeKey),
                        work_view_id: view.id,
                        host_work_unit_id: canonical?.workUnitId ?? null,
                        base_queue_key: canonical?.baseQueueKey ?? null,
                        route_key: routeKey,
                    },
                ];
            });
    }

    // Legacy fallback — no configured Work Views: derive nav from queue lanes / stage perspectives.
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
        // Configured labels only — a lane without a label never surfaces its raw queue key.
        .filter((row) => !!row.label?.trim())
        .map((row) => {
            // Phase 2 route canonicalization: each work-view lane resolves to its own operator
            // work-unit slug (`/workspace/work-unit/:slug`), matching the builder/pipeline nav path.
            const laneKey = operatorWorkUnitKeyForPipelineQueueKey(row.queue_key) ?? platformKey;
            return {
                label: row.label?.trim() ?? "",
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
                !isLifecycleStageWorkUnitKey(wu.key) &&
                // Configured names only — never surface a raw work-unit key as an operator label.
                !!wu.name?.trim(),
        )
        .map((wu) => ({
            label: wu.name.trim(),
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
