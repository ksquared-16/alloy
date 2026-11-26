/**
 * A redirect must point back at the origin the caller actually used.
 *
 * The defect these lock closed: middleware built `Location` from `request.url`,
 * which behind a reverse proxy is the origin the server is BOUND to. A Director
 * on `https://vacilandos-mac-mini.tail2aa1af.ts.net:3011/workspace` was sent to
 * `https://localhost:3011/login` — their own machine, where nothing is
 * listening. Rewriting `Host` alone does not fix it, because Next normalises
 * `request.url` to the bound origin regardless.
 *
 * The two properties that matter: a proxied request keeps its externally visible
 * origin, and a direct localhost request still resolves to localhost.
 */
import { describe, expect, it } from "vitest";

import { externalRedirectUrl, externalRequestOrigin } from "@/lib/http/requestOrigin";

const BOUND = "http://localhost:3011/workspace";

/** The header shape `tailscale serve` actually sends, captured from a live request. */
const TAILNET_HEADERS = {
    host: "vacilandos-mac-mini.tail2aa1af.ts.net:3011",
    "x-forwarded-host": "vacilandos-mac-mini.tail2aa1af.ts.net:3011",
    "x-forwarded-proto": "https",
};

function headers(map: Record<string, string>) {
    return { get: (name: string) => map[name.toLowerCase()] ?? null };
}

describe("externalRequestOrigin", () => {
    it("uses the forwarded origin rather than the bound one", () => {
        expect(externalRequestOrigin(headers(TAILNET_HEADERS), BOUND)).toBe(
            "https://vacilandos-mac-mini.tail2aa1af.ts.net:3011",
        );
    });

    it("keeps localhost for a direct request that carries no forwarding headers", () => {
        expect(externalRequestOrigin(headers({}), BOUND)).toBe("http://localhost:3011");
    });

    it("falls back to the Host header when only that is present", () => {
        expect(externalRequestOrigin(headers({ host: "alloy.example:8443" }), BOUND)).toBe(
            "http://alloy.example:8443",
        );
    });

    it("takes the client-facing entry from a forwarded chain", () => {
        const h = headers({
            "x-forwarded-host": "edge.example, inner.example",
            "x-forwarded-proto": "https, http",
        });
        expect(externalRequestOrigin(h, BOUND)).toBe("https://edge.example");
    });

    it("preserves a hosted https origin unchanged", () => {
        const h = headers({ host: "app.workwithalloy.com", "x-forwarded-proto": "https" });
        expect(externalRequestOrigin(h, "https://app.workwithalloy.com/workspace")).toBe(
            "https://app.workwithalloy.com",
        );
    });

    it("ignores a host that could smuggle anything into a response header", () => {
        for (const bad of [
            "evil.example/path",
            "evil.example\r\nX-Injected: 1",
            "user@evil.example",
            "evil example",
            "http://evil.example",
            "evil.example?x=1",
            "evil.example#frag",
        ]) {
            expect(externalRequestOrigin(headers({ "x-forwarded-host": bad }), BOUND)).toBe(
                "http://localhost:3011",
            );
        }
    });

    it("ignores a protocol that is not http(s)", () => {
        const h = headers({ ...TAILNET_HEADERS, "x-forwarded-proto": "javascript" });
        expect(externalRequestOrigin(h, BOUND)).toBe(
            "http://vacilandos-mac-mini.tail2aa1af.ts.net:3011",
        );
    });

    it("accepts a bracketed IPv6 authority", () => {
        expect(externalRequestOrigin(headers({ "x-forwarded-host": "[::1]:3011" }), BOUND)).toBe(
            "http://[::1]:3011",
        );
    });
});

describe("externalRedirectUrl", () => {
    it("builds the login redirect on the Director-visible origin", () => {
        const url = externalRedirectUrl({ headers: headers(TAILNET_HEADERS), url: BOUND }, "/login");
        expect(url.toString()).toBe(
            "https://vacilandos-mac-mini.tail2aa1af.ts.net:3011/login",
        );
    });

    it("still redirects localhost callers to localhost", () => {
        const url = externalRedirectUrl({ headers: headers({}), url: BOUND }, "/login");
        expect(url.toString()).toBe("http://localhost:3011/login");
    });

    it("carries a query string through", () => {
        const url = externalRedirectUrl(
            { headers: headers(TAILNET_HEADERS), url: BOUND },
            "/login?error=config",
        );
        expect(url.toString()).toBe(
            "https://vacilandos-mac-mini.tail2aa1af.ts.net:3011/login?error=config",
        );
    });
});
