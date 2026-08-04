/**
 * The browser's Supabase origin survives intact — scheme, host and explicit port.
 *
 * The certification stack serves Supabase at an explicit non-default port
 * (`http://127.0.0.1:54421`). A diagnostic that rebuilds the endpoint from
 * `scheme` + `hostname` silently produces `https://127.0.0.1/auth/v1/token`:
 * scheme upgraded, port gone. That string is indistinguishable from a real
 * auth-client defect and cost a certification run.
 *
 * These tests pin the property that prevents it: every reported endpoint comes
 * from one parsed URL, and nothing is ever assembled from parts.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import { getPublicSupabaseAuthDebug } from "@/lib/supabase/publicAuthEnv";
import { assertValidSupabaseHttpUrl } from "@/lib/supabase/supabaseUrlPolicy";

const REAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const REAL_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ANON = `eyJ${"a".repeat(120)}`;

function withEnv(url: string | undefined, key: string | undefined = ANON) {
    if (url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    if (key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = key;
    return getPublicSupabaseAuthDebug();
}

afterEach(() => {
    if (REAL_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = REAL_URL;
    if (REAL_KEY === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = REAL_KEY;
});

// --- 1-4. origins survive verbatim ------------------------------------------

describe("the configured Supabase origin is preserved", () => {
    it("keeps scheme and explicit port for the certification stack", () => {
        const d = withEnv("http://127.0.0.1:54421");

        expect(d.origin).toBe("http://127.0.0.1:54421");
        expect(d.scheme).toBe("http");
        expect(d.port).toBe("54421");
        expect(d.authTokenUrl).toBe("http://127.0.0.1:54421/auth/v1/token?grant_type=password");
        // The exact string the old diagnostic invented.
        expect(d.authTokenUrl).not.toContain("https://127.0.0.1/");
    });

    it("keeps scheme and explicit port for a default local stack", () => {
        const d = withEnv("http://localhost:54321");

        expect(d.origin).toBe("http://localhost:54321");
        expect(d.authTokenUrl).toBe("http://localhost:54321/auth/v1/token?grant_type=password");
    });

    it("keeps an explicit non-default port on https", () => {
        const d = withEnv("https://supabase.internal.example.com:8443");

        expect(d.origin).toBe("https://supabase.internal.example.com:8443");
        expect(d.port).toBe("8443");
        expect(d.authTokenUrl).toBe(
            "https://supabase.internal.example.com:8443/auth/v1/token?grant_type=password"
        );
    });

    it("leaves a production hosted URL unchanged", () => {
        const d = withEnv("https://abcdefghijklmno.supabase.co");

        expect(d.origin).toBe("https://abcdefghijklmno.supabase.co");
        expect(d.scheme).toBe("https");
        // No port was configured, so none is invented.
        expect(d.port).toBeNull();
        expect(d.authTokenUrl).toBe(
            "https://abcdefghijklmno.supabase.co/auth/v1/token?grant_type=password"
        );
    });

    it("does not downgrade or upgrade the scheme in either direction", () => {
        expect(withEnv("http://127.0.0.1:54421").scheme).toBe("http");
        expect(withEnv("https://abcdefghijklmno.supabase.co").scheme).toBe("https");
    });
});

// --- 5. app origin and Supabase origin are separate --------------------------

describe("app origin and Supabase origin are not interchangeable", () => {
    it("reports the Supabase origin, not the app origin", () => {
        process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3014";
        const d = withEnv("http://127.0.0.1:54421");

        expect(d.origin).toBe("http://127.0.0.1:54421");
        expect(d.origin).not.toBe(process.env.NEXT_PUBLIC_APP_URL);
        expect(d.authTokenUrl?.startsWith("http://localhost:3014")).toBe(false);
        delete process.env.NEXT_PUBLIC_APP_URL;
    });

    it("reads only NEXT_PUBLIC_SUPABASE_URL — an app URL cannot stand in for it", () => {
        process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3014";
        const d = withEnv(undefined);

        expect(d.urlDefined).toBe(false);
        expect(d.origin).toBeNull();
        expect(d.authTokenUrl).toBeNull();
        delete process.env.NEXT_PUBLIC_APP_URL;
    });
});

// --- 6-7. the browser client uses that origin --------------------------------

describe("the browser client is built from the public Supabase origin", () => {
    beforeEach(() => vi.resetModules());

    it("hands the configured URL to createBrowserClient untouched", async () => {
        const seen: Array<[string, string]> = [];
        vi.doMock("@supabase/ssr", () => ({
            createBrowserClient: (url: string, key: string) => {
                seen.push([url, key]);
                return { auth: {} };
            },
        }));
        process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54421";
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON;

        const { createClient } = await import("@/lib/supabaseClient");
        createClient();

        expect(seen[0][0]).toBe("http://127.0.0.1:54421");
        vi.doUnmock("@supabase/ssr");
    });

    it("the auth token URL resolves under /auth/v1/token on that same origin", () => {
        const d = withEnv("http://127.0.0.1:54421");
        const u = new URL(d.authTokenUrl!);

        expect(u.origin).toBe(d.origin);
        expect(u.pathname).toBe("/auth/v1/token");
        expect(u.searchParams.get("grant_type")).toBe("password");
    });
});

// --- 8. other client derivations keep the same authority ---------------------

describe("REST, storage and realtime keep the same host and port", () => {
    it.each([
        ["/rest/v1/", "http://127.0.0.1:54421"],
        ["/storage/v1/", "http://127.0.0.1:54421"],
        ["/realtime/v1/", "http://127.0.0.1:54421"],
        ["/rest/v1/", "https://abcdefghijklmno.supabase.co"],
    ])("%s on %s", (path, base) => {
        // supabase-js derives every sub-client from the one URL it was given,
        // so the property to hold is that the origin itself is intact.
        const derived = new URL(path, base);
        expect(derived.origin).toBe(new URL(base).origin);
        expect(derived.port).toBe(new URL(base).port);
        expect(derived.protocol).toBe(new URL(base).protocol);
    });

    it("loopback http stays valid under the shared URL policy", () => {
        expect(() => assertValidSupabaseHttpUrl("http://127.0.0.1:54421")).not.toThrow();
        expect(() => assertValidSupabaseHttpUrl("http://localhost:54321")).not.toThrow();
    });

    it("the policy still rejects http on a non-loopback host", () => {
        expect(() => assertValidSupabaseHttpUrl("http://db.example.com")).toThrow(/https/i);
    });
});

// --- 9-10. the generated certification env, and secret hygiene ---------------

describe("the certification environment generator", () => {
    const certify = readFileSync(join(process.cwd(), "..", "certification", "alloy-certify"), "utf8");

    it("writes the stack's API_URL verbatim, with no reconstruction", () => {
        expect(certify).toContain("NEXT_PUBLIC_SUPABASE_URL=${api}");
        expect(certify).toContain("SUPABASE_URL=${api}");
        // A hardcoded port or scheme here would survive a stack that moved.
        expect(certify).not.toMatch(/NEXT_PUBLIC_SUPABASE_URL=https?:\/\//);
    });

    it("does not put the service-role key in a browser-public variable", () => {
        expect(certify).toContain("SUPABASE_SERVICE_ROLE_KEY=${service}");
        expect(certify).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
        expect(certify).not.toMatch(/NEXT_PUBLIC_[A-Z_]*SERVICE_ROLE/);
    });
});

describe("no secret reaches the browser diagnostic", () => {
    it("reports only booleans and the origin — never key material", () => {
        const d = withEnv("http://127.0.0.1:54421", ANON);
        const serialized = JSON.stringify(d);

        expect(serialized).not.toContain(ANON);
        expect(d.anonKeyDefined).toBe(true);
        expect(Object.keys(d)).not.toContain("anonKey");
    });

    it("the login page renders no service-role reference", () => {
        const page = readFileSync(join(process.cwd(), "app", "login", "page.tsx"), "utf8");
        expect(page).not.toContain("SERVICE_ROLE");
        // The regression itself: no URL may be assembled from a literal scheme.
        expect(page).not.toMatch(/https:\/\/\$\{[^}]*hostname/);
    });
});
