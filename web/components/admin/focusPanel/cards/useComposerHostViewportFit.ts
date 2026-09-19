"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Let the composer host end where the SCREEN ends, not where a fraction of it does.
 *
 * ## What was measured
 *
 * The host is capped with `max-height: min(70vh, 640px)`, which is blind to where the host actually
 * starts. On the certified Enrollment specimen at a 900px desktop viewport the host began at y=433 —
 * the child record sits above it — so 467px were available and the cap allowed 630. The result was
 * not a cosmetic overflow: the composer's footer landed at y=905–941, and **the operator could not
 * see or click Send at all**.
 *
 * A smaller fixed fraction would only move the failure to a different panel, because the top offset
 * is a property of whatever card is open, not of the viewport.
 *
 * ## What this does
 *
 * Publishes the space actually available below the host as `--alloy-os-composer-available`, which
 * the stylesheet takes as one more term in the same `min()`. The cap therefore stays declarative and
 * still honours 70vh and 640px; it simply can no longer exceed the screen.
 *
 * It sets a MAX, never a height: the host keeps sizing itself, so nothing here can blind an observer
 * that is watching its content — which is the failure mode a pinned height would reintroduce.
 *
 * ## The screen is not the only thing that bounds it
 *
 * The host lives inside a focused card that has a max-height of its own, and that cap is SMALLER
 * than the screen on a short viewport and LARGER on a tall one. Measuring only to the window edge
 * was therefore wrong in both directions: on a 900px viewport it reported 489px where the card
 * allowed 461, and a floor built on it pushed the Send row 25px through the card's bottom edge —
 * still inside the window, and visibly cut off. On an 1100px viewport it under-reported nothing but
 * the card had 212px spare that nothing claimed.
 *
 * So the smaller of the two bounds is published. Both are real; neither is a guess.
 */
export function useComposerHostViewportFit() {
    const elRef = useRef<HTMLDivElement | null>(null);
    const lastRef = useRef<number>(-1);

    const measure = useCallback(() => {
        const el = elRef.current;
        if (!el || typeof window === "undefined") return;
        const top = el.getBoundingClientRect().top;
        /*
         * The nearest bound BELOW this host: the window, or the focused card it sits in, whichever
         * ends first. `max-height` is read rather than the rendered height, because the card is
         * content-sized — its current height is what the composer already takes, so using it would
         * make the cap agree with itself and the composer could never grow.
         */
        const card = el.closest("article.alloy-os-ucard") as HTMLElement | null;
        let bottomBound = window.innerHeight;
        if (card) {
            const cap = Number.parseFloat(window.getComputedStyle(card).maxHeight);
            if (Number.isFinite(cap) && cap > 0) {
                bottomBound = Math.min(bottomBound, card.getBoundingClientRect().top + cap);
            }
        }
        // A small gutter, so the footer never sits flush against the edge that bounds it.
        const available = Math.max(200, Math.round(bottomBound - top - 8));
        // The host's TOP is decided by what precedes it, never by its own height, so writing the
        // cap cannot feed back into the measurement. The threshold is only to avoid churn.
        if (Math.abs(available - lastRef.current) < 3) return;
        lastRef.current = available;
        el.style.setProperty("--alloy-os-composer-available", `${available}px`);
    }, []);

    const ref = useCallback(
        (node: HTMLDivElement | null) => {
            elRef.current = node;
            if (node) measure();
        },
        [measure],
    );

    useEffect(() => {
        measure();
        const onChange = () => measure();
        window.addEventListener("resize", onChange);
        window.addEventListener("scroll", onChange, true);
        return () => {
            window.removeEventListener("resize", onChange);
            window.removeEventListener("scroll", onChange, true);
        };
    }, [measure]);

    return ref;
}
