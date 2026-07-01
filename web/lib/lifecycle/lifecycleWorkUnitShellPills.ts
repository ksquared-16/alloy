/**
 * Builder-owned lifecycle work-unit above-fold pill shell (Enrollment parity).
 * Work Units row = sibling lifecycle stage work units; Needs Attention row always reserved.
 */

import type {
    WorkUnitAboveFoldChip,
    WorkUnitAboveFoldChipSection,
} from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/aboveFoldTypes";
import {
    deptUsesBuilderOwnedLifecycleRuntime,
    type WorkUnitListRow,
} from "@/lib/lifecycle/builderOwnedLifecycleRuntime";
import {
    attachLifecycleSiblingTotals,
    filterSortLifecycleSiblingWorkUnits,
} from "@/lib/lifecycle/lifecycleWorkUnitSiblingHydration";
import { loadQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import {
    isLifecycleStageWorkUnitKey,
    lifecycleStageWorkUnitKey,
    primaryQueueKeyForLifecycleStage,
    stageKeyFromLifecycleWorkUnitMetadata,
} from "@/lib/lifecycle/lifecycleStageWorkUnit";
import {
    lifecycleDeptThroughputWorkUnits,
    type DeptWorkUnitListRow,
} from "@/lib/lifecycle/sortLifecycleDeptWorkUnits";
import { resolveLifecycleStageQueuePresentationMode } from "@/lib/lifecycle/lifecycleStageQueuePresentation";
import { logLifecycleWorkUnitPillTrace } from "@/lib/lifecycle/lifecycleWorkUnitSwitchRuntime";
import { resolveDeptWorkUnitDisplayLabel } from "@/lib/workspace/workUnitShellDisplayTitle";
import {
    resolveOperatorLifecycleWorkQueueNavEntriesForDepartment,
    type OperatorLifecycleWorkQueuePreview,
} from "@/lib/admin/buildOperatorLifecycleLanding";
import { operatorStageKeysForPipelineQueueKey } from "@/lib/lifecycle/enrollmentProcessStageQueueKeys";
import { workUnitKeyToRouteSlug, workUnitRouteSlugsEquivalent } from "@/lib/admin/workUnitRouteSlug";

export const LIFECYCLE_WORK_UNIT_NAV_CHIP_PREFIX = "lifecycle_wu_nav:";
export const LIFECYCLE_PLATFORM_NAV_CHIP_PREFIX = "lifecycle_platform_nav:";

export const LIFECYCLE_NEEDS_ATTENTION_PLACEHOLDER_CHIP_KEY = "lifecycle_na_placeholder";

export type LifecycleSiblingWorkUnitNavRow = {
    id: string;
    name: string | null;
    key?: string | null;
    metadata?: unknown;
    queue_definition?: unknown;
    /** Visibility-based total for pill badge (dept summary or current WU queue head). */
    total: number | null;
    /** Sidebar parity — navigate by platform queue key when no lifecycle WU row exists. */
    nav_platform_key?: string | null;
};

export function lifecyclePlatformNavChipKey(platformKey: string): string {
    return `${LIFECYCLE_PLATFORM_NAV_CHIP_PREFIX}${platformKey.trim()}`;
}

export function parseLifecyclePlatformNavChipKey(chipKey: string): string | null {
    if (!chipKey.startsWith(LIFECYCLE_PLATFORM_NAV_CHIP_PREFIX)) return null;
    const key = chipKey.slice(LIFECYCLE_PLATFORM_NAV_CHIP_PREFIX.length).trim();
    return key || null;
}

export function isLifecyclePlatformNavChipKey(chipKey: string): boolean {
    return parseLifecyclePlatformNavChipKey(chipKey) != null;
}

export function lifecycleWorkUnitNavChipKey(workUnitId: string): string {
    return `${LIFECYCLE_WORK_UNIT_NAV_CHIP_PREFIX}${workUnitId}`;
}

export function parseLifecycleWorkUnitNavChipKey(chipKey: string): string | null {
    if (!chipKey.startsWith(LIFECYCLE_WORK_UNIT_NAV_CHIP_PREFIX)) return null;
    const id = chipKey.slice(LIFECYCLE_WORK_UNIT_NAV_CHIP_PREFIX.length).trim();
    return id || null;
}

export function isLifecycleWorkUnitNavChipKey(chipKey: string): boolean {
    return parseLifecycleWorkUnitNavChipKey(chipKey) != null;
}

/** Primary executable queue key for a lifecycle stage work unit — never `lifecycle_wu_nav:*`. */
export function resolveLifecycleWorkUnitPrimaryQueueKey(workUnit: {
    queue_definition?: unknown;
    metadata?: unknown;
}): string | null {
    const stageKey = stageKeyFromLifecycleWorkUnitMetadata(workUnit.metadata);
    const stagePrimary = stageKey ? primaryQueueKeyForLifecycleStage(stageKey) : null;
    if (workUnit.queue_definition == null) return stagePrimary;
    try {
        const bundle = loadQueueDefinitionBundle(workUnit.queue_definition);
        const keys = new Set(bundle.normalized.queues.map((q) => q.key));
        if (stagePrimary && keys.has(stagePrimary)) return stagePrimary;
        return bundle.normalized.queues[0]?.key ?? stagePrimary;
    } catch {
        return stagePrimary;
    }
}

/** Pill label: work_units.name → queue label → key title-case (never stage label when name set). */
export function resolveLifecycleSiblingPillLabel(wu: {
    name?: string | null;
    key?: string | null;
    metadata?: unknown;
    queue_definition?: unknown;
}): string {
    const name = wu.name?.trim();
    if (name) return name;
    if (wu.queue_definition != null) {
        try {
            const bundle = loadQueueDefinitionBundle(wu.queue_definition);
            const label = bundle.normalized.queues[0]?.label?.trim();
            if (label) return label;
        } catch {
            /* fall through */
        }
    }
    return resolveDeptWorkUnitDisplayLabel({ name: null, key: wu.key ?? null, metadata: null });
}

/** Same order as /dept throughput cards (`sort_order`, then name). */
export function orderLifecycleSiblingNavRows(
    siblings: LifecycleSiblingWorkUnitNavRow[],
    deptOrderedWorkUnits: DeptWorkUnitListRow[],
    deptNameById?: Record<string, string | null>
): LifecycleSiblingWorkUnitNavRow[] {
    if (!deptOrderedWorkUnits.length) return siblings;
    const byId = new Map(siblings.map((s) => [s.id, s]));
    const ordered: LifecycleSiblingWorkUnitNavRow[] = [];
    for (const row of deptOrderedWorkUnits) {
        const hit = byId.get(row.id);
        if (!hit) continue;
        const fromDept = deptNameById?.[row.id]?.trim();
        ordered.push({
            ...hit,
            name: fromDept || hit.name?.trim() || row.name,
            key: hit.key ?? row.key,
            metadata: hit.metadata ?? row.metadata,
        });
        byId.delete(row.id);
    }
    for (const rest of byId.values()) ordered.push(rest);
    return ordered;
}

/** Client-side row layout path (API loader is server-side; do not change QueueService here). */
export function inferLifecycleQueueRowLoader(params: {
    work_unit_id: string;
    queue_key: string;
    work_unit_metadata?: unknown;
    items?: unknown[] | null;
}): "waitlist_candidate_grain" | "opportunity_standard" {
    const items = params.items ?? [];
    const hasWaitlistRow = items.some(
        (r) =>
            r != null &&
            typeof r === "object" &&
            (r as { _placement_waitlist_row?: unknown })._placement_waitlist_row != null
    );
    if (hasWaitlistRow) return "waitlist_candidate_grain";
    const stageKey = stageKeyFromLifecycleWorkUnitMetadata(params.work_unit_metadata);
    if (stageKey && resolveLifecycleStageQueuePresentationMode(stageKey) === "waitlist_candidate") {
        return "waitlist_candidate_grain";
    }
    return "opportunity_standard";
}

export function traceLifecyclePillQueueResult(params: {
    phase: "click" | "rows_applied" | "rows_empty" | "rows_error";
    selected_work_unit_id: string;
    queue_key: string;
    loader: string;
    record_count: number | null;
    total?: number | null;
    from_work_unit_id?: string | null;
    api_path?: string;
    error?: string | null;
}): void {
    logLifecycleWorkUnitPillTrace(params);
}

export function deptOrderedLifecycleSiblingSource(
    workUnits: Array<{
        id: string;
        name?: string | null;
        key?: string | null;
        sort_order?: number | null;
        metadata?: unknown;
    }>
): DeptWorkUnitListRow[] {
    return lifecycleDeptThroughputWorkUnits(
        workUnits.map((w) => ({
            id: String(w.id),
            name: w.name ?? null,
            key: w.key ?? null,
            sort_order: w.sort_order ?? null,
            metadata: w.metadata,
        })),
        true
    );
}

export function filterActiveLifecycleSiblingWorkUnits(rows: WorkUnitListRow[]): LifecycleSiblingWorkUnitNavRow[] {
    const filtered = rows.filter((w) => w.is_active !== false);
    const metaById = new Map(filtered.map((w) => [w.id, w.metadata]));
    return filterSortLifecycleSiblingWorkUnits(rows).map((w) => ({
        id: w.id,
        name: w.name,
        key: w.key,
        metadata: metaById.get(w.id),
        total: null,
    }));
}

function normalizePlatformKey(key: string): string {
    return key.trim().toLowerCase();
}

function workUnitMatchesPlatformKey(wu: WorkUnitListRow, platformKey: string): boolean {
    const normalized = normalizePlatformKey(platformKey);
    const wuKey = (wu.key ?? "").trim();
    if (!wuKey) return false;
    if (normalizePlatformKey(wuKey) === normalized) return true;
    return workUnitRouteSlugsEquivalent(workUnitKeyToRouteSlug(wuKey), workUnitKeyToRouteSlug(platformKey));
}

function resolveWorkUnitForOperatorNavEntry(
    entry: OperatorLifecycleWorkQueuePreview,
    workUnits: WorkUnitListRow[]
): WorkUnitListRow | null {
    const active = workUnits.filter((w) => w.is_active !== false);
    const platformKey = entry.platformKey.trim();

    const direct = active.find((wu) => workUnitMatchesPlatformKey(wu, platformKey));
    if (direct) return direct;

    for (const stageKey of operatorStageKeysForPipelineQueueKey(platformKey)) {
        const lifecycleKey = lifecycleStageWorkUnitKey(stageKey).toLowerCase();
        const byLifecycleKey = active.find(
            (wu) => (wu.key ?? "").trim().toLowerCase() === lifecycleKey
        );
        if (byLifecycleKey) return byLifecycleKey;

        const byStageMeta = active.find(
            (wu) => stageKeyFromLifecycleWorkUnitMetadata(wu.metadata)?.trim().toLowerCase() === stageKey
        );
        if (byStageMeta) return byStageMeta;
    }

    for (const wu of active) {
        const stageKey = stageKeyFromLifecycleWorkUnitMetadata(wu.metadata);
        if (!stageKey) continue;
        if (workUnitRouteSlugsEquivalent(workUnitKeyToRouteSlug(stageKey), workUnitKeyToRouteSlug(platformKey))) {
            return wu;
        }
    }

    return null;
}

/** Build pill rows in the same order/labels as sidebar business-process nav. */
export function buildLifecycleSiblingNavRowsFromDepartmentWorkUnits(args: {
    departmentId: string;
    departmentMetadata: unknown;
    workUnits: WorkUnitListRow[];
}): LifecycleSiblingWorkUnitNavRow[] {
    const navEntries = resolveOperatorLifecycleWorkQueueNavEntriesForDepartment({
        departmentId: args.departmentId,
        departmentMetadata: args.departmentMetadata,
        workUnits: args.workUnits.map((wu) => ({
            id: wu.id,
            department_id: args.departmentId,
            key: wu.key ?? "",
            name: wu.name ?? "",
            queue_definition: (wu as { queue_definition?: unknown }).queue_definition,
            is_active: wu.is_active,
        })),
    });
    if (!navEntries.length) {
        return filterActiveLifecycleSiblingWorkUnits(args.workUnits);
    }

    const consumedIds = new Set<string>();
    const rows: LifecycleSiblingWorkUnitNavRow[] = [];

    for (const entry of navEntries) {
        const wu = resolveWorkUnitForOperatorNavEntry(entry, args.workUnits);
        if (wu) {
            consumedIds.add(wu.id);
            rows.push({
                id: wu.id,
                name: entry.label.trim() || wu.name,
                key: wu.key,
                metadata: wu.metadata,
                queue_definition: (wu as { queue_definition?: unknown }).queue_definition,
                total: null,
            });
            continue;
        }
        rows.push({
            id: `platform_nav:${normalizePlatformKey(entry.platformKey)}`,
            name: entry.label.trim() || entry.platformKey,
            key: entry.platformKey,
            total: null,
            nav_platform_key: entry.platformKey,
        });
    }

    const metaById = new Map(args.workUnits.map((w) => [w.id, w.metadata]));

    for (const wu of filterSortLifecycleSiblingWorkUnits(args.workUnits)) {
        if (consumedIds.has(wu.id)) continue;
        rows.push({
            id: wu.id,
            name: wu.name,
            key: wu.key,
            metadata: metaById.get(wu.id),
            total: null,
        });
    }

    return rows;
}

export function lifecycleSiblingNavRowSelected(
    row: LifecycleSiblingWorkUnitNavRow,
    currentWorkUnitId: string,
    currentWorkUnitKey?: string | null
): boolean {
    if (row.id === currentWorkUnitId && !row.nav_platform_key) return true;
    const currentKey = (currentWorkUnitKey ?? "").trim();
    if (!currentKey) return row.id === currentWorkUnitId;
    if (row.nav_platform_key) {
        return workUnitRouteSlugsEquivalent(
            workUnitKeyToRouteSlug(row.nav_platform_key),
            workUnitKeyToRouteSlug(currentKey)
        );
    }
    if (row.key) {
        return workUnitRouteSlugsEquivalent(
            workUnitKeyToRouteSlug(row.key),
            workUnitKeyToRouteSlug(currentKey)
        );
    }
    return row.id === currentWorkUnitId;
}

export function lifecycleSiblingNavRowHasResolvableWorkUnit(row: LifecycleSiblingWorkUnitNavRow): boolean {
    return !row.nav_platform_key;
}

export function attachSiblingWorkUnitTotals(
    siblings: LifecycleSiblingWorkUnitNavRow[],
    totalsByWorkUnitId: Record<string, number | null | undefined>,
    currentWorkUnitId: string,
    currentWorkUnitTotal: number | null
): LifecycleSiblingWorkUnitNavRow[] {
    return attachLifecycleSiblingTotals({
        siblings,
        totalsByWorkUnitId,
        currentWorkUnitId,
        currentWorkUnitTotal,
    });
}

function chipCountForSibling(total: number | null): WorkUnitAboveFoldChip["count"] {
    if (total == null || Number.isNaN(total)) return "emdash";
    return total;
}

function buildWorkUnitsSection(params: {
    siblings: LifecycleSiblingWorkUnitNavRow[];
    currentWorkUnitId: string;
    currentWorkUnitKey?: string | null;
}): WorkUnitAboveFoldChipSection {
    return {
        key: "lifecycle_work_units",
        label: "Work Units",
        chips: params.siblings.map((wu) => {
            const selected = lifecycleSiblingNavRowSelected(
                wu,
                params.currentWorkUnitId,
                params.currentWorkUnitKey
            );
            const chipKey =
                wu.nav_platform_key
                    ? lifecyclePlatformNavChipKey(wu.nav_platform_key)
                    : lifecycleWorkUnitNavChipKey(wu.id);
            return {
                key: chipKey,
                label:
                    wu.name?.trim() ||
                    resolveLifecycleSiblingPillLabel({
                        name: wu.name,
                        key: wu.key ?? null,
                        metadata: wu.metadata,
                        queue_definition: wu.queue_definition,
                    }),
                priority: "standard" as const,
                selected,
                count: chipCountForSibling(wu.total),
                lifecycle_work_unit_nav_id: wu.nav_platform_key ? undefined : wu.id,
            };
        }),
    };
}

function buildNeedsAttentionSection(params: {
    attentionQueues: Array<{ key: string; label: string; count: number; priority?: "standard" | "attention" | "critical" }>;
    selectedQueueKey: string | null;
}): WorkUnitAboveFoldChipSection | null {
    if (params.attentionQueues.length === 0) {
        return null;
    }

    return {
        key: "needs_attention",
        label: "Needs Attention",
        chips: params.attentionQueues.map((q) => ({
            key: q.key,
            label: q.label,
            priority: q.priority ?? ("critical" as const),
            selected: params.selectedQueueKey === q.key,
            count: Math.max(0, Math.floor(q.count)),
        })),
    };
}

/** Two-row enrollment-style header: Work Units (sibling nav) + Needs Attention (reserved). */
export function buildLifecycleBuilderOwnedAboveFoldHeaderSections(params: {
    siblings: LifecycleSiblingWorkUnitNavRow[];
    currentWorkUnitId: string;
    currentWorkUnitKey?: string | null;
    selectedQueueKey: string | null;
    attentionQueues?: Array<{
        key: string;
        label: string;
        count: number;
        priority?: "standard" | "attention" | "critical";
    }>;
}): WorkUnitAboveFoldChipSection[] {
    const sections: WorkUnitAboveFoldChipSection[] = [];
    if (params.siblings.length) {
        sections.push(
            buildWorkUnitsSection({
                siblings: params.siblings,
                currentWorkUnitId: params.currentWorkUnitId,
                currentWorkUnitKey: params.currentWorkUnitKey,
            })
        );
    }
    const needsAttention = buildNeedsAttentionSection({
        attentionQueues: params.attentionQueues ?? [],
        selectedQueueKey: params.selectedQueueKey,
    });
    if (needsAttention) {
        sections.push(needsAttention);
    }
    return sections;
}

/**
 * Preliminary sibling sections — real work-unit names, skeleton counts.
 * Used while the authoritative hydration is in-flight (bootstrap or client fetch).
 * Never shows stale counts; exact hydration replaces this in-place once ready.
 */
export function buildLifecycleSiblingPreliminaryHeaderSections(params: {
    siblings: LifecycleSiblingWorkUnitNavRow[];
    currentWorkUnitId: string;
    currentWorkUnitKey?: string | null;
}): WorkUnitAboveFoldChipSection[] {
    if (!params.siblings.length) return [];
    const chips = params.siblings.map((wu) => {
        const selected = lifecycleSiblingNavRowSelected(wu, params.currentWorkUnitId, params.currentWorkUnitKey);
        const chipKey = wu.nav_platform_key
            ? lifecyclePlatformNavChipKey(wu.nav_platform_key)
            : lifecycleWorkUnitNavChipKey(wu.id);
        return {
            key: chipKey,
            label: resolveLifecycleSiblingPillLabel({ name: wu.name, key: wu.key ?? null, metadata: wu.metadata }),
            priority: "standard" as const,
            selected,
            count: "skeleton" as const,
            lifecycle_work_unit_nav_id: wu.nav_platform_key ? undefined : wu.id,
        };
    });
    return [
        { key: "lifecycle_work_units", label: "Work Units", chips },
        {
            key: "needs_attention",
            label: "Needs Attention",
            chips: [
                {
                    key: "lifecycle_na_skeleton",
                    label: "—",
                    priority: "critical" as const,
                    selected: false,
                    count: "skeleton" as const,
                },
            ],
        },
    ];
}

/** Enrollment uses pipeline_with_attention KPI suppression when pills carry counts. */
export function lifecycleBuilderOwnedUsesEnrollmentPillShell(
    departmentMetadata: unknown,
    workUnitKey?: string | null
): boolean {
    if (!isLifecycleStageWorkUnitKey(workUnitKey ?? null)) return false;
    return deptUsesBuilderOwnedLifecycleRuntime(departmentMetadata, [{ key: workUnitKey }]);
}
