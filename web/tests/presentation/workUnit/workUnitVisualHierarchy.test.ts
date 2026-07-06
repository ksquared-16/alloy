import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Visual hierarchy pass guards — source-level so we don't reintroduce:
 *  - floating (non-tiled) Work Unit KPIs
 *  - queue title / record-count badges
 *  - inactive pills without an outline
 *  - Actions dropdown in the work-unit header
 */

const read = (rel: string) =>
    readFileSync(resolve(__dirname, "../../../components/presentation", rel), "utf8");

describe("Work Unit KPIs — compact bordered tiles", () => {
    const src = read("workspace/WorkspaceHeader.tsx");

    it("work-unit KPI tiles use a subtle border and equal-width grid strip", () => {
        expect(src).toMatch(/variant === "work-unit"/);
        expect(src).toMatch(/border border-alloy-stone\/20/);
        expect(src).toMatch(/auto-cols-fr grid-flow-col gap-2/);
    });
});

describe("Work View pills — inactive outline", () => {
    const src = read("workUnit/WorkViewPillStrip.tsx");

    it("inactive pills keep a visible outlined border", () => {
        expect(src).toMatch(/border-alloy-midnight\/20 bg-white/);
        expect(src).toMatch(/border-alloy-juniper bg-alloy-juniper text-white/);
    });
});

describe("Queue Region — no redundant title/count", () => {
    const src = read("workUnit/QueueRegion.tsx");

    it("does not render a visible queue title or record-count badge", () => {
        expect(src).not.toMatch(/data-queue-region-title/);
        expect(src).not.toMatch(/data-queue-region-count/);
        expect(src).toMatch(/data-queue-region-controls/);
        expect(src).toMatch(/QueueFilterControls/);
    });
});

describe("Work Unit header — no global Actions dropdown", () => {
    const header = read("workUnit/WorkUnitHeader.tsx");
    const surface = read("workUnit/WorkUnitSurface.tsx");

    it("does not place an Actions control in the work-unit header", () => {
        expect(header).not.toMatch(/Actions/);
        expect(header).toMatch(/WorkspaceHeader/);
    });

    it("registers actions into the right rail, not the header", () => {
        expect(surface).toMatch(/WorkUnitRightRailActions/);
        expect(surface).not.toMatch(/<Actions/);
    });
});

describe("Queue rows — runtime shell parity", () => {
    const src = read("workUnit/CondensedQueueRow.tsx");

    it("uses shared queue row card shell with selected rail and hover states", () => {
        expect(src).toMatch(/QUEUE_ROW_CARD_SHELL_CLASS/);
        expect(src).toMatch(/QUEUE_ROW_CARD_SELECTED_BORDER_CLASS/);
        expect(src).toMatch(/QUEUE_ROW_SELECTED_RAIL_CLASS/);
        expect(src).toMatch(/queueRowCardShell/);
    });
});

describe("Work Unit surface — tight header-to-queue hierarchy", () => {
    const src = read("workUnit/WorkUnitSurface.tsx");

    it("groups header + pills before the queue with minimal vertical gap", () => {
        expect(src).toMatch(/space-y-1/);
    });
});

describe("Process tiles — one shared card structure", () => {
    const grid = read("workspace/ProcessGrid.tsx");

    it("renders every process through ProcessSummaryCard", () => {
        expect(grid).toMatch(/ProcessSummaryCard/);
        expect(grid).toMatch(/processes\.map\(\(process\) =>/);
        expect(grid).not.toMatch(/EnrollmentCard|BillingCard|SchedulingCard/);
    });
});
