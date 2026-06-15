import { describe, expect, it } from "vitest";
import {
    OPERATIONAL_QUEUES,
    groupConversationsByQueue,
    computeCommandCenterMetrics,
    applyQueueFilters,
    type ConversationSummary,
} from "@/lib/communications/v2/commandCenterViewModel";

const C: ConversationSummary[] = [
    { id: "1", attention_state: "awaiting_parent_reply", channel: "email", assignment_state: "unassigned", sla_state: "overdue", unread: 1, family_label: "Rivera Family", location_id: "L1" },
    { id: "2", attention_state: "needs_follow_up", channel: "sms", assignment_state: "assigned", assigned_user_id: "u1", sla_state: "first_response_due", unread: 0, family_label: "Murphy Family", location_id: "L1" },
    { id: "3", attention_state: "documents_missing", channel: "email", assignment_state: "assigned", assigned_user_id: "u2", sla_state: "none", unread: 2, family_label: "Hayes Family", location_id: "L2" },
    { id: "4", attention_state: "mystery", channel: "email", assignment_state: "unassigned", sla_state: "none", family_label: "Other Family" },
];

describe("operational queues, not folders", () => {
    it("queue keys are operational work states", () => {
        expect(OPERATIONAL_QUEUES.map((q) => q.key)).toEqual([
            "awaiting_parent_reply", "needs_follow_up", "documents_missing", "re_enrollment_outreach", "waitlist_update",
        ]);
    });
    it("groups by attention_state; unknown → other", () => {
        const g = groupConversationsByQueue(C);
        expect(g.awaiting_parent_reply.map((c) => c.id)).toEqual(["1"]);
        expect(g.needs_follow_up.map((c) => c.id)).toEqual(["2"]);
        expect(g.other.map((c) => c.id)).toEqual(["4"]);
    });
});

describe("metrics", () => {
    it("computes deterministic counts", () => {
        const m = computeCommandCenterMetrics(C);
        expect(m.total).toBe(4);
        expect(m.requiresResponse).toBe(2); // ids 1,2
        expect(m.slaAtRisk).toBe(1); // overdue id 1
        expect(m.unassigned).toBe(2); // ids 1,4
        expect(m.unread).toBe(3);
    });
});

describe("filters", () => {
    it("filters by channel / owner / location / search", () => {
        expect(applyQueueFilters(C, { channel: "sms" }).map((c) => c.id)).toEqual(["2"]);
        expect(applyQueueFilters(C, { ownerUserId: "u2" }).map((c) => c.id)).toEqual(["3"]);
        expect(applyQueueFilters(C, { locationId: "L2" }).map((c) => c.id)).toEqual(["3"]);
        expect(applyQueueFilters(C, { search: "rivera" }).map((c) => c.id)).toEqual(["1"]);
        expect(applyQueueFilters(C, { assignmentState: "assigned" }).map((c) => c.id)).toEqual(["2", "3"]);
    });
});
