import { describe, expect, it } from "vitest";

import {
    attachmentNotice,
    headerValue,
    htmlToSafeText,
    normalizeResendInboundEmail,
} from "@/lib/communications/email/inboundEmailNormalization";

const AT = "2026-08-11T10:00:00.000Z";

function event(extra: Record<string, unknown> = {}) {
    return {
        email_id: "resend-inbound-1",
        from: "parent@example.invalid",
        to: ["hello@northwind.example"],
        subject: "Re: Enrollment paperwork",
        text: "Yes, Thursday works.",
        created_at: AT,
        headers: {
            "Message-ID": "<parent-1@mail.example>",
            "In-Reply-To": "<alloy.11111111-2222-4333-8444-555555555555@northwind.example>",
        },
        ...extra,
    };
}

describe("normalizing a received email", () => {
    it("keeps the truth the product needs", () => {
        const got = normalizeResendInboundEmail(event(), { receivedAtFallback: AT })!;
        expect(got.providerMessageId).toBe("resend-inbound-1");
        expect(got.fromAddress).toBe("parent@example.invalid");
        expect(got.toAddresses).toEqual(["hello@northwind.example"]);
        expect(got.subject).toBe("Re: Enrollment paperwork");
        expect(got.text).toBe("Yes, Thursday works.");
        expect(got.messageId).toBe("<parent-1@mail.example>");
        expect(got.inReplyTo).toContain("alloy.");
    });

    it("refuses a payload it cannot attribute, deduplicate or answer", () => {
        // A partial row would be one nothing can act on.
        expect(normalizeResendInboundEmail({ ...event(), from: undefined }, { receivedAtFallback: AT })).toBeNull();
        expect(normalizeResendInboundEmail({ ...event(), to: [] }, { receivedAtFallback: AT })).toBeNull();
        expect(
            normalizeResendInboundEmail({ ...event(), email_id: undefined, id: undefined }, { receivedAtFallback: AT })
        ).toBeNull();
        expect(normalizeResendInboundEmail(null, { receivedAtFallback: AT })).toBeNull();
        expect(normalizeResendInboundEmail("nope", { receivedAtFallback: AT })).toBeNull();
    });

    it("reads headers case-insensitively, and from either provider shape", () => {
        expect(headerValue({ "message-id": "<a@b>" }, "Message-ID")).toBe("<a@b>");
        expect(headerValue([{ name: "In-Reply-To", value: "<c@d>" }], "in-reply-to")).toBe("<c@d>");
        expect(headerValue({}, "Message-ID")).toBeNull();
        expect(headerValue(null, "Message-ID")).toBeNull();
    });

    it("always produces a safe text body, deriving it from HTML when needed", () => {
        const got = normalizeResendInboundEmail(
            { ...event(), text: undefined, html: "<p>Hello</p><p>Thanks</p>" },
            { receivedAtFallback: AT }
        )!;
        expect(got.text).toBe("Hello\nThanks");
        expect(got.html).toBe("<p>Hello</p><p>Thanks</p>");
    });
});

describe("html reduced to text", () => {
    it("drops script and style CONTENT rather than flattening it into the message", () => {
        // Their text is not something the parent wrote, and rendering it as body
        // would read as if they had.
        const text = htmlToSafeText('<p>Hi</p><script>alert("x")</script><style>p{color:red}</style>');
        expect(text).toBe("Hi");
        expect(text).not.toContain("alert");
        expect(text).not.toContain("color");
    });

    it("turns block structure into line breaks", () => {
        expect(htmlToSafeText("<div>One</div><div>Two</div>")).toBe("One\nTwo");
        expect(htmlToSafeText("A<br>B")).toBe("A\nB");
    });

    it("decodes the entities an operator would otherwise read raw", () => {
        expect(htmlToSafeText("<p>Tom &amp; Jerry &lt;3 &quot;x&quot;</p>")).toBe('Tom & Jerry <3 "x"');
    });

    it("survives malformed html without throwing", () => {
        expect(() => htmlToSafeText("<p>unclosed <b>bold")).not.toThrow();
        expect(htmlToSafeText("<<<>>>")).toBeTypeOf("string");
    });
});

describe("attachments are acknowledged, not silently dropped", () => {
    it("retains safe metadata and says support is pending", () => {
        const got = normalizeResendInboundEmail(
            { ...event(), attachments: [{ filename: "immunisation.pdf", content_type: "application/pdf", size: 1024 }] },
            { receivedAtFallback: AT }
        )!;
        expect(got.attachments).toHaveLength(1);
        expect(got.attachments[0]!.filename).toBe("immunisation.pdf");
        expect(attachmentNotice(got.attachments)).toBe(
            "1 attachment received: immunisation.pdf — attachment support is not available yet."
        );
    });

    it("says nothing when there were none", () => {
        const got = normalizeResendInboundEmail(event(), { receivedAtFallback: AT })!;
        expect(got.attachments).toEqual([]);
        expect(attachmentNotice(got.attachments)).toBeNull();
    });

    it("handles unnamed attachments without pretending they were absent", () => {
        expect(attachmentNotice([{ filename: null, contentType: "image/png", size: null }])).toBe(
            "1 attachment received — attachment support is not available yet."
        );
    });
});
