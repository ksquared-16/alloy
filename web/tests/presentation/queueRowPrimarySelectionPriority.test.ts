/**
 * @vitest-environment jsdom
 *
 * The prewarm scheduler is a browser-side owner: `scheduleDrawerVmPrewarm` returns immediately when
 * `window` is undefined, so a node environment would silently no-op every queue assertion and the
 * behavioural cases would pass for the wrong reason.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
    beginWorkUnitPrimaryReveal,
    endWorkUnitPrimaryReveal,
    isWorkUnitPrimaryRevealActive,
    scheduleDrawerVmPrewarm,
    drawerVmPrewarmQueueDepth,
    resetDrawerVmPrewarmSchedulerForTests,
} from "@/lib/adminV2/runtime/preload/drawerVmPrewarmScheduler";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../");
const read = (rel: string) => readFileSync(join(webRoot, rel), "utf8");
const WU_RUNTIME = read("lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts");
const RECORD_WORK = read("lib/presentation/runtime/useRecordWorkRuntime.ts");

/**
 * OX SLICE 3 — THE SELECTED RECORD OUTRANKS SPECULATION.
 *
 * Measured on deployed 2fcb4ddb: neighbour provisioning/VM requests for OTHER subjects began ~85ms
 * after a row click and ran 2.5-5.1s against the record the operator had selected. The gate and its
 * consumer already existed; only the arm at selection time was missing.
 */
describe("queue row primary selection priority", () => {
    beforeEach(() => resetDrawerVmPrewarmSchedulerForTests());

    it("the selection intent arms the reveal gate synchronously, before any effect or idle callback", () => {
        // Inside openRecord, and BEFORE the attention move — an arm that lands after the gesture is
        // the race this repairs.
        const open = WU_RUNTIME.slice(WU_RUNTIME.indexOf("const openRecord"));
        const armAt = open.indexOf("beginWorkUnitPrimaryReveal();");
        const moveAt = open.indexOf("kernel.attention.move(");
        expect(armAt).toBeGreaterThan(-1);
        expect(moveAt).toBeGreaterThan(-1);
        expect(armAt).toBeLessThan(moveAt);
    });

    it("neighbour speculation still observes the SAME canonical gate — no second mechanism", () => {
        expect(WU_RUNTIME).toContain("if (isWorkUnitPrimaryRevealActive())");
        expect(WU_RUNTIME).toContain('recordRevealGateEvent("subject_warm_suppressed", id)');
        // No parallel gate invented for row switching.
        expect(WU_RUNTIME).not.toMatch(/rowSelectionRevealActive|beginRowSelectionReveal/);
    });

    it("the window still ends on the selected VM apply — it cannot be left permanently armed", () => {
        expect(RECORD_WORK).toContain("endWorkUnitPrimaryReveal(");
        // Error paths release too, or a failed selection would starve speculation forever.
        expect(RECORD_WORK).toContain('endWorkUnitPrimaryReveal("error")');
    });

    it("prewarm is deferred while primary is active and drains after release", async () => {
        const ran: string[] = [];
        beginWorkUnitPrimaryReveal();
        expect(isWorkUnitPrimaryRevealActive()).toBe(true);
        scheduleDrawerVmPrewarm({ key: "oppvm:neighbour", reason: "wu_visible_rows", run: () => { ran.push("neighbour"); } });
        expect(ran).toEqual([]);
        expect(drawerVmPrewarmQueueDepth()).toBe(1);

        endWorkUnitPrimaryReveal();
        await new Promise((r) => setTimeout(r, 0));
        // Resume policy: suppression is a window, never permanent starvation.
        expect(ran).toEqual(["neighbour"]);
        expect(isWorkUnitPrimaryRevealActive()).toBe(false);
    });

    it("a later selection re-arms and supersedes the earlier one — latest click wins", async () => {
        const ran: string[] = [];
        beginWorkUnitPrimaryReveal();                       // click B
        scheduleDrawerVmPrewarm({ key: "oppvm:b-neighbour", reason: "wu_visible_rows", run: () => { ran.push("b"); } });
        beginWorkUnitPrimaryReveal();                       // click C before B settled
        expect(isWorkUnitPrimaryRevealActive()).toBe(true);
        // B's backlog is dropped by the re-arm, so it cannot drain against C.
        expect(drawerVmPrewarmQueueDepth()).toBe(0);
        endWorkUnitPrimaryReveal();
        await new Promise((r) => setTimeout(r, 0));
        expect(ran).toEqual([]);
    });

    it("the Slice-2 warm entry stays reachable — the selected record never loads via the scheduler", () => {
        // Regression guard for the scope alignment Slice 2 shipped.
        expect(RECORD_WORK).toContain("loadOpportunityDrawerViaViewModel(id, warmContext)");
        expect(RECORD_WORK).not.toContain("loadOpportunityDrawerViaViewModel(id, null)");
        expect(WU_RUNTIME).toContain("if (opportunity) void prewarmRecordWork(opportunity, id)");
    });

    it("pre-selection intent warming is NOT disabled", () => {
        // Part 7: hover still warms; only POST-selection speculation defers.
        expect(WU_RUNTIME).toContain("const prefetchRecord = useCallback(");
        expect(WU_RUNTIME).toContain("prewarmSubjectDestination(");
    });
});
