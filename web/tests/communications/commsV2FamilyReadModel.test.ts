import { describe, expect, it } from "vitest";
import {
    markUnreadFromReads,
    aggregateFamilyThreads,
    type RawThreadRow,
    type RawMessageRow,
} from "@/lib/communications/v2/familyWorkspace/aggregateFamilyTimeline";

const ctx = { childPersonIdToMemberId: {}, opportunityIds: new Set<string>(), selectedThreadId: null };

describe("P6 family read-model", () => {
    it("markUnreadFromReads: inbound unread unless read; outbound untouched", () => {
        const messages: RawMessageRow[] = [
            { id: "m1", thread_id: "t1", direction: "inbound", created_at: "2026-06-10T00:00:00Z" },
            { id: "m2", thread_id: "t1", direction: "inbound", created_at: "2026-06-11T00:00:00Z" },
            { id: "m3", thread_id: "t1", direction: "outbound", created_at: "2026-06-12T00:00:00Z" },
        ];
        markUnreadFromReads(messages, new Set(["m1"]));
        expect(messages[0].unread).toBe(false); // read
        expect(messages[1].unread).toBe(true); // unread
        expect(messages[2].unread).toBeUndefined(); // outbound untouched
    });

    it("rolls per-thread unread counts and a family unread total", () => {
        const threads: RawThreadRow[] = [
            { id: "t1", primary_entity_type: "customer", primary_entity_id: "c1", last_message_at: "2026-06-11T00:00:00Z" },
            { id: "t2", primary_entity_type: "person", primary_entity_id: "p1", last_message_at: "2026-06-09T00:00:00Z" },
        ];
        const messages: RawMessageRow[] = [
            { id: "m1", thread_id: "t1", direction: "inbound", unread: true, created_at: "2026-06-11T00:00:00Z" },
            { id: "m2", thread_id: "t1", direction: "inbound", unread: false, created_at: "2026-06-10T00:00:00Z" },
            { id: "m3", thread_id: "t2", direction: "inbound", unread: true, created_at: "2026-06-09T00:00:00Z" },
            { id: "m4", thread_id: "t2", direction: "outbound", created_at: "2026-06-08T00:00:00Z" },
        ];
        const agg = aggregateFamilyThreads(threads, messages, ctx);
        const t1 = agg.threads.find((t) => t.id === "t1")!;
        const t2 = agg.threads.find((t) => t.id === "t2")!;
        expect(t1.unread).toBe(1);
        expect(t2.unread).toBe(1);
        expect(agg.familyUnread).toBe(2);
    });

    it("last activity falls back to max message created_at when thread has no last_message_at", () => {
        const threads: RawThreadRow[] = [
            { id: "t1", primary_entity_type: "customer", primary_entity_id: "c1", last_message_at: null },
        ];
        const messages: RawMessageRow[] = [
            { id: "m1", thread_id: "t1", direction: "outbound", created_at: "2026-06-01T00:00:00Z" },
            { id: "m2", thread_id: "t1", direction: "inbound", created_at: "2026-06-05T00:00:00Z" },
        ];
        const agg = aggregateFamilyThreads(threads, messages, ctx);
        expect(agg.threads[0].lastActivityAt).toBe("2026-06-05T00:00:00Z");
        expect(agg.lastFamilyActivityAt).toBe("2026-06-05T00:00:00Z");
    });

    it("family last activity is the max across threads", () => {
        const threads: RawThreadRow[] = [
            { id: "t1", primary_entity_type: "customer", primary_entity_id: "c1", last_message_at: "2026-06-03T00:00:00Z" },
            { id: "t2", primary_entity_type: "person", primary_entity_id: "p1", last_message_at: "2026-06-07T00:00:00Z" },
        ];
        const agg = aggregateFamilyThreads(threads, [], ctx);
        expect(agg.lastFamilyActivityAt).toBe("2026-06-07T00:00:00Z");
        expect(agg.familyUnread).toBe(0);
    });
});
