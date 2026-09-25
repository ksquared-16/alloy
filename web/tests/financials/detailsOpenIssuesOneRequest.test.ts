/**
 * ONE DETAILS OPENING, ONE CANONICAL CARD REQUEST.
 *
 * The duplicate was MEASURED at the fetch boundary on deployed staging rather than inferred — two
 * earlier repairs reasoned from the effect graph and both were wrong. The capture named two
 * concrete callers of one `load()`, 48ms apart, for the same account, overlapping:
 *
 *   #1 at 7,830ms  requestIdleCallback.timeout  → the prewarm
 *   #2 at 7,878ms  the React commit path        → "asked for: now", once the overlay opened
 *                   identicalInFlight: 1
 *
 * These gates drive the real mechanism with real concurrency. They count OPERATIONS STARTED, which
 * is the thing that regressed — a source assertion that a guard exists would have passed during
 * both failed repairs.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createInFlightCoalescer } from "@/lib/adminV2/runtime/focusPanel/financials/coalesceInFlight";

const code = (rel: string) =>
    readFileSync(join(process.cwd(), rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** A read that takes a tick, counting how many times it actually started. */
function countingWork() {
    let started = 0;
    let release: (() => void) | null = null;
    const gate = new Promise<void>((r) => { release = r; });
    return {
        started: () => started,
        release: () => release?.(),
        work: async () => { started += 1; await gate; return undefined; },
    };
}

describe("two callers, one operation", () => {
    it("the prewarm and the operator's ask issue ONE read, not two", async () => {
        const c = createInFlightCoalescer<void>();
        const w = countingWork();
        const key = "customer_id=29944d3e";
        /* The prewarm fires first, then the click 48ms later — both while the read is in the air. */
        const prewarm = c.run(key, w.work);
        const asked = c.run(key, w.work);
        expect(w.started(), "one operation, however many callers asked").toBe(1);
        expect(asked, "the second caller consumes the first's result").toBe(prewarm);
        w.release();
        await Promise.all([prewarm, asked]);
    });

    it("both callers receive the same settled answer", async () => {
        const c = createInFlightCoalescer<string>();
        let started = 0;
        const work = async () => { started += 1; return "one-answer"; };
        const [a, b] = await Promise.all([c.run("k", work), c.run("k", work)]);
        expect(started).toBe(1);
        expect(a).toBe("one-answer");
        expect(b).toBe("one-answer");
    });

    it("a DIFFERENT account is a different operation and is never joined", async () => {
        const c = createInFlightCoalescer<void>();
        const w = countingWork();
        c.run("customer_id=A", w.work);
        c.run("customer_id=B", w.work);
        expect(w.started(), "coalescing two accounts would hand one family's answer to another").toBe(2);
        w.release();
    });

    it("the slot is released on settle, so the next open reads fresh truth", async () => {
        const c = createInFlightCoalescer<void>();
        let started = 0;
        const work = async () => { started += 1; };
        await c.run("k", work);
        expect(c.inFlightKey(), "nothing is retained between operations").toBeNull();
        await c.run("k", work);
        expect(started, "this is a coalescer, not a cache").toBe(2);
    });

    it("a failed read releases the slot too, and does not wedge the surface", async () => {
        const c = createInFlightCoalescer<void>();
        let started = 0;
        const boom = async () => { started += 1; throw new Error("read failed"); };
        await expect(c.run("k", boom)).rejects.toThrow("read failed");
        expect(c.inFlightKey()).toBeNull();
        await expect(c.run("k", boom)).rejects.toThrow("read failed");
        expect(started).toBe(2);
    });
});

describe("the card routes its read through that mechanism", () => {
    it("load() coalesces on the composed query, so both callers share one request", () => {
        /*
         * ── WHY THIS NO LONGER ASKS FOR A PER-INSTANCE REF ─────────────────────────────────────
         *
         * It used to require `useRef(createInFlightCoalescer<void>())` — the coalescer owned by the
         * card instance. That was right while the only caller was the Focus Panel, where one
         * instance asks twice.
         *
         * In the Accounts workspace the card is KEYED BY ACCOUNT, so a selection mounts a new
         * instance with a new ref and an empty slot. A prewarm had nothing to hand its in-flight
         * read to, which is exactly why that host never received the read-ahead F44 assumes, and
         * why a click cost a full ~1.1s read.
         *
         * So the ownership moved out of the instance — and the property this test exists to protect
         * did not change at all. It was never "the ref is local"; it was ONE REQUEST PER LOAD, and
         * NO FINANCIAL TRUTH KEPT FOR SPEED. Both are asserted here, now against the seam that
         * actually performs the read.
         */
        const card = code("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(card, "the card asks the shared read rather than fetching the route itself").toMatch(
            /await readFinancialsCardVm\(query\)/,
        );
        expect(card, "and does not open a second path to the same endpoint").not.toMatch(
            /fetch\(`\/api\/admin\/financials\/card/,
        );

        const seam = code("lib/adminV2/runtime/focusPanel/financials/financialsCardRead.ts");
        expect(seam, "one coalescer, keyed by the composed query").toMatch(
            /createInFlightCoalescer<FinancialsCardVM \| null>\(\)/,
        );
        expect(seam, "the request is composed in one place, so two callers cannot spell it two ways")
            .toMatch(/financials\/card\?\$\{query\}/);
        for (const src of [card, seam]) {
            expect(
                /localStorage|sessionStorage|indexedDB/.test(src),
                "financial truth is never persisted for speed",
            ).toBe(false);
        }
        /*
         * AND IT IS STILL NOT A CACHE. The slot is cleared the instant the operation settles, which
         * is what keeps a mutation from having anything to invalidate.
         */
        const mech = code("lib/adminV2/runtime/focusPanel/financials/coalesceInFlight.ts");
        expect(mech).toMatch(/if \(slot\?\.promise === promise\) slot = null;/);
    });

    it("both callers still exist — the repair coalesced them, it did not delete the prewarm", () => {
        const card = code("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(card, "the prewarm still predicts the operator's ask").toMatch(/requestIdleCallback/);
        expect(card, "and the click still asks outright").toMatch(/if \(overlay \|\| detailPending\)/);
    });
});
