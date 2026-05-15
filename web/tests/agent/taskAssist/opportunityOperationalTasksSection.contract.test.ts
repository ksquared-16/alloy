import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sectionPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../components/admin/opportunity/OpportunityOperationalTasksSection.tsx"
);

describe("OpportunityOperationalTasksSection", () => {
    it("lists tasks via operational-tasks API client and listens for refresh event", () => {
        const src = readFileSync(sectionPath, "utf8");
        expect(src).toContain("fetchOperationalTasks");
        expect(src).toContain("patchOperationalTaskStatus");
        expect(src).toContain("data-admin-opportunity-operational-tasks");
        expect(src).toContain("ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH");
    });
});
