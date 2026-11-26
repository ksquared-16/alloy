import { describe, expect, it } from "vitest";

import { createWorkItemDraft, mutateWorkItemDraft } from "@/lib/workItems/workItemDraftV1";
import { validateWorkItemDraft } from "@/lib/workItems/validateWorkItemDraft";

describe("validateWorkItemDraft", () => {
    it("reports missing required fields", () => {
        const draft = createWorkItemDraft({});
        const result = validateWorkItemDraft(draft);
        expect(result.canCommit).toBe(false);
        expect(result.blockingIssues.map((i) => i.code)).toEqual(
            expect.arrayContaining(["missing_title", "missing_due", "missing_assignee"]),
        );
    });

    it("allows commit when required fields are present", () => {
        let draft = createWorkItemDraft({ defaultAssigneeUserId: "user-1" });
        draft = mutateWorkItemDraft(draft, {
            title: "Review packet",
            due_at: new Date(Date.now() + 86_400_000).toISOString(),
            assigned_to_user_id: "user-1",
        });
        const result = validateWorkItemDraft(draft);
        expect(result.canCommit).toBe(true);
    });
});
