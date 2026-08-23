/**
 * Apply published Queue Row variant sortCriteria to a row list.
 * Consumes the SAME criteria the Queue Row Builder authors — no silent ignore.
 */

import type { QueueRowVariantSortCriterion } from "@/lib/layout/queueRecordLayoutV3";

function readSortValue(row: Record<string, unknown>, key: string): unknown {
    const k = key.trim().toLowerCase();
    const ctx = (row.context ?? row._queue_row_context) as Record<string, unknown> | null | undefined;
    const waitlist = (ctx?.waitlist_context ?? row.waitlist_context) as Record<string, unknown> | null | undefined;
    const placement = row._placement_waitlist_row as Record<string, unknown> | null | undefined;

    if (k.includes("priority") || k.includes("score")) {
        const pv2 = placement?.placement_priority_v2;
        const pv2Score =
            pv2 && typeof pv2 === "object" && typeof (pv2 as { score?: unknown }).score === "number"
                ? (pv2 as { score: number }).score
                : null;
        return (
            waitlist?.priority ??
            waitlist?.priority_score ??
            pv2Score ??
            placement?.priority_score ??
            placement?.bucket_rank ??
            row.waitlist_priority ??
            null
        );
    }
    if (k.includes("waitlist") && (k.includes("position") || k.includes("rank"))) {
        const runtimePos = placement?.runtime_position;
        if (typeof runtimePos === "number") return runtimePos;
        const ctxPos = waitlist?.runtime_position ?? waitlist?.position;
        if (typeof ctxPos === "number") return ctxPos;
        return (
            waitlist?.position_label ??
            waitlist?.position ??
            placement?.runtime_position_label ??
            placement?.position ??
            row.waitlist_position ??
            null
        );
    }
    if (k.includes("start")) {
        return row.desired_start_date ?? waitlist?.desired_start_date ?? placement?.desired_start_date ?? null;
    }
    if (k.includes("updated") || k.includes("activity")) {
        return row.updatedAt ?? row.updated_at ?? null;
    }
    if (k.includes("created")) {
        return row.created_at ?? null;
    }
    if (k.includes("due")) {
        return row.due_at ?? null;
    }
    return row[key] ?? null;
}

/** Canonical placement rank for a row, when the placement system assigned one. */
function readPlacementRank(row: Record<string, unknown>): number | null {
    const placement = row._placement_waitlist_row as Record<string, unknown> | null | undefined;
    const position = placement?.runtime_position;
    return typeof position === "number" && Number.isFinite(position) ? position : null;
}

/** Rows the placement system ranked keep that order; unranked rows never jump ahead of ranked ones. */
function comparePlacementRank(a: Record<string, unknown>, b: Record<string, unknown>): number {
    const ra = readPlacementRank(a);
    const rb = readPlacementRank(b);
    if (ra == null && rb == null) return 0;
    if (ra == null) return 1;
    if (rb == null) return -1;
    return ra - rb;
}

function compareValues(a: unknown, b: unknown, nulls: "first" | "last" = "last"): number {
    const aNull = a == null || a === "";
    const bNull = b == null || b === "";
    if (aNull && bNull) return 0;
    if (aNull) return nulls === "last" ? 1 : -1;
    if (bNull) return nulls === "last" ? -1 : 1;
    const an = typeof a === "string" && /^-?\d+(\.\d+)?$/.test(a.trim()) ? Number(a) : a;
    const bn = typeof b === "string" && /^-?\d+(\.\d+)?$/.test(b.trim()) ? Number(b) : b;
    if (typeof an === "number" && typeof bn === "number" && !Number.isNaN(an) && !Number.isNaN(bn)) {
        return an - bn;
    }
    const as = String(a);
    const bs = String(b);
    return as < bs ? -1 : as > bs ? 1 : 0;
}

/**
 * Stable sort by published variant sortCriteria.
 *
 * When no criterion decides, placement rank breaks the tie before the opaque row id. A configured
 * criterion that resolves to nothing on every row — `waitlist.priority` on the child Waitlist, where
 * no row carries a priority fact — otherwise fell straight through to `id`, ordering the queue by
 * participation UUID and discarding the placement order the rows were numbered from. That is the
 * client inventing an order, which is exactly what the Placement System is the authority against.
 * `runtime_position` here is the placement system's own output, not a score derived at the surface.
 */
export function applyQueueRowVariantSortCriteria<T extends Record<string, unknown>>(
    rows: readonly T[],
    criteria: readonly QueueRowVariantSortCriterion[] | null | undefined,
): T[] {
    if (!criteria?.length || rows.length < 2) return [...rows];
    const out = [...rows];
    out.sort((ra, rb) => {
        for (const rule of criteria) {
            const nulls = rule.nulls === "first" ? "first" : "last";
            const cmp = compareValues(readSortValue(ra, rule.key), readSortValue(rb, rule.key), nulls);
            if (cmp !== 0) return rule.direction === "desc" ? -cmp : cmp;
        }
        const placementRank = comparePlacementRank(ra, rb);
        if (placementRank !== 0) return placementRank;
        return compareValues(ra.id, rb.id);
    });
    return out;
}
