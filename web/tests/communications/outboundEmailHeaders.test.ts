/**
 * RFC threading headers on the TypeScript delivery path.
 *
 * The defect this covers: the headers existed only in the Python dispatcher,
 * while `deliverQueuedEmailHtml` — the path the family-send route PREFERS when
 * Resend credentials are present in the Next process — sent none of them and
 * persisted no `email_message_id`. Outbound mail carried no `Message-ID`, so an
 * inbound `In-Reply-To` had nothing of ours to name and correlation always fell
 * through to the weakest rule.
 *
 * Parity with `email_thread_headers.py` is asserted on the behaviours that
 * module documents, so the two runtimes cannot drift into producing different
 * headers for the same conversation.
 */

import { describe, expect, it } from "vitest";

import {
    MAX_REFERENCES,
    buildReferencesChain,
    deriveOutboundThreadHeaders,
    outboundEmailHeaders,
    type ThreadHeaderHistoryRow,
} from "@/lib/communications/email/outboundEmailHeaders";

const OUT_1 = "<alloy.11111111-1111-4111-8111-111111111111@workwithalloy.com>";
const IN_1 = "<CAF=parent-one@mail.gmail.com>";
const OUT_2 = "<alloy.22222222-2222-4222-8222-222222222222@workwithalloy.com>";
const IN_2 = "<CAF=parent-two@mail.gmail.com>";

function row(email_message_id: string, direction: "inbound" | "outbound"): ThreadHeaderHistoryRow {
    return { email_message_id, direction };
}

describe("buildReferencesChain", () => {
    it("is null with nothing to reference", () => {
        expect(buildReferencesChain([], null)).toBeNull();
    });

    it("puts the message being answered last — clients read it as the parent", () => {
        expect(buildReferencesChain([OUT_1, IN_1], IN_1)).toBe(`${OUT_1} ${IN_1}`);
    });

    it("deduplicates while preserving order", () => {
        expect(buildReferencesChain([OUT_1, OUT_1, IN_1], IN_1)).toBe(`${OUT_1} ${IN_1}`);
    });

    it("appends an in-reply-to that is not already in the chain", () => {
        expect(buildReferencesChain([OUT_1], IN_1)).toBe(`${OUT_1} ${IN_1}`);
    });

    it("keeps BOTH ends when capping — the root and the immediate ancestor", () => {
        const many = Array.from({ length: 40 }, (_, i) => `<alloy.m${i}@workwithalloy.com>`);
        const chain = buildReferencesChain(many, null)!.split(" ");
        expect(chain).toHaveLength(MAX_REFERENCES);
        expect(chain[0]).toBe(many[0]);
        expect(chain[chain.length - 1]).toBe(many[many.length - 1]);
    });
});

describe("deriveOutboundThreadHeaders", () => {
    it("has no headers for a first outbound — nothing is fabricated", () => {
        expect(deriveOutboundThreadHeaders([])).toEqual({ inReplyTo: null, references: null });
    });

    it("answers the most recent INBOUND, never our own last outbound", () => {
        const headers = deriveOutboundThreadHeaders([
            row(OUT_1, "outbound"),
            row(IN_1, "inbound"),
            row(OUT_2, "outbound"),
        ]);
        expect(headers.inReplyTo).toBe(IN_1);
    });

    it("takes the LATEST inbound when the parent has written twice", () => {
        const headers = deriveOutboundThreadHeaders([
            row(OUT_1, "outbound"),
            row(IN_1, "inbound"),
            row(OUT_2, "outbound"),
            row(IN_2, "inbound"),
        ]);
        expect(headers.inReplyTo).toBe(IN_2);
    });

    it("has a null In-Reply-To but a real chain when only we have written", () => {
        const headers = deriveOutboundThreadHeaders([row(OUT_1, "outbound"), row(OUT_2, "outbound")]);
        expect(headers.inReplyTo).toBeNull();
        expect(headers.references).toBe(`${OUT_1} ${OUT_2}`);
    });

    it("grows the chain rather than replacing it — a long thread must not split", () => {
        const headers = deriveOutboundThreadHeaders([
            row(OUT_1, "outbound"),
            row(IN_1, "inbound"),
            row(OUT_2, "outbound"),
            row(IN_2, "inbound"),
        ]);
        expect(headers.references).toBe(`${OUT_1} ${IN_1} ${OUT_2} ${IN_2}`);
    });

    it("ignores rows with no Message-ID — they are not evidence", () => {
        const headers = deriveOutboundThreadHeaders([
            { email_message_id: null, direction: "inbound" },
            { email_message_id: "   ", direction: "inbound" },
            row(OUT_1, "outbound"),
        ]);
        expect(headers.inReplyTo).toBeNull();
        expect(headers.references).toBe(OUT_1);
    });

    it("matches direction case-insensitively", () => {
        const headers = deriveOutboundThreadHeaders([{ email_message_id: IN_1, direction: "INBOUND" }]);
        expect(headers.inReplyTo).toBe(IN_1);
    });
});

describe("outboundEmailHeaders", () => {
    it("omits every header it has no value for", () => {
        expect(outboundEmailHeaders({ messageId: null, inReplyTo: null, references: null })).toEqual({});
    });

    it("emits only Message-ID on a first outbound", () => {
        expect(outboundEmailHeaders({ messageId: OUT_1, inReplyTo: null, references: null })).toEqual({
            "Message-ID": OUT_1,
        });
    });

    it("emits all three on a reply", () => {
        expect(
            outboundEmailHeaders({ messageId: OUT_2, inReplyTo: IN_1, references: `${OUT_1} ${IN_1}` })
        ).toEqual({
            "Message-ID": OUT_2,
            "In-Reply-To": IN_1,
            References: `${OUT_1} ${IN_1}`,
        });
    });
});
