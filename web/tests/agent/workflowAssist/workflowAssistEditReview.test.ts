import { describe, expect, it } from "vitest";

import { buildWorkflowAssistEditReviewRows, buildWorkflowAssistSuggestionV1 } from "@/lib/agent/workflowAssist/workflowAssistProposalV1";

describe("workflowAssist edit review rows", () => {
    const orgId = "22222222-2222-2222-2222-222222222222";
    const userId = "33333333-3333-3333-3333-333333333333";
    const wfId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    it("includes current and proposed for rename edit", () => {
        const suggestion = buildWorkflowAssistSuggestionV1({
            orgId,
            actorUserId: userId,
            parsed: {
                version: 1,
                proposal_kind: "edit_workflow",
                workflow_id: wfId,
                patch: { name: "Renamed" },
            },
            edit_before: { name: "Before", enabled: true },
        });
        expect(suggestion.edit_review).toEqual([
            { field: "name", label: "Name", current: "Before", proposed: "Renamed" },
        ]);
    });

    it("pause review shows enabled to disabled", () => {
        const rows = buildWorkflowAssistEditReviewRows({
            proposal_kind: "pause_workflow",
            patch: { enabled: false },
            before: { enabled: true },
        });
        expect(rows[0]).toMatchObject({ current: "Enabled", proposed: "Disabled" });
    });
});
