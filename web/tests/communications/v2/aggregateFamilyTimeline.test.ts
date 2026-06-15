import { describe, it, expect } from "vitest";
import { aggregateFamilyThreads, buildTimelineEvents, type RawThreadRow, type RawMessageRow } from "@/lib/communications/v2/familyWorkspace/aggregateFamilyTimeline";

const threads: RawThreadRow[] = [
    { id: "t-cust", primary_entity_type: "customer", primary_entity_id: "cust-1", channel: "email", last_message_at: "2026-06-10T10:00:00Z" },
    { id: "t-child", primary_entity_type: "person", primary_entity_id: "p-child1", channel: "sms", last_message_at: "2026-06-12T09:00:00Z" },
    { id: "t-opp", primary_entity_type: "opportunity", primary_entity_id: "opp-1", channel: "email", last_message_at: "2026-06-11T08:00:00Z" },
    { id: "t-cust", primary_entity_type: "customer", primary_entity_id: "cust-1", channel: "email", last_message_at: "2026-06-10T10:00:00Z" }, // dup
];
const messages: RawMessageRow[] = [
    { id: "m1", thread_id: "t-cust", direction: "outbound", channel: "email", body: "Welcome", created_at: "2026-06-10T10:00:00Z" },
    { id: "m2", thread_id: "t-child", direction: "inbound", channel: "sms", body: "Question", created_at: "2026-06-12T09:00:00Z" },
    { id: "m3", thread_id: "t-child", direction: "outbound", channel: "sms", body: "Answer", created_at: "2026-06-12T09:30:00Z" },
];
const ctx = { childPersonIdToMemberId: { "p-child1": "cm-1" }, opportunityIds: new Set(["opp-1"]) };

describe("aggregateFamilyTimeline", () => {
    it("builds chronological-ascending timeline", () => {
        const ev = buildTimelineEvents(messages);
        expect(ev.map((e) => e.id)).toEqual(["m1", "m2", "m3"]);
        expect(ev[0].threadId).toBe("t-cust");
    });
    it("dedups threads and sorts by last activity desc", () => {
        const out = aggregateFamilyThreads(threads, messages, ctx);
        expect(out.threads.map((t) => t.id)).toEqual(["t-child", "t-opp", "t-cust"]);
    });
    it("tags child + opportunity context", () => {
        const out = aggregateFamilyThreads(threads, messages, ctx);
        expect(out.threads.find((t) => t.id === "t-child")?.childId).toBe("cm-1");
        expect(out.threads.find((t) => t.id === "t-opp")?.opportunityId).toBe("opp-1");
        expect(out.threads.find((t) => t.id === "t-cust")?.childId).toBeNull();
    });
    it("counts messages per thread", () => {
        const out = aggregateFamilyThreads(threads, messages, ctx);
        expect(out.threads.find((t) => t.id === "t-child")?.messageCount).toBe(2);
    });
    it("default selected thread is newest; selectedMessages filtered to it", () => {
        const out = aggregateFamilyThreads(threads, messages, ctx);
        expect(out.selectedThread?.id).toBe("t-child");
        expect(out.selectedMessages.map((m) => m.id)).toEqual(["m2", "m3"]);
    });
    it("honors explicit selectedThreadId", () => {
        const out = aggregateFamilyThreads(threads, messages, { ...ctx, selectedThreadId: "t-cust" });
        expect(out.selectedThread?.id).toBe("t-cust");
        expect(out.selectedMessages.map((m) => m.id)).toEqual(["m1"]);
    });
});
