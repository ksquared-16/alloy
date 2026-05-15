import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspacePath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../components/admin/taskAssist/TaskAssistOpportunityWorkspace.tsx"
);

describe("TaskAssistOpportunityWorkspace post-reminder UX", () => {
    it("exposes View task control and drawer refresh events after operational task create", () => {
        const src = readFileSync(workspacePath, "utf8");
        expect(src).toContain("data-task-assist-reminder-created-card");
        expect(src).toContain("data-task-assist-view-created-operational-task");
        expect(src).toContain("ADMIN_V2_OPPORTUNITY_FOCUS_OPERATIONAL_TASKS");
        expect(src).toContain("ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH");
    });
});
