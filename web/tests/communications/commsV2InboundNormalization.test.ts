import { describe, expect, it } from "vitest";
import {
    buildInboundMessageDraft,
    normalizeInboundRecipientKey,
    selectOutboundToMarkReplied,
} from "@/lib/communications/v2/inboundNormalization";

/** PKG-07 — pure inbound normalization + reply matching. */
describe("inbound normalization", () => {
    it("builds an email draft (html detected) with lowercased recipient key", () => {
        const d = buildInboundMessageDraft({
            channel: "email",
            fromAddress: "Parent@Example.com",
            toAddress: "school@org.com",
            subject: "Re: Tour",
            body: "<p>Thanks!</p>",
        });
        expect(d.direction).toBe("inbound");
        expect(d.status).toBe("received");
        expect(d.body_format).toBe("html");
        expect(d.recipient_key).toBe("parent@example.com");
        expect(d.subject).toBe("Re: Tour");
    });
    it("builds an sms draft (plain) preserving e164 key", () => {
        const d = buildInboundMessageDraft({ channel: "sms", fromAddress: "+15551112222", toAddress: "+15553334444", body: "yo" });
        expect(d.body_format).toBe("plain");
        expect(d.recipient_key).toBe("+15551112222");
    });
    it("normalizes recipient keys by channel", () => {
        expect(normalizeInboundRecipientKey("email", "  A@B.COM ")).toBe("a@b.com");
        expect(normalizeInboundRecipientKey("sms", " +15551112222 ")).toBe("+15551112222");
    });
});

describe("reply matching", () => {
    it("selects the most-recent unreplied outbound", () => {
        expect(
            selectOutboundToMarkReplied([
                { id: "o1", direction: "outbound", created_at: "2026-05-01" },
                { id: "o2", direction: "outbound", created_at: "2026-05-03" },
                { id: "i1", direction: "inbound", created_at: "2026-05-04" },
            ])
        ).toBe("o2");
    });
    it("skips already-replied outbound and returns null when none", () => {
        expect(
            selectOutboundToMarkReplied([{ id: "o1", direction: "outbound", replied_at: "x", created_at: "2026-05-01" }])
        ).toBeNull();
        expect(selectOutboundToMarkReplied([])).toBeNull();
    });
});
