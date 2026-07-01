import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const actionCardPath = join(
    process.cwd(),
    "app/adminV2/components/aiCommandSurface/WorkflowAssistProposalActionCard.tsx"
);
const reviewPanelPath = join(
    process.cwd(),
    "app/adminV2/components/aiCommandSurface/WorkflowAssistProposalReviewPanel.tsx"
);

describe("Workflow Assist OperationalProposalCardFrame migration", () => {
    it("action card uses frame instead of CommandSurfaceActionCardShell", () => {
        const src = readFileSync(actionCardPath, "utf8");
        expect(src).toContain("OperationalProposalCardFrame");
        expect(src).not.toContain("CommandSurfaceActionCardShell");
        expect(src).toContain("OperationalProposalCardFrame");
        expect(src).toContain("data-command-surface-workflow-assist-apply");
        expect(src).toContain("dispatchWorkflowAutomationRefresh");
    });

    it("review panel uses frame for enriched draft proposals", () => {
        const src = readFileSync(reviewPanelPath, "utf8");
        expect(src).toContain("OperationalProposalCardFrame");
        expect(src).not.toContain("CommandSurfaceActionCardShell");
        expect(src).toContain("data-command-surface-workflow-assist-apply");
    });

    it("wires blocked copy and apply controls on edit proposals", () => {
        const src = readFileSync(actionCardPath, "utf8");
        expect(src).toContain("blocked={!applyAllowed}");
        expect(src).toContain("WORKFLOW_ASSIST_PORTAL_MUTATION_BLOCKED_USER_MESSAGE");
        expect(src).toContain("data-command-surface-workflow-assist-edit-review");
        expect(src).toContain("Apply disabled draft");
    });

    it("avoids chatbot marketing language in workflow proposal sources", () => {
        const src = readFileSync(actionCardPath, "utf8") + readFileSync(reviewPanelPath, "utf8");
        expect(src).not.toMatch(/\bAI thinks\b/i);
        expect(src).not.toContain("Copilot");
        expect(src).not.toContain("Magic");
        expect(src).not.toContain("Autonomous");
        expect(src).toContain("WORKFLOW_ASSIST_PROPOSAL_TYPE_LABEL");
    });
});
