/**
 * Enrollment-only Operational Surface data for Workspace processNavTile cover page.
 */

import { operatorWorkUnitHrefFromKey } from "@/lib/admin/canonicalOperatorRoutes";
import { parseOperatorWorkUnitEntryHref } from "@/lib/admin/operatorWorkUnitEntryWarm";
import type {
    OperatorLifecycleLandingCard,
    OperatorLifecycleWorkUnitRow,
} from "@/lib/admin/buildOperatorLifecycleLanding";
import { buildOperationalViewPreviewRuntimeHref } from "@/lib/adminV2/runtime/perspective/mergeOperationalViewMetadata";
import { resolveOperationalViewsForWorkUnit } from "@/lib/adminV2/runtime/perspective/resolveStageOperationalViews";
import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { LifecycleWorkUnitSummaryRow } from "@/lib/admin/resolveOperatorLifecycleLandingRollups";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";
import { slugifyWorkViewId } from "@/lib/lifecycle/workViewsConfigV1";
import {
    computeOperationalProjection,
    type OperationalProjectionRow,
} from "@/lib/lifecycle/operationalProjection";
import { resolveProcessWorkViews } from "@/lib/lifecycle/workViewsCompatibility";
import { pickDeptPipelineWorkUnit } from "@/lib/workspace/pickDeptPipelineWorkUnit";
import {
    workUnitKeyToRouteSlug,
    workUnitRouteSlugsEquivalent,
} from "@/lib/admin/workUnitRouteSlug";

export type OperationalSurfaceHealthTone = "healthy" | "warning" | "critical" | "neutral";

export type OperationalSurfaceStory = {
    headline: string;
    body?: string;
    healthLabel: string;
    healthTone: OperationalSurfaceHealthTone;
};

export type OperationalSurfaceWorkLineData = {
    id: string;
    label: string;
    count: number;
    workViewId: string;
    href: string;
    ariaLabel?: string;
};

export type EnrollmentOperationalSurfaceFields = {
    operationalStory: OperationalSurfaceStory;
    todaysWork: OperationalSurfaceWorkLineData[];
};

const ENROLLMENT_PROCESS_KEYS = new Set([
    "lead_management",
    "enrollment",
    "enrollments",
    "lead",
    "leads",
]);

const ENROLLMENT_ENTRY_HREF_MARKERS = ["enrollment", "new-leads", "new_leads", "lead"];

type WorkUnitPick = {
    id: string | null;
    key: string;
    queueDefinition: unknown;
};

/** Resolve the configured business process for a landing card. */
function resolveLifecycleProcessForCard(
    departmentMetadata: unknown,
    processKey: string,
): LifecycleBuilderProcessRecord | null {
    const builder = lifecycleBuilderFromDepartmentMetadata(departmentMetadata);
    const normalizedKey = processKey.trim().toLowerCase();
    const byKey = builder.processes.find(
        (process) =>
            process.is_active
            && (process.key.trim().toLowerCase() === normalizedKey
                || process.id.trim() === processKey.trim()),
    );
    return byKey ?? activeLifecycleProcess(builder);
}

const DEFAULT_STORY_BODY =
    "Let's keep conversations moving and help families reach enrollment.";

/** Explicit enrollment lifecycle detection — safe for render gating. */
export function isEnrollmentLifecycleCard(
    card: Pick<OperatorLifecycleLandingCard, "processKey" | "label" | "entryHref">,
): boolean {
    const processKey = card.processKey.trim().toLowerCase();
    if (ENROLLMENT_PROCESS_KEYS.has(processKey)) return true;
    if (processKey.includes("enroll") || processKey.includes("lead")) return true;

    const label = card.label.trim().toLowerCase();
    if (label.includes("enrollment") || label.includes("lead")) return true;

    const entry = card.entryHref.trim().toLowerCase();
    return ENROLLMENT_ENTRY_HREF_MARKERS.some((marker) => entry.includes(marker));
}

/** @deprecated Use isEnrollmentLifecycleCard */
export const isEnrollmentOperationalSurfaceProcess = isEnrollmentLifecycleCard;

export function enrollmentOperationalSurfaceNeedsHydration(
    cards: readonly OperatorLifecycleLandingCard[],
): boolean {
    return cards.some(
        (card) => isEnrollmentLifecycleCard(card) && !card.operationalStory?.headline?.trim(),
    );
}

function resolveHealthTone(
    needsAttentionCount: number | null,
): { healthLabel: string; healthTone: OperationalSurfaceHealthTone } {
    if (needsAttentionCount != null && needsAttentionCount > 0) {
        return { healthLabel: "Needs Attention", healthTone: "warning" };
    }
    return { healthLabel: "Healthy", healthTone: "healthy" };
}

function storyHeadlineFromCounts(args: {
    needsAttentionCount: number | null;
    activeRecordCount: number | null;
}): string {
    if (args.needsAttentionCount != null && args.needsAttentionCount > 0) {
        const n = args.needsAttentionCount;
        const noun = n === 1 ? "family is" : "families are";
        return `${n} ${noun} waiting for the next step.`;
    }
    if (args.activeRecordCount != null && args.activeRecordCount > 0) {
        const n = args.activeRecordCount;
        const noun = n === 1 ? "family is" : "families are";
        return `${n} ${noun} in the enrollment pipeline.`;
    }
    return "Three families are waiting for the next step.";
}

type EnrollmentWorkUnitPick = WorkUnitPick;

/** Resolve pipeline / enrollment work unit — never blocks surface render. */
export function resolveEnrollmentWorkUnitForSurface(args: {
    departmentId: string;
    entryHref: string;
    workUnits: OperatorLifecycleWorkUnitRow[];
}): EnrollmentWorkUnitPick {
    const forDept = args.workUnits.filter(
        (wu) => wu.department_id === args.departmentId && wu.is_active !== false,
    );

    const pipelinePick = pickDeptPipelineWorkUnit(forDept, args.departmentId);
    if (pipelinePick?.key?.trim()) {
        return {
            id: pipelinePick.id,
            key: pipelinePick.key.trim(),
            queueDefinition: pipelinePick.queue_definition,
        };
    }

    const enrollmentPipeline = forDept.find(
        (wu) => (wu.key ?? "").trim().toLowerCase() === "enrollment_pipeline",
    );
    if (enrollmentPipeline?.key?.trim()) {
        return {
            id: enrollmentPipeline.id,
            key: enrollmentPipeline.key.trim(),
            queueDefinition: enrollmentPipeline.queue_definition,
        };
    }

    const entrySlug = parseOperatorWorkUnitEntryHref(args.entryHref).workUnitSlug;
    if (entrySlug) {
        const matched = forDept.find((wu) =>
            workUnitRouteSlugsEquivalent(workUnitKeyToRouteSlug(wu.key ?? ""), entrySlug),
        );
        if (matched?.key?.trim()) {
            return {
                id: matched.id,
                key: matched.key.trim(),
                queueDefinition: matched.queue_definition,
            };
        }
        return {
            id: null,
            key: entrySlug.replace(/-/g, "_"),
            queueDefinition: null,
        };
    }

    const anyEnrollmentWu = forDept.find((wu) => {
        const key = (wu.key ?? "").trim().toLowerCase();
        return key.includes("enrollment") || key.includes("lead") || key.includes("pipeline");
    });
    if (anyEnrollmentWu?.key?.trim()) {
        return {
            id: anyEnrollmentWu.id,
            key: anyEnrollmentWu.key.trim(),
            queueDefinition: anyEnrollmentWu.queue_definition,
        };
    }

    return {
        id: null,
        key: "enrollment_pipeline",
        queueDefinition: null,
    };
}

function resolveQueueKeyForWorkView(args: {
    workViewId: string;
    workViewLabel: string;
    compatQueueKey?: string | null;
    operationalViews: ReturnType<typeof resolveOperationalViewsForWorkUnit>;
    card: OperatorLifecycleLandingCard;
}): string {
    const compat = args.compatQueueKey?.trim();
    if (compat) return compat;

    const normalizedId = args.workViewId.trim().toLowerCase();
    const normalizedLabel = slugifyWorkViewId(args.workViewLabel);

    const byQueueKey = args.operationalViews.find(
        (view) => view.queue_key.trim().toLowerCase() === normalizedId,
    );
    if (byQueueKey?.queue_key?.trim()) return byQueueKey.queue_key.trim();

    const byLabel = args.operationalViews.find(
        (view) => slugifyWorkViewId(view.label?.trim() || view.queue_key) === normalizedLabel,
    );
    if (byLabel?.queue_key?.trim()) return byLabel.queue_key.trim();

    const fromNav = args.card.workQueues.find(
        (entry) =>
            slugifyWorkViewId(entry.label) === normalizedId
            || entry.label.trim().toLowerCase() === args.workViewLabel.trim().toLowerCase(),
    );
    if (fromNav?.platformKey?.trim()) {
        return fromNav.platformKey.trim().replace(/-/g, "_");
    }

    return args.workViewId.trim();
}

function isPlaceholderWorkViewDraft(views: readonly WorkViewConfigV1Stored[]): boolean {
    return views.length === 1 && views[0]?.label.trim() === "New families today";
}

function workViewsFromCardWorkQueues(
    card: OperatorLifecycleLandingCard,
): WorkViewConfigV1Stored[] {
    return card.workQueues.map((entry, index) => ({
        id: slugifyWorkViewId(entry.label),
        label: entry.label,
        compat_queue_key: entry.platformKey.trim().replace(/-/g, "_"),
        display_order: index + 1,
        visible_in_runtime: true,
    }));
}

function resolveOperationalSurfaceWorkViews(args: {
    departmentMetadata: unknown;
    processKey: string;
    operationalViews: ReturnType<typeof resolveOperationalViewsForWorkUnit>;
    card: OperatorLifecycleLandingCard;
}): WorkViewConfigV1Stored[] {
    const process = resolveLifecycleProcessForCard(args.departmentMetadata, args.processKey);
    const configured = resolveProcessWorkViews({
        process,
        saved: process?.work_views_v1,
    }).filter((view) => view.visible_in_runtime !== false);

    if (configured.length > 0 && !isPlaceholderWorkViewDraft(configured)) {
        return configured;
    }

    const fromOperationalViews = [...args.operationalViews]
        .filter((view) => view.visible_in_rail !== false)
        .sort(
            (a, b) =>
                (a.display_order ?? Number.MAX_SAFE_INTEGER) - (b.display_order ?? Number.MAX_SAFE_INTEGER)
                || a.queue_key.localeCompare(b.queue_key),
        )
        .map((view, index) => ({
            id: slugifyWorkViewId(view.label?.trim() || view.queue_key),
            label: view.label?.trim() || view.queue_key,
            compat_queue_key: view.queue_key,
            display_order: view.display_order ?? index + 1,
            visible_in_runtime: true,
        }));

    if (fromOperationalViews.length > 0) {
        return fromOperationalViews;
    }

    return workViewsFromCardWorkQueues(args.card);
}

function buildWorkLinesFromConfiguredWorkViews(args: {
    card: OperatorLifecycleLandingCard;
    departmentMetadata: unknown;
    workUnit: WorkUnitPick;
    queueSummaries?: readonly LifecycleWorkUnitSummaryRow[];
    /** All-records base rows for the pipeline work unit — when present, per-view counts come from the
     *  canonical operational projection (predicate-filtered), NOT lane summaries. */
    baseRows?: ReadonlyArray<OperationalProjectionRow>;
}): OperationalSurfaceWorkLineData[] {
    const operationalViews = args.workUnit.queueDefinition ?
        resolveOperationalViewsForWorkUnit({
            departmentMetadata: args.departmentMetadata,
            queueDefinition: args.workUnit.queueDefinition,
        })
    :   [];

    const workViews = resolveOperationalSurfaceWorkViews({
        departmentMetadata: args.departmentMetadata,
        processKey: args.card.processKey,
        operationalViews,
        card: args.card,
    });

    // Canonical operational projection — per-view counts from the all-records base rows + each view's
    // predicates, via the SAME evaluator as the queue rows. Computed over the SAME `workViews` used for
    // the work lines, so count keys align by id. Falls back to lane summaries only when base rows are
    // unavailable (e.g. server first-paint before the client hydrates them).
    const projection =
        args.baseRows ?
            computeOperationalProjection({ baseRows: args.baseRows, workViews, includeRows: false })
        :   null;

    return workViews.map((view) => {
        const workViewId = view.id.trim();
        const label = view.label.trim();
        const queueKey = resolveQueueKeyForWorkView({
            workViewId,
            workViewLabel: label,
            compatQueueKey: view.compat_queue_key,
            operationalViews,
            card: args.card,
        });
        const href = resolveWorkViewHref({
            departmentId: args.card.departmentId,
            workUnit: args.workUnit,
            workViewId,
            queueKey,
            entryHref: args.card.entryHref,
        });
        const projectionCount = projection?.byViewId[workViewId]?.count;
        const count =
            projectionCount ??
            (args.queueSummaries ?
                queueCountFromSummaries(args.queueSummaries, args.workUnit.id, [queueKey])
            :   null);

        return {
            id: workViewId,
            label,
            count: count ?? 0,
            workViewId,
            href,
            ariaLabel: `Enter ${label} work view`,
        };
    });
}

export function buildCanonicalOperationalWorkViewHref(params: {
    workUnitPlatformKey: string;
    workViewId: string;
    queueKey?: string | null;
}): string {
    const base = operatorWorkUnitHrefFromKey(params.workUnitPlatformKey);
    const sp = new URLSearchParams();
    sp.set("work_view", params.workViewId.trim());
    const queueKey = params.queueKey?.trim();
    if (queueKey) sp.set("queue", queueKey);
    return `${base}?${sp.toString()}`;
}

function resolveWorkViewHref(args: {
    departmentId: string;
    workUnit: EnrollmentWorkUnitPick;
    workViewId: string;
    queueKey: string;
    entryHref: string;
}): string {
    void args.entryHref;
    // Canonical operator route (Phase 2 route canonicalization): always emit the routable slug
    // surface `/workspace/work-unit/:slug?work_view=…&queue=…`. The previous dept/uuid preview href,
    // once run through `normalizeOperatorPathname`, became `/workspace/dept/…` — a shape that has NO
    // `next.config` rewrite and 404s, then forces a retry on the compat route (duplicate RSC loads).
    if (args.workUnit.key?.trim()) {
        return buildCanonicalOperationalWorkViewHref({
            workUnitPlatformKey: args.workUnit.key,
            workViewId: args.workViewId,
            queueKey: args.queueKey,
        });
    }

    // No platform key to build a slug — fall back to the routable compat dept route under
    // `/admin/workspace` (served by the `/admin/:path*` rewrite). Never normalize to `/workspace/dept/…`.
    if (args.workUnit.id) {
        const fromPreview =
            buildOperationalViewPreviewRuntimeHref({
                departmentId: args.departmentId,
                workUnitId: args.workUnit.id,
                workViewId: args.workViewId,
                queueKey: args.queueKey,
            }) ?? null;
        if (fromPreview) {
            return fromPreview.replace(/^\/adminV2\//, "/admin/");
        }
    }

    return buildCanonicalOperationalWorkViewHref({
        workUnitPlatformKey: args.workUnit.key,
        workViewId: args.workViewId,
        queueKey: args.queueKey,
    });
}

function queueCountFromSummaries(
    summaries: readonly LifecycleWorkUnitSummaryRow[],
    pipelineWorkUnitId: string | null,
    queueKeys: readonly string[],
): number | null {
    if (!pipelineWorkUnitId) return null;
    const pipelineRow = summaries.find((row) => row.id === pipelineWorkUnitId && !row.error);
    if (!pipelineRow?.queues?.length) return null;

    let total = 0;
    let found = false;
    for (const key of queueKeys) {
        const normalized = key.trim().toLowerCase();
        const match = pipelineRow.queues.find((q) => (q.key ?? "").trim().toLowerCase() === normalized);
        if (!match || match.counts_deferred === true || typeof match.count !== "number") continue;
        total += Math.max(0, Math.floor(match.count));
        found = true;
    }
    return found ? total : null;
}

/** Always returns fields for enrollment cards — never null for enrollment. */
export function buildEnrollmentOperationalSurfaceFields(args: {
    card: OperatorLifecycleLandingCard;
    departmentMetadata?: unknown;
    workUnits?: OperatorLifecycleWorkUnitRow[];
    queueSummaries?: readonly LifecycleWorkUnitSummaryRow[];
    baseRows?: ReadonlyArray<OperationalProjectionRow>;
}): EnrollmentOperationalSurfaceFields | null {
    if (!isEnrollmentLifecycleCard(args.card)) return null;

    const workUnit = resolveEnrollmentWorkUnitForSurface({
        departmentId: args.card.departmentId,
        entryHref: args.card.entryHref,
        workUnits: args.workUnits ?? [],
    });

    const { healthLabel, healthTone } = resolveHealthTone(args.card.needsAttentionCount);

    return {
        operationalStory: {
            headline: storyHeadlineFromCounts({
                needsAttentionCount: args.card.needsAttentionCount,
                activeRecordCount: args.card.activeRecordCount,
            }),
            body: DEFAULT_STORY_BODY,
            healthLabel,
            healthTone,
        },
        todaysWork: buildWorkLinesFromConfiguredWorkViews({
            card: args.card,
            departmentMetadata: args.departmentMetadata,
            workUnit,
            queueSummaries: args.queueSummaries,
            baseRows: args.baseRows,
        }),
    };
}

export function applyEnrollmentOperationalSurfaceFields(
    card: OperatorLifecycleLandingCard,
    fields: EnrollmentOperationalSurfaceFields | null,
): OperatorLifecycleLandingCard {
    if (!fields) return card;
    return {
        ...card,
        operationalStory: fields.operationalStory,
        todaysWork: fields.todaysWork,
    };
}

/** Ensure enrollment card has surface fields — safe at render time with fallbacks. */
export function ensureEnrollmentOperationalSurfaceCard(
    card: OperatorLifecycleLandingCard,
    args?: {
        departmentMetadata?: unknown;
        workUnits?: OperatorLifecycleWorkUnitRow[];
        queueSummaries?: readonly LifecycleWorkUnitSummaryRow[];
    },
): OperatorLifecycleLandingCard {
    if (!isEnrollmentLifecycleCard(card)) return card;
    if (card.operationalStory?.headline?.trim() && (card.todaysWork?.length ?? 0) > 0) return card;
    const fields = buildEnrollmentOperationalSurfaceFields({
        card,
        departmentMetadata: args?.departmentMetadata,
        workUnits: args?.workUnits,
        queueSummaries: args?.queueSummaries,
    });
    return applyEnrollmentOperationalSurfaceFields(card, fields);
}

export function enrichEnrollmentOperationalSurfaceForDepartment(args: {
    cards: OperatorLifecycleLandingCard[];
    departmentId: string;
    departmentMetadata: unknown;
    workUnits: OperatorLifecycleWorkUnitRow[];
    queueSummaries?: readonly LifecycleWorkUnitSummaryRow[];
    /** All-records base rows for the department's pipeline work unit (canonical projection source). */
    baseRows?: ReadonlyArray<OperationalProjectionRow>;
}): OperatorLifecycleLandingCard[] {
    return args.cards.map((card) => {
        if (card.departmentId !== args.departmentId) return card;
        if (!isEnrollmentLifecycleCard(card)) return card;
        const fields = buildEnrollmentOperationalSurfaceFields({
            card,
            departmentMetadata: args.departmentMetadata,
            workUnits: args.workUnits,
            queueSummaries: args.queueSummaries,
            baseRows: args.baseRows,
        });
        return applyEnrollmentOperationalSurfaceFields(card, fields);
    });
}
