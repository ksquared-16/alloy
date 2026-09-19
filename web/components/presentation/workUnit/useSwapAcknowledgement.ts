"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * NAVIGATION SWAP ACKNOWLEDGEMENT — "your click registered, the destination is changing".
 *
 * ── WHAT THIS IS NOT ──
 *
 * It is not a loading state and it is not part of the performance architecture. It never gates a
 * request, never holds content, and never participates in when the operator is allowed to see an
 * authoritative answer. Metric V2.1 classifies the resulting mutation as PRESENTATIONAL_ANIMATION,
 * which does not advance finality.
 *
 * ── WHY A FIXED TIMER, NOT "UNTIL THE DATA ARRIVES" ──
 *
 * The obvious implementation clears the acknowledgement when the destination identity changes. That
 * turns a 160ms flourish into an open-ended dim lasting however long the load takes — a loading
 * state wearing a transition's clothes, dimming truth the whole time it is on screen. So the window
 * is fixed and short: the acknowledgement ends on its own, and the content appears exactly when it
 * is ready, neither sooner nor later. The two are concurrent and independent by construction.
 *
 * ── RAPID SWITCHING ──
 *
 * Each acknowledgement CANCELS the one before it, so A → B → C runs one window, not three. Nothing
 * queues, nothing stacks, and no expiring timer from an older destination can restore a surface the
 * operator has already navigated away from: there is only ever one timer, and it belongs to the
 * newest click.
 *
 * Duration defaults to `--motion-micro` (160ms), the canonical duration the Alloy motion language
 * already defines for a swap. The CSS side (`.motion-swap-region`) owns the easing and the
 * reduced-motion collapse.
 */
export const SWAP_ACKNOWLEDGEMENT_MS = 160;

export function useSwapAcknowledgement(durationMs: number = SWAP_ACKNOWLEDGEMENT_MS): {
    swapping: boolean;
    acknowledge: () => void;
} {
    const [swapping, setSwapping] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const acknowledge = useCallback(() => {
        // Newest destination wins: cancel any window still running before opening this one.
        if (timer.current !== null) clearTimeout(timer.current);
        setSwapping(true);
        timer.current = setTimeout(() => {
            timer.current = null;
            setSwapping(false);
        }, durationMs);
    }, [durationMs]);

    // A timer that outlives the surface would call setState on an unmounted tree.
    useEffect(
        () => () => {
            if (timer.current !== null) clearTimeout(timer.current);
        },
        [],
    );

    return { swapping, acknowledge };
}
