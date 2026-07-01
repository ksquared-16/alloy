import { describe, expect, it } from "vitest";
import {
    OPERATIONAL_QUEUES,
    OTHER_QUEUE_KEY,
    groupConversationsByQueue,
    computeCommandCenterMetrics,
    applyQueueFilters,
    visibleCommandCenterQueues,
    flattenVisibleConversationIds,
    resolveCommandCenterSelection,
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
    it("groups by attention_state; unknown/null → other", () => {
        const g = groupConversationsByQueue(C);
        expect(g.awaiting_parent_reply.map((c) => c.id)).toEqual(["1"]);
        expect(g.needs_follow_up.map((c) => c.id)).toEqual(["2"]);
        expect(g[OTHER_QUEUE_KEY].map((c) => c.id)).toEqual(["4"]);
    });
    it("groups null attention_state into other (live staging threads)", () => {
        const live: ConversationSummary[] = [
            { id: "t1", family_label: "Rivera Family", attention_state: null },
            { id: "t2", family_label: "Smith Family" },
        ];
        const g = groupConversationsByQueue(live);
        expect(g[OTHER_QUEUE_KEY].map((c) => c.id)).toEqual(["t1", "t2"]);
        expect(OPERATIONAL_QUEUES.every((q) => (g[q.key] ?? []).length === 0)).toBe(true);
    });
});

describe("visible queue sections", () => {
    it("includes the fallback section when rows only land in other", () => {
        const live: ConversationSummary[] = [
            { id: "t1", family_label: "Rivera Family" },
            { id: "t2", family_label: "Smith Family" },
        ];
        const grouped = groupConversationsByQueue(live);
        const sections = visibleCommandCenterQueues(grouped);
        expect(sections).toHaveLength(1);
        expect(sections[0]?.key).toBe(OTHER_QUEUE_KEY);
        expect(sections[0]?.items).toHaveLength(2);
    });
    it("keeps count and visible rows consistent for mixed buckets", () => {
        const grouped = groupConversationsByQueue(C);
        const sections = visibleCommandCenterQueues(grouped);
        const visibleCount = sections.reduce((n, s) => n + s.items.length, 0);
        expect(visibleCount).toBe(C.length);
    });
    it("returns no sections when the filtered set is empty", () => {
        expect(visibleCommandCenterQueues(groupConversationsByQueue([]))).toEqual([]);
    });
});

describe("auto-selection", () => {
    it("selects the first visible row when nothing is selected", () => {
        expect(resolveCommandCenterSelection(null, ["a", "b"])).toBe("a");
    });
    it("keeps manual selection while the row remains visible", () => {
        expect(resolveCommandCenterSelection("b", ["a", "b", "c"])).toBe("b");
    });
    it("falls back to the first visible row when the selected row disappears", () => {
        expect(resolveCommandCenterSelection("gone", ["a", "c"])).toBe("a");
    });
    it("returns null when there are no visible rows", () => {
        expect(resolveCommandCenterSelection("gone", [])).toBeNull();
    });
});

describe("metrics", () => {
    it("computes deterministic counts", () => {
        const m = computeCommandCenterMetrics(C);
        expect(m.total).toBe(4);
        expect(m.requiresResponse).toBe(2);
        expect(m.slaAtRisk).toBe(1);
        expect(m.unassigned).toBe(2);
        expect(m.unread).toBe(3);
        expect(m.unclassified).toBe(1);
    });
});

describe("health display", () => {
    it("does not show Unresponsive for unclassified threads", async () => {
        const { resolveCommandCenterHealthDisplay } = await import("@/lib/communications/v2/commandCenterViewModel");
        expect(resolveCommandCenterHealthDisplay({ id: "1", attention_state: null }, 0, 0).label).toBe("Needs review");
        expect(resolveCommandCenterHealthDisplay({ id: "2", attention_state: "awaiting_parent_reply" }, 0, 0).label).toBeNull();
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

describe("queue card presentation", () => {
    it("prefers household label over raw email for title", async () => {
        const { conversationDisplayTitle } = await import("@/lib/communications/v2/commandCenterViewModel");
        expect(
            conversationDisplayTitle({
                id: "1",
                family_label: "user@example.com",
                primary_contact_name: "Jamie Rivera",
            })
        ).toBe("Jamie Rivera");
        expect(conversationDisplayTitle({ id: "2", family_label: "Rivera Family" })).toBe("Rivera Family");
        expect(conversationDisplayTitle({ id: "3", family_label: "unknown@example.com" })).toBe("Family");
    });

    it("labels unclassified threads without faking on track", async () => {
        const { conversationQueueStatusPill } = await import("@/lib/communications/v2/commandCenterViewModel");
        expect(conversationQueueStatusPill({ id: "1", attention_state: null, sla_state: null }).label).toBe("Needs review");
        expect(conversationQueueStatusPill({ id: "2", attention_state: "awaiting_parent_reply" }).label).toBe("Needs response");
        expect(conversationQueueStatusPill({ id: "3", attention_state: "needs_follow_up", sla_state: "on_track" }).label).toBe("Follow up");
    });
});
