import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Workflow Assist apply refresh wiring", () => {
    it("dispatches automation refresh on successful apply", () => {
        const src = readFileSync(
            join(process.cwd(), "app/adminV2/components/aiCommandSurface/WorkflowAssistProposalActionCard.tsx"),
            "utf8"
        );
        expect(src).toContain("dispatchWorkflowAutomationRefresh");
        expect(src).toContain("globalAssistant?.workspaceScope");
        expect(src).toContain("OperationalProposalCardFrame");
    });
});
