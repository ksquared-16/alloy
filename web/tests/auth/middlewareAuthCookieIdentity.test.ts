/**
 * Middleware must read the SAME auth cookie the browser wrote.
 *
 * The defect these lock closed: on a loopback runtime the browser reaches
 * Supabase through the app's own origin, so `@supabase/ssr` derives its cookie
 * name from a different URL than the one middleware is configured with.
 * `supabaseClient.ts` and `supabaseServer.ts` pinned the name; middleware did
 * not. Live over the tailnet, sign-in returned 200 and set
 * `sb-alloy-local-auth`, and the very next authenticated `GET /workspace` was
 * answered `307 → /login`, because middleware was looking for
 * `sb-<ref>-auth-token` and no such cookie existed.
 *
 * Hosted runtimes must keep the library's own derivation, so the pin is
 * loopback-only and asserted in both directions.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LOCAL_AUTH_COOKIE_NAME } from "@/lib/supabase/browserTransport";

const LOOPBACK = "http://127.0.0.1:54421";
const HOSTED = "https://abcdefghijklm.supabase.co";

/** What the runtime is configured with, per test. */
let supabaseUrl = LOOPBACK;
/** Whether the mocked Supabase client resolves a signed-in user. */
let authedSub: string | null = null;
/** Options the code under test handed to `createServerClient`. */
let capturedOptions: Record<string, unknown> | null = null;

vi.mock("@supabase/ssr", () => ({
    createServerClient: (_url: string, _key: string, options: Record<string, unknown>) => {
        capturedOptions = options;
        return {
            auth: {
                getClaims: async () =>
                    authedSub
                        ? { data: { claims: { sub: authedSub } }, error: null }
                        : { data: null, error: new Error("no session") },
                getUser: async () => ({ data: { user: authedSub ? { id: authedSub } : null } }),
            },
        };
    },
}));

vi.mock("@/lib/auth/jwksCache", () => ({ getCachedJwks: async () => null }));

vi.mock("@/lib/supabase/auth-env", () => ({
    getSupabaseUrlForAuth: () => supabaseUrl,
    getSupabaseAnonKeyForAuth: () => "anon-key",
    warnIfAuthSupabaseUrlMismatch: () => {},
}));

const { middleware } = await import("@/middleware");
const { NextRequest } = await import("next/server");

/** The header shape `tailscale serve` actually sends, captured from a live request. */
const TAILNET = "vacilandos-mac-mini.tail2aa1af.ts.net:3011";
const tailnetHeaders = {
    host: TAILNET,
    "x-forwarded-host": TAILNET,
    "x-forwarded-proto": "https",
};

function request(path: string, { headers = {}, cookie = "" } = {}) {
    return new NextRequest(`http://localhost:3011${path}`, {
        headers: { ...headers, ...(cookie ? { cookie } : {}) },
    });
}

beforeEach(() => {
    supabaseUrl = LOOPBACK;
    authedSub = null;
    capturedOptions = null;
});

describe("middleware auth cookie identity", () => {
    it("pins the loopback cookie name, the same one the browser and server clients use", async () => {
        authedSub = "user-1";
        await middleware(request("/workspace"));

        expect(capturedOptions?.cookieOptions).toEqual({ name: LOCAL_AUTH_COOKIE_NAME });
    });

    it("leaves a hosted runtime on the library's own derivation", async () => {
        supabaseUrl = HOSTED;
        authedSub = "user-1";
        await middleware(request("/workspace"));

        expect(capturedOptions).not.toBeNull();
        expect("cookieOptions" in (capturedOptions ?? {})).toBe(false);
    });

    it("lets an authenticated request through instead of bouncing it to /login", async () => {
        authedSub = "user-1";
        const res = await middleware(
            request("/workspace", { headers: tailnetHeaders, cookie: `${LOCAL_AUTH_COOKIE_NAME}=token` }),
        );

        expect(res.headers.get("x-alloy-admin-mw")).toBe("next");
        expect(res.status).not.toBe(307);
    });
});

describe("middleware redirect address", () => {
    it("sends an unauthenticated tailnet caller back to the tailnet origin", async () => {
        const res = await middleware(request("/workspace", { headers: tailnetHeaders }));

        expect(res.status).toBe(307);
        expect(res.headers.get("x-alloy-admin-mw")).toBe("redirect:/login");
        expect(res.headers.get("location")).toBe(`https://${TAILNET}/login`);
    });

    it("still sends a direct localhost caller to localhost", async () => {
        const res = await middleware(request("/workspace"));

        expect(res.status).toBe(307);
        expect(res.headers.get("location")).toBe("http://localhost:3011/login");
    });
});
