"use client";

/**
 * The one `acknowledge` primitive (operational-motion-doctrine.md §Choreography 4 —
 * "the system confirms the operator's action"). Plays the spring `acknowledge` pulse
 * exactly once each time `active` rises false → true: the confidence signal that the
 * operator's selection registered. Selection lift, nothing more — the only place
 * `ease.spring` is used, so it is reserved for genuine acknowledgement.
 *
 * Consumes the existing token/class only (`MOTION_CHOREOGRAPHY.acknowledge` →
 * `.motion-acknowledge` in globals.css). It is NOT a new motion system: it is the shared
 * trigger the doctrine's implementation contract (§5, "one `acknowledge` primitive")
 * calls for, so selection/confirmation acknowledgement is identical everywhere.
 *
 * Reduced motion is handled at the token level (globals.css collapses `.motion-acknowledge`
 * to `animation: none`), so there is no per-consumer branch here — the class stays inert.
 *
 * The INITIAL value never pulses (auto-open of the first row / first render is not an
 * operator action); only a false → true transition does.
 */

import { useEffect, useRef, useState } from "react";

import { MOTION_CHOREOGRAPHY, motionDurationMs } from "@/lib/motion/motionTokens";

/** Spread the returned object onto the element that should acknowledge the action. */
export function useAcknowledgeOnActive(active: boolean): { className?: string } {
    const [pulsing, setPulsing] = useState(false);
    const prevActive = useRef(active);

    useEffect(() => {
        const rising = active && !prevActive.current;
        prevActive.current = active;
        if (!rising) return;
        setPulsing(true);
        // Clear once the pulse has played so the next rising edge can replay it. The buffer
        // past `motion.micro` guarantees the animation finishes before the class is removed.
        const timer = setTimeout(() => setPulsing(false), motionDurationMs("micro") + 60);
        return () => clearTimeout(timer);
    }, [active]);

    return pulsing ? { className: MOTION_CHOREOGRAPHY.acknowledge.className } : {};
}
