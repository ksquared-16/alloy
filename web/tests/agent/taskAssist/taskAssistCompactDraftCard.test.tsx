import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const cardPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../components/admin/taskAssist/TaskAssistCompactDraftCard.tsx"
);

describe("TaskAssistCompactDraftCard", () => {
    it("auto-proposes on mount and exposes Send now + schedule prompt", () => {
        const src = readFileSync(cardPath, "utf8");
        expect(src).toContain("autoPropose");
        expect(src).toContain("Drafting message");
        expect(src).toContain("Preparing message and schedule review");
        expect(src).toContain("OperationalProposalCardFrame");
        expect(src).toContain("data-task-assist-compact-send-now");
        expect(src).toContain("When should I send it?");
        expect(src).toContain("What time should I send it?");
        expect(src).toContain("Schedule send");
        expect(src).toContain('setPhase(needsExplicitSendTime ? "schedule_prompt" : "review")');
        expect(src).toContain("formatTaskAssistClientError");
        expect(src).toContain("/api/admin/ai/task-assist/propose");
        expect(src).toContain("STALE_OPERATIONAL_PROPOSAL_MESSAGE");
    });
});
