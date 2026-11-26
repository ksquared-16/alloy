/** @vitest-environment jsdom */

import { describe, expect, it, beforeEach } from "vitest";

import { resolveFloatingExposure } from "@/lib/bos/resolveFloatingExposure";
import {
    beginWorkUnitPrimaryReveal,
    declareWorkUnitSurfaceMounted,
    endWorkUnitPrimaryReveal,
    isWorkUnitRevealTerminal,
    releaseWorkUnitSurface,
    subscribeWorkUnitRevealLifecycle,
    workUnitRevealEpoch,
} from "@/lib/adminV2/runtime/preload/drawerVmPrewarmScheduler";

/**
 * R6 — the BOS exposure rule, exercised as the consumer actually composes it.
 *
 * The lifecycle guards prove the state machine. These prove the thing that broke: what the rail may
 * SHOW, given a lifecycle state and a committed placement. They model the controller's own
 * composition — a park commits trust only while the lifecycle is terminal, and a new epoch drops it —
 * so a scenario cannot pass by calling a helper the product never reaches in that order.
 */

/** Mirrors the controller: trust is granted by a park, and only while the lifecycle is terminal. */
function makeController(canvas: "expanded" | "compact" | "constrained" = "expanded") {
    let parkedRevealEpoch: number | null = null;
    let ambientMeasured = false;
    const unsubscribe = subscribeWorkUnitRevealLifecycle(() => {
        if (isWorkUnitRevealTerminal()) return;
        const epoch = workUnitRevealEpoch();
        if (parkedRevealEpoch !== null && parkedRevealEpoch !== epoch) parkedRevealEpoch = null;
    });
    return {
        measureCanvas: () => { ambientMeasured = true; },
        /** The debounced observer's park. Commitment is epoch-bound and only counts when terminal. */
        park: () => { if (isWorkUnitRevealTerminal()) parkedRevealEpoch = workUnitRevealEpoch(); },
        exposed: (opts?: { operatorPositioned?: boolean; effective?: string }) =>
            resolveFloatingExposure({
                effective: opts?.effective ?? "floating",
                canvas,
                operatorPositioned: opts?.operatorPositioned ?? false,
                ambientMeasured,
                parkedRevealEpoch,
            }),
        dispose: unsubscribe,
    };
}

beforeEach(() => {
    const e = declareWorkUnitSurfaceMounted(true);
    releaseWorkUnitSurface(e);
});

describe("BOS exposure fixtures", () => {
    it("direct Work Unit — hidden through pending/active, visible only after a terminal park", () => {
        const c = makeController();
        declareWorkUnitSurfaceMounted(true);
        c.measureCanvas();
        c.park();                                   // provisional: lifecycle is pending
        expect(c.exposed()).toBe(false);
        beginWorkUnitPrimaryReveal();
        expect(c.exposed()).toBe(false);
        endWorkUnitPrimaryReveal();                 // terminal
        expect(c.exposed()).toBe(false);            // ...but no park has committed since
        c.park();
        expect(c.exposed()).toBe(true);
        c.dispose();
    });

    it("geometry before reveal — a provisional commit cannot expose a pending epoch", () => {
        const c = makeController();
        c.measureCanvas();
        c.park();                                   // committed while idle
        declareWorkUnitSurfaceMounted(true);        // a Work Unit now declares
        expect(c.exposed()).toBe(false);            // the older commit is dropped
        c.dispose();
    });

    it("reveal before geometry — terminal alone does not expose", () => {
        const c = makeController();
        declareWorkUnitSurfaceMounted(true);
        c.measureCanvas();
        endWorkUnitPrimaryReveal();
        expect(c.exposed()).toBe(false);
        c.park();
        expect(c.exposed()).toBe(true);
        c.dispose();
    });

    it("data before geometry — a renderable rail with no committed placement stays hidden", () => {
        const c = makeController();
        declareWorkUnitSurfaceMounted(true);
        endWorkUnitPrimaryReveal();
        c.measureCanvas();                          // canvas known, no park yet
        expect(c.exposed()).toBe(false);
        c.dispose();
    });

    it("geometry before canvas measurement — still hidden", () => {
        const c = makeController();
        declareWorkUnitSurfaceMounted(true);
        endWorkUnitPrimaryReveal();
        c.park();
        expect(c.exposed()).toBe(false);            // ambient not measured
        c.measureCanvas();
        expect(c.exposed()).toBe(true);
        c.dispose();
    });

    it("empty Work Unit terminates and exposes — no deadlock, no phantom rail", () => {
        const c = makeController();
        declareWorkUnitSurfaceMounted(true);
        c.measureCanvas();
        endWorkUnitPrimaryReveal("empty");
        expect(isWorkUnitRevealTerminal()).toBe(true);
        c.park();
        expect(c.exposed()).toBe(true);
        c.dispose();
    });

    it("unavailable/forbidden Work Unit terminates immediately — no deadlock", () => {
        const c = makeController();
        declareWorkUnitSurfaceMounted(false);
        expect(isWorkUnitRevealTerminal()).toBe(true);
        c.measureCanvas();
        c.park();
        expect(c.exposed()).toBe(true);
        c.dispose();
    });

    it("errored Work Unit terminates — no permanent pending", () => {
        const c = makeController();
        declareWorkUnitSurfaceMounted(true);
        beginWorkUnitPrimaryReveal();
        endWorkUnitPrimaryReveal("error");
        c.measureCanvas();
        c.park();
        expect(c.exposed()).toBe(true);
        c.dispose();
    });

    it("navigation while pending — a stale epoch's park cannot expose the current rail", () => {
        const c = makeController();
        declareWorkUnitSurfaceMounted(true);
        c.measureCanvas();
        endWorkUnitPrimaryReveal();
        c.park();
        expect(c.exposed()).toBe(true);
        declareWorkUnitSurfaceMounted(true);        // replacement navigation
        expect(c.exposed()).toBe(false);
        c.dispose();
    });

    it("rapid replacement — the latest epoch wins", () => {
        const c = makeController();
        c.measureCanvas();
        declareWorkUnitSurfaceMounted(true);
        declareWorkUnitSurfaceMounted(true);
        const latest = workUnitRevealEpoch();
        endWorkUnitPrimaryReveal();
        c.park();
        expect(c.exposed()).toBe(true);
        expect(workUnitRevealEpoch()).toBe(latest);
        c.dispose();
    });

    it("non-Work-Unit surface — visible after its first committed placement, no lifecycle wait", () => {
        const c = makeController();
        expect(isWorkUnitRevealTerminal()).toBe(true);   // idle is terminal
        c.measureCanvas();
        c.park();
        expect(c.exposed()).toBe(true);
        c.dispose();
    });

    it("later legitimate re-park still commits after the rail is visible", () => {
        const c = makeController();
        declareWorkUnitSurfaceMounted(true);
        c.measureCanvas();
        endWorkUnitPrimaryReveal();
        c.park();
        expect(c.exposed()).toBe(true);
        c.park();                                   // observer re-parks on real content change
        expect(c.exposed()).toBe(true);
        c.dispose();
    });

    it("constrained canvas is outside the gate — behaviour unchanged", () => {
        const c = makeController("constrained");
        declareWorkUnitSurfaceMounted(true);         // never terminal, never parked
        expect(c.exposed()).toBe(true);
        c.dispose();
    });

    it("compact canvas IS gated — the defect was measured there too", () => {
        const c = makeController("compact");
        declareWorkUnitSurfaceMounted(true);
        expect(c.exposed()).toBe(false);
        c.dispose();
    });

    it("an operator-positioned window is never withheld", () => {
        const c = makeController();
        declareWorkUnitSurfaceMounted(true);
        expect(c.exposed({ operatorPositioned: true })).toBe(true);
        c.dispose();
    });

    it("a non-floating mode is never withheld", () => {
        const c = makeController();
        declareWorkUnitSurfaceMounted(true);
        expect(c.exposed({ effective: "pinned" })).toBe(true);
        expect(c.exposed({ effective: "closed" })).toBe(true);
        c.dispose();
    });

    it("repeated terminal notification does not change exposure", () => {
        const c = makeController();
        declareWorkUnitSurfaceMounted(true);
        c.measureCanvas();
        endWorkUnitPrimaryReveal();
        endWorkUnitPrimaryReveal();
        c.park();
        expect(c.exposed()).toBe(true);
        c.dispose();
    });

    it("subscriber cleanup detaches — a later epoch cannot revoke a disposed consumer", () => {
        const c = makeController();
        declareWorkUnitSurfaceMounted(true);
        c.measureCanvas();
        endWorkUnitPrimaryReveal();
        c.park();
        c.dispose();
        declareWorkUnitSurfaceMounted(true);
        expect(c.exposed()).toBe(true);   // no longer listening — proves cleanup detached
    });
});
