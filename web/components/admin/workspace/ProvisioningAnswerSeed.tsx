"use client";

import { useMemo } from "react";
import { seedProvisioningForRoute } from "@/lib/runtime/kernel/workUnitProvisioningPrefetch";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

/**
 * Seeds a server-composed Provisioning Answer into the client K2 cache BEFORE K2's post-hydration
 * consume runs (Runtime V1 — Law 2/5). Uses the canonical kernel preload seam (RA-1):
 *
 * The parent hands us the ROUTE IDENTITY (target [+ lens/subject]) and the resolved answer; the KERNEL
 * derives K2's cache key — this layer never touches the key scheme, so it cannot drift from K2's consume
 * key. The write is SYNCHRONOUS (`useMemo`, render phase), co-located with `WorkUnitSlugRouteHost` in the
 * layout — the same early-hydrating boundary whose render-phase write precedes the Surface Host's
 * cold-load consume. K2 then resolves warm with no network hop.
 *
 * Renders nothing; runs no controller effects. A null answer (gate failure / non-committable terminal)
 * seeds nothing → K2 falls back to its existing live fetch. Every latest-click-wins guard is untouched.
 */
export default function ProvisioningAnswerSeed({
    target,
    lens = null,
    subject = null,
    answer,
}: {
    target: string;
    lens?: string | null;
    subject?: string | null;
    answer: ProvisioningAnswer | null;
}) {
    useMemo(() => {
        seedProvisioningForRoute({ target, lens, subject }, answer);
    }, [target, lens, subject, answer]);
    return null;
}
