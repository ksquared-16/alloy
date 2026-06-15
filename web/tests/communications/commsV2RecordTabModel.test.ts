import { describe, expect, it } from "vitest";
import { buildRecordCommunicationsModel } from "@/lib/communications/v2/recordTabModel";

describe("buildRecordCommunicationsModel", () => {
    it("merges messages + notes into one chronological timeline", () => {
        const m = buildRecordCommunicationsModel({
            messages: [
                { id: "m2", channel: "email", direction: "inbound", created_at: "2026-05-03", body: "<p>Reply</p>" },
                { id: "m1", channel: "email", direction: "outbound", created_at: "2026-05-01", body: "Hi" },
            ],
            notes: [{ id: "n1", created_at: "2026-05-02", body: "internal note" }],
            unread: 2,
            consentStatus: "all_opted_in",
        });
        expect(m.timeline.map((e) => e.id)).toEqual(["m1", "n1", "m2"]);
        expect(m.timeline.find((e) => e.id === "n1")).toMatchObject({ kind: "note", direction: "internal" });
        expect(m.timeline.find((e) => e.id === "m2")?.preview).toBe("Reply");
        expect(m.lastContactAt).toBe("2026-05-03");
        expect(m.unread).toBe(2);
        expect(m.consentDisplay).toBe("all_opted_in");
    });
    it("defaults gracefully", () => {
        const m = buildRecordCommunicationsModel({ messages: [] });
        expect(m.timeline).toEqual([]);
        expect(m.lastContactAt).toBeNull();
        expect(m.unread).toBe(0);
        expect(m.consentDisplay).toBe("unknown");
    });
});
