import { describe, expect, it } from "vitest";

import { activityEventDisplayTitle } from "@/lib/admin/enrichActivityEventsWithCommunicationChannels";

describe("enrichActivityEventsWithCommunicationChannels display", () => {
    it("labels tour_scheduling email using canonical channel after enrichment shape", () => {
        const payload = {
            channel: "email",
            communication_message_id: "msg-1",
            metadata: { source: "tour_scheduling" },
        };
        expect(activityEventDisplayTitle("message_sent", payload)).toBe("Email sent");
    });

    it("labels sms using canonical channel", () => {
        expect(activityEventDisplayTitle("message_sent", { channel: "sms" })).toBe("SMS sent");
    });
});
