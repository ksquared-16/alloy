import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { deriveOpportunityFocusPanelPresentation } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { ACTIVITY_WORKSPACE_TABS } from "@/lib/adminV2/runtime/focusPanel/activityWorkspaceTabs";
import { minimalSettledOpportunityDrawerViewModel } from "@/tests/adminV2/viewModel/fixtures/minimalSettledOpportunityDrawerViewModel";

const webRoot = join(process.cwd());

function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("System 5 Visual QA correction guards", () => {
    const baseVm = minimalSettledOpportunityDrawerViewModel({
        summaries: {
            attention: {
                visible: true,
                needs_attention: true,
                primary_reason: "Medical form outstanding",
                reason_count: 1,
            },
            tasks: {
                state: "loaded",
                open_count: 1,
                open_tasks: [
                    { id: "t1", title: "Follow up", due_at: "", status: "open", source: "task_assist" },
                ],
            },
            active_tour_bookings: [],
            reminders: {
                state: "empty",
                next_follow_up_iso: null,
                scheduled_send_count: 0,
                scheduled_sends: [],
            },
            bos: null,
        },
    });

    it("summary cards use System 5 storytelling — mission uses action not stage label", () => {
        const { cards } = deriveOpportunityFocusPanelPresentation({
            mode: "summary",
            displayVm: baseVm,
            record: {
                _inquiry_children: [
                    { id: "c1", display_name: "Emyrson", outcome_status_key: "active" },
                    { id: "c2", display_name: "McKenzie", outcome_status_key: "active" },
                ],
            },
            title: "Wright Family",
            perspective: {
                key: "lead",
                label: "Lead",
                workUnitId: "wu",
                grain: "case",
                groupBy: null,
                sort: [],
                defaultMission: null,
                defaultFilters: null,
                emptyState: { title: "Empty" },
                source: "pill",
            },
            statusLabel: "Lead",
        });

        expect(cards.get("current_mission")?.insight).toBe("Schedule tour");
        expect(cards.get("current_mission")?.secondaryInsight).toBeTruthy();
        expect(cards.get("health")?.title).toBe("Enrollment Health");
        expect(cards.get("readiness_kpi")?.insight).toBe("Medical form outstanding");
        expect(cards.get("readiness_kpi")?.secondaryInsight).toContain("required item");
        expect(cards.get("children")?.payload?.collectionItems?.[0]?.label).toBe("Emyrson");
    });

    it("work mode exposes split-column layout markers", () => {
        const { grid } = deriveOpportunityFocusPanelPresentation({
            mode: "work",
            displayVm: baseVm,
            record: {},
            title: "Wright Family",
            perspective: null,
            statusLabel: "Lead",
        });

        const splitRow = grid.rows.find((row) =>
            row.cells.some((c) => c.key === "workflow_steps")
            && row.cells.some((c) => c.key === "required_information"),
        );
        expect(splitRow?.cells.map((c) => c.span)).toEqual([1, 1]);

        const launcherRow = grid.rows.find((row) => row.cells.some((c) => c.key === "work_launcher"));
        expect(launcherRow?.cells[0]?.span).toBe(1);

        const modeGrid = readSrc("components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx");
        expect(modeGrid).toContain("alloy-os-focus-panel-grid--work");
        expect(modeGrid).toContain("dataFocusPanelSplitLayout");
    });

    it("activity mode uses horizontal workspace with communications embed", () => {
        const { grid } = deriveOpportunityFocusPanelPresentation({
            mode: "activity",
            displayVm: baseVm,
            record: {},
            title: "Wright Family",
            perspective: null,
            statusLabel: "Lead",
        });
        expect(grid.rows).toHaveLength(0);

        const workspace = readSrc("components/admin/focusPanel/OpportunityFocusPanelEmbeddedWorkspace.tsx");
        expect(workspace).toContain('data-focus-panel-embedded-workspace="true"');
        expect(workspace).toContain('data-focus-panel-activity-workspace="true"');
        expect(workspace).toContain("CommunicationsDrawerSection");
        expect(ACTIVITY_WORKSPACE_TABS.map((t) => t.key)).toEqual([
            "timeline",
            "communications",
            "documents",
            "notes",
            "workflow",
            "audit",
        ]);
    });

    it("summary does not embed communications composer path in card renderer", () => {
        const renderer = readSrc("components/admin/focusPanel/FocusPanelCardRenderer.tsx");
        expect(renderer).not.toContain("CommunicationsDrawerSection");
        expect(renderer).toContain('focusPanelMode !== "activity"');
    });

});
