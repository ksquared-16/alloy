"use client";

import { useMemo } from "react";
import { seedProvisioning } from "@/lib/runtime/kernel/workUnitProvisioningPrefetch";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

/**
 * Seeds a server-composed Provisioning Answer into the client K2 cache BEFORE K2's post-hydration
 * consume runs (Runtime V1 Realization — Law 2/5).
 *
 * SEED-ONLY, co-located with `WorkUnitSlugRouteHost` in the layout — the same early-hydrating boundary
 * whose render-phase write is proven to precede the Surface Host's cold-load consume. The write is
 * SYNCHRONOUS (`useMemo`, render phase), so it lands before K2 reads the cache; K2 then resolves warm
 * with no network hop. Receives a RESOLVED answer (a plain serializable object — the same shape the D1
 * HTTP route returns); a null answer (gate failure / non-committable terminal) seeds nothing and K2
 * falls back to its existing live fetch, so behavior and the rollback path are unchanged.
 *
 * It runs NO controller effects and renders nothing — the Surface Host stays the one renderer, K2 the
 * one owner of the atomic commit; every generation/supersession guard (latest-click-wins) is untouched.
 *
 * The key MUST equal what K2 builds (`provisioningAnswerUrl(ref.target, ref.lens, ref.subject)`), keyed
 * on the RAW route slug. The parent computes it identically to `attentionFromUrl`.
 */
export default function ProvisioningAnswerSeed({
    seedUrl,
    answer,
}: {
    seedUrl: string;
    answer: ProvisioningAnswer | null;
}) {
    useMemo(() => {
        if (answer) seedProvisioning(seedUrl, answer);
    }, [seedUrl, answer]);
    return null;
}
