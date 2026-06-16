import { describe, expect, it, vi } from "vitest";
import { aggregateFamilyThreads, type RawMessageRow } from "@/lib/communications/v2/familyWorkspace/aggregateFamilyTimeline";

describe("aggregateFamilyThreads selected thread messages", () => {
    it("returns messages for selectedThreadId even when thread metadata is missing from the family set", () => {
        const messages: RawMessageRow[] = [
            { id: "m1", thread_id: "t-preview", direction: "inbound", body: "Hello from queue preview", created_at: "2026-06-15T10:00:00Z" },
        ];
        const result = aggregateFamilyThreads([], messages, {
            childPersonIdToMemberId: {},
            opportunityIds: new Set(),
            selectedThreadId: "t-preview",
        });
        expect(result.selectedMessages).toHaveLength(1);
        expect(result.selectedMessages[0]?.body).toBe("Hello from queue preview");
    });
});

describe("command center thread messages helper", () => {
    it("reverses API descending order into chronological timeline order", async () => {
        const { fetchCommandCenterThreadMessages } = await import("@/lib/communications/v2/commandCenterThreadMessages");
        const originalFetch = global.fetch;
        global.fetch = vi.fn(async () => ({
            ok: true,
            json: async () => ({
                messages: [
                    { id: "2", body: "second", created_at: "2026-06-15T11:00:00Z" },
                    { id: "1", body: "first", created_at: "2026-06-15T10:00:00Z" },
                ],
            }),
        })) as typeof fetch;
        const msgs = await fetchCommandCenterThreadMessages("thread-1");
        expect(msgs.map((m) => m.body)).toEqual(["first", "second"]);
        global.fetch = originalFetch;
    });
});

describe("command center record links", () => {
    it("builds drawer links only when ids exist", async () => {
        const { buildCommandCenterRecordLinks } = await import("@/lib/communications/v2/commandCenterRecordLinks");
        const links = buildCommandCenterRecordLinks({
            id: "thread-1",
            customer_id: "11111111-1111-1111-1111-111111111111",
            family_label: "Rivera Family",
            primary_contact_person_id: "22222222-2222-2222-2222-222222222222",
            primary_contact_name: "Jamie Rivera",
            opportunity_id: "33333333-3333-3333-3333-333333333333",
            stage_label: "New Lead",
            child_links: [{ id: "44444444-4444-4444-4444-444444444444", name: "Maya" }],
        });
        expect(links.map((l) => l.type)).toEqual(expect.arrayContaining(["customers", "persons", "opportunities", "customer_members"]));
    });
});

describe("command center operator terminology", () => {
    it("labels unassigned queue threads as Needs review", async () => {
        const { NEEDS_REVIEW_STATUS_LABEL, conversationQueueStatusPill } = await import("@/lib/communications/v2/commandCenterViewModel");
        expect(NEEDS_REVIEW_STATUS_LABEL).toBe("Needs review");
        expect(conversationQueueStatusPill({ id: "1", attention_state: null }).label).toBe("Needs review");
    });
});
