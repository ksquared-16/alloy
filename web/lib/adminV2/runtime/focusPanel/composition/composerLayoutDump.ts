/**
 * Surface composer — live layout dump.
 *
 * Three rounds of QA have been argued from screenshots, and the last one asked
 * the operator to reconstruct rows and spans by hand. That was the wrong way
 * round: the builder knows its own geometry exactly, and the lane should read it
 * rather than infer it.
 *
 * `window.__ALLOY_SURFACE_STATE__()` answers, for the canvas as it stands right
 * now: what every card's logical rectangle is, what its RENDERED rectangle is,
 * and — the question the screenshots keep raising — whether those two agree.
 *
 * Diagnostic only. Nothing here participates in placement.
 */

import type { FocusPanelGridLayout } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";
import { COMPOSER_GRID_GAP_PX, COMPOSER_GRID_ROW_UNIT_PX } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelGridLayoutOps";

export type ComposerLayoutDump = Record<string, unknown>;

type DumpWindow = typeof globalThis & {
    __ALLOY_SURFACE_STATE__?: () => ComposerLayoutDump;
};

function rectOf(el: Element | null) {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
}

function parseTracks(value: string | null | undefined): number[] {
    if (!value) return [];
    return value.split(/\s+/).map((t) => Number.parseFloat(t)).filter((n) => Number.isFinite(n));
}

/**
 * Publish the dump for the current canvas. Called on every committed layout, so
 * whatever the operator is looking at is what the dump describes.
 */
export function publishComposerLayoutDump(args: {
    committed: FocusPanelGridLayout;
    preview: FocusPanelGridLayout | null;
    selectedCard: string | null;
    draggingCard: string | null;
}): void {
    if (typeof window === "undefined") return;
    const w = window as DumpWindow;
    w.__ALLOY_SURFACE_STATE__ = () => {
        const gridEl = document.querySelector(".alloy-os-fp-canvas--grid");
        const style = gridEl ? window.getComputedStyle(gridEl) : null;
        const rowTracks = parseTracks(style?.gridTemplateRows);
        const colTracks = parseTracks(style?.gridTemplateColumns);
        const source = args.preview ?? args.committed;

        const cards = source.areas.map((area) => {
            const el = document.querySelector(`[data-fp-grid-area="${area.card}"]`);
            const rendered = rectOf(el);
            /*
             * The declared height of the card's own rows, and the height it is
             * actually drawing. Rows are content-sized (`minmax(76px, auto)`), so a
             * card taller than its declared span STRETCHES the shared tracks — every
             * other card on those rows moves, while the model still believes the
             * rows below are free. That divergence is what makes a visible vacancy
             * disagree with the collision model, so it is measured here explicitly.
             */
            const declaredMinHeight =
                area.rowSpan * COMPOSER_GRID_ROW_UNIT_PX + (area.rowSpan - 1) * COMPOSER_GRID_GAP_PX;
            const trackHeight = rowTracks.length
                ? rowTracks.slice(area.rowStart - 1, area.rowStart - 1 + area.rowSpan)
                      .reduce((sum, h) => sum + h, 0)
                  + Math.max(0, area.rowSpan - 1) * COMPOSER_GRID_GAP_PX
                : null;
            const committedArea = args.committed.areas.find((a) => a.card === area.card) ?? null;
            return {
                card: area.card,
                grid: {
                    colStart: area.colStart, colSpan: area.colSpan,
                    rowStart: area.rowStart, rowSpan: area.rowSpan,
                },
                persisted: committedArea && {
                    colStart: committedArea.colStart, colSpan: committedArea.colSpan,
                    rowStart: committedArea.rowStart, rowSpan: committedArea.rowSpan,
                },
                rendered,
                declaredMinHeight,
                trackHeight: trackHeight == null ? null : Math.round(trackHeight),
                /** > 0 means the card draws taller than the rows it declares. */
                overflowPx: rendered && trackHeight != null ? Math.round(rendered.h - trackHeight) : null,
                selected: args.selectedCard === area.card,
                dragging: args.draggingCard === area.card,
            };
        });

        return {
            canvas: rectOf(gridEl),
            scroll: { x: Math.round(window.scrollX), y: Math.round(window.scrollY) },
            columns: source.columns,
            gapPx: COMPOSER_GRID_GAP_PX,
            rowUnitPx: COMPOSER_GRID_ROW_UNIT_PX,
            rowTracks: rowTracks.map((h) => Math.round(h)),
            colTracks: colTracks.map((wd) => Math.round(wd)),
            previewActive: Boolean(args.preview),
            cards,
            /*
             * The occupancy the solver reasons about, stated as text so a dump can be
             * read without re-deriving it: one line per card, grid coordinates only.
             */
            occupancy: source.areas
                .map((a) => `${a.card} c${a.colStart}-${a.colStart + a.colSpan - 1} r${a.rowStart}-${a.rowStart + a.rowSpan - 1}`)
                .sort(),
        };
    };
}
