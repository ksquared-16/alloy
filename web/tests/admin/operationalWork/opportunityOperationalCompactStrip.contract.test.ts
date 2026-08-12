import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const strip = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../components/admin/opportunity/OpportunityOperationalCompactStrip.tsx"
);
const drawer = join(dirname(fileURLToPath(import.meta.url)), "../../../components/admin/AdminEntityDrawer.tsx");
const myTasksPanel = join(dirname(fileURLToPath(import.meta.url)), "../../../app/adminV2/components/MyTasksPanel.tsx");
const navBadge = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../app/adminV2/components/OperationalTasksNavBadge.tsx"
);

describe("OpportunityOperationalCompactStrip PR2", () => {
    it("decouples core work UX from Task Assist gate", () => {
        const src = readFileSync(strip, "utf8");
        expect(src).toContain("isOperationalWorkV1Enabled");
        expect(src).toContain("isTaskAssistV1UiEnabled");
        expect(src).toContain("fetchOperationalTasks");
        expect(src).not.toMatch(/if \(!v11\) return null/);
    });

    it("shows create follow-up control and dispatches create modal event", () => {
        const src = readFileSync(strip, "utf8");
        expect(src).toContain("data-operational-work-create");
        expect(src).toContain("Add follow-up");
        expect(src).toContain("ADMIN_V2_OPEN_CREATE_WORK_MODAL");
        expect(src).toContain('data-operational-strip-group="work"');
    });

    it("shows assignee and inline complete affordance on work chips", () => {
        const src = readFileSync(strip, "utf8");
        expect(src).toContain("operationalWorkAssigneeCompactLabel");
        expect(src).toContain("data-operational-task-assignee-chip");
        expect(src).toContain("data-operational-work-complete");
        expect(src).toContain("patchOperationalTaskStatus");
        expect(src).toContain("ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH");
    });

    it("My Tasks supports assignee filters and display", () => {
        const panel = readFileSync(myTasksPanel, "utf8");
        const card = readFileSync(
            join(dirname(fileURLToPath(import.meta.url)), "../../../app/adminV2/components/MyTasksTaskCard.tsx"),
            "utf8"
        );
        expect(panel).toContain('key: "assigned_to_me"');
        expect(panel).toContain('key: "unassigned"');
        expect(panel).toContain("assigned_to_user_id");
        expect(card).toContain("data-adminv2-task-assignee");
        expect(card).toContain("OperationalWorkAssigneeSelect");
    });

    it("My Tasks and nav badge use operational work gate", () => {
        expect(readFileSync(myTasksPanel, "utf8")).toContain("isOperationalWorkV1Enabled");
        expect(readFileSync(navBadge, "utf8")).toContain("isOperationalWorkV1Enabled");
    });
});
