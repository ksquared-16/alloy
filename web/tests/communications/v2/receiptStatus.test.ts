import { describe, it, expect } from "vitest";
import { rollupRecipientReceipts, deriveTimelineStatus, buildTimelineEvents, type RawMessageRow } from "@/lib/communications/v2/familyWorkspace/aggregateFamilyTimeline";

describe("rollupRecipientReceipts", () => {
    it("takes the most-progressed timestamp per message across recipients", () => {
        const out = rollupRecipientReceipts([
            { message_id: "m1", delivered_at: "2026-06-10T10:00:00Z", opened_at: null },
            { message_id: "m1", delivered_at: "2026-06-10T11:00:00Z", opened_at: "2026-06-10T12:00:00Z" },
            { message_id: "m2", replied_at: "2026-06-11T09:00:00Z" },
        ]);
        expect(out.m1).toEqual({ deliveredAt: "2026-06-10T11:00:00Z", openedAt: "2026-06-10T12:00:00Z", repliedAt: null });
        expect(out.m2.repliedAt).toBe("2026-06-11T09:00:00Z");
    });
    it("empty -> {}", () => { expect(rollupRecipientReceipts([])).toEqual({}); });
});

describe("deriveTimelineStatus", () => {
    const m = (o: Partial<RawMessageRow>): RawMessageRow => ({ id: "x", ...o });
    it("inbound -> received", () => expect(deriveTimelineStatus(m({}), "inbound")).toBe("received"));
    it("note/system/internal -> null", () => expect(deriveTimelineStatus(m({}), "internal")).toBeNull());
    it("failed wins", () => expect(deriveTimelineStatus(m({ status: "failed", opened_at: "z" }), "outbound")).toBe("failed"));
    it("replied > opened > delivered", () => {
        expect(deriveTimelineStatus(m({ replied_at: "z" }), "outbound")).toBe("replied");
        expect(deriveTimelineStatus(m({ opened_at: "z" }), "outbound")).toBe("opened");
        expect(deriveTimelineStatus(m({ delivered_at: "z" }), "outbound")).toBe("delivered");
    });
    it("sent via status or sent_at; else queued", () => {
        expect(deriveTimelineStatus(m({ status: "sent" }), "outbound")).toBe("sent");
        expect(deriveTimelineStatus(m({ sent_at: "z" }), "outbound")).toBe("sent");
        expect(deriveTimelineStatus(m({ status: "queued" }), "outbound")).toBe("queued");
    });
});

describe("buildTimelineEvents status passthrough", () => {
    it("sets status + sentAt + receipts", () => {
        const ev = buildTimelineEvents([
            { id: "m1", thread_id: "t", direction: "outbound", created_at: "2026-06-10T10:00:00Z", delivered_at: "2026-06-10T10:05:00Z", status: "sent" },
        ]);
        expect(ev[0].status).toBe("delivered");
        expect(ev[0].deliveredAt).toBe("2026-06-10T10:05:00Z");
    });
});
