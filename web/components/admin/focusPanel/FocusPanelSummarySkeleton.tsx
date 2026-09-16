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

import { useEffect, useMemo, useRef } from "react";

import FocusPanelCardGrid from "@/components/admin/focusPanel/FocusPanelCardGrid";
import { deriveFocusPanelSummaryCompositionInputs } from "@/lib/adminV2/runtime/focusPanel/deriveFocusPanelSummaryCompositionInputs";
import {
    focusPanelSummaryUsesPublishedDoc,
    resolveFocusPanelSummaryActiveDoc,
} from "@/lib/adminV2/runtime/focusPanel/resolveFocusPanelSummaryActiveDoc";
import type { OperationalSubjectType } from "@/lib/adminV2/runtime/operationalContext/subjectGrain";
import { usePublishedFocusPanelSummaryDocState } from "@/lib/adminV2/runtime/focusPanel/usePublishedFocusPanelSummaryDoc";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";

/**
 * RESERVED SETTLEMENT GEOMETRY — not a skeleton.
 *
 * This card used to pulse three placeholder bars while the deferred record VM loaded. That is the
 * operator watching the application assemble itself, and browser certification measured it: ~8 s of
 * `visible_construction` on a Work Unit whose operational truth (subject, Situation, Decision,
 * Action) was already committed and on screen. The Settlement contract is explicit — "use reserved
 * geometry; never visibly construct the operational surface" — so the region reserves its space and
 * stays quiet.
 *
 * It keeps the card shell and `minHeight` (that is what prevents reflow when Detail settles into it)
 * and drops the animation and the fake bars: bars imply content that does not exist yet, which is
 * both construction and a small lie about what is known.
 */
/**
 * THE RESERVED-GEOMETRY FLOOR, stated once.
 *
 * Exported because reserved geometry is a Focus Panel CONTRACT, not a detail of this skeleton: a
 * card that legitimately clears its data during a subject switch must keep a footprint, or every
 * card below it moves. `FinancialsCard` consumes this for exactly that case. Anything adopting the
 * contract uses this token rather than inventing a height.
 */
export const FOCUS_PANEL_RESERVED_MIN_HEIGHT = "7.5rem";

/**
 * THE RESERVED-GEOMETRY CONTRACT, as a hook — for cards that legitimately clear their data.
 *
 * Financials proved the shape in Slice 4 and this is the same contract, not a competing one: keep the
 * card's footprint while its data is cleared, so every card below it does not move down and back.
 * Extracted only once a third and fourth adopter existed (Attendance, Health & Safety); a card with
 * ONE occurrence should still just express it inline.
 *
 * Geometry only. This reserves space — it never keeps the previous subject's values on screen, and
 * it never changes when a card clears or what it clears.
 *
 * `hasContent` is the card's own truth: true once its data is settled, false while cleared/pending.
 * The remembered footprint is per card instance, so a legitimate unmount (a subject refusal removing
 * the card) simply starts again from the shared floor — no external state survives it.
 */
/**
 * THE RESERVED-CARD GEOMETRY CONTRACT, stated once — Slice 4's Financials repair, expressed for the
 * cards that share its shape.
 *
 * `settled` means THE CARD HAS THE ANSWER, whatever the answer is: a loaded record, "no attendance
 * record", "select a child", a permission refusal. It does NOT mean "has data". A card that is
 * resolving the next subject is the only thing this reserves against, because that is the only state
 * whose height is about to change for a reason the operator did not ask for.
 *
 * Two rules the adopters must honour, both learned the hard way in Slice 4:
 *  - the `ref` goes on EVERY root the card can return through while settled, or the footprint is
 *    never measured and the reserve silently falls back to the shared floor;
 *  - an interaction-opened overlay (history, detail) is NOT one of those roots — measuring it would
 *    remember the overlay's footprint as the card's.
 *
 * Geometry only. Nothing here retains, restores or delays the prior subject's content.
 */
export function useReservedCardGeometry(settled: boolean): {
    ref: React.RefObject<HTMLDivElement | null>;
    style: React.CSSProperties | undefined;
    reserved: boolean;
} {
    const ref = useRef<HTMLDivElement | null>(null);
    const lastSettledHeight = useRef<number | null>(null);
    useEffect(() => {
        if (!settled || !ref.current) return;
        const h = Math.round(ref.current.getBoundingClientRect().height);
        if (h > 0) lastSettledHeight.current = h;
    }, [settled]);
    return {
        ref,
        style: settled
            ? undefined
            : { minHeight: lastSettledHeight.current ?? FOCUS_PANEL_RESERVED_MIN_HEIGHT },
        reserved: !settled,
    };
}

function ReservedSettlementRegion() {
    return (
        <div
            className="alloy-os-ucard"
            data-focus-panel-skeleton-card="true"
            data-focus-panel-settlement-reserved="true"
            aria-hidden="true"
            style={{ minHeight: FOCUS_PANEL_RESERVED_MIN_HEIGHT, padding: "0.875rem" }}
        />
    );
}

export default function FocusPanelSummarySkeleton({
    mode,
    subjectGrain = "opportunity",
    familySettlement = true,
}: {
    mode: FocusPanelMode;
    /**
     * The grain the resolved body will compose for, when the host already knows it.
     *
     * The host knows this BEFORE the record payload lands — it comes from the committed
     * Operational Subject / queue seed, which is what selected this subject in the first
     * place. Without it the skeleton assumed the case grain and drew the org's published
     * enrollment layout over every child subject, then swapped to the child composition on
     * settle. Defaulting to `opportunity` keeps the long-standing behaviour for hosts that
     * genuinely cannot say.
     */
    subjectGrain?: OperationalSubjectType;
    /** Whether a settled family opportunity stands behind the subject (child grain only). */
    familySettlement?: boolean;
}) {
    const isSummary = mode === "summary";
    // Mounting this hook triggers the module-cached published-doc load EARLY, so by the
    // time the record payload resolves the doc is already warm. We gate the composed grid on
    // the fetch having SETTLED: until then we cannot know the org's real layout, and picking
    // the code default now would REFLOW to the published layout on load (the exact flash we
    // are removing). The record VM always resolves AFTER the doc, so once the resolved body
    // can render, the doc is settled — the skeleton and resolved surface pick the same grid.
    const { doc: publishedDoc, loaded: docLoaded } = usePublishedFocusPanelSummaryDocState(isSummary);
    // Only the case grain composes from the publication, so only the case grain has to WAIT
    // for it. A child subject's composition is code-owned and known immediately.
    const needsPublication = focusPanelSummaryUsesPublishedDoc(subjectGrain, { familySettlement });
    const activeDoc =
        !isSummary || (needsPublication && !docLoaded)
            ? null
            : resolveFocusPanelSummaryActiveDoc({
                  isSummary,
                  grain: subjectGrain,
                  publishedDoc,
                  context: { familySettlement },
              });

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
                <ReservedSettlementRegion />
                {isSummary ? <ReservedSettlementRegion /> : null}
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
                // The skeleton and the resolved body plan the SAME published layout the same
                // way, and now they do so because there is nothing left to disagree about:
                // `planPublishedLayout` takes no strategy hint. A disagreement here was a
                // STRATEGY SWAP on settle — different DOM, different geometry — which is the
                // exact reflow this component exists to prevent.
                composeCards={inputs.composeCards}
                compositionOverrides={inputs.compositionOverrides}
                renderCell={() => <ReservedSettlementRegion />}
            />
        </div>
    );
}
