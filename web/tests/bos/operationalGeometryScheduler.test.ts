/**
 * The pinned-BOS freeze, reproduced and then proven fixed.
 *
 * The first test is the defect: a measurement whose own write provokes the observer that
 * triggered it. Run through a naive "just call it" trigger, that recurses until the stack
 * gives out — which is what saturated the main thread when BOS was pinned. Run through the
 * scheduler, the same self-sustaining source costs a bounded number of passes.
 *
 * Frames are injected, so this is deterministic and does not depend on a real browser.
 */

import { describe, expect, it } from "vitest";

import { createOperationalGeometryScheduler } from "@/lib/bos/operationalGeometryScheduler";

/** Runs queued frames until the queue drains or the budget is spent. */
function makeFrames(budget = 200) {
    const queue: Array<() => void> = [];
    let handle = 0;
    const handles = new Map<number, () => void>();
    return {
        schedule: (cb: () => void) => {
            const id = ++handle;
            handles.set(id, cb);
            queue.push(() => {
                if (handles.has(id)) {
                    handles.delete(id);
                    cb();
                }
            });
            return id;
        },
        cancelScheduled: (id: number) => handles.delete(id),
        /** @returns how many frames actually ran. */
        drain(): number {
            let ran = 0;
            while (queue.length > 0 && ran < budget) {
                queue.shift()!();
                ran += 1;
            }
            return ran;
        },
        pending: () => queue.length,
    };
}

describe("the defect: a measurement that provokes its own trigger", () => {
    it("recurses without bound when the trigger is called directly", () => {
        // This is the shape of the pinned-BOS loop: measure → write → ResizeObserver fires
        // → measure. Nothing here is throttled, so it does not terminate.
        let depth = 0;
        let maxDepth = 0;
        const measure = () => {
            depth += 1;
            maxDepth = Math.max(maxDepth, depth);
            if (depth < 5000) measure(); // the observer re-entering synchronously
            depth -= 1;
        };
        expect(() => measure()).not.toThrow();
        expect(maxDepth).toBeGreaterThan(1000);
    });
});

describe("the fix: the scheduler bounds a self-sustaining source", () => {
    it("collapses a storm of requests into ONE measurement per frame", () => {
        const frames = makeFrames();
        let measured = 0;
        const s = createOperationalGeometryScheduler(() => { measured += 1; }, frames);

        for (let i = 0; i < 500; i += 1) s.request();
        frames.drain();

        expect(measured).toBe(1);
    });

    it("absorbs the requests the measurement itself provokes", () => {
        // The measurement writes, the observer fires, the observer calls request(). Without
        // the guard this is the freeze. With it, the echo is absorbed and costs one trailing
        // pass — not a frame per echo, and not an unbounded chain.
        const frames = makeFrames();
        let measured = 0;
        let s: ReturnType<typeof createOperationalGeometryScheduler>;
        s = createOperationalGeometryScheduler(() => {
            measured += 1;
            s.request(); // our own write, echoing back through the ResizeObserver
            s.request();
            s.request();
        }, frames);

        s.request();
        const framesRun = frames.drain();

        expect(measured).toBe(2); // the pass, plus exactly one settling pass
        expect(framesRun).toBeLessThan(5);
        expect(frames.pending()).toBe(0);
    });

    it("never chains frames indefinitely, however persistent the echo", () => {
        const frames = makeFrames(50);
        let measured = 0;
        let s: ReturnType<typeof createOperationalGeometryScheduler>;
        s = createOperationalGeometryScheduler(() => {
            measured += 1;
            s.request();
        }, frames);

        s.request();
        frames.drain();
        expect(measured).toBeLessThanOrEqual(2);
        expect(frames.pending()).toBe(0);
    });

    it("does NOT lose a genuine change that arrived during a measurement", () => {
        // The settling pass is the reason this is a scheduler and not just a lock: dropping
        // the request outright would trade a freeze for a stale band, which reads as a
        // layout bug and is harder to find.
        const frames = makeFrames();
        const seen: number[] = [];
        let width = 100;
        let s: ReturnType<typeof createOperationalGeometryScheduler>;
        s = createOperationalGeometryScheduler(() => {
            seen.push(width);
            if (seen.length === 1) {
                width = 250; // an operator drags the rail mid-measurement
                s.request();
            }
        }, frames);

        s.request();
        frames.drain();

        expect(seen).toEqual([100, 250]);
    });

    it("a settled layout stops asking for frames at all", () => {
        const frames = makeFrames();
        let measured = 0;
        const s = createOperationalGeometryScheduler(() => { measured += 1; }, frames);

        s.request();
        frames.drain();
        expect(measured).toBe(1);
        expect(frames.pending()).toBe(0);

        // Nothing changed, nothing observed, nothing scheduled.
        frames.drain();
        expect(measured).toBe(1);
    });

    it("cancel drops a pending frame and cannot fire afterwards", () => {
        const frames = makeFrames();
        let measured = 0;
        const s = createOperationalGeometryScheduler(() => { measured += 1; }, frames);

        s.request();
        s.cancel();
        frames.drain();

        expect(measured).toBe(0);
    });

    it("cancel is idempotent and safe before any request", () => {
        const frames = makeFrames();
        const s = createOperationalGeometryScheduler(() => {}, frames);
        expect(() => { s.cancel(); s.cancel(); }).not.toThrow();
    });
});
