/**
 * Merge Business Process operational view metadata into runtime navigation + perspective.
 */

import type { WorkUnitAboveFoldChipSection } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/aboveFoldTypes";
import { WORK_VIEW_PILL_SECTION_LABEL } from "@/lib/adminV2/runtime/configurationRuntimeConvergenceFlag";
import {
    normalizeQueueDefinitionDocument,
    type NormalizedQueueEntry,
} from "@/lib/config/queueDefinitionV2Runtime";
import type { PerspectiveConfigV1Stored } from "@/lib/lifecycle/perspectiveConfigV1";
import type { WorkUnitPillSection } from "@/lib/workspace/workUnitQueueDerived";
import {
    deriveRuntimePerspective,
    type DeriveRuntimePerspectiveParams,
    type RuntimePerspective,
} from "@/lib/adminV2/runtime/perspective/deriveRuntimePerspective";

export function operationalViewMetadataForQueueKey(
    views: readonly PerspectiveConfigV1Stored[],
    queueKey: string,
): PerspectiveConfigV1Stored | null {
    const key = queueKey.trim();
    if (!key) return null;
    return views.find((row) => row.queue_key === key) ?? null;
}

export function mergeOperationalViewIntoRuntimePerspective(
    base: RuntimePerspective,
    stored: PerspectiveConfigV1Stored | null,
): RuntimePerspective {
    if (!stored) return base;
    const label = stored.label?.trim();
    const mission = stored.mission?.trim();
    return {
        ...base,
        label: label || base.label,
        defaultMission: mission || base.defaultMission,
    };
}

export function deriveRuntimePerspectiveWithOperationalViews(
    params: DeriveRuntimePerspectiveParams & {
        operationalViews?: readonly PerspectiveConfigV1Stored[] | null;
    },
): RuntimePerspective | null {
    const base = deriveRuntimePerspective(params);
    if (!base) return null;
    const stored = operationalViewMetadataForQueueKey(params.operationalViews ?? [], base.key);
    return mergeOperationalViewIntoRuntimePerspective(base, stored);
}

function visibleOperationalViews(views: readonly PerspectiveConfigV1Stored[]): PerspectiveConfigV1Stored[] {
    return views.filter((row) => row.visible_in_rail !== false);
}

function sortOperationalViews(views: readonly PerspectiveConfigV1Stored[]): PerspectiveConfigV1Stored[] {
    return [...views].sort(
        (a, b) =>
            (a.display_order ?? Number.MAX_SAFE_INTEGER) - (b.display_order ?? Number.MAX_SAFE_INTEGER)
            || a.queue_key.localeCompare(b.queue_key),
    );
}

/** Apply configured labels, visibility, and ordering to queue pill sections. */
export function applyOperationalViewsToPillSections<T extends { key: string; label: string }>(
    sections: WorkUnitPillSection<T>[] | null,
    views: readonly PerspectiveConfigV1Stored[],
): WorkUnitPillSection<T>[] | null {
    if (!sections?.length || !views.length) return sections;

    const byKey = new Map(views.map((row) => [row.queue_key, row]));

    const transformQueues = (queues: T[]): T[] => {
        const filtered = queues.filter((q) => {
            const meta = byKey.get(q.key);
            if (!meta) return true;
            return meta.visible_in_rail !== false;
        });
        const relabeled = filtered.map((q) => {
            const meta = byKey.get(q.key);
            const label = meta?.label?.trim();
            return label ? ({ ...q, label } as T) : q;
        });
        return relabeled.sort((a, b) => {
            const orderA = byKey.get(a.key)?.display_order ?? Number.MAX_SAFE_INTEGER;
            const orderB = byKey.get(b.key)?.display_order ?? Number.MAX_SAFE_INTEGER;
            if (orderA !== orderB) return orderA - orderB;
            return a.label.localeCompare(b.label);
        });
    };

    return sections
        .map((sec) => ({ ...sec, queues: transformQueues(sec.queues) }))
        .filter((sec) => sec.queues.length > 0);
}

/** Apply configured labels to queue tab placeholders while summaries load. */
export function applyOperationalViewsToTabPlaceholders<
    T extends { key: string; label: string; priority: "standard" | "attention" | "critical" },
>(
    sections: WorkUnitPillSection<T>[] | null,
    views: readonly PerspectiveConfigV1Stored[],
): WorkUnitPillSection<T>[] | null {
    return applyOperationalViewsToPillSections(sections, views);
}

type QueueChipSource = {
    key: string;
    label: string;
    count?: number;
    priority?: "standard" | "attention" | "critical";
};

/** Derive Work View lanes from `queue_definition` when perspectives_v1 is not yet saved. */
export function deriveOperationalViewsFromQueueDefinition(
    queueDefinition: unknown,
): PerspectiveConfigV1Stored[] {
    const normalized =
        queueDefinition != null ? normalizeQueueDefinitionDocument(queueDefinition) : null;
    if (!normalized?.queues.length) return [];

    const skip = new Set(["needs_attention", "all_records"]);
    return normalized.queues
        .filter((q: NormalizedQueueEntry) => !skip.has(q.key.trim().toLowerCase()))
        .map((q: NormalizedQueueEntry, index) => ({
            queue_key: q.key,
            label: q.label?.trim() || q.key,
            display_order: index,
            visible_in_rail: true,
        }));
}

/** Relabel the primary throughput pill section to the operator-facing Work View label. */
export function relabelPrimaryPillSectionWorkView<T extends { label: string }>(
    sections: WorkUnitPillSection<T>[] | null,
): WorkUnitPillSection<T>[] | null {
    if (!sections?.length) return sections;
    return sections.map((section, index) =>
        index === 0 ? { ...section, label: WORK_VIEW_PILL_SECTION_LABEL } : section,
    );
}

/** Builder-owned lifecycle: operational view row when a stage exposes multiple visible views. */
export function buildOperationalViewHeaderSection(params: {
    views: readonly PerspectiveConfigV1Stored[];
    queueSummaries: readonly QueueChipSource[];
    selectedQueueKey: string | null;
    sectionLabel?: string;
    /** When true, render even a single visible lane (Work View with one perspective). */
    allowSingleLane?: boolean;
}): WorkUnitAboveFoldChipSection | null {
    const visible = sortOperationalViews(visibleOperationalViews(params.views));
    if (visible.length === 0) return null;
    if (visible.length <= 1 && !params.allowSingleLane) return null;

    const summaryByKey = new Map(params.queueSummaries.map((q) => [q.key, q]));

    return {
        key: "operational_views",
        label: params.sectionLabel?.trim() || WORK_VIEW_PILL_SECTION_LABEL,
        chips: visible.map((view) => {
            const summary = summaryByKey.get(view.queue_key);
            const label = view.label?.trim() || summary?.label?.trim() || view.queue_key;
            const count = summary?.count;
            return {
                key: view.queue_key,
                label,
                priority: summary?.priority ?? ("standard" as const),
                selected: params.selectedQueueKey === view.queue_key,
                count: typeof count === "number" && !Number.isNaN(count) ? Math.max(0, Math.floor(count)) : "emdash",
            };
        }),
    };
}

/** Preview Runtime — open work unit with operational view (queue lane) active. */
export function buildOperationalViewPreviewRuntimeHref(params: {
    departmentId: string;
    workUnitId: string;
    queueKey: string;
    workViewId?: string | null;
    queueLayoutId?: string | null;
    focusPanelLayoutId?: string | null;
}): string | null {
    const departmentId = params.departmentId.trim();
    const workUnitId = params.workUnitId.trim();
    const queueKey = params.queueKey.trim();
    if (!departmentId || !workUnitId || !queueKey) return null;
    const sp = new URLSearchParams({ queue: queueKey });
    const workViewId = params.workViewId?.trim();
    if (workViewId) sp.set("work_view", workViewId);
    const queueLayoutId = params.queueLayoutId?.trim();
    if (queueLayoutId) sp.set("queue_layout", queueLayoutId);
    const focusPanelLayoutId = params.focusPanelLayoutId?.trim();
    if (focusPanelLayoutId) sp.set("focus_layout", focusPanelLayoutId);
    return `/adminV2/workspace/dept/${encodeURIComponent(departmentId)}/work-unit/${encodeURIComponent(workUnitId)}?${sp.toString()}`;
}
