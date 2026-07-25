import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    armSoftNavReloadFloor,
    resetSoftNavGenerationForTests,
    shouldFireReloadFloor,
} from "@/lib/adminV2/navigation/adminV2SoftNavReloadFloor";
import { shouldSoftNavigate } from "@/lib/adminV2/navigation/adminV2SoftNavLinkCommit";

beforeEach(() => resetSoftNavGenerationForTests());
afterEach(() => vi.unstubAllEnvs());

describe("shouldFireReloadFloor — soft-nav stall detection", () => {
    it("does NOT fire when the nav arrived (path reached target)", () => {
        expect(
            shouldFireReloadFloor({
                currentPathname: "/workspace/work-unit/a",
                targetPathname: "/workspace/work-unit/a",
                superseded: false,
            }),
        ).toBe(false);
    });

    it("FIRES when stalled (path never reached target, not superseded)", () => {
        expect(
            shouldFireReloadFloor({
                currentPathname: "/workspace",
                targetPathname: "/workspace/work-unit/a",
                superseded: false,
            }),
        ).toBe(true);
    });

    it("never fires when superseded by a newer navigation", () => {
        expect(
            shouldFireReloadFloor({
                currentPathname: "/workspace",
                targetPathname: "/workspace/work-unit/a",
                superseded: true,
            }),
        ).toBe(false);
    });

    it("compares canonically (internal /adminV2/workspace path == canonical /workspace)", () => {
        expect(
            shouldFireReloadFloor({
                currentPathname: "/adminV2/workspace/work-unit/a",
                targetPathname: "/workspace/work-unit/a",
                superseded: false,
            }),
        ).toBe(false);
    });
});

function fakeTimers() {
    const cbs: Array<() => void> = [];
    return {
        setTimeoutFn: ((fn: () => void) => cbs.push(fn) as unknown) as (
            cb: () => void,
            ms: number,
        ) => ReturnType<typeof setTimeout>,
        clearTimeoutFn: (() => undefined) as (h: ReturnType<typeof setTimeout>) => void,
        fire: (i: number) => cbs[i]?.(),
    };
}

describe("armSoftNavReloadFloor — watchdog", () => {
    it("does not reload when the nav has arrived at the target", () => {
        const t = fakeTimers();
        const reload = vi.fn();
        armSoftNavReloadFloor("/workspace", {
            getPathname: () => "/workspace",
            reload,
            setTimeoutFn: t.setTimeoutFn,
            clearTimeoutFn: t.clearTimeoutFn,
        });
        t.fire(0);
        expect(reload).not.toHaveBeenCalled();
    });

    it("reloads (recovery floor) when the soft nav stalled", () => {
        const t = fakeTimers();
        const reload = vi.fn();
        armSoftNavReloadFloor("/workspace/work-unit/a", {
            getPathname: () => "/workspace", // never left
            reload,
            setTimeoutFn: t.setTimeoutFn,
            clearTimeoutFn: t.clearTimeoutFn,
        });
        t.fire(0);
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it("supersession: an older watchdog never fires once a newer nav is armed", () => {
        const t = fakeTimers();
        const reloadA = vi.fn();
        const reloadB = vi.fn();
        armSoftNavReloadFloor("/workspace/work-unit/a", {
            getPathname: () => "/workspace", // stalled…
            reload: reloadA,
            setTimeoutFn: t.setTimeoutFn,
            clearTimeoutFn: t.clearTimeoutFn,
        });
        armSoftNavReloadFloor("/workspace/work-unit/b", {
            getPathname: () => "/workspace",
            reload: reloadB,
            setTimeoutFn: t.setTimeoutFn,
            clearTimeoutFn: t.clearTimeoutFn,
        });
        t.fire(0); // older watchdog → superseded → no reload
        t.fire(1); // newer watchdog → genuine stall → reload
        expect(reloadA).not.toHaveBeenCalled();
        expect(reloadB).toHaveBeenCalledTimes(1);
    });

    // Kelly cert scenarios — reload floor provisional review.
    function trackingTimers() {
        const cbs: Array<() => void> = [];
        const cleared: number[] = [];
        return {
            setTimeoutFn: ((fn: () => void) => cbs.push(fn) as unknown) as (
                cb: () => void,
                ms: number,
            ) => ReturnType<typeof setTimeout>,
            clearTimeoutFn: ((h: number) => {
                cleared.push(h);
            }) as unknown as (h: ReturnType<typeof setTimeout>) => void,
            fire: (i: number) => cbs[i]?.(),
            cleared,
        };
    }

    it("navigating to a SECOND destination while the first is pending cancels the first's timer", () => {
        const t = trackingTimers();
        const reloadA = vi.fn();
        const reloadB = vi.fn();
        // First nav arms handle #1 (push returns length 1).
        armSoftNavReloadFloor("/workspace/work-unit/a", {
            getPathname: () => "/workspace",
            reload: reloadA,
            setTimeoutFn: t.setTimeoutFn,
            clearTimeoutFn: t.clearTimeoutFn,
        });
        // Second nav (still pending) arms handle #2 AND cancels handle #1.
        armSoftNavReloadFloor("/workspace/work-unit/b", {
            getPathname: () => "/workspace",
            reload: reloadB,
            setTimeoutFn: t.setTimeoutFn,
            clearTimeoutFn: t.clearTimeoutFn,
        });
        expect(t.cleared).toContain(1); // the first watchdog's timer was cancelled outright
        // Even if the (cancelled) first timer somehow fired, it must not reload; only the latest does.
        t.fire(0);
        expect(reloadA).not.toHaveBeenCalled();
        t.fire(1);
        expect(reloadB).toHaveBeenCalledTimes(1);
    });

    it("repeated clicks to the SAME target never double-reload", () => {
        const t = trackingTimers();
        const reload = vi.fn();
        for (let i = 0; i < 4; i++) {
            armSoftNavReloadFloor("/workspace/work-unit/a", {
                getPathname: () => "/workspace", // still stalled across all clicks
                reload,
                setTimeoutFn: t.setTimeoutFn,
                clearTimeoutFn: t.clearTimeoutFn,
            });
        }
        // Every earlier timer was cancelled; fire them all — only the final generation may reload once.
        for (let i = 0; i < 4; i++) t.fire(i);
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it("a slow nav that EVENTUALLY succeeds does not reload (path reached target by fire time)", () => {
        const t = trackingTimers();
        const reload = vi.fn();
        let arrived = false;
        armSoftNavReloadFloor("/workspace/work-unit/a", {
            getPathname: () => (arrived ? "/workspace/work-unit/a" : "/workspace"),
            reload,
            setTimeoutFn: t.setTimeoutFn,
            clearTimeoutFn: t.clearTimeoutFn,
        });
        arrived = true; // the slow nav completed before the watchdog fired
        t.fire(0);
        expect(reload).not.toHaveBeenCalled();
    });
});

describe("shouldSoftNavigate — Workspace + Configuration Continuity", () => {
    it("eligible operator paths soft-navigate by default (shell stays mounted)", () => {
        expect(shouldSoftNavigate("/workspace")).toBe(true);
        expect(shouldSoftNavigate("/workspace/work-unit/active-pipeline")).toBe(true);
        expect(shouldSoftNavigate("/workspace/dept/sales")).toBe(true);
    });

    it("Organization / Settings soft-navigate by default (Checkpoint A)", () => {
        expect(shouldSoftNavigate("/organization")).toBe(true);
        expect(shouldSoftNavigate("/settings/locations")).toBe(true);
        expect(shouldSoftNavigate("/organization/programs")).toBe(true);
    });

    it("workflows keep the hard reload (unchanged)", () => {
        expect(shouldSoftNavigate("/admin/workflows")).toBe(false);
    });

    it("kill switch (…SOFT_SIDEBAR_NAV=0) forces hard everywhere", () => {
        vi.stubEnv("NEXT_PUBLIC_ADMIN_V2_SOFT_SIDEBAR_NAV", "0");
        expect(shouldSoftNavigate("/workspace")).toBe(false);
        expect(shouldSoftNavigate("/workspace/work-unit/active-pipeline")).toBe(false);
        expect(shouldSoftNavigate("/organization")).toBe(false);
    });
});
