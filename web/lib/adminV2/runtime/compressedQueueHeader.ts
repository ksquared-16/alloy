import type { QueueVm } from "@/lib/ui-v2/workspace-types";

/**
 * Compressed queue header model (Alloy OS, Scope A/B).
 *
 * Pure derivation of the queue column header shown above the search/filter toolbar:
 * a Bend Pine eyebrow ("Active lens"), the active perspective name, a record-count phrase,
 * and an optional attention summary.
 *
 * CONFIG-READINESS: the perspective NAME + eyebrow + count UNIT should later be owned by
 * **Perspective config** (the active lens label, its display noun). The attention summary is
 * derived from row `needsOperationalAttention` flags — a compatibility signal until perspective
 * config supplies an explicit attention rollup. `countLabel` is always a TOTAL-visible-records
 * phrase; a selected-row count is intentionally NOT surfaced here (it would be ambiguous).
 */
export type CompressedQueueHeaderModel = {
    /** Small Bend Pine eyebrow above/inline with the summary (e.g. "Active lens"). */
    eyebrow: string;
    /** Active perspective / lens name (e.g. "Lead", "Today's Tours", "Waitlist"). */
    perspectiveName: string | null;
    /** Total-visible record-count phrase (e.g. "7 families", "7 records"). Never a selection count. */
    countLabel: string | null;
    /** Optional attention summary (e.g. "2 need attention"). */
    attentionLabel: string | null;
    /** Composed secondary line: eyebrow · count · attention (presentation convenience). */
    summaryLine: string | null;
};

function pluralizeUnit(count: number, unit: string | null | undefined): string {
    const base = unit?.trim() || "record";
    if (count === 1) {
        if (base.endsWith("ies")) return `${base.slice(0, -3)}y`;
        if (base.endsWith("s")) return base.slice(0, -1);
        return base;
    }
    return base;
}

export function resolveCompressedQueueHeader(
    queue: Pick<QueueVm, "title" | "laneQueueLabel" | "countBadge" | "countBadgeUnit">,
    attentionCount: number,
    eyebrow = "Active lens",
): CompressedQueueHeaderModel {
    const perspectiveName = queue.title?.trim() || queue.laneQueueLabel?.trim() || null;

    const count = queue.countBadge;
    const countLabel =
        typeof count === "number" ? `${count} ${pluralizeUnit(count, queue.countBadgeUnit)}` : null;

    const attentionLabel =
        attentionCount > 0 ? `${attentionCount} need${attentionCount === 1 ? "s" : ""} attention` : null;

    const summaryParts = [eyebrow, countLabel, attentionLabel].filter(
        (p): p is string => Boolean(p),
    );
    const summaryLine = summaryParts.length ? summaryParts.join(" · ") : null;

    return { eyebrow, perspectiveName, countLabel, attentionLabel, summaryLine };
}
