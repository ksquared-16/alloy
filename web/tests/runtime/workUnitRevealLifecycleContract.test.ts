/** @vitest-environment jsdom */

import { describe, expect, it, beforeEach } from "vitest";

import {
    beginWorkUnitPrimaryReveal,
    declareWorkUnitSurfaceMounted,
    endWorkUnitPrimaryReveal,
    isWorkUnitRevealTerminal,
    releaseWorkUnitSurface,
    subscribeWorkUnitRevealLifecycle,
    workUnitRevealEpoch,
    workUnitRevealLifecycle,
} from "@/lib/adminV2/runtime/preload/drawerVmPrewarmScheduler";

/**
 * R6 — the Work Unit reveal lifecycle, exercised through its public contract.
 *
 * The lifecycle exists because `isWorkUnitPrimaryRevealActive()` cannot answer "is a Work Unit ABOUT
 * to reveal": it only turns on once the surface runtime mounts, measured at 4,464 ms on a cold
 * direct boot. Before that, `active === false` means both "no reveal has started yet" and "this
 * surface has no Work Unit at all", and those require opposite behaviour from anything waiting.
 *
 * `idle` is deliberately TERMINAL: a surface with no Work Unit must never wait for a reveal that
 * will not happen.
 */

/** The module holds process-wide state; return it to a terminal, unsubscribed baseline. */
function resetLifecycle(): void {
    const epoch = declareWorkUnitSurfaceMounted(true);
    releaseWorkUnitSurface(epoch);
}

beforeEach(resetLifecycle);

describe("transitions", () => {
    it("1. a Work Unit route mount moves idle → pending", () => {
        declareWorkUnitSurfaceMounted(true);
        expect(workUnitRevealLifecycle()).toBe("pending");
        expect(isWorkUnitRevealTerminal()).toBe(false);
    });

    it("2. pending → active on the primary reveal", () => {
        declareWorkUnitSurfaceMounted(true);
        beginWorkUnitPrimaryReveal();
        expect(workUnitRevealLifecycle()).toBe("active");
    });

    it("3. pending → settled when completion arrives without a separate active observation", () => {
        declareWorkUnitSurfaceMounted(true);
        endWorkUnitPrimaryReveal();
        expect(workUnitRevealLifecycle()).toBe("settled");
        expect(isWorkUnitRevealTerminal()).toBe(true);
    });

    it("4. active → settled", () => {
        declareWorkUnitSurfaceMounted(true);
        beginWorkUnitPrimaryReveal();
        endWorkUnitPrimaryReveal();
        expect(workUnitRevealLifecycle()).toBe("settled");
    });

    it("5. pending → empty — a Work Unit with no revealable subject still terminates", () => {
        declareWorkUnitSurfaceMounted(true);
        endWorkUnitPrimaryReveal("empty");
        expect(workUnitRevealLifecycle()).toBe("empty");
        expect(isWorkUnitRevealTerminal()).toBe(true);
    });

    it("6. an unresolved route is unavailable immediately — there is no reveal to wait for", () => {
        declareWorkUnitSurfaceMounted(false);
        expect(workUnitRevealLifecycle()).toBe("unavailable");
        expect(isWorkUnitRevealTerminal()).toBe(true);
    });

    it("7. pending/active → error", () => {
        declareWorkUnitSurfaceMounted(true);
        beginWorkUnitPrimaryReveal();
        endWorkUnitPrimaryReveal("error");
        expect(workUnitRevealLifecycle()).toBe("error");
        expect(isWorkUnitRevealTerminal()).toBe(true);
    });

    it("8. unmount cancels an outstanding reveal", () => {
        const epoch = declareWorkUnitSurfaceMounted(true);
        beginWorkUnitPrimaryReveal();
        releaseWorkUnitSurface(epoch);
        expect(workUnitRevealLifecycle()).toBe("cancelled");
        expect(isWorkUnitRevealTerminal()).toBe(true);
    });

    it("9. a newer Work Unit epoch supersedes the current one", () => {
        const first = declareWorkUnitSurfaceMounted(true);
        const second = declareWorkUnitSurfaceMounted(true);
        expect(second).toBeGreaterThan(first);
        expect(workUnitRevealLifecycle()).toBe("pending");
    });

    it("10. a stale epoch's release cannot terminate the current one", () => {
        const stale = declareWorkUnitSurfaceMounted(true);
        declareWorkUnitSurfaceMounted(true); // navigation replaced it
        releaseWorkUnitSurface(stale);
        expect(workUnitRevealLifecycle()).toBe("pending");
        expect(isWorkUnitRevealTerminal()).toBe(false);
    });

    it("11. a surface that never declares stays idle — and idle is TERMINAL", () => {
        const epoch = declareWorkUnitSurfaceMounted(true);
        releaseWorkUnitSurface(epoch);
        expect(isWorkUnitRevealTerminal()).toBe(true);
        // Nothing waits on a surface with no Work Unit.
        expect(["cancelled", "idle"]).toContain(workUnitRevealLifecycle());
    });

    it("12. a subscriber sees each transition once, and cleanup unsubscribes", () => {
        const seen: string[] = [];
        const unsubscribe = subscribeWorkUnitRevealLifecycle(() => seen.push(workUnitRevealLifecycle()));
        declareWorkUnitSurfaceMounted(true);
        beginWorkUnitPrimaryReveal();
        endWorkUnitPrimaryReveal();
        expect(seen).toEqual(["pending", "active", "settled"]);
        unsubscribe();
        const after = seen.length;
        declareWorkUnitSurfaceMounted(true);
        expect(seen).toHaveLength(after);
    });

    it("a repeated state does not re-notify", () => {
        declareWorkUnitSurfaceMounted(true);
        const seen: string[] = [];
        const unsubscribe = subscribeWorkUnitRevealLifecycle(() => seen.push(workUnitRevealLifecycle()));
        beginWorkUnitPrimaryReveal();
        beginWorkUnitPrimaryReveal();
        unsubscribe();
        expect(seen).toEqual(["active"]);
    });

    it("the epoch advances per declaration so placement can be bound to one", () => {
        const a = workUnitRevealEpoch();
        declareWorkUnitSurfaceMounted(true);
        expect(workUnitRevealEpoch()).toBe(a + 1);
    });
});
