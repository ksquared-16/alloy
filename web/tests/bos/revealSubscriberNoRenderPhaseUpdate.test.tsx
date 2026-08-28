/**
 * The reveal subscriber must not enqueue a state update it does not owe.
 *
 * `declareWorkUnitSurfaceMounted` publishes synchronously from a `useMemo` — during
 * `WorkUnitSlugRouteHost`'s render, deliberately, because declaring it in an effect left the
 * lifecycle reading terminal from paint until 717 ms later. That is certified and must stay, and
 * deferring the PUBLISHER instead breaks two BOS exposure contracts (a provisional commit exposing
 * a pending epoch, and a stale epoch's park exposing the current rail) — measured, then reverted.
 *
 * So the fix belongs to the component doing the update. On load nothing is parked, so the old
 * updater returned `prev` unchanged — a no-op that still enqueued during another component's
 * render, which is what React reported. The listener now reads the current value first and returns
 * early, so the common case enqueues nothing and observable state is identical.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "contexts/BosPresentationControllerContext.tsx"), "utf8");
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("reveal subscriber render-phase safety", () => {
    it("the listener decides from a ref before enqueueing anything", () => {
        const listener = code.slice(code.indexOf("subscribeWorkUnitRevealLifecycle(() =>"));
        const body = listener.slice(0, listener.indexOf("});") + 3);
        expect(body).toMatch(/parkedRevealEpochRef\.current/);
        // An early return, not an updater that returns `prev`.
        expect(body).toMatch(/return;/);
        expect(body, "the no-op updater is what warned").not.toMatch(/setParkedRevealEpoch\(\(prev\)/);
    });

    it("every parked-epoch write goes through the guarded commit", () => {
        // Direct setter calls would reintroduce the unowed enqueue.
        const direct = [...code.matchAll(/setParkedRevealEpoch\(/g)].length;
        const inside = code.indexOf("const commitParkedRevealEpoch");
        const commitBody = code.slice(inside, inside + 260);
        expect(commitBody).toMatch(/setParkedRevealEpoch\(next\)/);
        expect(direct, "setParkedRevealEpoch is called only inside commitParkedRevealEpoch").toBe(1);
    });

    it("the commit is a no-op when the value is unchanged", () => {
        const inside = code.indexOf("const commitParkedRevealEpoch");
        const commitBody = code.slice(inside, inside + 260);
        expect(commitBody).toMatch(/if \(parkedRevealEpochRef\.current === next\) return;/);
    });

    it("POSITIVE CONTROL — the pre-fix updater enqueues even when nothing changes", () => {
        // Models React's enqueue: the setter is invoked, and only then does the updater bail.
        let enqueued = 0;
        const setState = (updater: (p: number | null) => number | null) => { enqueued += 1; updater(null); };
        const epoch = 7;
        setState((prev) => (prev === null || prev === epoch ? prev : null));   // pre-fix shape
        expect(enqueued, "the pre-fix shape DOES enqueue during render").toBe(1);

        let guarded = 0;
        const prev: number | null = null;
        if (!(prev === null || prev === epoch)) guarded += 1;                   // post-fix shape
        expect(guarded, "the guarded shape enqueues nothing").toBe(0);
    });

    it("the PUBLISHER stays synchronous — the certified render-phase read", () => {
        const pub = readFileSync(join(process.cwd(), "lib/adminV2/runtime/preload/drawerVmPrewarmScheduler.ts"), "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        const fn = pub.slice(pub.indexOf("function publishRevealLifecycle"));
        const body = fn.slice(0, fn.indexOf("\n}") + 2);
        expect(body, "deferring the publisher broke two BOS exposure contracts").not.toMatch(/queueMicrotask|Promise\.resolve/);
    });
});
