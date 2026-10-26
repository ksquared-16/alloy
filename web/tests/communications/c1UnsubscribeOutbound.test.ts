/**
 * C1-A — unsubscribe tokens mint into eligible outbound email classification.
 */
import { describe, expect, it } from "vitest";

import {
    appendUnsubscribeFooterHtml,
    appendUnsubscribeFooterPlain,
    resolveOutboundUnsubscribeUrl,
    unsubscribableCategoryForOutboundEmail,
} from "@/lib/communications/preferences/unsubscribeForOutbound";
import { verifyUnsubscribeToken } from "@/lib/communications/preferences/unsubscribeToken";

const ENV: NodeJS.ProcessEnv = {
    ...process.env,
    COMMUNICATION_UNSUBSCRIBE_SECRET: "c1-test-secret",
    NODE_ENV: "test",
};

describe("unsubscribableCategoryForOutboundEmail", () => {
    it("maps marketing and operational only", () => {
        expect(unsubscribableCategoryForOutboundEmail("marketing")).toBe("email_marketing");
        expect(unsubscribableCategoryForOutboundEmail("operational")).toBe("email_operational");
        expect(unsubscribableCategoryForOutboundEmail("transactional")).toBeNull();
        expect(unsubscribableCategoryForOutboundEmail("emergency")).toBeNull();
    });
});

describe("resolveOutboundUnsubscribeUrl", () => {
    it("mints a verifiable token scoped to person/org/category", () => {
        const resolved = resolveOutboundUnsubscribeUrl({
            messageCategory: "marketing",
            personId: "11111111-1111-4111-8111-111111111111",
            orgId: "22222222-2222-4222-8222-222222222222",
            origin: "https://app.example.test",
            env: ENV,
        });
        expect(resolved).not.toBeNull();
        expect(resolved!.url).toMatch(/^https:\/\/app\.example\.test\/api\/communications\/unsubscribe\?t=/);
        const token = new URL(resolved!.url).searchParams.get("t");
        const verified = verifyUnsubscribeToken(token, { env: ENV });
        expect(verified).toEqual({
            ok: true,
            claims: expect.objectContaining({
                p: "11111111-1111-4111-8111-111111111111",
                o: "22222222-2222-4222-8222-222222222222",
                c: "email_marketing",
            }),
        });
    });

    it("refuses transactional and missing person", () => {
        expect(
            resolveOutboundUnsubscribeUrl({
                messageCategory: "transactional",
                personId: "11111111-1111-4111-8111-111111111111",
                orgId: "22222222-2222-4222-8222-222222222222",
                origin: "https://app.example.test",
                env: ENV,
            })
        ).toBeNull();
        expect(
            resolveOutboundUnsubscribeUrl({
                messageCategory: "marketing",
                personId: null,
                orgId: "22222222-2222-4222-8222-222222222222",
                origin: "https://app.example.test",
                env: ENV,
            })
        ).toBeNull();
    });
});

describe("unsubscribe footers", () => {
    it("appends once", () => {
        const url = "https://app.example.test/api/communications/unsubscribe?t=abc";
        const once = appendUnsubscribeFooterPlain("Hello", url);
        expect(once).toContain(url);
        expect(appendUnsubscribeFooterPlain(once, url)).toBe(once);
        const html = appendUnsubscribeFooterHtml("<p>Hi</p>", url);
        expect(html).toContain(`href="${url}"`);
        expect(appendUnsubscribeFooterHtml(html, url)).toBe(html);
    });
});
