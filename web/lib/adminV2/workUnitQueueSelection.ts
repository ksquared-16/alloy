import { WORK_UNIT_ATTENTION_BUCKET_PILL_PREFIX } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/aboveFoldTypes";
import type { WorkUnitBootstrapOwnership } from "@/lib/adminV2/workUnitBootstrapClientSession";
import { validateQueueDefinition, type QueueDefinitionV1 } from "@/lib/config/queueDefinitionSchema";
import {
    loadQueueDefinitionBundle,
    normalizeQueueDefinitionDocument,
    resolveQueueKeyFromDefinition,
    type NormalizedQueueDefinitionDocument,
    type QueueKeyResolution,
} from "@/lib/config/queueDefinitionV2Runtime";
import { getQueueUiConfig } from "@/lib/ui-v2/queueUiConfig";
import { findAllRecordsQueueKey } from "@/lib/workspace/workUnitQueueDerived";
import { appendWorkspaceSiteToPath } from "@/lib/adminV2/workspaceSiteFilterClient";
import { workspaceDeptQueueNavHref } from "@/lib/adminV2/navigation/buildWorkspaceNavDeptChildren";
import {
    parseLifecyclePlatformNavChipKey,
    parseLifecycleWorkUnitNavChipKey,
} from "@/lib/lifecycle/lifecycleWorkUnitShellPills";
import { resolveActiveWorkViewRuntimeContext } from "@/lib/lifecycle/resolveWorkViewRuntimeContext";

export type WorkUnitQueueSelectionSource =
    | "dept_queue"
    | "dept_needs_attention"
    | "work_unit_pill"
    | "default";

/** Canonical work-unit queue filter — route-owned when source is dept_* or encoded in URL. */
export type WorkUnitQueueSelection = {
    workUnitId: string;
    queueKey: string;
    source: WorkUnitQueueSelectionSource;
    /** Process Work View id from `?work_view=` — resolved to compat queue at fetch time. */
    workViewId?: string;
    attentionBucketKey?: string;
    statusKey?: string;
    label?: string;
};

export type WorkUnitQueueLocationParams = {
    queue: string;
    workViewId: string;
    queueLayoutId: string;
    focusLayoutId: string;
    unmapped: boolean;
    attentionBucket: string;
    statusKeys: string;
    attentionReason: string;
    attentionReasonCode: string;
    activitySignalKey: string;
};

export function readWorkUnitQueueLocationParams(): WorkUnitQueueLocationParams {
    if (typeof window === "undefined") {
        return emptyWorkUnitQueueLocationParams();
    }
    try {
        const sp = new URLSearchParams(window.location.search);
        const bucket =
            (sp.get("attention_bucket") ?? sp.get("bucket") ?? "").trim();
        return {
            queue: sp.get("queue")?.trim() ?? "",
            workViewId: sp.get("work_view")?.trim() ?? "",
            queueLayoutId: sp.get("queue_layout")?.trim() ?? "",
            focusLayoutId: sp.get("focus_layout")?.trim() ?? "",
            unmapped: sp.get("unmapped")?.trim() === "1",
            attentionBucket: bucket,
            statusKeys: (sp.get("status_keys") ?? "").trim(),
            attentionReason: (sp.get("attention_reason") ?? "").trim(),
            attentionReasonCode: (sp.get("attention_reason_code") ?? "").trim(),
            activitySignalKey: (sp.get("activity_signal_key") ?? "").trim(),
        };
    } catch {
        return emptyWorkUnitQueueLocationParams();
    }
}

function emptyWorkUnitQueueLocationParams(): WorkUnitQueueLocationParams {
    return {
        queue: "",
        workViewId: "",
        queueLayoutId: "",
        focusLayoutId: "",
        unmapped: false,
        attentionBucket: "",
        statusKeys: "",
        attentionReason: "",
        attentionReasonCode: "",
        activitySignalKey: "",
    };
}

export function workUnitQueueSelectionFromLocation(
    workUnitId: string,
    loc: WorkUnitQueueLocationParams
): WorkUnitQueueSelection | null {
    const wuId = workUnitId.trim();
    const queueKey = loc.queue.trim();
    const workViewId = loc.workViewId.trim();
    if (!wuId) return null;
    if (!queueKey && !workViewId) return null;

    const attentionBucketKey = loc.attentionBucket.trim() || undefined;
    const statusKey = loc.statusKeys.trim() || undefined;
    const laneQueueKey = queueKey || "";
    const isNeedsAttention = laneQueueKey.toLowerCase() === "needs_attention";
    const source: WorkUnitQueueSelectionSource =
        isNeedsAttention && attentionBucketKey ? "dept_needs_attention" : "dept_queue";

    return {
        workUnitId: wuId,
        queueKey: laneQueueKey,
        source,
        ...(workViewId ? { workViewId } : {}),
        ...(attentionBucketKey ? { attentionBucketKey } : {}),
        ...(statusKey ? { statusKey } : {}),
    };
}

/** True when URL encodes an explicit queue (not empty / default-only navigation). */
export function isExplicitWorkUnitQueueSelection(
    selection: WorkUnitQueueSelection | null | undefined
): boolean {
    if (!selection) return false;
    if (selection.workViewId?.trim()) return true;
    if (!selection.queueKey?.trim()) return false;
    return selection.source !== "default";
}

/** Resolve fetch/bootstrap queue key — Work View compat lane wins over bare work_view id. */
export function resolveWorkUnitQueueKeyFromLocation(
    departmentMetadata: unknown | null | undefined,
    loc: Pick<WorkUnitQueueLocationParams, "queue" | "workViewId">,
    routeQueueKey?: string | null,
): string {
    const direct = loc.queue.trim() || routeQueueKey?.trim() || "";
    if (direct) return direct;
    if (loc.workViewId.trim() && departmentMetadata) {
        return (
            resolveActiveWorkViewRuntimeContext({
                departmentMetadata,
                workViewId: loc.workViewId,
            }).queueKey ?? ""
        );
    }
    return "";
}

export function workUnitQueueSelectionToSearchParams(
    selection: Pick<
        WorkUnitQueueSelection,
        "queueKey" | "attentionBucketKey" | "statusKey"
    >
): URLSearchParams {
    const qs = new URLSearchParams();
    const q = selection.queueKey.trim();
    if (q) qs.set("queue", q);
    const bucket = selection.attentionBucketKey?.trim();
    if (bucket) qs.set("attention_bucket", bucket);
    const status = selection.statusKey?.trim();
    if (status) qs.set("status_keys", status);
    return qs;
}

export function buildWorkUnitQueueSelectionHref(
    workspaceBase: string,
    departmentId: string,
    selection: WorkUnitQueueSelection,
    selectedSiteId?: string | null
): string {
    const basePath = workspaceBase.replace(/\/$/, "");
    let href = workspaceDeptQueueNavHref(
        basePath,
        departmentId,
        selection.workUnitId,
        selection.queueKey
    );
    const bucket = selection.attentionBucketKey?.trim();
    const status = selection.statusKey?.trim();
    if (bucket || status) {
        const u = new URL(href, "https://alloy.local");
        if (bucket) u.searchParams.set("attention_bucket", bucket);
        if (status) u.searchParams.set("status_keys", status);
        href = `${u.pathname}${u.search}`;
    }
    return appendWorkspaceSiteToPath(href, selectedSiteId ?? null);
}

/** API queue route key (never synthetic pill keys). Resolves v2 aliases to canonical lane keys. */
export function workUnitQueueSelectionFetchQueueKey(
    selection: Pick<WorkUnitQueueSelection, "queueKey">,
    wu?: { queue_definition?: unknown } | null
): string {
    const q = selection.queueKey.trim();
    if (!q || q.toLowerCase() === "needs_attention") return q;
    if (wu?.queue_definition) return resolveWorkUnitQueueCanonicalKey(wu, q);
    return q;
}

export type WorkUnitQueueSummaryCountPatch = {
    key: string;
    label: string;
    description?: string;
    priority: "standard" | "attention" | "critical";
    count: number;
    counts_deferred?: boolean;
    entity_type?: string;
    display?: string;
    preview?: unknown[];
};

/** True when two pill/queue keys refer to the same work-unit lane (exact or v2 alias). */
export function workUnitQueuePillKeysEquivalent(
    wu: { queue_definition?: unknown } | null | undefined,
    a: string | null | undefined,
    b: string | null | undefined
): boolean {
    const left = (a ?? "").trim();
    const right = (b ?? "").trim();
    if (!left || !right) return false;
    if (left === right) return true;
    if (!wu?.queue_definition) return false;
    return resolveWorkUnitQueueCanonicalKey(wu, left) === resolveWorkUnitQueueCanonicalKey(wu, right);
}

/** Whether a header chip pill should render as selected (dept URL, WU pill, or legacy needs_attention + bucket). */
export function workUnitQueuePillKeySelected(
    selectedPillKey: string | null,
    chipPillKey: string,
    attentionBucketKey: string,
    wu?: { queue_definition?: unknown } | null
): boolean {
    const selected = (selectedPillKey ?? "").trim();
    const chip = chipPillKey.trim();
    if (!selected || !chip) return false;

    if (chip.startsWith(WORK_UNIT_ATTENTION_BUCKET_PILL_PREFIX)) {
        const chipBucket = chip.slice(WORK_UNIT_ATTENTION_BUCKET_PILL_PREFIX.length);
        if (selected.startsWith(WORK_UNIT_ATTENTION_BUCKET_PILL_PREFIX)) {
            return selected === chip;
        }
        if (selected.toLowerCase() !== "needs_attention") return false;
        if (chipBucket === "__all__") return !attentionBucketKey.trim();
        return attentionBucketKey.trim() === chipBucket;
    }

    if (selected.startsWith(WORK_UNIT_ATTENTION_BUCKET_PILL_PREFIX)) {
        return false;
    }

    if (workUnitQueuePillKeysEquivalent(wu, selected, chip)) return true;
    return selected === chip;
}

/** Resolve alias / legacy pill keys to canonical queue_definition queue key for fetch + count parity. */
export function resolveWorkUnitQueueCanonicalKey(
    wu: { queue_definition?: unknown },
    pillOrQueueKey: string
): string {
    const pill = pillOrQueueKey.trim();
    if (!pill) return pill;
    const resolution = resolveWorkUnitQueueKey(wu, pill);
    if (resolution.queue && resolution.resolvedKey.trim()) {
        return resolution.resolvedKey.trim();
    }
    return pill;
}

export function findQueueSummaryForSelection<T extends { key: string }>(
    summaries: T[] | null | undefined,
    wu: { queue_definition?: unknown } | null | undefined,
    selectedQueueKey: string | null | undefined
): T | undefined {
    if (!summaries?.length) return undefined;
    const selected = (selectedQueueKey ?? "").trim();
    if (!selected) return summaries[0];
    const exact = summaries.find((q) => q.key === selected);
    if (exact) return exact;
    if (!wu?.queue_definition) return summaries[0];
    const canonical = resolveWorkUnitQueueCanonicalKey(wu, selected);
    if (canonical) {
        const byCanonical = summaries.find((q) => q.key === canonical);
        if (byCanonical) return byCanonical;
    }
    return summaries[0];
}

/** Resolve API queue key + attention bucket from pill strip key. */
export function resolveWorkUnitFetchQueueKeyFromPill(
    pillOrQueueKey: string,
    attentionBucketKey: string,
    wu?: { queue_definition?: unknown }
): { queueKey: string; attentionBucketOverride?: string } {
    const pill = pillOrQueueKey.trim();
    if (parseLifecycleWorkUnitNavChipKey(pill)) {
        return { queueKey: "" };
    }
    if (parseLifecyclePlatformNavChipKey(pill)) {
        return { queueKey: "" };
    }
    if (pill.startsWith(WORK_UNIT_ATTENTION_BUCKET_PILL_PREFIX)) {
        const raw = pill.slice(WORK_UNIT_ATTENTION_BUCKET_PILL_PREFIX.length);
        if (raw === "__all__") {
            return { queueKey: "needs_attention", attentionBucketOverride: "" };
        }
        return { queueKey: "needs_attention", attentionBucketOverride: raw };
    }
    if (pill.toLowerCase() === "needs_attention") {
        const bucket = attentionBucketKey.trim();
        return bucket
            ? { queueKey: "needs_attention", attentionBucketOverride: bucket }
            : { queueKey: "needs_attention" };
    }
    const canonical = wu?.queue_definition ? resolveWorkUnitQueueCanonicalKey(wu, pill) : pill;
    return { queueKey: canonical };
}

/** Merge partial summary counts into existing pills without reordering or clearing deferred stubs. */
export function mergeWorkUnitQueueSummaryCounts<T extends WorkUnitQueueSummaryCountPatch>(
    existing: T[],
    incoming: T[]
): T[] {
    if (!incoming.length) return existing;
    const patchByKey = new Map(incoming.map((q) => [q.key, q]));
    return existing.map((q) => {
        const patch = patchByKey.get(q.key);
        if (!patch) return q;
        return {
            ...q,
            count: patch.count,
            counts_deferred: false,
            ...(patch.label ? { label: patch.label } : {}),
            ...(patch.description !== undefined ? { description: patch.description } : {}),
        };
    });
}

/** Active pill key in WU header chip strip (synthetic keys for NA buckets). */
export function workUnitActivePillKeyFromSelection(selection: WorkUnitQueueSelection): string {
    const q = selection.queueKey.trim();
    const bucket = selection.attentionBucketKey?.trim();
    if (q.toLowerCase() === "needs_attention" && bucket) {
        return `${WORK_UNIT_ATTENTION_BUCKET_PILL_PREFIX}${bucket}`;
    }
    return q;
}

/** Build selection when operator changes WU header pills. */
export function workUnitQueueSelectionFromPillKey(
    workUnitId: string,
    pillKey: string
): WorkUnitQueueSelection {
    const wuId = workUnitId.trim();
    const pill = pillKey.trim();
    if (pill.startsWith(WORK_UNIT_ATTENTION_BUCKET_PILL_PREFIX)) {
        const raw = pill.slice(WORK_UNIT_ATTENTION_BUCKET_PILL_PREFIX.length);
        const bucket = raw === "__all__" ? "" : raw;
        return {
            workUnitId: wuId,
            queueKey: "needs_attention",
            source: "work_unit_pill",
            ...(bucket ? { attentionBucketKey: bucket } : {}),
        };
    }
    return {
        workUnitId: wuId,
        queueKey: pill,
        source: "work_unit_pill",
    };
}

export function workUnitQueueSelectionCacheSignature(
    selection: WorkUnitQueueSelection | null | undefined
): string {
    if (!selection) return "";
    return [
        selection.workUnitId,
        selection.queueKey,
        selection.attentionBucketKey ?? "",
        selection.statusKey ?? "",
    ].join("|");
}

export function workUnitBootstrapOwnershipFromSelection(
    departmentId: string,
    selectedSiteId: string | null,
    selection: WorkUnitQueueSelection | null,
    workUnitIdFallback?: string
): WorkUnitBootstrapOwnership {
    return {
        departmentId,
        workUnitId: selection?.workUnitId.trim() || workUnitIdFallback?.trim() || "",
        selectedSiteId,
        focusQueue: selection?.queueKey.trim() || null,
        attentionBucket: selection?.attentionBucketKey?.trim() || null,
    };
}

export function queueKeyDefinedOnWorkUnit(
    wu: { queue_definition?: unknown },
    queueKey: string
): boolean {
    const q = queueKey.trim();
    if (!q || !wu.queue_definition) return Boolean(q);
    try {
        const normalized = normalizeQueueDefinitionDocument(wu.queue_definition);
        if (normalized) {
            const resolution = resolveQueueKeyFromDefinition(q, normalized.queues);
            if (resolution.queue) return true;
        }
        const def = validateQueueDefinition(wu.queue_definition);
        return def.queues.some((row) => row.key === q);
    } catch {
        return Boolean(q);
    }
}

export type WorkUnitQueueKeyResolution = QueueKeyResolution;

/** Resolve legacy/alias queue keys against work unit config (exact → alias → fallback). */
export function resolveWorkUnitQueueKey(
    wu: { queue_definition?: unknown },
    requestedQueueKey: string
): WorkUnitQueueKeyResolution {
    const requestedKey = requestedQueueKey.trim();
    if (!requestedKey) {
        return { requestedKey: "", resolvedKey: "", matchedBy: "fallback", queue: null };
    }
    const normalized = wu.queue_definition ? normalizeQueueDefinitionDocument(wu.queue_definition) : null;
    if (normalized) {
        return resolveQueueKeyFromDefinition(requestedKey, normalized.queues);
    }
    return { requestedKey, resolvedKey: requestedKey, matchedBy: "fallback", queue: null };
}

/**
 * Authoritative queue for bootstrap / row fetch.
 * Explicit URL/selection queue wins when defined on work unit — even if missing from priority summaries.
 */
export function resolveAuthoritativeWorkUnitQueueKey(
    wu: { queue_definition?: unknown },
    summaries: Array<{ key: string }> | null,
    explicitQueueKey: string
): string | null {
    const qTrim = explicitQueueKey.trim();
    if (qTrim && queueKeyDefinedOnWorkUnit(wu, qTrim)) {
        return resolveWorkUnitQueueCanonicalKey(wu, qTrim);
    }
    if (qTrim && summaries?.some((x) => x.key === qTrim)) {
        return qTrim;
    }
    if (!summaries?.length) {
        return qTrim || null;
    }
    let allKeyFromDef: string | null = null;
    try {
        const defBoot = validateQueueDefinition(wu.queue_definition) as QueueDefinitionV1;
        const uiBoot = getQueueUiConfig(defBoot);
        allKeyFromDef = findAllRecordsQueueKey(defBoot, uiBoot);
    } catch {
        allKeyFromDef = null;
    }
    const uiOrder = (() => {
        try {
            const def = validateQueueDefinition(wu.queue_definition) as QueueDefinitionV1;
            const ui = getQueueUiConfig(def);
            return ui.sections.flatMap((s) => s.queue_keys);
        } catch {
            return summaries.map((x) => x.key);
        }
    })();
    const firstByUi = uiOrder.find((k) => summaries.some((x) => x.key === k)) ?? summaries[0]?.key ?? null;
    if (allKeyFromDef && summaries.some((x) => x.key === allKeyFromDef)) return allKeyFromDef;
    return firstByUi;
}
