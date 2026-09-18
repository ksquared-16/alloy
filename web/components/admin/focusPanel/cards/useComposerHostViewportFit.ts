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
 */
export function useComposerHostViewportFit() {
    const elRef = useRef<HTMLDivElement | null>(null);
    const lastRef = useRef<number>(-1);

    const measure = useCallback(() => {
        const el = elRef.current;
        if (!el || typeof window === "undefined") return;
        const top = el.getBoundingClientRect().top;
        // A small gutter, so the footer never sits flush against the viewport edge.
        const available = Math.max(200, Math.round(window.innerHeight - top - 8));
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
