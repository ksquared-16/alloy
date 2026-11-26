/**
 * Deterministic responsive Focus Panel card composition (grid-flow).
 *
 * Builder configures: card order, preferred column span, full-width vs shared-row,
 * breakpoint behavior, optional min-height / preview density.
 *
 * Runtime places cards in ordered grid rows; row height follows the tallest card
 * in the row (CSS grid align). Variable child/contact counts must not invalidate
 * the outer card placement — only inner collection density.
 *
 * Preview density modes never claim exact runtime height.
 */

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

export type FocusPanelCardPreviewDensity = "minimal" | "typical" | "dense" | "maximum";

export type FocusPanelCardBreakpointBehavior = "stack" | "keep_row" | "shrink_span";

export type FocusPanelCardFlowPlacement = {
    /** Stable card type identifier. */
    cardKey: FocusPanelCardKey;
    /** Reading order (1-based). */
    order: number;
    /** Preferred column span on the wide breakpoint (1–12). */
    preferredColumnSpan: number;
    /** When true, card always claims the full row. */
    fullWidth: boolean;
    /** Narrow-layout behavior. */
    breakpointBehavior: FocusPanelCardBreakpointBehavior;
    /** Optional authored minimum height hint (px) — preview only, not runtime truth. */
    minHeightPx?: number | null;
    /** Builder preview density — does not claim exact runtime height. */
    previewDensity?: FocusPanelCardPreviewDensity;
};

export type FocusPanelCardFlowRow = {
    row: number;
    cards: FocusPanelCardFlowPlacement[];
    /** Sum of preferred spans on this row (capped at columns). */
    occupiedColumns: number;
};

export type FocusPanelCardFlowPlan = {
    columns: number;
    rows: FocusPanelCardFlowRow[];
    /** True when the surface collapsed to a single stacked column. */
    stacked: boolean;
};

const DEFAULT_COLUMNS = 12;

/**
 * Pack ordered placements into rows. Full-width cards always start a new row.
 * Shared-row cards pack while remaining span fits; otherwise wrap.
 * On narrow/stacked mode every card is its own row in order.
 */
export function planFocusPanelCardGridFlow(args: {
    placements: readonly FocusPanelCardFlowPlacement[];
    columns?: number;
    /** When true (narrow viewport), stack predictably in order. */
    forceStack?: boolean;
}): FocusPanelCardFlowPlan {
    const columns = Math.max(1, args.columns ?? DEFAULT_COLUMNS);
    const ordered = [...args.placements].sort((a, b) => a.order - b.order);
    if (args.forceStack) {
        return {
            columns: 1,
            stacked: true,
            rows: ordered.map((card, index) => ({
                row: index + 1,
                cards: [{ ...card, preferredColumnSpan: 1, fullWidth: true }],
                occupiedColumns: 1,
            })),
        };
    }

    const rows: FocusPanelCardFlowRow[] = [];
    let current: FocusPanelCardFlowPlacement[] = [];
    let occupied = 0;

    const flush = () => {
        if (current.length === 0) return;
        rows.push({
            row: rows.length + 1,
            cards: current,
            occupiedColumns: occupied,
        });
        current = [];
        occupied = 0;
    };

    for (const placement of ordered) {
        const span = placement.fullWidth
            ? columns
            : Math.min(columns, Math.max(1, placement.preferredColumnSpan));
        if (placement.fullWidth || occupied + span > columns) {
            flush();
        }
        if (placement.breakpointBehavior === "stack" && occupied > 0 && span < columns) {
            // Optional: stack behavior at wide width only when explicitly requested mid-row.
            // Prefer packing; stacking is for narrow forceStack path.
        }
        current.push({ ...placement, preferredColumnSpan: span });
        occupied += span;
        if (placement.fullWidth || occupied >= columns) {
            flush();
        }
    }
    flush();

    return { columns, stacked: false, rows };
}

/** CSS grid template for a planned row — equal fractional tracks by span. */
export function focusPanelCardFlowRowStyle(row: FocusPanelCardFlowRow, columns: number): {
    display: "grid";
    gridTemplateColumns: string;
    alignItems: "stretch";
} {
    const tracks = row.cards.map((card) => `${card.preferredColumnSpan}fr`).join(" ");
    const remainder = Math.max(0, columns - row.occupiedColumns);
    return {
        display: "grid",
        gridTemplateColumns: remainder > 0 ? `${tracks} ${remainder}fr` : tracks || "1fr",
        // Row height follows the tallest card (stretch).
        alignItems: "stretch",
    };
}

export const FOCUS_PANEL_CARD_PREVIEW_DENSITY_HINTS: Record<
    FocusPanelCardPreviewDensity,
    { label: string; note: string }
> = {
    minimal: {
        label: "Minimal",
        note: "Preview only — runtime height follows live content.",
    },
    typical: {
        label: "Typical",
        note: "Preview only — runtime height follows live content.",
    },
    dense: {
        label: "Dense",
        note: "Preview only — runtime height follows live content.",
    },
    maximum: {
        label: "Maximum",
        note: "Preview only — runtime height follows live content.",
    },
};
