import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Visual hierarchy pass guards — source-level so we don't reintroduce:
 *  - floating (non-tiled) Work Unit KPIs
 *  - queue title / record-count badges
 *  - inactive pills without an outline
 *  - Actions incorrectly owned by the BOS assistant column
 */

const read = (rel: string) =>
    readFileSync(resolve(__dirname, "../../../components/presentation", rel), "utf8");

describe("Work Unit KPIs — shared workspace KPI card grammar", () => {
    const src = read("workspace/WorkspaceHeader.tsx");

    it("work-unit KPI tiles reuse WS_KPI_CARD_CHROME and icon wells", () => {
        expect(src).toMatch(/variant === "work-unit"/);
        expect(src).toMatch(/WS_KPI_CARD_CHROME/);
        expect(src).toMatch(/data-work-unit-header-kpi-icon-well/);
        expect(src).toMatch(/data-adaptive-metric-row/);
        expect(src).toMatch(/flex flex-nowrap items-stretch/);
    });
});

describe("Work View pills — inactive outline", () => {
    const src = read("workUnit/WorkViewPillStrip.tsx");

    it("inactive pills keep a visible outlined border", () => {
        expect(src).toMatch(/border-alloy-midnight\/20 bg-white/);
        expect(src).toMatch(/border-alloy-juniper bg-alloy-juniper/);
    });

    it("selected pill label stays semibold, not bold", () => {
        expect(src).toMatch(/view\.isActive[\s\S]*font-semibold/);
        expect(src).not.toMatch(/font-bold/);
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

    it("elevates the filter toolbar above the row list", () => {
        expect(src).toMatch(/WS_QUEUE_TOOLBAR_CHROME/);
    });
});

describe("Focus Panel boundary — header-only accent", () => {
    const src = read("workUnit/FocusPanelSurface.tsx");

    it("does not extend a green left rail down the full panel card", () => {
        expect(src).toMatch(/data-focus-panel-boundary/);
        expect(src).not.toMatch(/border-l-alloy-juniper/);
        expect(src).not.toMatch(/border-l-alloy-bend-pine/);
        expect(src).not.toMatch(/DRAWER_OVERVIEW_PANEL_SURFACE/);
    });
});

describe("Work View row counts — grain labels, not generic Records", () => {
    const src = read("workspace/WorkViewList.tsx");

    it("derives unit labels from runtime grain kinds", () => {
        expect(src).toMatch(/grainCountUnitLabel/);
        expect(src).toMatch(/primaryGrainKind/);
    });

    it("never falls back to the generic Records label", () => {
        expect(src).not.toMatch(/"Records"/);
    });
});

describe("Work Unit header — title hierarchy vs workspace", () => {
    const src = read("workspace/WorkspaceHeader.tsx");

    it("workspace title stays sized but reads lighter than the work-unit page title", () => {
        expect(src).toMatch(/text-\[26px\] font-semibold/);
        expect(src).toMatch(/text-\[28px\] font-semibold/);
    });

    it("work-unit subtitle stays medium weight", () => {
        expect(src).toMatch(/text-\[14px\] font-medium/);
    });

    it("work-unit identity chip is slightly larger than process tile icons", () => {
        expect(src).toMatch(/data-work-unit-header-identity-chip/);
        expect(src).toMatch(/h-11 w-11/);
        expect(src).toMatch(/ProcessCardGlyph icon=\{model\.identityIcon\} className="h-5 w-5"/);
    });
});

describe("Work Unit header — Actions control band (independent of BOS)", () => {
    const header = read("workUnit/WorkUnitHeader.tsx");
    const surface = read("workUnit/WorkUnitSurface.tsx");

    it("accepts an actionsSlot on the work-unit header", () => {
        expect(header).toMatch(/actionsSlot/);
        expect(header).toMatch(/WorkspaceHeader/);
    });

    it("places Work Unit Actions in the header control band", () => {
        expect(surface).toMatch(/WorkUnitRightRailActions/);
        expect(surface).toMatch(/actionsSlot/);
    });
});

describe("Queue rows — runtime shell parity", () => {
    const src = read("workUnit/CondensedQueueRow.tsx");

    it("uses shared queue row card shell with selected perimeter (no left rail)", () => {
        expect(src).toMatch(/QUEUE_ROW_CARD_SHELL_CLASS/);
        expect(src).toMatch(/QUEUE_ROW_CARD_SELECTED_BORDER_CLASS/);
        expect(src).not.toMatch(/QUEUE_ROW_SELECTED_RAIL_CLASS/);
        expect(src).toMatch(/queueRowCardShell/);
    });

    it("selected queue row CSS keeps uniform border weight (no heavier left)", () => {
        const css = readFileSync(
            resolve(__dirname, "../../../app/adminV2/components/alloyOsRuntime.css"),
            "utf8",
        );
        const selectedBlock = css.match(
            /\.alloy-os-queue-row-card\.alloy-os-queue-row-card--selected,[\s\S]*?\.alloy-os-queue-row-card\[data-queue-row-active="true"\]\s*\{[\s\S]*?\n\}/,
        )?.[0];
        expect(selectedBlock).toBeTruthy();
        expect(selectedBlock).toMatch(/border-left-width:\s*1px/);
        expect(selectedBlock).toMatch(/border-width:\s*1px/);
        expect(css).not.toMatch(
            /\.adminv2-ws-wu-queue-card\[data-queue-row-active="true"\][\s\S]{0,160}inset\s+3px\s+0\s+0\s+0/,
        );
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
