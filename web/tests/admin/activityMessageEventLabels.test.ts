import { describe, expect, it } from "vitest";

import { resolveCommunicationMessageEventTitle } from "@/lib/admin/activityMessageEventLabels";

describe("activityMessageEventLabels", () => {
    it("labels outbound email as Email sent", () => {
        expect(resolveCommunicationMessageEventTitle("message_sent", { channel: "email" })).toBe("Email sent");
    });

    it("labels outbound sms as SMS sent", () => {
        expect(resolveCommunicationMessageEventTitle("message_sent", { channel: "sms" })).toBe("SMS sent");
    });

    it("labels inbound email as Email received", () => {
        expect(resolveCommunicationMessageEventTitle("message_received", { channel: "email" })).toBe("Email received");
    });
});
