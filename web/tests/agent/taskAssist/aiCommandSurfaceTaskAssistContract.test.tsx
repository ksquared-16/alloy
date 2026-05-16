import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const shellPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../app/adminV2/components/aiCommandSurface/AICommandSurfaceShell.tsx"
);
const threadPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../app/adminV2/components/aiCommandSurface/CommandSurfaceThread.tsx"
);
const proposalCardPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../app/adminV2/components/aiCommandSurface/WorkflowAssistProposalActionCard.tsx"
);
const eventsPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../lib/adminV2/aiCommandSurface/adminV2CommandBarEvents.ts"
);

describe("AICommandSurfaceShell Interaction Layer V1", () => {
    it("uses unified thread surface without mode tabs", () => {
        const src = readFileSync(shellPath, "utf8");
        expect(src).not.toContain("data-adminv2-command-surface-mode-tabs");
        expect(src).not.toContain("Find target");
        expect(src).toContain("data-command-surface-thread-panel");
        expect(src).toContain("data-command-surface-input");
        expect(src).toContain("data-command-surface-submit");
        expect(src).toContain("routeCommandSurface");
        expect(src).toContain("CommandSurfaceThread");
    });

    it("thread hosts compact auto-draft card before full workspace", () => {
        const threadSrc = readFileSync(threadPath, "utf8");
        expect(threadSrc).toContain("TaskAssistCompactDraftCard");
        expect(threadSrc).toContain("TaskAssistOpportunityWorkspace");
        expect(threadSrc).toContain("data-command-surface-task-assist-action-card");
        expect(threadSrc).toContain('source_surface="command_bar"');
        expect(threadSrc).toContain("entity_display_label={entityLabel}");
        expect(threadSrc).toContain('uiPhase === "draft"');
        expect(threadSrc).toContain('uiPhase === "reminder"');
        expect(threadSrc).toContain("TaskAssistCompactReminderCard");
        expect(threadSrc).toContain("TaskAssistCompactDraftCard");
        expect(threadSrc).not.toContain("I found these matching records.");
        expect(threadSrc).not.toContain("Next:");
        expect(threadSrc).toContain('case "target_confirmed"');
        expect(threadSrc).toContain("return null");
        expect(threadSrc).toContain("autoPropose");
        expect(threadSrc).toContain("TaskAssistClarificationCard");
        expect(threadSrc).toContain("fuzzy_entity_suggestion");
    });

    it("thread renders workflow assist read + proposal action wiring", () => {
        const threadSrc = readFileSync(threadPath, "utf8");
        expect(threadSrc).toContain("WorkflowAssistReadThreadCard");
        expect(threadSrc).toContain("workflowAssistMutation");
        expect(threadSrc).toContain("workflowAssistMutationBlockedReason");
        expect(threadSrc).toContain("workflow_assist_proposal");
        expect(threadSrc).toContain("WorkflowAssistProposalActionCard");
        expect(threadSrc).toContain("applyAllowed");
        expect(readFileSync(proposalCardPath, "utf8")).toContain("data-command-surface-workflow-assist-proposal-card");
    });

    it("shell wires workflow-assist propose fetch and portal capability hint", () => {
        const shellSrc = readFileSync(shellPath, "utf8");
        expect(shellSrc).toContain("/api/admin/ai/workflow-assist/propose");
        expect(shellSrc).toContain("/api/admin/ai/workflow-assist/capabilities");
        expect(shellSrc).toContain("workflowAssistMutation");
    });

    it("shell auto-drafts after candidate confirm for message intents", () => {
        const shellSrc = readFileSync(shellPath, "utf8");
        expect(shellSrc).toContain("taskAssistFollowUpNoticeText");
        expect(shellSrc).toContain('isReminderIntent ? "reminder"');
        expect(shellSrc).toContain("dedupeTaskAssistEntitySearchCandidates");
        expect(shellSrc).toContain("I found");
        expect(shellSrc).toContain("Which one?");
        expect(shellSrc).toContain("pendingClarificationRef");
        expect(shellSrc).toContain("needsMessageGoalClarification");
        expect(shellSrc).toContain("fuzzy_entity_suggestion");
        expect(shellSrc).toContain("threadScrollRef");
    });

    it("exports stable focus event name for GlobalAssistantContext", () => {
        const src = readFileSync(eventsPath, "utf8");
        expect(src).toContain("alloy-adminv2-focus-command-bar");
    });
});
