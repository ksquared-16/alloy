/**
 * The embed page now server-renders the resolve payload so an iframe's first paint already contains
 * the form (it previously rendered an empty shell, hydrated, then fetched — a guaranteed blank
 * iframe). That fast path MUST NOT resolve anything the API would refuse.
 *
 * Both callers derive the origin with the same header rule and enforce it with the same allowlist
 * check, so this pins the two properties that keep them equivalent.
 */

import { describe, expect, it } from "vitest";

import {
    embedOriginFromHeaders,
    isEmbedOriginAllowed,
    normalizeEmbedAllowlistEntry,
} from "@/lib/public/forms/embedOrigin";

function headerGetter(headers: Record<string, string>) {
    return (name: string) => headers[name.toLowerCase()] ?? null;
}

describe("embed origin derivation is header-based and identical for both callers", () => {
    it("prefers the Origin header", () => {
        expect(embedOriginFromHeaders(headerGetter({ origin: "https://a.example" }))).toBe("https://a.example");
    });

    it("falls back to Referer — an iframe document navigation sends no Origin", () => {
        expect(
            embedOriginFromHeaders(headerGetter({ referer: "https://firefly.example/contact/north-campus" }))
        ).toBe("https://firefly.example");
    });

    it("Origin wins when both are present", () => {
        expect(
            embedOriginFromHeaders(
                headerGetter({ origin: "https://a.example", referer: "https://b.example/x" })
            )
        ).toBe("https://a.example");
    });

    it("returns null when neither is present or parseable", () => {
        expect(embedOriginFromHeaders(headerGetter({}))).toBeNull();
        expect(embedOriginFromHeaders(headerGetter({ referer: "not-a-url" }))).toBeNull();
        expect(embedOriginFromHeaders(headerGetter({ origin: "null" }))).toBeNull();
    });

    it("drops path and query, keeping protocol + host", () => {
        expect(
            embedOriginFromHeaders(headerGetter({ referer: "https://site.example:8443/a/b?c=d#e" }))
        ).toBe("https://site.example:8443");
    });
});

describe("the server fast path can never widen access", () => {
    it("an unknown origin is refused whenever the link has an allowlist", () => {
        const allowed = ["https://firefly.example"];
        expect(isEmbedOriginAllowed("https://evil.example", allowed)).toBe(false);
        // No derivable origin + an allowlist → refused. This is why a missing Referer falls back to
        // the client fetch rather than silently rendering the form.
        expect(isEmbedOriginAllowed(null, allowed)).toBe(false);
    });

    it("an empty allowlist still permits any origin, exactly as before", () => {
        expect(isEmbedOriginAllowed(null, [])).toBe(true);
        expect(isEmbedOriginAllowed(null, null)).toBe(true);
        expect(isEmbedOriginAllowed("https://anything.example", undefined)).toBe(true);
    });

    it("allowlist entries normalize to protocol + host before comparison", () => {
        expect(normalizeEmbedAllowlistEntry("https://firefly.example/contact")).toBe("https://firefly.example");
        expect(isEmbedOriginAllowed("https://firefly.example", ["https://firefly.example/contact"])).toBe(true);
        // Protocol and port are part of identity — a downgrade must not pass.
        expect(isEmbedOriginAllowed("http://firefly.example", ["https://firefly.example"])).toBe(false);
        expect(isEmbedOriginAllowed("https://firefly.example:8443", ["https://firefly.example"])).toBe(false);
    });

    it("the derived origin is what gets checked, end to end", () => {
        const allowed = ["https://firefly.example"];
        const fromIframe = embedOriginFromHeaders(
            headerGetter({ referer: "https://firefly.example/contact/north-campus" })
        );
        expect(isEmbedOriginAllowed(fromIframe, allowed)).toBe(true);

        const fromOtherSite = embedOriginFromHeaders(headerGetter({ referer: "https://scraper.example/x" }));
        expect(isEmbedOriginAllowed(fromOtherSite, allowed)).toBe(false);
    });
});
