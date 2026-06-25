/**
 * Runtime Perspective compatibility layer (read/derive only).
 *
 * A "Perspective" is the runtime abstraction the Alloy OS spec asks for. Rather than
 * introduce a new table/config surface, this module DERIVES a `RuntimePerspective`
 * from data that already exists: a work unit's `work_units.queue_definition` (JSONB)
 * plus the currently active queue/lane selection. Business Processes will eventually
 * expose/edit Perspectives directly — until then this layer proves the runtime
 * connection with no schema change and no new fetch.
 *
 * Pure: no I/O, no React, no mutation of config.
 */

import {
    normalizeQueueDefinitionDocument,
    resolveQueueKeyFromDefinition,
    type NormalizedQueueEntry,
    type QueueGrain,
} from "@/lib/config/queueDefinitionV2Runtime";

export type PerspectiveGrain = QueueGrain; // "case" | "child" | "candidate"

export interface RuntimePerspective {
    key: string;
    workUnitId: string;
    label: string;
    grain: PerspectiveGrain;
    groupBy: string | null;
    sort: { field: string; direction: "asc" | "desc" }[];
    defaultFilters: unknown | null;
    defaultMission: string | null;
    emptyState: { title: string; body?: string } | null;
    source: "url" | "pill" | "bootstrap" | "default";
    attentionBucketKey?: string;
}

export interface DeriveRuntimePerspectiveParams {
    workUnitId: string;
    /** Raw `work_units.queue_definition` JSON (v1 or v2). */
    queueDefinition: unknown;
    /** Currently active lane/queue key (selectedQueueKey or URL queue). */
    activeQueueKey: string | null | undefined;
    attentionBucketKey?: string | null;
    source?: RuntimePerspective["source"];
}

function titleCaseKey(key: string): string {
    return key
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function readSort(rawEntry: unknown): { field: string; direction: "asc" | "desc" }[] {
    if (rawEntry == null || typeof rawEntry !== "object") return [];
    const sort = (rawEntry as { sort?: unknown }).sort;
    if (!Array.isArray(sort)) return [];
    const out: { field: string; direction: "asc" | "desc" }[] = [];
    for (const s of sort) {
        if (s == null || typeof s !== "object") continue;
        const field = typeof (s as { field?: unknown }).field === "string" ? (s as { field: string }).field.trim() : "";
        const direction = (s as { direction?: unknown }).direction;
        if (field && (direction === "asc" || direction === "desc")) {
            out.push({ field, direction });
        }
    }
    return out;
}

/**
 * Group-by derivation. Candidate-grain lanes (e.g. a waitlist) group by program by
 * default — this is grain-driven, not domain/vertical-specific. All other grains
 * default to no grouping until configuration expresses it.
 */
function deriveGroupBy(entry: NormalizedQueueEntry): string | null {
    if (entry.grain === "candidate") return "program";
    return null;
}

function deriveEmptyState(label: string): { title: string; body?: string } {
    return {
        title: "Nothing needs you here",
        body: `No records in ${label}.`,
    };
}

/**
 * Derive the active runtime Perspective for a work unit + active lane selection.
 * Returns null when there is no active queue/lane (State 1 with no lane resolved).
 *
 * Falls back to a minimal Perspective when the queue_definition is missing or the
 * key is unresolved but an active key exists — so the runtime works for any work
 * unit, not just those with a normalized v2 definition.
 */
export function deriveRuntimePerspective(
    params: DeriveRuntimePerspectiveParams
): RuntimePerspective | null {
    const workUnitId = params.workUnitId.trim();
    const activeKey = (params.activeQueueKey ?? "").trim();
    const attentionBucketKey = params.attentionBucketKey?.trim() || undefined;
    const source = params.source ?? "default";

    if (!workUnitId || !activeKey) return null;

    const normalized =
        params.queueDefinition != null ? normalizeQueueDefinitionDocument(params.queueDefinition) : null;

    const entry: NormalizedQueueEntry | null =
        normalized ? resolveQueueKeyFromDefinition(activeKey, normalized.queues).queue : null;

    if (!entry) {
        // Minimal fallback — runtime still resolves a Perspective for any work unit.
        const label = titleCaseKey(activeKey);
        return {
            key: activeKey,
            workUnitId,
            label,
            grain: "case",
            groupBy: null,
            sort: [],
            defaultFilters: null,
            defaultMission: label,
            emptyState: deriveEmptyState(label),
            source,
            ...(attentionBucketKey ? { attentionBucketKey } : {}),
        };
    }

    return {
        key: entry.key,
        workUnitId,
        label: entry.label,
        grain: entry.grain,
        groupBy: deriveGroupBy(entry),
        sort: readSort(entry.raw),
        defaultFilters: entry.filters.length > 0 ? entry.filters : null,
        // Mission ("why here now") defaults to the lane label until BP config owns it.
        defaultMission: entry.label,
        emptyState: deriveEmptyState(entry.label),
        source,
        ...(attentionBucketKey ? { attentionBucketKey } : {}),
    };
}

/** Stable signature for memoizing perspective derivation / store churn. */
export function runtimePerspectiveSignature(p: RuntimePerspective | null): string {
    if (!p) return "";
    return [p.workUnitId, p.key, p.attentionBucketKey ?? "", p.source].join("|");
}

/** Root data-attribute value: `<workUnitId>:<perspectiveKey>`. */
export function runtimePerspectiveAttrValue(p: RuntimePerspective | null): string | null {
    if (!p) return null;
    return `${p.workUnitId}:${p.key}`;
}
