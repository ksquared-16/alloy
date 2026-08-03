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
import type { OpportunityDrawerQueuePreviewSeed } from "@/lib/admin/opportunityDrawerQueuePreviewSeed";
import type { DestinationId } from "@/lib/runtime/graph/destinationId";
import { nodeDestinationId } from "@/lib/runtime/graph/destinationId";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";
import type { QueueItemsResult } from "@/lib/queues/types";
import type { OipMetricKey } from "@/lib/metrics/types";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import type { CompactRowSlots } from "./queueRowSurfaceConfig";
import type { WorkUnitSelectedSubject } from "./workUnitPillSwitching";
import type { FocusedSubjectContext } from "./resolveQueueRowSubjectFocus";
import type {
    ProcessCardIcon,
    WorkspaceProcessSurfaceConfig,
} from "./workspaceProcessSurfaceConfig";
import type { WorkspaceHeaderPresentationModel } from "./workspaceHeaderSurfaceConfig";
import type { WorkViewGrainBucket } from "@/lib/lifecycle/stageGrainV1";
import { grainCountUnitLabel } from "@/lib/lifecycle/stageGrainV1";
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
    /** Optional Work View mission — configured copy, not a calculated metric. */
    description?: string | null;
    isActive: boolean;
    /** Lane count when resolvable from queue summaries; null renders as no badge. */
    count: number | null;
    /** Workspace tile links soft-navigate; Work Unit pills select in-page (null). */
    href: string | null;
    /**
     * Configured Work View row glyph (Surface Builder → per work view). Null → the row uses the
     * neutral fallback glyph. Never derived from a stage/view NAME — always config-resolved.
     */
    icon?: ProcessCardIcon | null;
    /**
     * Secondary operational context for the Workspace tile row (records needing attention /
     * overdue in this view) — from the operational projection. Null when unresolved or on the
     * Work Unit pill path (pills show none). A row renders an attention indicator only when
     * `attentionCount` is a positive number.
     */
    attentionCount: number | null;
    overdueCount: number | null;
    /** Primary grain count (family/case or sole grain) from operational projection. */
    primaryGrainCount: number | null;
    /** Supporting grain count when the view spans both grains. */
    supportingGrainCount: number | null;
    /** Grain bucket for primary count — from operational projection. */
    primaryGrainKind?: WorkViewGrainBucket | null;
    /** Grain bucket for supporting count when dual-grain. */
    supportingGrainKind?: WorkViewGrainBucket | null;
    /** Presentation unit label derived from grain kind + count (e.g. `Family`, `Children`). */
    primaryGrainLabel?: string | null;
    supportingGrainLabel?: string | null;
    /**
     * The CANONICAL Operational Destination this link resolves to — server-resolved
     * `(workUnitId, workViewId)`. The runtime keys surface identity / preparation / provisioning on
     * THIS (via the entry gesture → K1 AttentionRef.destination), never on the route slug, so two URL
     * forms of the same destination can never fracture. Null only when the host unit could not resolve.
     * Stamped on Workspace entry rows; absent on Work-Unit pills (they select via a LENS move that
     * inherits the destination) and on snapshot-derived models.
     */
    destination?: DestinationId | null;
};

/** A process tile — the collapsed state of a process on the Workspace surface. */
export type ProcessTileModel = {
    id: string;
    /** The process's business-process key — resolves its configured Primary Signal + signal options. */
    processKey: string;
    label: string;
    description: string;
    /** Canonical slug entry (`/workspace/work-unit/<slug>`). */
    entryHref: string;
    /** Canonical destination the tile's primary CTA enters — the process's default Work View. */
    destination?: DestinationId | null;
    activeRecordCount: number | null;
    needsAttentionCount: number | null;
    workViews: WorkViewLinkModel[];
    /**
     * The one configured Primary Signal for this process — a resolved Operational Calculation
     * (answer / value / state / supporting context / drill). Null when none is configured/resolved
     * (the card shows a neutral no-signal state; it never fabricates one).
     */
    primarySignal: PrimarySignalModel | null;
    /**
     * An optional SECOND configured Operational Calculation, resolved the same way as the primary
     * signal, rendered by the card as a text-only supporting line. Null when none is configured.
     */
    supportingSignal: PrimarySignalModel | null;
};

/** Canonical display state of a Primary Signal — localized from the calculation's KPI status. */
export type SignalState = "healthy" | "caution" | "critical" | "neutral";

/** A resolved Primary Signal the ProcessSummaryCard renders (domain-neutral). */
export type PrimarySignalModel = {
    key: string;
    label: string;
    /** Answer line — the signal framed by its canonical state. */
    answer: string;
    state: SignalState;
    /** Formatted value (percent / currency / count / score / ratio — the card never branches on type). */
    value: string | null;
    /** Supporting context (the calculation's target, as text). */
    supportingContext: string | null;
    /** Trend text — rendered only when the data layer supplies it; never fabricated. */
    trend: string | null;
    /** Drill target from the calculation's drill contract. */
    drillHref: string | null;
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
    /**
     * Per-row compact slots resolved from the row's matching Queue Row Variant. Present only when
     * the published surface defines variants AND this row matched one; absent → the row uses the
     * surface's Default (`queue.rowConfig`). Same slot shape either way — no alternate renderer.
     */
    rowConfig?: CompactRowSlots;
    /**
     * Resolved Subject Focus (Phase 3) — which subject the compact row emphasizes. Present only when
     * the matched variant declares `subjectFocus`; absent → frozen-context rendering (fallback).
     */
    focus?: FocusedSubjectContext;
};

/** WS.SURFACE — resolved model for the Workspace surface. */
export type WorkspaceSurfaceModel = {
    /**
     * Published Workspace Header (title, subtitle, org-level KPIs). Commit atomically with
     * process tiles — do not flash a default header when a published config exists.
     */
    header: WorkspaceHeaderPresentationModel;
    processes: ProcessTileModel[];
    /** The published Workspace Process Summary config used to assemble `processes`. */
    processConfig: WorkspaceProcessSurfaceConfig;
    /**
     * Configured Workspace actions (`surface=workspace` + shared `right_rail`) resolved for the
     * persistent command rail — registered symmetric to the Work Unit rail. Empty until resolved
     * (or when none are configured).
     */
    rightRailActions: ResolvedActionForClient[];
    /**
     * Workspace scope HINT for BOS (intake spec + process-effective slash catalog) — the first
     * configured process's department. Null when no process is configured.
     */
    defaultDepartmentId: string | null;
    /**
     * Department ASSERTED when creating a record from the workspace. Null unless the org has
     * exactly one process — "first by sort order" is not operator intent — in which case the
     * server resolves the create-lead entry department from configuration.
     */
    createLeadDepartmentId: string | null;
    ready: boolean;
};

/** WU.SURFACE — resolved model for the Work Unit surface. */
/**
 * Canonical Work Unit readiness (Trust Closure, atomic reveal). The surface reveals as ONE
 * coherent composition — header, work-view pills, counts, and the primary queue rows together —
 * never region-by-region. `coldCompositionReady` is the gate the render mode uses; it includes the
 * primary queue settling so cold entry holds one skeleton until rows are present, while a seeded
 * return is ready on first render. `retainedCompositionReady` marks that this mount opened from a
 * cached composition (no loading boundary should ever show for it).
 */
export type WorkUnitReadiness = {
    /** Identity resolved — the stable shell frame can render. */
    shellReady: boolean;
    /** This mount opened from a cached config + rows composition (return navigation). */
    retainedCompositionReady: boolean;
    /** Config + header + primary queue all established — the atomic above-fold reveal gate. */
    coldCompositionReady: boolean;
    /** Primary composition ready AND the action rail settled — fully interactive. */
    interactionReady: boolean;
};

export type WorkUnitSurfaceModel = {
    /** Configurable header (title, subtitle, KPIs) from published Work Unit Header surface. */
    header: WorkspaceHeaderPresentationModel;
    workViews: WorkViewLinkModel[];
    queue: {
        rows: QueueRowModel[];
        totalCount: number | null;
        loading: boolean;
        error: string | null;
        /**
         * WHAT KIND of failure `error` describes, when it came from a provisioning terminal.
         *
         * Added because no renderer read the provisioning `code`, so an invalid tenant CONFIGURATION and
         * a missing RECORD rendered identically — an operator could not tell "someone has to fix this
         * Work View" from "nothing is here". Optional by design: a transport/client error string carries
         * no provisioning code, and honestly has no kind.
         */
        errorKind?: "authorization" | "configuration" | "subject" | "records";
        /**
         * Published Queue Row surface config mapped onto the COMPACT row anatomy's fixed
         * slots (visibility + label overrides). Server owns row order/membership/filtering;
         * this only tunes per-slot placement of the compact card. Generic-context fallback
         * (all slots visible, no overrides) when the surface is unpublished / fetch failed.
         */
        rowConfig: CompactRowSlots;
        /**
         * Config-consumption provenance (P2-V) — surfaced to the DOM so the rendered queue's source is
         * verifiable in the browser: which published surface drove the slots, its resolver source, and
         * the compact variant. Never a render gate — evidence only.
         */
        provenance?: {
            /** `published` = a published Queue Row Surface drove the slots; `canonical_fallback` = the default. */
            source: "published" | "canonical_fallback";
            /** The resolved queue-row surface id (`queue-row-{dept}-{proc}` or a legacy id). */
            surfaceId: string | null;
            /** Richer resolver source (`published` | resolver source | `builtin_default`). */
            resolvedSource: string | null;
            /** The compact row anatomy variant. */
            variant: string;
            /** Non-compact-effective published keys — explicit diagnostic for older invalid configs. */
            ineffectiveFieldKeys?: readonly string[];
        };
    };
    activeWorkViewId: string | null;
    /**
     * The currently selected Focus Panel record (opportunity) id — `drawer.id` from the
     * global drawer store when an opportunity subject is selected, else null. Queue rows
     * use it to render the persistent selected rail.
     */
    selectedRecordId: string | null;
    /**
     * How the surface resolved its DEFAULT operational subject for the current rows/route/retained
     * selection (url → retained → strategy → first_row → empty), computed synchronously as part of
     * the committed model. Invariant: when `queue.rows` is non-empty, `selectedSubject.selectedRecordId`
     * is non-null — a populated Work View never commits with no subject. `selectedRecordId` above is
     * the LIVE drawer selection (operator interaction), falling back to this resolution.
     */
    selectedSubject: WorkUnitSelectedSubject;
    /**
     * Configured Right Rail actions resolved for this work unit (`surface=work_unit,right_rail`),
     * flattened to the client action shape. Empty until the lane resolves (or when none are
     * configured) — RR.SURFACE stays a zero-footprint anchor while empty, then reveals. Rendered +
     * executed through the existing action runtime; the runtime never invents or hardcodes actions.
     */
    rightRailActions: ResolvedActionForClient[];
    /**
     * Work-unit scope for the resolved actions — baked so the action controls execute with the
     * right context even when registered into the shell-level command rail (which sits ABOVE the
     * work-unit route context and cannot read it).
     */
    departmentId: string | null;
    workUnitId: string | null;
    /**
     * Legacy single-boolean readiness — equals `readiness.coldCompositionReady`. Retained so the
     * render mode and existing consumers keep one gate; prefer `readiness` for the full contract.
     */
    ready: boolean;
    /** Canonical atomic-reveal readiness (Trust Closure). */
    readiness: WorkUnitReadiness;
};

/** Work Unit surface intents — the only mutations presentation components may express. */
export type WorkUnitSurfaceIntents = {
    /** In-page Work View selection (doctrine: no query-string routing for view selection). */
    selectWorkView: (workViewId: string) => void;
    /**
     * Warm a Work View's target route on hover/focus intent — the same route `selectWorkView`
     * will push — so switching views lands on a resolved host (no cold shell for cross-host
     * views). No-op for the active view and unresolvable views. Fire-and-forget, deduped.
     */
    prefetchWorkView: (workViewId: string) => void;
    /** Open the Focus Panel for a queue row (in-page `openDrawer`). */
    openRecord: (row: QueueRowModel) => void;
    /**
     * Warm a queue row's Focus Panel record VM on hover/focus intent — the same id + context
     * `openRecord` will use — so the inline Focus Panel resolves instantly on click. Hover-safe
     * (bootstrap + primary only, no full-hydrate), fire-and-forget, deduped. No-op for non-
     * opportunity rows and while the work-unit scope is unresolved.
     */
    prefetchRecord: (row: QueueRowModel) => void;
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
    // Route to the canonical Work Unit runtime (Work View pills / search / filter / queue + Focus
    // Panel shells all render there) and carry the drill's semantic filter through QUERY STATE —
    // never a slug that silently drops it. The runtime reads status_keys / attention_reason_code.
    const base = operatorWorkUnitHrefFromKey(contract.workUnitKey);
    const query = new URLSearchParams();
    if (contract.statusKeys && contract.statusKeys.length > 0) {
        query.set("status_keys", contract.statusKeys.join(","));
    }
    if (contract.attentionReasonCode) {
        query.set("attention_reason_code", contract.attentionReasonCode);
    }
    const qs = query.toString();
    return qs ? `${base}?${qs}` : base;
}

/**
 * Map warm-cache resolved metrics to answer models, preserving `keys` order. Keys without
 * a resolved value — missing, empty, or the no-data em dash ("—") — are omitted: the
 * answers strip shows real values, never rows of placeholders. Real zeros ("0") are data
 * and stay.
 */
export function operationalAnswerModelsFromResolvedMetrics(
    keys: readonly OipMetricKey[],
    resolved: ResolvedMetricMap,
): OperationalAnswerModel[] {
    const out: OperationalAnswerModel[] = [];
    for (const key of keys) {
        const item = resolved[key];
        const formattedValue =
            typeof item?.formatted_value === "string" ? item.formatted_value.trim() : "";
        if (!formattedValue || formattedValue === "—") continue;
        out.push({
            key,
            label: item?.label ?? key,
            formattedValue,
            href: drillHrefForMetricKey(key),
        });
    }
    return out;
}

/**
 * Workspace tile work-view link from a landing card nav entry (carries its own slug href).
 * `count` is the view's canonical-location total (`useWorkViewTotals`) — null renders no badge.
 */
export function workViewLinkFromWorkQueuePreview(
    entry: OperatorLifecycleWorkQueuePreview,
    count: number | null = null,
    icon: ProcessCardIcon | null = null,
): WorkViewLinkModel {
    const primaryKind = entry.primary_grain_kind ?? null;
    const supportingKind = entry.supporting_grain_kind ?? null;
    const primaryCount = entry.primary_grain_count;
    const supportingCount = entry.supporting_grain_count;
    return {
        id: entry.platformKey,
        label: entry.label,
        description: entry.description?.trim() || null,
        isActive: false,
        count,
        href: entry.href,
        icon,
        attentionCount: entry.attention_count ?? null,
        overdueCount: entry.overdue_count ?? null,
        primaryGrainCount: primaryCount ?? null,
        supportingGrainCount: supportingCount ?? null,
        primaryGrainKind: primaryKind,
        supportingGrainKind: supportingKind,
        primaryGrainLabel:
            primaryKind != null && typeof primaryCount === "number"
                ? grainCountUnitLabel(primaryKind, primaryCount)
                : null,
        supportingGrainLabel:
            supportingKind != null && typeof supportingCount === "number"
                ? grainCountUnitLabel(supportingKind, supportingCount)
                : null,
        // Server-resolved canonical identity (host Work Unit + this Work View), stamped so the entry
        // gesture carries it into K1 — the runtime never re-derives identity from the slug.
        destination:
            entry.host_work_unit_id && entry.work_view_id
                ? nodeDestinationId(entry.host_work_unit_id, entry.work_view_id)
                : null,
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
            // Work Unit pills show no per-view operational indicators (Workspace-tile only).
            attentionCount: null,
            overdueCount: null,
            primaryGrainCount: null,
            supportingGrainCount: null,
            primaryGrainKind: null,
            supportingGrainKind: null,
            primaryGrainLabel: null,
            supportingGrainLabel: null,
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

/**
 * Workspace process tile from an operator lifecycle landing card (values pre-resolved).
 * `countForWorkView` resolves each work-view row's count from the view's canonical
 * location totals — the SAME source the Work Unit pill counts read, so tile and pill
 * numbers agree for the same view. Absent/null → no badge.
 */
export function processTileModelFromLandingCard(
    card: OperatorLifecycleLandingCard,
    args?: {
        countForWorkView?: (entry: OperatorLifecycleWorkQueuePreview) => number | null;
        /** Configured Work View row glyph resolver (Surface Builder). Absent → fallback glyph. */
        iconForWorkView?: (entry: OperatorLifecycleWorkQueuePreview) => ProcessCardIcon | null;
        /** The resolved Primary Signal for this process (null when unconfigured/unresolved). */
        primarySignal?: PrimarySignalModel | null;
        /** The resolved supporting signal (second calculation), null when unconfigured. */
        supportingSignal?: PrimarySignalModel | null;
    },
): ProcessTileModel {
    const workViews = card.workQueues.map((entry) =>
        workViewLinkFromWorkQueuePreview(
            entry,
            args?.countForWorkView?.(entry) ?? null,
            args?.iconForWorkView?.(entry) ?? null,
        ),
    );
    return {
        id: card.id,
        processKey: card.processKey,
        label: card.label,
        description: card.description,
        entryHref: card.entryHref,
        // The tile CTA enters the process's DEFAULT Work View — the first configured view, the same
        // one the bare entry slug resolves to server-side. Carry its canonical destination so the CTA
        // and its default-view row can never key differently.
        destination: workViews[0]?.destination ?? null,
        activeRecordCount: card.activeRecordCount,
        needsAttentionCount: card.needsAttentionCount,
        workViews,
        primarySignal: args?.primarySignal ?? null,
        supportingSignal: args?.supportingSignal ?? null,
    };
}

/**
 * Subject display for a queue row context: single subject name; grouped rows join
 * subjects or fall back to the row count. The ONE subject-title derivation — the
 * condensed queue row and the Focus Panel open seed both render it, so the inline
 * panel's seed header can never disagree with the clicked row.
 */
export function queueRowSubjectDisplayName(context: QueueRowContext): string {
    if (context.row_presentation_mode === "grouped_subjects") {
        if (context.row_subjects?.length) {
            return context.row_subjects.map((s) => s.display_name).join(", ");
        }
        if (context.row_count != null) {
            const unit = (context.row_count_unit ?? "records").replace(/_/g, " ");
            return `${context.row_count} ${unit}`;
        }
    }
    return context.row_subject.display_name;
}

function queueRowLocationLabel(context: QueueRowContext): string | null {
    const placement = context.placement_context;
    if (!placement) return null;
    return (
        placement.location_label?.trim() ||
        placement.room_label?.trim() ||
        placement.program_label?.trim() ||
        null
    );
}

function queueRowRelatedSubjectsLine(context: QueueRowContext): string | null {
    const names = context.related_subjects_summary
        ?.filter((subject) => subject.visibility !== "hidden")
        .map((subject) => subject.display_name.trim())
        .filter(Boolean);
    if (!names?.length) return null;
    return names.join(", ");
}

function queueRowAttentionLine(context: QueueRowContext): string | null {
    const attention = context.attention_summary;
    if (!attention?.needs_attention) return null;
    return attention.primary_reason_label?.trim() || null;
}

function queueRowWorkLine(context: QueueRowContext): string | null {
    const current = context.current_work_summary;
    if (current?.label?.trim() && current.state !== "none") {
        const label = current.label.trim();
        const due = current.due_label?.trim();
        return due ? `${label} · ${due}` : label;
    }
    return context.work_summary?.primary_open_label?.trim() || null;
}

/**
 * Ephemeral Focus Panel header seed from a queue row's frozen context — owns the
 * subject identity from the click until the record payload resolves (see
 * `resolveFocusPanelSubjectReveal`). Null when the row carried no context (the panel
 * falls back to the entity-label placeholder title).
 */
export function opportunityQueuePreviewSeedFromRowContext(
    context: QueueRowContext | null,
): OpportunityDrawerQueuePreviewSeed | null {
    if (!context) return null;
    const title = queueRowSubjectDisplayName(context).trim();
    if (!title) return null;

    const primaryContact = context.primary_contact?.display_name?.trim() || null;
    const relatedSubjects = queueRowRelatedSubjectsLine(context);
    const attentionLine = queueRowAttentionLine(context);
    const workLine = queueRowWorkLine(context);

    return {
        title,
        statusLabel: context.row_status_label?.trim() || null,
        statusKey: context.row_status_key?.trim() || null,
        stageLabel: context.row_stage?.trim() || null,
        locationLabel: queueRowLocationLabel(context),
        subtitle: primaryContact || relatedSubjects || null,
        operTrustHeadline: attentionLine || workLine || null,
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
