/**
 * Pure Focus Panel Summary composition inputs (Presentation Runtime V2 — FP.SURFACE).
 *
 * Extracts the RECORD-INDEPENDENT layout derivation that `OpportunityFocusPanelModeGrid`
 * feeds to `FocusPanelCardGrid`, so the SAME grid strategy + cell positions can be produced
 * two ways:
 *
 *   - the RESOLVED body (ModeGrid) passes `{ cards }` → the visibility filter applies exactly
 *     as before (a placed cell is dropped when its card model is `visible === false`);
 *   - the PENDING skeleton passes nothing → ALL published cells are included, so the pulse
 *     placeholder renders the same lanes/areas the resolved surface will, with zero layout
 *     change pending → resolved (only cell CONTENT transitions).
 *
 * Everything here is a pure function of the (already record-free) `LayoutDoc`:
 *   - `deriveFocusPanelGridFromLayoutDoc` — placed cells, order, span, grid row
 *   - `deriveFocusPanelInstanceMap`       — instance → { typeKey, config }
 *   - `readFocusPanelPublishedLayout`     — operator-authored explicit layout (source of truth)
 *   - `buildCompositionOverrides`         — per-type composition overrides
 *
 * The only record dependency in ModeGrid is the visibility filter, which is expressed here as
 * the optional `cards` map. This is a BEHAVIOR-PRESERVING extraction: with `{ cards }` it
 * reproduces ModeGrid's prior `gridRows` / `composeCards` / `compositionOverrides` exactly.
 */

import {
    deriveFocusPanelGridFromLayoutDoc,
    deriveFocusPanelInstanceMap,
} from "@/lib/adminV2/runtime/focusPanel/deriveFocusPanelCardsFromLayoutDoc";
import {
    buildCompositionOverrides,
    type FocusPanelCardConfig,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import { readFocusPanelPublishedLayout } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";
import type { CompositionCardInput } from "@/lib/adminV2/runtime/focusPanel/composition/composeFocusPanelSurface";
import type { FocusPanelPublishedLayout } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";
import type { CardCompositionPreference } from "@/lib/adminV2/runtime/focusPanel/cardCompositionModel";
import type { FocusPanelGridRow } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrid";
import type { FocusPanelCardKey, FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

/** Card MODEL map keyed by card TYPE — the resolved body's derived models. */
export type FocusPanelCardModelMap = Map<FocusPanelCardKey, FocusPanelCardModel>;

export type FocusPanelSummaryCompositionInputs = {
    /** Grid rows (visibility-filtered when `cards` provided), for the legacy grid path. */
    gridRows: FocusPanelGridRow[];
    /** Operator-published explicit layout (source of truth) — record-free. */
    publishedLayout: FocusPanelPublishedLayout | null;
    /** Composition Engine input — reading order + type, record-free given gridRows. */
    composeCards: CompositionCardInput[];
    /** Per-type composition overrides — record-free. */
    compositionOverrides: Partial<Record<FocusPanelCardKey, Partial<CardCompositionPreference>>>;
    /** instanceKey → { typeKey, config } for model + config resolution. */
    cellResolution: Map<string, { typeKey: FocusPanelCardKey; config: FocusPanelCardConfig | null }>;
};

/**
 * Derive the record-independent composition inputs for the Focus Panel Summary surface.
 *
 * @param activeDoc  the resolved Summary `LayoutDoc` (published doc or code default)
 * @param opts.cards resolved card models keyed by type. When present, a placed cell is
 *                   dropped if `cards.get(type)?.visible === false` (exactly as ModeGrid
 *                   does). When absent (skeleton), no visibility filter — ALL published
 *                   cells are included so the placeholder matches the resolved layout.
 */
export function deriveFocusPanelSummaryCompositionInputs(
    activeDoc: LayoutDoc | null | undefined,
    opts?: { cards?: FocusPanelCardModelMap },
): FocusPanelSummaryCompositionInputs {
    const cards = opts?.cards ?? null;
    const grid = deriveFocusPanelGridFromLayoutDoc(activeDoc);
    const instanceMap = activeDoc ? deriveFocusPanelInstanceMap(activeDoc) : new Map();
    const publishedLayout = readFocusPanelPublishedLayout(activeDoc);

    const cellResolution = new Map<
        string,
        { typeKey: FocusPanelCardKey; config: FocusPanelCardConfig | null }
    >();
    grid.rows.forEach((row) => {
        row.cells.forEach((cell) => {
            const cellKey = cell.instanceKey ?? cell.key;
            cellResolution.set(cellKey, {
                typeKey: cell.key as FocusPanelCardKey,
                config: instanceMap.get(cellKey)?.config ?? null,
            });
        });
    });

    // COMPOSITION IS CONFIGURATION-DRIVEN (A). Every published cell is included, ALWAYS — a missing
    // settlement value RESERVES the cell, it never removes it. `visible:false` no longer drops a
    // configured card; per-card readiness (not data presence) decides content vs reserved geometry.
    void cards;
    const gridRows = grid.rows
        .map((row) => ({
            cells: row.cells.map((cell) => ({
                key: cell.instanceKey ?? cell.key,
                span: cell.span,
                density: cell.density,
            })),
        }))
        .filter((row) => row.cells.length > 0);

    const composeCards: CompositionCardInput[] = gridRows.flatMap((row) =>
        row.cells.map((cell) => ({
            key: cell.key,
            typeKey: (cellResolution.get(cell.key)?.typeKey ?? cell.key) as FocusPanelCardKey,
        })),
    );

    const compositionOverrides = buildCompositionOverrides(
        Array.from(cellResolution.values()).map((r) => ({ typeKey: r.typeKey, config: r.config })),
    );

    return { gridRows, publishedLayout, composeCards, compositionOverrides, cellResolution };
}
