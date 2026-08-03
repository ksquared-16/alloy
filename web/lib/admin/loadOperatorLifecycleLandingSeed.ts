import "server-only";

import { loadOperatorLifecycleLandingCardsServer } from "@/lib/admin/loadOperatorLifecycleLandingServer";
import type { OperatorLifecycleLandingCard } from "@/lib/admin/buildOperatorLifecycleLanding";

/**
 * Landing-only first-paint seed load for the workspace lifecycle tiles.
 *
 * This is loaded IN THE LANDING ROUTE (`/workspace` page) — **not** the shared `/workspace` layout —
 * so the WORK-UNIT routes that share that layout never pay for this landing-only data (it was ~600 ms
 * of dead-weight DB work on every work-unit navigation: a landing-only seed with a per-unit N+1 that
 * no work-unit surface consumes). The landing's own server render seeds it here; the client
 * authoritative load (`loadOperatorLifecycleLandingCards`) still refines it in place.
 *
 * Capped (same doctrine as the prior layout seed) so a slow/N+1 query can never gate the landing
 * render — on timeout or error it degrades to `[]` and the client refinement path fills it in.
 */
export async function loadOperatorLifecycleLandingSeed(
    timeoutMs = 600,
): Promise<OperatorLifecycleLandingCard[]> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<OperatorLifecycleLandingCard[]>((resolve) => {
        timer = setTimeout(() => resolve([]), timeoutMs);
    });
    try {
        return await Promise.race([
            loadOperatorLifecycleLandingCardsServer().catch(() => []),
            timeout,
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}
