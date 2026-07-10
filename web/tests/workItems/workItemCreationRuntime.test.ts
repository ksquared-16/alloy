import { describe, expect, it } from "vitest";

import { draftToOperationalTaskBody } from "@/lib/workItems/commitWorkItemDraft";
import {
    applyConversationInput,
    applyDraftMutation,
    beginWorkItemDraft,
    cancelWorkItemCreationSession,
    sessionCanCommit,
} from "@/lib/workItems/workItemCreationRuntime";
import { mutateWorkItemDraft } from "@/lib/workItems/workItemDraftV1";
import { validateWorkItemDraft } from "@/lib/workItems/validateWorkItemDraft";

describe("WorkItemDraftV1 creation runtime", () => {
    it("creates draft with schema version and draft status", () => {
        const session = beginWorkItemDraft({ defaultAssigneeUserId: "user-1" });
        expect(session.draft.schema_version).toBe("1");
        expect(session.draft.status).toBe("needs_clarification");
        expect(session.turns[0]?.role).toBe("system");
    });

    it("mutates draft incrementally from conversation input", () => {
        let session = beginWorkItemDraft({ defaultAssigneeUserId: "user-1" });
        session = applyConversationInput(session, "Call the Kurzman family tomorrow", "user-1");
        expect(session.draft.title.toLowerCase()).toContain("call");
        expect(session.draft.due_at).toBeTruthy();
        expect(session.draft.intent_text).toContain("Call the Kurzman family");
    });

    it("marks ready when validation passes", () => {
        let session = beginWorkItemDraft({ defaultAssigneeUserId: "user-1" });
        session = applyConversationInput(session, "Prepare enrollment packet", "user-1");
        session = applyDraftMutation(session, { kind: "set_due_default" });
        session = applyDraftMutation(session, { kind: "set_assignee", userId: "user-1" });
        expect(session.draft.status).toBe("ready");
        expect(sessionCanCommit(session)).toBe(true);
    });

    it("blocks commit for linked mode without entity", () => {
        let session = beginWorkItemDraft({ defaultAssigneeUserId: "user-1" });
        session = applyDraftMutation(session, { kind: "set_link_mode", mode: "linked" });
        session = applyConversationInput(session, "Follow up with family", "user-1");
        session = applyDraftMutation(session, { kind: "set_due_default" });
        session = applyDraftMutation(session, { kind: "set_assignee", userId: "user-1" });
        expect(session.draft.status).toBe("needs_clarification");
        expect(sessionCanCommit(session)).toBe(false);
        expect(validateWorkItemDraft(session.draft).blockingIssues.some((i) => i.code === "missing_entity")).toBe(true);
    });

    it("maps ready draft to existing operational task body", () => {
        const session = beginWorkItemDraft({ defaultAssigneeUserId: "user-1" });
        const draft = mutateWorkItemDraft(session.draft, {
            title: "Send forms",
            due_at: new Date(Date.now() + 86_400_000).toISOString(),
            assigned_to_user_id: "user-1",
            description: "Packet follow-up",
        });
        const body = draftToOperationalTaskBody({ ...draft, status: "ready" });
        expect(body.title).toBe("Send forms");
        expect(body.source).toBe("manual");
        expect(body.assigned_to_user_id).toBe("user-1");
    });

    it("cancels draft without commit", () => {
        const session = beginWorkItemDraft({ defaultAssigneeUserId: "user-1" });
        const cancelled = cancelWorkItemCreationSession(session);
        expect(cancelled.draft.status).toBe("cancelled");
        expect(sessionCanCommit(cancelled)).toBe(false);
    });
});
