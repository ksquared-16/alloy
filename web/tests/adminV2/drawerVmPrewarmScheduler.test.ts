// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    beginWorkUnitPrimaryReveal,
    cancelBackgroundDrawerVmPrewarm,
    DRAWER_VM_PREWARM_CONCURRENCY_CAP,
    drawerVmPrewarmQueueDepth,
    endWorkUnitPrimaryReveal,
    isWorkUnitPrimaryRevealActive,
    resetDrawerVmPrewarmSchedulerForTests,
    scheduleDrawerVmPrewarm,
} from "@/lib/adminV2/runtime/preload/drawerVmPrewarmScheduler";

const WEB_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB_ROOT, rel), "utf8");

/** Flush microtasks + one macrotask so deferred task.run() calls settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function deferred<T = void>() {
    let resolve!: (value?: T) => void;
    const promise = new Promise<T | undefined>((res) => {
        resolve = res as (value?: T) => void;
    });
    return { promise, resolve };
}

describe("drawerVmPrewarmScheduler (runtime flag ON)", () => {
    beforeEach(() => {
        resetDrawerVmPrewarmSchedulerForTests();
    });
    afterEach(() => {
        resetDrawerVmPrewarmSchedulerForTests();
        vi.restoreAllMocks();
    });

    it("holds ALL prewarm during the primary reveal (only the default subject VM may load)", async () => {
        beginWorkUnitPrimaryReveal();
        expect(isWorkUnitPrimaryRevealActive()).toBe(true);

        const run = vi.fn();
        scheduleDrawerVmPrewarm({ key: "oppvm:a", reason: "wu_visible_rows", run });
        scheduleDrawerVmPrewarm({ key: "related:b", reason: "related_graph", run: vi.fn() });

        await flush();
        // Nothing executes while the reveal window is open.
        expect(run).not.toHaveBeenCalled();
        expect(drawerVmPrewarmQueueDepth()).toBe(2);
    });

    it("defers additional VM prewarm until coordinated reveal, then drains", async () => {
        beginWorkUnitPrimaryReveal();
        const run = vi.fn();
        scheduleDrawerVmPrewarm({ key: "oppvm:a", reason: "wu_visible_rows", run });
        await flush();
        expect(run).not.toHaveBeenCalled();

        endWorkUnitPrimaryReveal();
        await flush();
        expect(run).toHaveBeenCalledTimes(1);
        expect(drawerVmPrewarmQueueDepth()).toBe(0);
    });

    it("caps background VM prewarm concurrency to 1 (no parallel stampede)", async () => {
        expect(DRAWER_VM_PREWARM_CONCURRENCY_CAP).toBe(1);
        // Not in a reveal window — tasks drain immediately but one-at-a-time.
        const d1 = deferred();
        const d2 = deferred();
        const d3 = deferred();
        const run1 = vi.fn(() => d1.promise);
        const run2 = vi.fn(() => d2.promise);
        const run3 = vi.fn(() => d3.promise);

        scheduleDrawerVmPrewarm({ key: "oppvm:1", reason: "wu_visible_rows", run: run1 });
        scheduleDrawerVmPrewarm({ key: "oppvm:2", reason: "wu_visible_rows", run: run2 });
        scheduleDrawerVmPrewarm({ key: "oppvm:3", reason: "wu_visible_rows", run: run3 });

        await flush();
        expect(run1).toHaveBeenCalledTimes(1);
        expect(run2).not.toHaveBeenCalled();
        expect(run3).not.toHaveBeenCalled();

        d1.resolve();
        await flush();
        expect(run2).toHaveBeenCalledTimes(1);
        expect(run3).not.toHaveBeenCalled();

        d2.resolve();
        await flush();
        expect(run3).toHaveBeenCalledTimes(1);

        d3.resolve();
        await flush();
    });

    it("manual selection cancels the background backlog (clicked subject wins)", async () => {
        beginWorkUnitPrimaryReveal();
        const run1 = vi.fn();
        const run2 = vi.fn();
        scheduleDrawerVmPrewarm({ key: "oppvm:1", reason: "wu_visible_rows", run: run1 });
        scheduleDrawerVmPrewarm({ key: "oppvm:2", reason: "wu_visible_rows", run: run2 });
        expect(drawerVmPrewarmQueueDepth()).toBe(2);

        cancelBackgroundDrawerVmPrewarm("manual_selection");
        expect(drawerVmPrewarmQueueDepth()).toBe(0);

        // Even after reveal completes, the cancelled backlog never runs.
        endWorkUnitPrimaryReveal();
        await flush();
        expect(run1).not.toHaveBeenCalled();
        expect(run2).not.toHaveBeenCalled();
    });

    it("dedupes repeated enqueues for the same key", async () => {
        beginWorkUnitPrimaryReveal();
        const run = vi.fn();
        scheduleDrawerVmPrewarm({ key: "oppvm:dupe", reason: "wu_visible_rows", run });
        scheduleDrawerVmPrewarm({ key: "oppvm:dupe", reason: "wu_visible_rows", run });
        scheduleDrawerVmPrewarm({ key: "oppvm:dupe", reason: "wu_visible_rows", run });
        expect(drawerVmPrewarmQueueDepth()).toBe(1);

        endWorkUnitPrimaryReveal();
        await flush();
        expect(run).toHaveBeenCalledTimes(1);
    });

    it("emits a readable deferral reason mark (dev/staging only)", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        beginWorkUnitPrimaryReveal();
        scheduleDrawerVmPrewarm({ key: "oppvm:log", reason: "wu_visible_rows", run: vi.fn() });

        const deferralCall = warn.mock.calls.find(
            (call) =>
                call[0] === "[perf:prefetch]" &&
                typeof call[1] === "object" &&
                (call[1] as Record<string, unknown>).phase === "prewarm_deferred_primary_reveal",
        );
        expect(deferralCall).toBeTruthy();
        expect((deferralCall?.[1] as Record<string, unknown>).reason).toBe("wu_visible_rows");
    });
});

describe("drawerVmPrewarmScheduler (runtime flag OFF preserves legacy)", () => {
    afterEach(() => {
        vi.resetModules();
        vi.restoreAllMocks();
    });

    it("fires prewarm immediately with no gating when the flag is off", async () => {
        vi.resetModules();
        vi.doMock("@/lib/adminV2/runtime/alloyOsRuntimeFlag", () => ({
            ALLOY_OS_RUNTIME_ENABLED: false,
        }));
        const mod = await import("@/lib/adminV2/runtime/preload/drawerVmPrewarmScheduler");
        mod.resetDrawerVmPrewarmSchedulerForTests();

        // begin() is a no-op when the flag is off, so there is no reveal hold.
        mod.beginWorkUnitPrimaryReveal();
        expect(mod.isWorkUnitPrimaryRevealActive()).toBe(false);

        const run = vi.fn();
        mod.scheduleDrawerVmPrewarm({ key: "oppvm:legacy", reason: "wu_visible_rows", run });
        await flush();
        expect(run).toHaveBeenCalledTimes(1);
    });
});

describe("drawerVmPrewarmScheduler wiring", () => {
    it("routes visible queue-row VM warm through the scheduler", () => {
        const src = read("lib/adminV2/viewModel/drawer/vmRuntime/queueRowDrawerVmWarm.ts");
        expect(src).toContain("scheduleDrawerVmPrewarm");
        expect(src).toMatch(/warmVisibleQueueRowOpportunityVms[\s\S]*scheduleDrawerVmPrewarm/);
    });

    it("routes related person/child graph warm through the scheduler", () => {
        const src = read("lib/adminV2/viewModel/drawer/vmRuntime/drawerVmPayloadWarmRelated.ts");
        expect(src).toContain("scheduleDrawerVmPrewarm");
    });

    it("opens/closes the reveal window and cancels on manual click in the work-unit page", () => {
        const src = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(src).toContain("beginWorkUnitPrimaryReveal");
        expect(src).toContain("endWorkUnitPrimaryReveal");
        expect(src).toMatch(/queue_row_click[\s\S]*?cancelBackgroundDrawerVmPrewarm|cancelBackgroundDrawerVmPrewarm\("manual_selection"\)/);
    });
});
