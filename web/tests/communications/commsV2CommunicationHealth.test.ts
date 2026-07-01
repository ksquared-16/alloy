import { describe, expect, it } from "vitest";
import { computeCommunicationHealth } from "@/lib/communications/v2/communicationHealth";

/** PKG-09 — pure communication health computation. */
describe("computeCommunicationHealth", () => {
    it("empty conversation", () => {
        const h = computeCommunicationHealth({ messages: [] });
        expect(h.lastContactAt).toBeNull();
        expect(h.responseRate).toBeNull();
        expect(h.engagementScore).toBe(0);
        expect(h.unreadCount).toBe(0);
        expect(h.consentStatus).toBe("unknown");
        expect(h.channelPreference).toBeNull();
    });
    it("computes last contact, response rate, opens, engagement", () => {
        const h = computeCommunicationHealth({
            messages: [
                { direction: "outbound", created_at: "2026-05-01", channel: "email", opened_at: "2026-05-01" },
                { direction: "outbound", created_at: "2026-05-02", channel: "email" },
                { direction: "inbound", created_at: "2026-05-03", channel: "email" },
            ],
        });
        expect(h.lastContactAt).toBe("2026-05-03");
        expect(h.responseRate).toBe(0.5); // 1 inbound / 2 outbound
        expect(h.channelPreference).toBe("email");
        // openRate 0.5, responseRate 0.5 -> 100*(0.25+0.25)=50
        expect(h.engagementScore).toBe(50);
    });
    it("caps response rate at 1 and honors provided overrides", () => {
        const h = computeCommunicationHealth({
            messages: [
                { direction: "outbound", created_at: "2026-05-01" },
                { direction: "inbound", created_at: "2026-05-02" },
                { direction: "inbound", created_at: "2026-05-03" },
            ],
            lastReadAt: "2026-05-02",
            unreadCount: 1,
            consentStatus: "all_opted_in",
            channelPreference: "sms",
        });
        expect(h.responseRate).toBe(1);
        expect(h.lastReadAt).toBe("2026-05-02");
        expect(h.unreadCount).toBe(1);
        expect(h.consentStatus).toBe("all_opted_in");
        expect(h.channelPreference).toBe("sms");
    });
});
