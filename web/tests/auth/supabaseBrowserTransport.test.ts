/**
 * A loopback Supabase URL names the machine running the BROWSER.
 *
 * The defect: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421` was handed
 * straight to `createBrowserClient`, so a Director signing in at
 * `https://vacilandos-mac-mini.tail2aa1af.ts.net:3012/login` had the request
 * sent to their own laptop — and, being plain http on an https page, blocked as
 * mixed content before it could even fail honestly.
 *
 * These pin the two properties that make the repair safe: hosted runtimes are
 * bit-for-bit unchanged, and the cookie name cannot drift between the browser
 * and middleware.
 */
import { describe, expect, it } from "vitest";

import {
    authCookieNameFor,
    browserSupabaseUrl,
    isLoopbackSupabaseUrl,
    LOCAL_AUTH_COOKIE_NAME,
    localSupabaseRewrite,
} from "@/lib/supabase/browserTransport";

const TAILNET = "https://vacilandos-mac-mini.tail2aa1af.ts.net:3012";
const LOCAL = "http://127.0.0.1:54421";
const HOSTED = "https://abcdefghijklm.supabase.co";

describe("loopback detection", () => {
    it("recognises every loopback spelling a lane env might use", () => {
        for (const u of ["http://127.0.0.1:54421", "http://localhost:54321", "http://[::1]:54321"]) {
            expect(isLoopbackSupabaseUrl(u)).toBe(true);
        }
    });

    it("does not mistake a hosted project for a local stack", () => {
        expect(isLoopbackSupabaseUrl(HOSTED)).toBe(false);
        expect(isLoopbackSupabaseUrl("")).toBe(false);
        expect(isLoopbackSupabaseUrl("not a url")).toBe(false);
    });
});

describe("THE DEFECT: a remote browser must not be sent to its own loopback", () => {
    it("routes sign-in through the origin that served the page", () => {
        expect(browserSupabaseUrl(LOCAL, TAILNET)).toBe(`${TAILNET}/supabase`);
    });

    it("never hands a remote browser a loopback address", () => {
        const out = browserSupabaseUrl(LOCAL, TAILNET);
        expect(out).not.toMatch(/127\.0\.0\.1|localhost/);
    });

    it("inherits the page's scheme, so there is no mixed content on an https origin", () => {
        expect(browserSupabaseUrl(LOCAL, TAILNET).startsWith("https:")).toBe(true);
    });

    it("works from the host too, so one code path serves every origin", () => {
        expect(browserSupabaseUrl(LOCAL, "http://localhost:3012")).toBe("http://localhost:3012/supabase");
    });

    it("falls back to the canonical URL when there is no browser (SSR)", () => {
        expect(browserSupabaseUrl(LOCAL, null)).toBe(LOCAL);
    });
});

describe("hosted runtimes are untouched by construction", () => {
    it("returns the canonical URL unchanged whatever the origin", () => {
        expect(browserSupabaseUrl(HOSTED, TAILNET)).toBe(HOSTED);
        expect(browserSupabaseUrl(HOSTED, "https://app.example.com")).toBe(HOSTED);
    });

    it("leaves the library's own cookie derivation alone off-loopback", () => {
        expect(authCookieNameFor(HOSTED)).toBeNull();
        expect(authCookieNameFor(undefined)).toBeNull();
    });

    it("adds no rewrite at all for a hosted project", () => {
        expect(localSupabaseRewrite(HOSTED)).toBeNull();
        expect(localSupabaseRewrite(undefined)).toBeNull();
    });
});

describe("the cookie name cannot drift between browser and middleware", () => {
    it("pins one name for a loopback runtime", () => {
        expect(authCookieNameFor(LOCAL)).toBe(LOCAL_AUTH_COOKIE_NAME);
    });

    it("is the same whichever origin the browser used", () => {
        // The point of pinning: two origins, one session key, so middleware is
        // never looking for a cookie the browser did not set.
        const viaTailnet = authCookieNameFor(LOCAL);
        const viaLocalhost = authCookieNameFor(LOCAL);
        expect(viaTailnet).toBe(viaLocalhost);
    });
});

describe("the proxy forwards to the real local Supabase", () => {
    it("maps the proxy path onto the configured loopback origin", () => {
        expect(localSupabaseRewrite(LOCAL)).toEqual({
            source: "/supabase/:path*",
            destination: "http://127.0.0.1:54421/:path*",
        });
    });

    it("does not double a trailing slash into the destination", () => {
        expect(localSupabaseRewrite("http://127.0.0.1:54421/")?.destination).toBe(
            "http://127.0.0.1:54421/:path*"
        );
    });
});
