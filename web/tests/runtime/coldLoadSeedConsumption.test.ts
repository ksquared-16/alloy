/**
 * P0-7.6 — THE SEED MUST BE CONSUMED, NOT REFETCHED.
 *
 * ── THE REGRESSION THIS EXISTS TO CATCH ─────────────────────────────────────────────────────────
 *
 * Cold-load attention hydration lives in a `useEffect`, which does not run until React has hydrated
 * the whole tree. Measured on deployed 5e312eb3 (n=26): the OS shell painted at 619ms and the Focus
 * Panel chain did not start until 1,521ms, so for 900ms the client was alive with the
 * server-composed answer already in the flight payload and nothing had asked for it. Moving the
 * hydration into render is the obvious repair, and it was tried.
 *
 * It broke the seed. Deployed 5cc97186, n=24: a live `provisioning-answer` network fetch in
 * 23 of 24 samples, where the effect-based version had 0 of 26. FIRST_AUTHORITATIVE_FRAME P50 did
 * improve (1,557 -> 1,377ms) because the fetch overlaps, but P95 went 2,405 -> 7,642ms. The change
 * was reverted.
 *
 * THE ORDERING, PLAINLY. `provisioning.onAttentionMoved` runs synchronously up to its first await,
 * and that stretch reaches `consumeFreshProvisioningForRoute`. The seed is registered by a
 * render-phase write in the PAGE SEGMENT, which is a DESCENDANT of `SurfaceHostProvider`. React
 * renders ancestors first. So any hydration that happens during the provider's render — or in a
 * microtask after that render pass, which was also tried — can still precede the descendant's
 * registration, consume nothing, and pay for a round trip the document already carried.
 *
 * ── A CORRECTION, FROM THE REVERT'S OWN MEASUREMENT ─────────────────────────────────────────────
 *
 * The paragraph above originally ended by concluding that the effect is "what makes the seed
 * reachable". The revert disproved that. On d198b6ca — the effect restored — the live fetch was
 * still 25 of 26, while `seedReachedClient.present` was 26 of 26 and the seed's own match
 * diagnostic reported `ok: true`. So the payload carries the seed and the CONSUME misses it, on a
 * build whose hydration ordering is identical to the one that had 0 of 26.
 *
 * The render-phase experiment therefore did not cause the seed miss. What it did cause, measurably,
 * was the P95: 2,405 -> 7,642ms, recovering to 1,892ms once reverted. That is the reason these
 * assertions stand, and it is the only claim they are entitled to make.
 *
 * The missed consume asks for the BARE base key
 * (`/api/admin/work-units/new-leads/provisioning-answer`, no `work_view_id`) and costs ~2.2s. It
 * appeared between 5e312eb3 and 5cc97186 and survives this revert, so its owner is elsewhere and is
 * not yet identified. Recorded here because this is the file a reader will reach for.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const codeOf = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const HOST = codeOf(read("lib/experience/surfaceHost/SurfaceHostContext.tsx"));
const KERNEL = codeOf(read("lib/runtime/kernel/RuntimeKernelContext.tsx"));

describe("the cold-load seed is consumed, not refetched", () => {
    it("attention hydration stays in an effect, so the descendant seed is registered first", () => {
        const idx = HOST.indexOf("kernel.attention.hydrate(h)");
        expect(idx).toBeGreaterThan(-1);
        // The nearest enclosing hook before the hydrate call must be an effect, not a render-phase
        // one. `useMemo` here is what produced the 23/24 seed miss.
        const before = HOST.slice(0, idx);
        const lastEffect = before.lastIndexOf("useEffect(");
        const lastMemo = before.lastIndexOf("useMemo(");
        expect(lastEffect).toBeGreaterThan(-1);
        expect(lastEffect).toBeGreaterThan(lastMemo);
    });

    it("K2 is not deferred behind a microtask hop", () => {
        /*
         * The microtask was the attempted fix for the ordering above, and it did not work: the
         * render pass it waits for is not necessarily the one that registers the seed. It is listed
         * here so a future reader knows it was measured rather than assumed.
         */
        expect(KERNEL).not.toContain("queueMicrotask");
        expect(KERNEL).toContain("void provisioning.onAttentionMoved(e)");
    });
});
