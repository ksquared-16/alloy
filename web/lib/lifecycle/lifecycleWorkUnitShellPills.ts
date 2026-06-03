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

export const LIFECYCLE_WORK_UNIT_NAV_CHIP_PREFIX = "lifecycle_wu_nav:";

export const LIFECYCLE_NEEDS_ATTENTION_PLACEHOLDER_CHIP_KEY = "lifecycle_na_placeholder";

export type LifecycleSiblingWorkUnitNavRow = {
    id: string;
    name: string | null;
    key?: string | null;
    metadata?: unknown;
    queue_definition?: unknown;
    /** Visibility-based total for pill badge (dept summary or current WU queue head). */
    total: number | null;
};

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
}): WorkUnitAboveFoldChipSection {
    return {
        key: "lifecycle_work_units",
        label: "Work Units",
        chips: params.siblings.map((wu) => {
            const selected = wu.id === params.currentWorkUnitId;
            return {
                key: lifecycleWorkUnitNavChipKey(wu.id),
                label: resolveLifecycleSiblingPillLabel({
                    name: wu.name,
                    key: wu.key ?? null,
                    metadata: wu.metadata,
                    queue_definition: wu.queue_definition,
                }),
                priority: "standard" as const,
                selected,
                count: chipCountForSibling(wu.total),
                lifecycle_work_unit_nav_id: wu.id,
            };
        }),
    };
}

function buildNeedsAttentionSection(params: {
    attentionQueues: Array<{ key: string; label: string; count: number; priority?: "standard" | "attention" | "critical" }>;
    selectedQueueKey: string | null;
}): WorkUnitAboveFoldChipSection {
    if (params.attentionQueues.length > 0) {
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

    return {
        key: "needs_attention",
        label: "Needs Attention",
        chips: [
            {
                key: LIFECYCLE_NEEDS_ATTENTION_PLACEHOLDER_CHIP_KEY,
                label: "No needs attention rules configured",
                priority: "critical" as const,
                selected: false,
                count: 0,
                attention_placeholder: true,
            },
        ],
    };
}

/** Two-row enrollment-style header: Work Units (sibling nav) + Needs Attention (reserved). */
export function buildLifecycleBuilderOwnedAboveFoldHeaderSections(params: {
    siblings: LifecycleSiblingWorkUnitNavRow[];
    currentWorkUnitId: string;
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
            })
        );
    }
    sections.push(
        buildNeedsAttentionSection({
            attentionQueues: params.attentionQueues ?? [],
            selectedQueueKey: params.selectedQueueKey,
        })
    );
    return sections;
}

/** Enrollment uses pipeline_with_attention KPI suppression when pills carry counts. */
export function lifecycleBuilderOwnedUsesEnrollmentPillShell(
    departmentMetadata: unknown,
    workUnitKey?: string | null
): boolean {
    if (!isLifecycleStageWorkUnitKey(workUnitKey ?? null)) return false;
    return deptUsesBuilderOwnedLifecycleRuntime(departmentMetadata, [{ key: workUnitKey }]);
}
