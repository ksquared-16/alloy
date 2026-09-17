/**
 * THE FIXTURE THE PAINTED-SURFACE GATE MOUNTS (P0-7.5).
 *
 * It renders the REAL `UniversalCard` — the component that owns the white, bordered, rounded
 * `article.alloy-os-ucard` an operator actually sees — inside the REAL nesting the solved grid
 * produces, with the REAL runtime stylesheet supplying every rule under certification.
 *
 * ── WHY THIS FIXTURE EXISTS AT ALL ──
 *
 * `focusPanelGeometryFixture` mounts the real `FocusPanelCardGrid` with SYNTHETIC cell content —
 * plain blocks of a controlled height. That is exactly right for certifying the solver and the
 * band, and it is structurally blind to the defect this gate owns: the solver can be correct, the
 * cell can be correct, and the painted card can still be short, because between them sits a
 * wrapper that no synthetic cell ever renders.
 *
 * Business Process is the one card that wraps. `ProcessCard` renders
 * `<div class="alloy-os-process" data-process-card="true">` AROUND its `UniversalCard`; every other
 * card hands the grid its painted article directly. That asymmetry is the whole defect, so the
 * fixture reproduces it literally: one card wrapped, one card bare, same band, same solved height.
 *
 * The wrapped/bare structural claim is NOT asserted here — a fixture cannot certify its own shape.
 * `focusPanelBandFillRuntimePath.test.ts` reads `ProcessCard.tsx` and proves the wrapper is real
 * and that `UniversalCard` sits inside it. This file then owns only what a browser can settle:
 * given that shape, does the band height reach the painted surface.
 *
 * ── THE NESTING IS COPIED FROM THE PRODUCT, NOT INVENTED ──
 *
 *   div[data-fp-grid-area]            inline `height: {solved}px`   ← FocusPanelCardGrid
 *     div.alloy-os-fp-card-intrinsic  min-height:100%               ← the measured node
 *       div.alloy-os-focus-panel-grid__cell                         ← renderCellBox
 *         div.alloy-os-process        BP ONLY                       ← ProcessCard's wrapper
 *           article.alloy-os-ucard    the painted surface           ← UniversalCard
 *
 * `window.__paint` is the whole contract with the spec: set an arbitrary solved height, re-render,
 * read rectangles and computed paint properties.
 */

import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";

/**
 * One cell of the solved grid.
 *
 * `wrapped` is the only difference between the two cards, and it is the difference under test.
 * Content is a fixed short block so the card's NATURAL height is unambiguously less than any
 * solved height the spec chooses — if the painted article ends up at the band height, it got
 * there by consuming the band, never by its content happening to reach it.
 */
function SolvedCell({
    cardKey,
    solvedHeight,
    wrapped,
    contentHeight,
}: {
    cardKey: string;
    solvedHeight: number;
    wrapped: boolean;
    contentHeight: number;
}) {
    const card = (
        <UniversalCard
            title={cardKey}
            insight=""
            iconName="GitBranch"
            tier="work"
            archetype="action"
            density="compact"
            gridSpan="row"
            data-universal-card-key={cardKey}
            footerAction={null}
        >
            <div data-synthetic-content="true" style={{ height: `${contentHeight}px` }} />
        </UniversalCard>
    );

    return (
        <div
            className="alloy-os-fp-grid-area"
            data-fp-grid-area={cardKey}
            // The solved band height, applied exactly as FocusPanelCardGrid applies it: an inline
            // `height`, never a `min-height`. Nothing downstream may name a pixel value.
            style={{ height: `${solvedHeight}px` }}
        >
            <div className="alloy-os-fp-card-intrinsic" data-fp-card-intrinsic={cardKey}>
                <div className="alloy-os-focus-panel-grid__cell">
                    {wrapped ? (
                        <div className="alloy-os-process" data-process-card="true">
                            {card}
                        </div>
                    ) : (
                        card
                    )}
                </div>
            </div>
        </div>
    );
}

function Fixture() {
    // Deliberately not 299 or 325 — the two numbers this defect has already been measured at.
    const [solvedHeight, setSolvedHeight] = useState(471);
    const [contentHeight, setContentHeight] = useState(96);

    const apply = useCallback((h: number, content?: number) => {
        setSolvedHeight(h);
        if (typeof content === "number") setContentHeight(content);
    }, []);

    useEffect(() => {
        (window as unknown as { __paint: unknown }).__paint = { apply };
    }, [apply]);

    return (
        <div
            className="alloy-os-focus-panel-grid alloy-os-focus-panel-grid--composed"
            style={{ display: "flex", alignItems: "flex-start", gap: "12px", width: "1200px" }}
        >
            {/* Business Process — WRAPPED, the shape that failed. */}
            <div style={{ width: "700px" }}>
                <SolvedCell
                    cardKey="business_process"
                    solvedHeight={solvedHeight}
                    wrapped
                    contentHeight={contentHeight}
                />
            </div>
            {/* Financials — BARE, the shape that always worked, as the control. */}
            <div style={{ width: "340px" }}>
                <SolvedCell
                    cardKey="financials"
                    solvedHeight={solvedHeight}
                    wrapped={false}
                    contentHeight={contentHeight}
                />
            </div>
        </div>
    );
}

createRoot(document.getElementById("root")!).render(<Fixture />);
