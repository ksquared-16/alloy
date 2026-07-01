/**
 * Operational queue row layout shell — content grid tracks + fixed actions rail.
 *
 * /settings/layouts owns column width tokens; this module maps them to grid minmax tracks.
 */

import type { QueueRecordColumnWidth } from "@/lib/layout/queueRecordLayoutConfig";
import { queueRecordWidthToCss } from "@/lib/layout/queueRecordLayoutWidth";

/** Legacy position-based defaults (used only when width token is missing). */
export const OPERATIONAL_QUEUE_ROW_CONTENT_SHELL_SLOTS = [
    "minmax(240px, 1.1fr)",
    "minmax(260px, 1.15fr)",
    "minmax(170px, 0.7fr)",
    "minmax(220px, 1fr)",
    "minmax(140px, 0.55fr)",
] as const;

/** Extra config columns beyond the default five preset slots. */
export const OPERATIONAL_QUEUE_ROW_EXTRA_CONTENT_SLOT = "minmax(120px, 0.65fr)";

/** Fixed actions rail — never participates in content fr shrink fights. */
export const OPERATIONAL_QUEUE_ROW_ACTIONS_SHELL_WIDTH = "168px";

const FALLBACK_CONTENT_SLOT = "minmax(140px, 1fr)";

export type OperationalQueueRowContentColumn = {
    width?: QueueRecordColumnWidth | string;
};

function resolveContentColumnTrack(
    column: OperationalQueueRowContentColumn | undefined,
    index: number,
): string {
    const width = column?.width;
    if (width) return queueRecordWidthToCss(width);
    return (
        OPERATIONAL_QUEUE_ROW_CONTENT_SHELL_SLOTS[index]
        ?? OPERATIONAL_QUEUE_ROW_EXTRA_CONTENT_SLOT
    );
}

/**
 * Grid template from saved column width tokens (canonical runtime path).
 */
export function buildOperationalQueueRowContentGridFromColumns(
    columns: OperationalQueueRowContentColumn[],
): string {
    if (!columns.length) return FALLBACK_CONTENT_SLOT;
    return columns.map((col, index) => resolveContentColumnTrack(col, index)).join(" ");
}

/**
 * Grid template for column count only — legacy fallback when widths are unavailable.
 */
export function buildOperationalQueueRowContentGrid(columnCount: number): string {
    const count = Math.max(0, columnCount);
    if (count === 0) return FALLBACK_CONTENT_SLOT;

    const tracks: string[] = [];
    for (let i = 0; i < count; i += 1) {
        tracks.push(resolveContentColumnTrack(undefined, i));
    }
    return tracks.join(" ");
}
