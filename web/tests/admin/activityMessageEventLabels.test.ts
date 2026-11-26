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

    // Both policy boundaries emit these — the enqueue eligibility gate and
    // dispatch revalidation. Unmapped, a durable refusal reached the operator as
    // the raw key `message_blocked`.
    it("labels a policy-blocked sms as SMS blocked", () => {
        expect(resolveCommunicationMessageEventTitle("message_blocked", { channel: "sms" })).toBe("SMS blocked");
    });

    it("labels a policy-deferred email as Email deferred", () => {
        expect(resolveCommunicationMessageEventTitle("message_deferred", { channel: "email" })).toBe("Email deferred");
    });

    it("falls back to a channel-free label rather than the raw key", () => {
        expect(resolveCommunicationMessageEventTitle("message_blocked", {})).toBe("Message blocked");
    });

    it("keeps a policy refusal distinct from a provider failure", () => {
        // "SMS failed" sends an operator to the provider. "SMS blocked" tells
        // them the platform declined. They must not collapse into one label.
        expect(resolveCommunicationMessageEventTitle("message_blocked", { channel: "sms" })).not.toBe(
            resolveCommunicationMessageEventTitle("message_failed", { channel: "sms" })
        );
    });
});
