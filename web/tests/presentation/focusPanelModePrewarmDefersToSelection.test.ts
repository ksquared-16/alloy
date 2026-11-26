/**
 * @vitest-environment jsdom
 *
 * The prewarm scheduler is a browser-side owner (it returns immediately without `window`), so a
 * node environment would no-op every queue assertion and pass for the wrong reason.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
    beginWorkUnitPrimaryReveal,
    endWorkUnitPrimaryReveal,
    scheduleDrawerVmPrewarm,
    drawerVmPrewarmQueueDepth,
    resetDrawerVmPrewarmSchedulerForTests,
} from "@/lib/adminV2/runtime/preload/drawerVmPrewarmScheduler";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");
const MODE_PREWARM = read("lib/adminV2/runtime/focusPanel/useFocusPanelModePrewarm.ts");
const ACTIVITY_PREWARM = read("lib/adminV2/runtime/focusPanel/focusPanelActivityPrewarm.ts");

/**
 * OX SLICE 4 — EAGER SECOND-ORDER PREWARM WAITS FOR THE SELECTED RECORD.
 *
 * Measured on deployed 5a24b636: a warm row switch in Work mode issued the whole Activity data set
 * (family-workspace ~1,444ms, threads ~1,212ms, drawer-recipients ~1,076ms) for a surface nobody
 * had opened, on an idle callback that fires while the selected record is still awaiting network.
 */
describe("focus panel mode prewarm defers to the selected record", () => {
    beforeEach(() => resetDrawerVmPrewarmSchedulerForTests());

    it("non-active mode prewarm goes through the canonical deferring scheduler", () => {
        expect(MODE_PREWARM).toContain("scheduleDrawerVmPrewarm({");
        expect(MODE_PREWARM).toContain('reason: "focus_panel_mode_prewarm"');
        // Keyed per subject AND mode, so a new selection is not deduped against the previous one.
        expect(MODE_PREWARM).toContain("key: `focusmode:${subjectId}:${mode}`");
    });

    it("the ACTIVE mode still warms immediately — this defers speculation, not the mode in use", () => {
        // Part 9: the mode the operator is looking at must not be delayed by this repair.
        const activeArm = MODE_PREWARM.indexOf("prewarm?.[activeMode]?.()");
        const deferArm = MODE_PREWARM.indexOf("scheduleDrawerVmPrewarm({");
        expect(activeArm).toBeGreaterThan(-1);
        expect(activeArm).toBeLessThan(deferArm);
    });

    it("mode prewarm is held while the selected record's window is open, then drains", async () => {
        const ran: string[] = [];
        beginWorkUnitPrimaryReveal();
        scheduleDrawerVmPrewarm({ key: "focusmode:b:activity", reason: "focus_panel_mode_prewarm", run: () => { ran.push("activity"); } });
        expect(ran).toEqual([]);
        expect(drawerVmPrewarmQueueDepth()).toBe(1);

        endWorkUnitPrimaryReveal();
        await new Promise((r) => setTimeout(r, 0));
        // Part 6: Activity must still be warm by the time the operator switches to it.
        expect(ran).toEqual(["activity"]);
    });

    it("a newer selection supersedes the older subject's deferred mode prewarm", async () => {
        const ran: string[] = [];
        beginWorkUnitPrimaryReveal();                       // select B
        scheduleDrawerVmPrewarm({ key: "focusmode:b:activity", reason: "focus_panel_mode_prewarm", run: () => { ran.push("b"); } });
        beginWorkUnitPrimaryReveal();                       // select C before B settles
        expect(drawerVmPrewarmQueueDepth()).toBe(0);
        endWorkUnitPrimaryReveal();
        await new Promise((r) => setTimeout(r, 0));
        // Obsolete deferred work must not outrank the current subject.
        expect(ran).toEqual([]);
    });

    it("Activity prewarm still warms what the Activity surface reads — deferred, not deleted", () => {
        expect(ACTIVITY_PREWARM).toContain("prewarmFocusPanelActivityMode");
        expect(ACTIVITY_PREWARM).toContain("prefetchDrawerFamilyWorkspace");
        expect(ACTIVITY_PREWARM).toContain("scheduleDeferredCommunicationsDrawerPrefetch");
    });

    it("prior slice wins are untouched by this repair", () => {
        const RECORD_WORK = read("lib/presentation/runtime/useRecordWorkRuntime.ts");
        const WU_RUNTIME = read("lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts");
        // Slice 2: warm scope alignment.
        expect(RECORD_WORK).toContain("loadOpportunityDrawerViaViewModel(id, warmContext)");
        // Slice 3: the gate is armed at selection.
        const open = WU_RUNTIME.slice(WU_RUNTIME.indexOf("const openRecord"));
        expect(open.indexOf("beginWorkUnitPrimaryReveal();")).toBeLessThan(open.indexOf("kernel.attention.move("));
    });
});
