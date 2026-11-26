/**
 * ALY-14 — Supabase Auth mail that Alloy code triggers obeys the staging recipient rule.
 *
 * Invitations (`auth.admin.inviteUserByEmail`) and admin-started password resets
 * (`auth.resetPasswordForEmail`) are delivered by Supabase Auth's own mailer, so the
 * Resend guard never sees them. The two server routes that ask for them apply the same
 * guard first: outside an explicit ALLOY_ENVIRONMENT=production a real inbox is refused
 * before the provider is asked, and a test or owner-allowlisted inbox still goes through.
 *
 * The public /forgot-password page calls Supabase Auth from the browser with the anon
 * key; no Alloy server code is on that path, so it is pinned here as provider-only and
 * documented in deployment-and-environments.md (staging mailer setting).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STAGING_EMAIL_ALLOWLIST_ENV, STAGING_RECIPIENT_REFUSED } from "@/lib/communications/stagingOutboundRecipientGuard";

const WEB = join(__dirname, "../..");
const MEMBER = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
    invite: vi.fn(),
    reset: vi.fn(),
    getUserById: vi.fn(),
    rpc: vi.fn(),
}));

vi.mock("@/lib/admin/canManageUsersAndRoles", async (orig) => {
    const actual = await orig<typeof import("@/lib/admin/canManageUsersAndRoles")>();
    return {
        ...actual,
        requireAccessAdministration: vi.fn(async () => ({
            ok: true,
            access: { orgId: "org-1", userId: "actor-1", permissionKeys: ["admin.users.write"], roleKeys: [] },
        })),
    };
});

vi.mock("@/lib/supabaseAdmin", () => ({
    createAdminClient: () => {
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq", "in", "limit"]) chain[m] = () => chain;
        chain.maybeSingle = async () => ({ data: { role_key: "teacher", user_id: MEMBER }, error: null });
        return {
            from: () => chain,
            rpc: mocks.rpc,
            auth: {
                admin: { inviteUserByEmail: mocks.invite, getUserById: mocks.getUserById },
                resetPasswordForEmail: mocks.reset,
            },
        };
    },
}));

import { POST as INVITE } from "@/app/api/admin/users/route";
import { POST as SEND_RESET } from "@/app/api/admin/send-password-reset/route";

const ENV_KEYS = [
    "ALLOY_ENVIRONMENT",
    "APP_ENV",
    "NEXT_PUBLIC_APP_ENV",
    "VERCEL_ENV",
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    STAGING_EMAIL_ALLOWLIST_ENV,
];

function useEnv(env: Record<string, string>) {
    for (const k of ENV_KEYS) vi.stubEnv(k, env[k] ?? "");
}
const STAGING = { ALLOY_ENVIRONMENT: "staging" };
const UNIDENTIFIED = {};
const PRODUCTION = { ALLOY_ENVIRONMENT: "production", VERCEL_ENV: "production" };

const invite = (email: string) =>
    INVITE(new Request("http://x/api/admin/users", { method: "POST", body: JSON.stringify({ email, role: "teacher" }) }));
const resetFor = (email: string) => {
    mocks.getUserById.mockResolvedValue({ data: { user: { id: MEMBER, email } } });
    return SEND_RESET(
        new NextRequest("http://localhost/api/admin/send-password-reset", {
            method: "POST",
            body: JSON.stringify({ user_id: MEMBER }),
            headers: { "content-type": "application/json" },
        })
    );
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.test.invalid");
    mocks.invite.mockImplementation(async (email: string) => ({ data: { user: { id: "new-user", email } }, error: null }));
    mocks.reset.mockResolvedValue({ data: {}, error: null });
    mocks.rpc.mockResolvedValue({ data: { user_id: "new-user", org_id: "org-1", role: "teacher" }, error: null });
    vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe("invite (inviteUserByEmail) — guarded before Supabase Auth is asked", () => {
    it("staging: a real inbox is refused and no invite is sent", async () => {
        useEnv(STAGING);
        const res = await invite("parent@gmail.com");
        expect(res.status).toBe(403);
        expect((await res.json()).code).toBe(STAGING_RECIPIENT_REFUSED);
        expect(mocks.invite).not.toHaveBeenCalled();
        expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it("missing ALLOY_ENVIRONMENT: a real inbox is refused the same way", async () => {
        useEnv(UNIDENTIFIED);
        expect((await invite("parent@gmail.com")).status).toBe(403);
        expect(mocks.invite).not.toHaveBeenCalled();
    });

    it("staging: a test inbox and an owner-allowlisted inbox are invited", async () => {
        useEnv({ ...STAGING, [STAGING_EMAIL_ALLOWLIST_ENV]: "owner@alloy.dev" });
        expect((await invite("new@example.com")).status).toBe(200);
        expect((await invite("owner@alloy.dev")).status).toBe(200);
        expect(mocks.invite.mock.calls.map((c) => c[0])).toEqual(["new@example.com", "owner@alloy.dev"]);
    });

    it("production: a real inbox is invited unchanged", async () => {
        useEnv(PRODUCTION);
        expect((await invite("parent@gmail.com")).status).toBe(200);
        expect(mocks.invite).toHaveBeenCalledWith("parent@gmail.com", expect.anything());
    });
});

describe("admin password reset (resetPasswordForEmail) — guarded before Supabase Auth is asked", () => {
    it("staging: a member with a real inbox is refused and no reset is sent", async () => {
        useEnv(STAGING);
        const res = await resetFor("member@gmail.com");
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.code).toBe(STAGING_RECIPIENT_REFUSED);
        expect(JSON.stringify(body)).not.toContain("member@gmail.com");
        expect(mocks.reset).not.toHaveBeenCalled();
    });

    it("unknown ALLOY_ENVIRONMENT: refused the same way", async () => {
        useEnv({ ALLOY_ENVIRONMENT: "prod" });
        expect((await resetFor("member@gmail.com")).status).toBe(403);
        expect(mocks.reset).not.toHaveBeenCalled();
    });

    it("staging: a test inbox and an owner-allowlisted inbox are sent the reset", async () => {
        useEnv({ ...STAGING, [STAGING_EMAIL_ALLOWLIST_ENV]: "owner@alloy.dev" });
        expect((await resetFor("member@northwind.invalid")).status).toBe(200);
        expect((await resetFor("owner@alloy.dev")).status).toBe(200);
        expect(mocks.reset.mock.calls.map((c) => c[0])).toEqual(["member@northwind.invalid", "owner@alloy.dev"]);
    });

    it("production: a real inbox is sent the reset unchanged", async () => {
        useEnv(PRODUCTION);
        expect((await resetFor("member@gmail.com")).status).toBe(200);
        expect(mocks.reset).toHaveBeenCalledWith("member@gmail.com", expect.anything());
    });
});

describe("Auth mail call sites", () => {
    const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

    it("each server-side Auth mail call is preceded by the recipient guard", () => {
        for (const [rel, call] of [
            ["app/api/admin/users/route.ts", "supabase.auth.admin.inviteUserByEmail("],
            ["app/api/admin/send-password-reset/route.ts", "supabase.auth.resetPasswordForEmail("],
        ] as const) {
            const src = read(rel);
            const gate = src.indexOf('guardOutboundRecipients("email"');
            expect(gate, rel).toBeGreaterThan(-1);
            expect(gate, rel).toBeLessThan(src.indexOf(call));
        }
    });

    it("/forgot-password is a browser call to Supabase Auth — provider config, not app code, governs it", () => {
        const src = read("app/forgot-password/page.tsx");
        expect(src).toMatch(/^"use client";/);
        expect(src).toContain('from "@/lib/supabaseClient"');
        expect(src).toContain("supabase.auth.resetPasswordForEmail(");
    });
});
