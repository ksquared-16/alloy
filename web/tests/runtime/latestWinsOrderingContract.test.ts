/**
 * LAW 25 — the latest operator intent wins, whatever order responses arrive in.
 *
 * Previously browser-verified only, and untestable without wall-clock timing. Ordering here is
 * decided by ISSUE ORDER, so these guards are deterministic: they never sleep, and they behave the
 * same on a loaded host as an idle one.
 */
import { describe, expect, it } from "vitest";

import { createLatestWinsGate, createSubjectGate } from "@/lib/runtime/latestWins";

describe("latest-click-wins", () => {
    it("a stale response that resolves LAST may not overwrite the newer one", () => {
        const gate = createLatestWinsGate();
        let committed: string | null = null;
        const set = (v: string) => { committed = v; };

        const a = gate.issue();          // click A
        const b = gate.issue();          // click B
        expect(gate.commit(b, set, "B")).toBe(true);   // B resolves first
        expect(gate.commit(a, set, "A")).toBe(false);  // A resolves LATER — must not land
        expect(committed).toBe("B");
    });

    it("POSITIVE CONTROL — the latest ticket does commit", () => {
        const gate = createLatestWinsGate();
        let committed: string | null = null;
        const a = gate.issue();
        expect(gate.commit(a, (v: string) => { committed = v; }, "A")).toBe(true);
        expect(committed).toBe("A");
    });

    it("holds across three interleaved intents", () => {
        const gate = createLatestWinsGate();
        const order: string[] = [];
        const a = gate.issue(), b = gate.issue(), c = gate.issue();
        gate.commit(b, (v: string) => order.push(v), "B");
        gate.commit(c, (v: string) => order.push(v), "C");
        gate.commit(a, (v: string) => order.push(v), "A");
        expect(order).toEqual(["C"]);
    });

    it("TWO LOADS MUST NOT SHARE ONE GATE — the defect this codebase already paid for", () => {
        // One gate for two independent loads: each invalidates the other and BOTH are discarded.
        const shared = createLatestWinsGate();
        let ledger: string | null = null, card: string | null = null;
        const l = shared.issue();
        const c = shared.issue();
        expect(shared.commit(l, (v: string) => { ledger = v; }, "ledger")).toBe(false); // self-cancelled
        expect(shared.commit(c, (v: string) => { card = v; }, "card")).toBe(true);
        expect(ledger).toBeNull();

        // One gate PER LOAD: both land, and each still rejects its own stale response.
        const gl = createLatestWinsGate(), gc = createLatestWinsGate();
        let ledger2: string | null = null, card2: string | null = null;
        const l2 = gl.issue(), c2 = gc.issue();
        expect(gl.commit(l2, (v: string) => { ledger2 = v; }, "ledger")).toBe(true);
        expect(gc.commit(c2, (v: string) => { card2 = v; }, "card")).toBe(true);
        expect([ledger2, card2]).toEqual(["ledger", "card"]);
    });
});

describe("Activity subject switching", () => {
    it("a stale subject's response may never replace the attended subject's content", () => {
        const gate = createSubjectGate<string>();
        let shown: string | null = null;
        const render = (v: string) => { shown = v; };

        gate.attend("childA");            // open Activity on A -> request A
        gate.attend("childB");            // switch to B        -> request B
        expect(gate.commit("childB", render, "activity-B")).toBe(true);
        expect(gate.commit("childA", render, "activity-A")).toBe(false); // A resolves after B
        expect(shown).toBe("activity-B");
    });

    it("re-attending a subject makes its in-flight response legitimate again", () => {
        // The case a pure counter gets WRONG: back to A, so an in-flight A response is correct.
        const gate = createSubjectGate<string>();
        let shown: string | null = null;
        gate.attend("childA");
        gate.attend("childB");
        gate.attend("childA");
        expect(gate.commit("childA", (v: string) => { shown = v; }, "activity-A")).toBe(true);
        expect(shown).toBe("activity-A");
    });

    it("nothing commits before a subject is attended", () => {
        const gate = createSubjectGate<string>();
        let shown: string | null = null;
        expect(gate.commit("childA", (v: string) => { shown = v; }, "activity-A")).toBe(false);
        expect(shown).toBeNull();
        expect(gate.current()).toBeNull();
    });
});
