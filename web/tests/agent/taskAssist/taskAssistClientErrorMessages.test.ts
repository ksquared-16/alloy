import { describe, expect, it } from "vitest";

import { formatTaskAssistClientError } from "@/lib/agent/taskAssist/taskAssistClientErrorMessages";

describe("formatTaskAssistClientError", () => {
    it("maps raw ai_policy task_assist_draft error to friendly copy", () => {
        expect(
            formatTaskAssistClientError("task_assist_draft must appear in ai_policy.allowed_features.")
        ).toBe("Message drafting is not enabled for this organization yet.");
    });

    it("passes through generic errors", () => {
        expect(formatTaskAssistClientError("Network timeout")).toBe("Network timeout");
    });
});
