import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AutomationWorkflowsBlock Ask Workflow Assist", () => {
    it("exposes onAskWorkflowAssist button affordance", () => {
        const src = readFileSync(
            join(process.cwd(), "app/adminV2/components/workspace/blocks/AutomationWorkflowsBlock.tsx"),
            "utf8"
        );
        expect(src).toContain("onAskWorkflowAssist");
        expect(src).toContain('data-ws-ask-workflow-assist="true"');
        expect(src).toContain("Ask Workflow Assist");
    });

    it("department page passes onAskWorkflowAssist", () => {
        const src = readFileSync(
            join(process.cwd(), "app/adminV2/workspace/dept/[departmentId]/page.tsx"),
            "utf8"
        );
        expect(src).toContain("onAskWorkflowAssist={askWorkflowAssist}");
        expect(src).toContain("seedCommand:");
    });
});
