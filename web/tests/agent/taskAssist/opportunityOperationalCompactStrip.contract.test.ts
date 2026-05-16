import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stripPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../components/admin/opportunity/OpportunityOperationalCompactStrip.tsx"
);
const drawerPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../components/admin/AdminEntityDrawer.tsx"
);

describe("OpportunityOperationalCompactStrip", () => {
    it("loads tasks and scheduled sends and listens for drawer refresh/focus events", () => {
        const src = readFileSync(stripPath, "utf8");
        expect(src).toContain("fetchOperationalTasks");
        expect(src).toContain("fetchCommunicationScheduledSends");
        expect(src).toContain("data-admin-opportunity-operational-strip");
        expect(src).toContain("data-operational-task-chip");
        expect(src).toContain("OperationalTaskDetailPopover");
        expect(src).toContain("ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH");
        expect(src).toContain("ADMIN_V2_OPPORTUNITY_FOCUS_OPERATIONAL_TASKS");
    });
});

describe("AdminEntityDrawer operational strip wiring", () => {
    it("renders compact strip in header and omits heavy overview operational sections", () => {
        const src = readFileSync(drawerPath, "utf8");
        expect(src).toContain("OpportunityOperationalCompactStrip");
        expect(src).toContain("data-admin-opportunity-operational-strip");
        expect(src).not.toContain("OpportunityOperationalTasksSection");
        expect(src).not.toContain("OperationalAttentionDrawerSection");
        expect(src).not.toContain("Operational tasks & follow-ups");
        expect(src).not.toContain('data-drawer-section="operational_attention_detail"');
    });
});
