"use client";

/**
 * Presentation Runtime V2 — the Focus Panel PENDING skeleton (FP.SURFACE).
 *
 * The loading contract for the inline Focus Panel: STABLE structure first, data fills
 * in, no layout swap. Instead of a centered "Preparing…" spinner (which swapped to a
 * completely different card grid on resolve — a visible layout flash), this renders the
 * SAME `FocusPanelCardGrid` the resolved body will, using the SAME record-independent
 * composition inputs (`deriveFocusPanelSummaryCompositionInputs` WITHOUT cards — so every
 * published cell is present, no visibility filter). The result picks the identical grid
 * strategy + cell positions as the resolved surface for the same published doc, so the
 * only thing that transitions pending → resolved is each cell's CONTENT.
 *
 * The placeholder cell is an inert `.alloy-os-ucard` (the exact card chrome — rounded
 * border + padding) with a pulse and a representative min-height. No coordination, no
 * mutation, `aria-hidden` — it is presentation scaffolding, not a live card.
 *
 * Only Summary is a composed grid; other modes reserve a simple stable placeholder.
 */

import { useMemo } from "react";

import FocusPanelCardGrid from "@/components/admin/focusPanel/FocusPanelCardGrid";
import { deriveFocusPanelSummaryCompositionInputs } from "@/lib/adminV2/runtime/focusPanel/deriveFocusPanelSummaryCompositionInputs";
import { FOCUS_PANEL_SUMMARY_DEFAULT_DOC } from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";
import { usePublishedFocusPanelSummaryDocState } from "@/lib/adminV2/runtime/focusPanel/usePublishedFocusPanelSummaryDoc";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";

/** Inert placeholder body — the card shell shape with a pulse, no content, aria-hidden. */
function PlaceholderCard() {
    return (
        <div
            className="alloy-os-ucard"
            data-focus-panel-skeleton-card="true"
            aria-hidden="true"
            style={{ minHeight: "7.5rem", padding: "0.875rem" }}
        >
            <div className="flex flex-col gap-2 animate-pulse" aria-hidden="true">
                <div className="h-3.5 w-1/3 rounded bg-alloy-stone/12" />
                <div className="h-3 w-2/3 rounded bg-alloy-stone/10" />
                <div className="h-3 w-1/2 rounded bg-alloy-stone/10" />
            </div>
        </div>
    );
}

export default function FocusPanelSummarySkeleton({ mode }: { mode: FocusPanelMode }) {
    const isSummary = mode === "summary";
    // Mounting this hook triggers the module-cached published-doc load EARLY, so by the
    // time the record payload resolves the doc is already warm. We gate the composed grid on
    // the fetch having SETTLED: until then we cannot know the org's real layout, and picking
    // the code default now would REFLOW to the published layout on load (the exact flash we
    // are removing). The record VM always resolves AFTER the doc, so once the resolved body
    // can render, the doc is settled — the skeleton and resolved surface pick the same grid.
    const { doc: publishedDoc, loaded: docLoaded } = usePublishedFocusPanelSummaryDocState(isSummary);
    const activeDoc = isSummary && docLoaded ? publishedDoc ?? FOCUS_PANEL_SUMMARY_DEFAULT_DOC : null;

    // Record-free inputs (NO cards) → all published cells present. Same strategy the
    // resolved body derives with the same doc, so the pending → resolved layout is stable.
    const inputs = useMemo(
        () => (activeDoc ? deriveFocusPanelSummaryCompositionInputs(activeDoc) : null),
        [activeDoc],
    );

    // Non-summary modes (or the brief pre-settle window on the first Focus Panel open of a
    // session) reserve a stable neutral placeholder — never a composed grid that would later
    // reflow to the published layout.
    if (!isSummary || !inputs) {
        return (
            <div
                data-testid="inline-focus-panel-skeleton"
                data-inline-focus-panel-pending="true"
                data-focus-panel-skeleton-mode={mode}
                className="flex flex-col gap-3"
            >
                <PlaceholderCard />
                {isSummary ? <PlaceholderCard /> : null}
            </div>
        );
    }

    return (
        <div
            data-testid="inline-focus-panel-skeleton"
            data-inline-focus-panel-pending="true"
            data-focus-panel-skeleton-mode={mode}
        >
            <FocusPanelCardGrid
                rows={inputs.gridRows}
                publishedLayout={inputs.publishedLayout}
                composeCards={inputs.composeCards}
                compositionOverrides={inputs.compositionOverrides}
                renderCell={() => <PlaceholderCard />}
            />
        </div>
    );
}
