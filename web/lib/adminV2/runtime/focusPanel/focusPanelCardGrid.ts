/**
 * Focus Panel Concept B — responsive card grid engine.
 * Platform-owned collapse rules; Experience Builder will supply rows/cells/span later.
 */

export type FocusPanelCardSpan = 1 | 2 | "row";

export type FocusPanelCardDensity = "micro" | "compact" | "standard" | "expanded";

/**
 * HOW MANY ITEMS OF A COLLECTION A FOCUS PANEL SUMMARY SHOWS.
 *
 * A Focus Panel card is a summary with a route to the whole thing, not the whole thing. The number
 * was already decided — `childrenCollectionItems` and its sibling in `deriveOpportunityFocusPanelCards`
 * both took the first three and reported a truthful overflow count — but it lived as a bare `3` in
 * two places and the settled Children card honoured neither, rendering every row. Measured on a
 * production build, a 17-child family took that cell from 120px to 2319px: 86% of the panel's whole
 * 406px -> 2968px growth, so the surface reflowed around one collection.
 *
 * Stating it once makes the contract enforceable: cards bound their summary density here, and a
 * collection larger than it reaches its full form through the card's own detail affordance. This is
 * a DENSITY, not a truncation of truth — the count beside it always states the total, and the card
 * owns how it overflows. The grid owns placement and knows nothing about what is being counted.
 */
export const FOCUS_PANEL_SUMMARY_COLLECTION_DENSITY = 3;

export type FocusPanelGridCell = {
    key: string;
    span: FocusPanelCardSpan;
    density?: FocusPanelCardDensity;
    tierPriority?: number;
};

export type FocusPanelGridRow = {
    cells: FocusPanelGridCell[];
};

export const FOCUS_PANEL_GRID_GAP_PX = 16;
export const FOCUS_PANEL_GRID_MIN_CARD_PX = 240;
export const FOCUS_PANEL_GRID_MIN_MICRO_PX = 160;

/** Grid column count from measured panel width (Concept B breakpoints). */
export function computeFocusPanelGridColumns(panelWidthPx: number): 1 | 2 | 3 | 4 {
    if (panelWidthPx >= 1040) return 4;
    if (panelWidthPx >= 820) return 3;
    if (panelWidthPx >= 560) return 2;
    return 1;
}

/** CSS grid-column span for a cell at the current column count. */
export function resolveFocusPanelCellGridSpan(
    span: FocusPanelCardSpan,
    columns: number,
): number {
    if (span === "row" || columns <= 1) return columns;
    if (span === 2) return Math.min(2, columns);
    return 1;
}

const FULL_ROW_SECTION_PATTERN =
    /communications|documents|timeline|activity|notes|audit|recent/i;
const PAIR_SECTION_PATTERN = /household|children|guardian|guardians|address|pickup|role/i;
const MICRO_SECTION_PATTERN = /kpi|readiness|metric|attention|why_now|current_work/i;

/** Derive default span from a layout section key (compatibility layer). */
export function resolveFocusPanelSectionSpan(sectionKey: string): FocusPanelCardSpan {
    const key = sectionKey.trim().toLowerCase();
    if (FULL_ROW_SECTION_PATTERN.test(key)) return "row";
    if (MICRO_SECTION_PATTERN.test(key)) return 1;
    if (PAIR_SECTION_PATTERN.test(key)) return 2;
    return 1;
}

export function resolveFocusPanelSectionDensity(sectionKey: string): FocusPanelCardDensity {
    const key = sectionKey.trim().toLowerCase();
    if (MICRO_SECTION_PATTERN.test(key)) return "micro";
    if (FULL_ROW_SECTION_PATTERN.test(key)) return "standard";
    if (PAIR_SECTION_PATTERN.test(key)) return "standard";
    return "compact";
}

/** Pack section keys into grid rows (pair adjacent span-2 cells). */
export function buildFocusPanelGridRows(sectionKeys: string[]): FocusPanelGridRow[] {
    const rows: FocusPanelGridRow[] = [];
    let pendingPair: FocusPanelGridCell | null = null;

    for (const key of sectionKeys) {
        const span = resolveFocusPanelSectionSpan(key);
        const cell: FocusPanelGridCell = {
            key,
            span,
            density: resolveFocusPanelSectionDensity(key),
        };

        if (span === "row") {
            if (pendingPair) {
                rows.push({ cells: [pendingPair] });
                pendingPair = null;
            }
            rows.push({ cells: [cell] });
            continue;
        }

        if (span === 2) {
            if (pendingPair) {
                rows.push({ cells: [pendingPair, cell] });
                pendingPair = null;
            } else {
                pendingPair = cell;
            }
            continue;
        }

        if (pendingPair) {
            rows.push({ cells: [pendingPair] });
            pendingPair = null;
        }
        rows.push({ cells: [cell] });
    }

    if (pendingPair) {
        rows.push({ cells: [pendingPair] });
    }

    return rows;
}

/** Linearize grid rows by tier priority when columns collapse to 1. */
export function linearizeFocusPanelGridRows(rows: FocusPanelGridRow[]): FocusPanelGridCell[] {
    const cells: FocusPanelGridCell[] = [];
    for (const row of rows) {
        for (const cell of row.cells) {
            cells.push(cell);
        }
    }
    return cells.sort((a, b) => (a.tierPriority ?? 99) - (b.tierPriority ?? 99));
}
