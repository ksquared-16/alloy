/**
 * The provider contract, as documented — not as guessed.
 *
 * `CANONICAL_RECEIVED_EVENT` and `CANONICAL_RETRIEVED_EMAIL` are the payloads
 * from Resend's official documentation (RESEND-INBOUND-CONTRACT.md). Everything
 * else here varies from them deliberately. If Resend changes the contract these
 * fixtures are what must be updated, in one place.
 *
 * The shape that matters most: the webhook carries NO body and NO headers, so
 * threading evidence only exists after the retrieval step.
 */

import { describe, expect, it } from "vitest";

import {
    attachmentNotice,
    combineInboundEmail,
    headerValue,
    htmlToSafeText,
    normalizeResendReceivedEvent,
    normalizeResendRetrievedEmail,
    ownershipCandidateAddresses,
} from "@/lib/communications/email/inboundEmailNormalization";

const AT = "2026-08-11T10:00:00.000Z";
const ALLOY_MID = "<alloy.11111111-2222-4333-8444-555555555555@northwind.example>";

/** Verbatim from https://resend.com/docs/webhooks/emails/received */
const CANONICAL_RECEIVED_EVENT = {
    email_id: "56761188-7520-42d8-8898-ff6fc54ce618",
    created_at: "2026-02-22T23:41:11.894Z",
    from: "onboarding@resend.dev",
    to: ["delivered@resend.dev"],
    bcc: [],
    cc: [],
    received_for: ["forwarded@example.com"],
    message_id: "<111-222-333@email.example.com>",
    subject: "Sending this example",
    attachments: [
        {
            id: "2a0c9ce0-3112-4728-976e-47ddcd16a318",
            filename: "avatar.png",
            content_type: "image/png",
            content_disposition: "inline",
            content_id: "img001",
        },
    ],
};

/** Shaped after https://resend.com/docs/api-reference/emails/retrieve-received-email */
const CANONICAL_RETRIEVED_EMAIL = {
    object: "email",
    id: "56761188-7520-42d8-8898-ff6fc54ce618",
    to: ["delivered@resend.dev"],
    from: "onboarding@resend.dev",
    created_at: "2026-02-22T23:41:11.894Z",
    subject: "Sending this example",
    html: "<p>Yes, Thursday works.</p>",
    html_format: "data_uri",
    text: "Yes, Thursday works.",
    headers: {
        from: "onboarding@resend.dev",
        "return-path": "bounce@resend.dev",
        "mime-version": "1.0",
        "In-Reply-To": ALLOY_MID,
        References: `<older@x.example> ${ALLOY_MID}`,
    },
    bcc: [],
    cc: [],
    reply_to: [],
    received_for: ["forwarded@example.com"],
    message_id: "<111-222-333@email.example.com>",
    raw: { download_url: "https://example.invalid/raw", expires_at: AT },
    attachments: [],
};

describe("the email.received webhook — metadata only, per the contract", () => {
    it("reads the documented payload", () => {
        const got = normalizeResendReceivedEvent(CANONICAL_RECEIVED_EVENT, { receivedAtFallback: AT })!;
        expect(got.emailId).toBe("56761188-7520-42d8-8898-ff6fc54ce618");
        expect(got.fromAddress).toBe("onboarding@resend.dev");
        expect(got.toAddresses).toEqual(["delivered@resend.dev"]);
        expect(got.receivedFor).toEqual(["forwarded@example.com"]);
        // The SENDER's RFC Message-ID, not Resend's id.
        expect(got.messageId).toBe("<111-222-333@email.example.com>");
        expect(got.subject).toBe("Sending this example");
        expect(got.receivedAt).toBe("2026-02-22T23:41:11.894Z");
    });

    it("carries attachment metadata, including the inline disposition", () => {
        const got = normalizeResendReceivedEvent(CANONICAL_RECEIVED_EVENT, { receivedAtFallback: AT })!;
        expect(got.attachments).toHaveLength(1);
        expect(got.attachments[0]).toMatchObject({
            id: "2a0c9ce0-3112-4728-976e-47ddcd16a318",
            filename: "avatar.png",
            contentType: "image/png",
            contentDisposition: "inline",
        });
    });

    it("refuses an event it could not retrieve, attribute or deduplicate", () => {
        const base = CANONICAL_RECEIVED_EVENT;
        expect(normalizeResendReceivedEvent({ ...base, email_id: undefined }, { receivedAtFallback: AT })).toBeNull();
        expect(normalizeResendReceivedEvent({ ...base, from: undefined }, { receivedAtFallback: AT })).toBeNull();
        expect(
            normalizeResendReceivedEvent({ ...base, to: [], received_for: [] }, { receivedAtFallback: AT })
        ).toBeNull();
        expect(normalizeResendReceivedEvent(null, { receivedAtFallback: AT })).toBeNull();
    });

    it("accepts an event with only received_for, which is how forwarded mail arrives", () => {
        const got = normalizeResendReceivedEvent(
            { ...CANONICAL_RECEIVED_EVENT, to: [] },
            { receivedAtFallback: AT }
        );
        expect(got).not.toBeNull();
        expect(got!.receivedFor).toEqual(["forwarded@example.com"]);
    });
});

describe("ownership candidates", () => {
    it("puts received_for first, so forwarded mail is not quarantined as unowned", () => {
        // `to` is whoever the SENDER addressed; `received_for` is the address that
        // actually caused Resend to receive it.
        const event = normalizeResendReceivedEvent(CANONICAL_RECEIVED_EVENT, { receivedAtFallback: AT })!;
        expect(ownershipCandidateAddresses(event)[0]).toBe("forwarded@example.com");
        expect(ownershipCandidateAddresses(event)).toContain("delivered@resend.dev");
    });
});

describe("the retrieval step — where body and threading actually live", () => {
    it("reads body and header map", () => {
        const got = normalizeResendRetrievedEmail(CANONICAL_RETRIEVED_EMAIL)!;
        expect(got.text).toBe("Yes, Thursday works.");
        expect(got.html).toBe("<p>Yes, Thursday works.</p>");
        expect(got.htmlFormat).toBe("data_uri");
    });

    it("exposes In-Reply-To and References, which the webhook never had", () => {
        const event = normalizeResendReceivedEvent(CANONICAL_RECEIVED_EVENT, { receivedAtFallback: AT })!;
        const combined = combineInboundEmail(event, normalizeResendRetrievedEmail(CANONICAL_RETRIEVED_EMAIL));
        expect(combined.inReplyTo).toBe(ALLOY_MID);
        expect(combined.references).toContain(ALLOY_MID);
    });

    it("finds headers regardless of the provider's casing", () => {
        // The documented map is lowercased, but header names are case-insensitive
        // by RFC and Alloy must not depend on one provider's choice.
        expect(headerValue({ "in-reply-to": "<a@b>" }, "In-Reply-To")).toBe("<a@b>");
        expect(headerValue({ "IN-REPLY-TO": "<a@b>" }, "in-reply-to")).toBe("<a@b>");
        expect(headerValue([{ name: "References", value: "<c@d>" }], "references")).toBe("<c@d>");
        expect(headerValue(null, "In-Reply-To")).toBeNull();
    });

    it("yields no threading evidence when retrieval has not happened", () => {
        // The distinction that matters: a webhook alone can never correlate.
        const event = normalizeResendReceivedEvent(CANONICAL_RECEIVED_EVENT, { receivedAtFallback: AT })!;
        const combined = combineInboundEmail(event, null);
        expect(combined.inReplyTo).toBeNull();
        expect(combined.references).toBeNull();
        expect(combined.text).toBe("");
    });

    it("derives a safe text body when the provider sent only HTML", () => {
        const event = normalizeResendReceivedEvent(CANONICAL_RECEIVED_EVENT, { receivedAtFallback: AT })!;
        const combined = combineInboundEmail(
            event,
            normalizeResendRetrievedEmail({ ...CANONICAL_RETRIEVED_EMAIL, text: null })
        );
        expect(combined.text).toBe("Yes, Thursday works.");
        expect(combined.html).toBe("<p>Yes, Thursday works.</p>");
    });
});

describe("html reduced to text", () => {
    it("drops script and style CONTENT rather than flattening it into the message", () => {
        const text = htmlToSafeText('<p>Hi</p><script>alert("x")</script><style>p{color:red}</style>');
        expect(text).toBe("Hi");
        expect(text).not.toContain("alert");
    });

    it("turns block structure into line breaks without leading spaces", () => {
        expect(htmlToSafeText("<div>One</div><div>Two</div>")).toBe("One\nTwo");
        expect(htmlToSafeText("A<br>B")).toBe("A\nB");
    });

    it("decodes the entities an operator would otherwise read raw", () => {
        expect(htmlToSafeText("<p>Tom &amp; Jerry &lt;3 &quot;x&quot;</p>")).toBe('Tom & Jerry <3 "x"');
    });

    it("survives malformed markup without throwing", () => {
        expect(() => htmlToSafeText("<p>unclosed <b>bold")).not.toThrow();
        expect(htmlToSafeText("<<<>>>")).toBeTypeOf("string");
    });
});

describe("attachments are acknowledged, not silently dropped", () => {
    it("tells the operator one arrived and that support is pending", () => {
        const event = normalizeResendReceivedEvent(CANONICAL_RECEIVED_EVENT, { receivedAtFallback: AT })!;
        expect(attachmentNotice(event.attachments)).toBe(
            "1 attachment received: avatar.png — attachment support is not available yet."
        );
    });

    it("says nothing when there were none", () => {
        expect(attachmentNotice([])).toBeNull();
    });

    it("does not pretend an unnamed attachment was absent", () => {
        expect(
            attachmentNotice([{ id: "a", filename: null, contentType: "image/png", contentDisposition: null, size: null }])
        ).toBe("1 attachment received — attachment support is not available yet.");
    });
});
