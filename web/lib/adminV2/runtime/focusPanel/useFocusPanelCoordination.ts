"use client";

/**
 * Focus Panel coordination — CLIENT HOOKS only.
 *
 * The React orchestration of the pure coordination model
 * (`focusPanelCoordinationModel.ts`). Imported ONLY from client components — never
 * from server / App Route code (which must stay React-free; see the model module).
 *
 * These hooks orchestrate the EXISTING local perspective state the Core Four own:
 * a card reports its depth (host raises it + recedes the rest), and responds to the
 * host's dismiss signal (collapse back to base). No fetch, no route, no new primitive.
 */

import { useEffect, useRef } from "react";

import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import {
    clampPerspectiveForCard,
    type FocusPanelCoordination,
    type FocusPanelPerspectiveLevel,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";

/**
 * Report a card's current perspective depth to the host so it can apply the
 * in-panel depth layer (raise this card, recede the rest). Resets to `base` on
 * unmount. `reportPerspective` is captured via ref so the effect does not re-fire
 * when the coordination object identity changes (e.g. on every handoff request).
 */
export function useReportPerspective(
    coordination: FocusPanelCoordination | undefined,
    card: FocusPanelCardKey,
    level: FocusPanelPerspectiveLevel,
): void {
    const reportRef = useRef(coordination?.reportPerspective);
    reportRef.current = coordination?.reportPerspective;

    // Diagnostic cards never elevate: clamp so they only ever report base/evidence.
    const effective = clampPerspectiveForCard(card, level);

    useEffect(() => {
        reportRef.current?.(card, effective);
    }, [card, effective]);

    useEffect(() => {
        return () => {
            reportRef.current?.(card, "base");
        };
    }, [card]);
}

/**
 * Run `reset` when the host dismisses this card's depth layer (backdrop click or
 * ESC). The card collapses back to its base Work surface. Keyed by card so only the
 * active focused/edit card responds. `reset` is captured via ref to keep the effect
 * gated solely on the dismissal nonce.
 */
export function useDismissSignal(
    coordination: FocusPanelCoordination | undefined,
    card: FocusPanelCardKey,
    reset: () => void,
): void {
    const resetRef = useRef(reset);
    resetRef.current = reset;
    const dismissed = coordination?.dismissed;
    const nonce = dismissed?.card === card ? dismissed.nonce : null;

    /*
     * A DISMISSAL IS AN EVENT, NOT A STATE.
     *
     * The host keeps the last `dismissed` signal for as long as it lives — nothing clears it. Reacting
     * to whatever nonce is present on MOUNT therefore replays a dismissal that has already been
     * answered. That is exactly how a backdrop/Esc close killed the Focus Panel until refresh (E2E-10):
     * the command workspace is hosted by mounting a fresh `CurrentWorkCard`, which saw the old
     * dismissal and closed itself in the same commit, so no later command ever appeared.
     *
     * The nonce present at mount is history; only a nonce that changes while this card is mounted is
     * a dismissal addressed to it.
     */
    const answeredRef = useRef(nonce);

    useEffect(() => {
        if (nonce == null || nonce === answeredRef.current) return;
        answeredRef.current = nonce;
        resetRef.current();
    }, [nonce]);
}
