/**
 * Presentation Runtime V2 — resolved presentation models + pure mappers.
 *
 * The PresentationRuntime is the ONLY layer that touches data (see
 * docs/platform/experience/presentation-runtime-v2.md). Surfaces receive these resolved
 * models from the runtime hooks and never fetch. This module is pure (no React, no
 * fetches) so the mappers are testable without a DOM and importable from both hooks
 * and tests.
 *
 * One operational answer model. One work-view link model (Workspace tile list and
 * Work Unit pill strip render the same configured Work Views). One queue row model
 * (the frozen `QueueRowContext` contract, wrapped thin).
 */

import type {
    OperatorLifecycleLandingCard,
    OperatorLifecycleWorkQueuePreview,
} from "@/lib/admin/buildOperatorLifecycleLanding";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";
import type { QueueItemsResult } from "@/lib/queues/types";
import type { OipMetricKey } from "@/lib/metrics/types";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import { findOperationalCalculation } from "@/lib/analytics/calculations/registry";
import { getDrillContract } from "@/lib/analytics/runtime/drillResolver";
import { operatorWorkUnitHrefFromKey } from "@/lib/admin/canonicalOperatorRoutes";

/**
 * One operational answer — a governed calculation's resolved, formatted value plus its
 * drill target. Both the Workspace and Work Unit answer rows render this model.
 */
export type OperationalAnswerModel = {
    key: OipMetricKey;
    label: string;
    formattedValue: string;
    /** Canonical drill href (`/workspace/work-unit/<slug>`) — null for exploratory-only calculations. */
    href: string | null;
};

/**
 * One configured Work View link — the same shape for the Workspace tile WorkViewList and
 * the Work Unit pill strip (both render the configured `work_views_v1` for the process).
 */
export type WorkViewLinkModel = {
    id: string;
    label: string;
    isActive: boolean;
    /** Lane count when resolvable from queue summaries; null renders as no badge. */
    count: number | null;
    /** Workspace tile links soft-navigate; Work Unit pills select in-page (null). */
    href: string | null;
};

/** A process tile — the collapsed state of a process on the Workspace surface. */
export type ProcessTileModel = {
    id: string;
    label: string;
    description: string;
    /** Canonical slug entry (`/workspace/work-unit/<slug>`). */
    entryHref: string;
    activeRecordCount: number | null;
    needsAttentionCount: number | null;
    workViews: WorkViewLinkModel[];
    /** Already-formatted OIP preview values (server/warm-cache resolved). */
    performanceMetrics: readonly {
        label: string;
        value: string;
        target?: string | null;
        status?: string | null;
    }[];
};

/**
 * A condensed queue row — thin wrapper over the frozen `QueueRowContext` contract plus
 * the minimal identity the Focus Panel open needs. `context` is null only for rows the
 * queue API did not attach the projection to (job/schedule lanes, disabled case grain).
 */
export type QueueRowModel = {
    context: QueueRowContext | null;
    entityType: "opportunity" | "job" | "schedule";
    entityId: string;
};

/** WS.SURFACE — resolved model for the Workspace surface. */
export type WorkspaceSurfaceModel = {
    header: { orgName: string | null };
    answers: OperationalAnswerModel[];
    processes: ProcessTileModel[];
    ready: boolean;
};

/** WU.SURFACE — resolved model for the Work Unit surface. */
export type WorkUnitSurfaceModel = {
    /**
     * Operator-facing identity — configured labels only. `processLabel` is the configured
     * lifecycle process label (department name fallback); `workViewLabel` is the ACTIVE
     * configured Work View's label. Internal structure names (work-unit `name`/`key`) and
     * humanized slugs never surface here.
     */
    header: { processLabel: string | null; workViewLabel: string | null };
    answers: OperationalAnswerModel[];
    workViews: WorkViewLinkModel[];
    queue: {
        rows: QueueRowModel[];
        totalCount: number | null;
        loading: boolean;
        error: string | null;
    };
    activeWorkViewId: string | null;
    ready: boolean;
};

/** Work Unit surface intents — the only mutations presentation components may express. */
export type WorkUnitSurfaceIntents = {
    /** In-page Work View selection (doctrine: no query-string routing for view selection). */
    selectWorkView: (workViewId: string) => void;
    /** Open the Focus Panel for a queue row (in-page `openDrawer`). */
    openRecord: (row: QueueRowModel) => void;
};

/**
 * Drill href for an operational answer: calculation → drill contract → canonical work-unit
 * slug route. Exploratory-only calculations (no drill contract) resolve to null — surfaces
 * render them non-navigable rather than dead-ending.
 */
export function drillHrefForMetricKey(key: string): string | null {
    const calc = findOperationalCalculation(key);
    const contract = getDrillContract(calc?.drillContractId);
    if (!contract) return null;
    return operatorWorkUnitHrefFromKey(contract.workUnitKey);
}

/**
 * Map warm-cache resolved metrics to answer models, preserving `keys` order. Keys without
 * a resolved value are omitted (the answers row shows real values, not placeholders).
 */
export function operationalAnswerModelsFromResolvedMetrics(
    keys: readonly OipMetricKey[],
    resolved: ResolvedMetricMap,
): OperationalAnswerModel[] {
    const out: OperationalAnswerModel[] = [];
    for (const key of keys) {
        const item = resolved[key];
        if (!item?.formatted_value) continue;
        out.push({
            key,
            label: item.label ?? key,
            formattedValue: item.formatted_value,
            href: drillHrefForMetricKey(key),
        });
    }
    return out;
}

/** Workspace tile work-view link from a landing card nav entry (carries its own slug href). */
export function workViewLinkFromWorkQueuePreview(
    entry: OperatorLifecycleWorkQueuePreview,
): WorkViewLinkModel {
    return {
        id: entry.platformKey,
        label: entry.label,
        isActive: false,
        count: null,
        href: entry.href,
    };
}

/**
 * Work Unit pill-strip links from the configured Work Views (`work_views_v1`) — the same
 * list the Workspace tile renders (built by `workViewNavEntriesForDepartment`). Hidden
 * views are dropped; a view without a configured label is a config bug and is omitted
 * (never rendered as a raw internal id). Ordering follows `display_order` then label.
 * `countForView` resolves a count (null renders as no badge). Pills select in-page → no href.
 */
export function workViewLinkModelsFromConfiguredViews(
    views: readonly WorkViewConfigV1Stored[],
    args: {
        activeWorkViewId: string | null;
        countForView?: (view: WorkViewConfigV1Stored) => number | null;
    },
): WorkViewLinkModel[] {
    return views
        .filter((view) => view.visible_in_runtime !== false && !!view.label?.trim())
        .sort(
            (a, b) =>
                (a.display_order ?? Number.MAX_SAFE_INTEGER) - (b.display_order ?? Number.MAX_SAFE_INTEGER)
                || a.label.localeCompare(b.label),
        )
        .map((view) => ({
            id: view.id,
            label: view.label.trim(),
            isActive: view.id === args.activeWorkViewId,
            count: args.countForView?.(view) ?? null,
            href: null,
        }));
}

/**
 * THE queue count for a Work View — the `total` of the same `QueueItemsResult` that renders
 * the rows (`count_mode=exact`). Pill counts and `queue.totalCount` both derive from this so
 * the badge can never disagree with the rendered rows. `total_omitted` / missing → null
 * (no badge beats a wrong badge).
 */
export function queueTotalCountFromQueueItemsResult(
    result: Pick<QueueItemsResult, "total" | "total_omitted"> | null | undefined,
): number | null {
    if (!result || result.total_omitted) return null;
    return typeof result.total === "number" && Number.isFinite(result.total) ? result.total : null;
}

/** Workspace process tile from an operator lifecycle landing card (values pre-resolved). */
export function processTileModelFromLandingCard(card: OperatorLifecycleLandingCard): ProcessTileModel {
    return {
        id: card.id,
        label: card.label,
        description: card.description,
        entryHref: card.entryHref,
        activeRecordCount: card.activeRecordCount,
        needsAttentionCount: card.needsAttentionCount,
        workViews: card.workQueues.map(workViewLinkFromWorkQueuePreview),
        performanceMetrics: card.performanceMetrics ?? [],
    };
}

/**
 * One queue row from a `QueueItemsResult` item. Rows carry the frozen `QueueRowContext`
 * projection as `_queue_row_context` when the QueueService attached it; identity falls
 * back to the raw row `id`. Rows without a usable id are dropped (nothing to open).
 */
export function queueRowModelFromQueueItem(
    item: unknown,
    queueEntityType: "opportunity" | "job" | "schedule",
): QueueRowModel | null {
    if (item == null || typeof item !== "object") return null;
    const row = item as { id?: unknown; _queue_row_context?: QueueRowContext };
    const context = row._queue_row_context ?? null;
    const entityId =
        (typeof row.id === "string" ? row.id.trim() : "") ||
        context?.drawer_open.entity_id?.trim() ||
        "";
    if (!entityId) return null;
    return { context, entityType: queueEntityType, entityId };
}

/** All rows of a queue payload, in API order (rows without identity dropped). */
export function queueRowModelsFromQueueItemsResult(result: QueueItemsResult): QueueRowModel[] {
    const entityType = result.queue.entity_type;
    const out: QueueRowModel[] = [];
    for (const item of result.items) {
        const row = queueRowModelFromQueueItem(item, entityType);
        if (row) out.push(row);
    }
    return out;
}
