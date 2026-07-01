"use client";

import { useEffect, useRef, useState } from "react";

/**
 * One-shot intersection gate for drawer enrichment sections (tours, packets, record_section actions).
 * Disconnects after first intersect so scroll-away does not cancel in-flight work.
 */
export function useDrawerSectionIntersection(gateEnabled: boolean, rootMargin = "0px") {
    const ref = useRef<HTMLDivElement | null>(null);
    const [intersecting, setIntersecting] = useState(false);

    useEffect(() => {
        if (!gateEnabled) {
            setIntersecting(false);
            return;
        }
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    setIntersecting(true);
                    obs.disconnect();
                }
            },
            { root: null, rootMargin, threshold: 0.01 }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [gateEnabled, rootMargin]);

    return { ref, intersecting };
}
