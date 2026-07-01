import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AdminV2 workflows page contract", () => {
    const pagePath = join(process.cwd(), "app/adminV2/workflows/page.tsx");
    const panelPath = join(process.cwd(), "app/adminV2/components/workflows/AdminV2WorkflowDetailPanel.tsx");

    it("syncs workflow selection to query param", () => {
        const src = readFileSync(pagePath, "utf8");
        expect(src).toContain("highlightWorkflowId");
        expect(src).toContain("selectWorkflow");
        expect(src).toContain('sp.set("workflow", workflowId)');
    });

    it("detail panel exposes deep-link and reminder metadata hooks", () => {
        const src = readFileSync(panelPath, "utf8");
        expect(src).toContain('data-workflow-detail-panel="true"');
        expect(src).toContain("data-workflow-reminder-intent");
        expect(src).toContain("data-workflow-action-row");
    });
});
