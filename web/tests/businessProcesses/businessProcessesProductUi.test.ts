/**
 * Business Processes product UI — Collection → Selected Process → Focused Workspace.
 * UI-only surface; no new process/stage runtime, parallel builder, or schema under test here.
 * Mutations continue to flow through the existing lifecycle-catalog / lifecycle-builder /
 * stage-runtime-config / process-work-views / lifecycle-actions-matrix APIs untouched by this
 * sprint — this file asserts presentation wiring only.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildBusinessProcessesLandingModel } from "@/lib/configRuntime/businessProcessesLandingModel";
import {
    BUSINESS_PROCESS_HEADER_TABS,
    normalizeBusinessProcessSection,
} from "@/lib/lifecycle/businessProcessUiLabels";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Business Processes landing model", () => {
    it("is collection-first: no conceptual summary cards (Ownership / How to start)", () => {
        const model = buildBusinessProcessesLandingModel();
        expect(model.summaryCards).toEqual([]);
        expect(model.purpose).toBe("Create and manage how operational work moves through Alloy.");
    });
});

describe("Business Processes page entry", () => {
    it("always mounts ProcessesConfigurationPage, never the tile-landing surface", () => {
        const page = read("app/adminV2/settings/processes/page.tsx");
        expect(page).toContain("ProcessesConfigurationPage");
        expect(page).not.toContain("OrganizationDomainLanding");
        expect(page).toContain("normalizeBusinessProcessSection");
    });

    it("supports ?section= and ?processId= deep links into the collection workspace", () => {
        const page = read("components/adminV2/settings/businessProcess/ProcessesConfigurationPage.tsx");
        expect(page).toContain("initialSection");
        expect(page).toContain("initialProcessId");
        expect(page).toContain("LifecycleBuilderPrimary");
    });
});

describe("Business Processes workspace sections", () => {
    it("includes overview and history alongside the existing five sections", () => {
        const keys = BUSINESS_PROCESS_HEADER_TABS.map((t) => t.key);
        expect(keys).toEqual(["overview", "stages", "work-views", "actions", "automation", "health", "history"]);
    });

    it("normalizes unknown/legacy ?section= values without throwing, defaulting to overview", () => {
        expect(normalizeBusinessProcessSection("stages")).toBe("stages");
        expect(normalizeBusinessProcessSection("history")).toBe("history");
        expect(normalizeBusinessProcessSection("bogus")).toBe("overview");
        expect(normalizeBusinessProcessSection(undefined)).toBe("overview");
        expect(normalizeBusinessProcessSection(null)).toBe("overview");
    });
});

describe("Business Processes collection rail", () => {
    it("replaces the chip selector strip in the primary UX", () => {
        const primary = read("components/adminV2/settings/lifecycle/LifecycleBuilderPrimary.tsx");
        expect(primary).not.toContain("BusinessProcessProcessSelectorStrip");
        expect(primary).toContain("BusinessProcessCollectionRail");
    });

    it("shows an intentional no-selection empty state, not a fabricated selection", () => {
        const primary = read("components/adminV2/settings/lifecycle/LifecycleBuilderPrimary.tsx");
        expect(primary).toContain("business-process-no-selection");
        expect(primary).toContain("BUSINESS_PROCESS_NO_SELECTION_TITLE");
    });
});

describe("Business Processes Planned surfaces", () => {
    it("History tab renders a calm Planned empty surface with data-capability", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("business-process-history-workspace");
        expect(board).toContain('data-capability="planned"');
        expect(board).toContain("BUSINESS_PROCESS_HISTORY_PLANNED");
    });

    it("Automation placeholder uses calm Planned copy, not a raw pending disabled action", () => {
        const shell = read("components/adminV2/settings/businessProcess/BusinessProcessAutomationShell.tsx");
        expect(shell).toContain('data-capability="planned"');
        expect(shell).toContain("BUSINESS_PROCESS_AUTOMATION_PLANNED_BODY");
    });

    it("Overview panel does not fabricate history and marks location availability as Planned", () => {
        const overview = read("components/adminV2/settings/businessProcess/BusinessProcessOverviewPanel.tsx");
        expect(overview).toContain('data-capability="planned"');
        expect(overview).toContain("BUSINESS_PROCESS_OVERVIEW_AVAILABILITY_NOTE");
    });
});
