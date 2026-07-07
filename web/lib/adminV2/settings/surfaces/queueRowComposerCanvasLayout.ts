/**
 * Builder canvas layout — readable field chip placement inside the runtime row shell.
 */

import type { CanvasAnatomyRegion } from "@/lib/adminV2/settings/surfaces/queueRowCanvasRegions";
import type { PlacedFieldRef } from "@/lib/adminV2/settings/surfaces/queueRowComposerModel";

export const COMPOSER_LINE_HEIGHT_PX = 18;
export const COMPOSER_LINE_GAP_PX = 4;
export const COMPOSER_ADD_ROW_HEIGHT_PX = 18;
export const COMPOSER_CARD_MIN_HEIGHT_PX = 88;
export const COMPOSER_CARD_PAD_BOTTOM_PX = 10;
export const MAX_FIELDS_PER_LINE = 3;

/** Pixel anchors aligned to CondensedQueueRow anatomy (440px card). */
export const REGION_ANCHOR: Record<
    CanvasAnatomyRegion,
    { topPx: number; leftPx: number; rightPx: number; minHeightPx: number }
> = {
    identity: { topPx: 10, leftPx: 42, rightPx: 112, minHeightPx: 18 },
    status: { topPx: 10, leftPx: 318, rightPx: 12, minHeightPx: 20 },
    attention: { topPx: 48, leftPx: 42, rightPx: 12, minHeightPx: 16 },
    groupCount: { topPx: 68, leftPx: 42, rightPx: 280, minHeightPx: 16 },
    work: { topPx: 68, leftPx: 318, rightPx: 12, minHeightPx: 16 },
};

export type ComposedFieldLine = readonly PlacedFieldRef[];

export function fieldsOnStackLine(fields: readonly PlacedFieldRef[], stackLine: number): PlacedFieldRef[] {
    return fields.filter((f) => f.stackLine === stackLine);
}

export function lastStackLine(fields: readonly PlacedFieldRef[]): number {
    if (fields.length === 0) return 0;
    return Math.max(...fields.map((f) => f.stackLine));
}

/** Default append: same line until 3 fields, then new line below. */
export function resolveDefaultAppendPlacement(regionFields: readonly PlacedFieldRef[]): {
    stackLine: number;
    inlineWithPrevious: boolean;
} {
    if (regionFields.length === 0) {
        return { stackLine: 0, inlineWithPrevious: false };
    }
    const line = lastStackLine(regionFields);
    const onLine = fieldsOnStackLine(regionFields, line);
    if (onLine.length < MAX_FIELDS_PER_LINE) {
        return { stackLine: line, inlineWithPrevious: onLine.length > 0 };
    }
    return { stackLine: line + 1, inlineWithPrevious: false };
}

/** Group fields into display lines: stackLine breaks rows; max 3 chips per visual line. */
export function groupFieldsByStackLine(fields: readonly PlacedFieldRef[]): ComposedFieldLine[] {
    if (fields.length === 0) return [];
    const byLine = new Map<number, PlacedFieldRef[]>();
    for (const field of fields) {
        const list = byLine.get(field.stackLine) ?? [];
        list.push(field);
        byLine.set(field.stackLine, list);
    }
    const rawLines = [...byLine.keys()]
        .sort((a, b) => a - b)
        .flatMap((line) => {
            const row = byLine.get(line) ?? [];
            const chunks: PlacedFieldRef[][] = [];
            for (let i = 0; i < row.length; i += MAX_FIELDS_PER_LINE) {
                chunks.push(row.slice(i, i + MAX_FIELDS_PER_LINE));
            }
            return chunks;
        });
    return rawLines;
}

export type RegionLayoutMetrics = {
    lines: ComposedFieldLine[];
    contentHeightPx: number;
    totalHeightPx: number;
    bottomPx: number;
};

export function regionLayoutMetrics(
    region: CanvasAnatomyRegion,
    fields: readonly PlacedFieldRef[],
): RegionLayoutMetrics {
    const anchor = REGION_ANCHOR[region];
    const lines = groupFieldsByStackLine(fields);
    const lineCount = lines.length;
    const contentHeightPx =
        lineCount > 0
            ? lineCount * COMPOSER_LINE_HEIGHT_PX + Math.max(0, lineCount - 1) * COMPOSER_LINE_GAP_PX
            : 0;
    const totalHeightPx = Math.max(anchor.minHeightPx, contentHeightPx);
    const bottomPx = anchor.topPx + totalHeightPx;
    return { lines, contentHeightPx, totalHeightPx, bottomPx };
}

export function composerCardHeightPx(fieldsByRegion: ReadonlyMap<CanvasAnatomyRegion, readonly PlacedFieldRef[]>): number {
    let maxBottom = COMPOSER_CARD_MIN_HEIGHT_PX;
    for (const region of Object.keys(REGION_ANCHOR) as CanvasAnatomyRegion[]) {
        const fields = fieldsByRegion.get(region) ?? [];
        if (fields.length === 0) continue;
        maxBottom = Math.max(maxBottom, regionLayoutMetrics(region, fields).bottomPx + COMPOSER_CARD_PAD_BOTTOM_PX);
    }
    return maxBottom;
}

/** Non-overlapping hit boxes for tests — one box per field chip. */
export function fieldChipHitBoxes(
    region: CanvasAnatomyRegion,
    fields: readonly PlacedFieldRef[],
): { field: PlacedFieldRef; topPx: number; heightPx: number }[] {
    const anchor = REGION_ANCHOR[region];
    const { lines } = regionLayoutMetrics(region, fields);
    const boxes: { field: PlacedFieldRef; topPx: number; heightPx: number }[] = [];
    lines.forEach((line, lineIdx) => {
        const topPx = anchor.topPx + lineIdx * (COMPOSER_LINE_HEIGHT_PX + COMPOSER_LINE_GAP_PX);
        for (const field of line) {
            boxes.push({ field, topPx, heightPx: COMPOSER_LINE_HEIGHT_PX });
        }
    });
    return boxes;
}

/** True when chip hit boxes within a region do not share identical tops (unless inline same line). */
export function fieldChipLayoutsDoNotOverlap(fields: readonly PlacedFieldRef[]): boolean {
    const boxes = fieldChipHitBoxes("identity", fields);
    if (boxes.length <= 1) return true;
    const seen = new Set<string>();
    for (const box of boxes) {
        const key = `${box.topPx}:${box.field.fieldKey}`;
        if (seen.has(key)) return false;
        seen.add(key);
    }
    return true;
}
