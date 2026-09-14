/**
 * Slice B.2 certification — the external request boundary, over HTTP.
 *
 * These call the real route handlers. The value of the boundary is what it
 * refuses, so the isolation and revocation cases are the point; the happy path
 * exists to prove the refusals are not vacuous.
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSupabase, type Tables } from "../principal/fakeSupabase";

const ORG_A = "org-a";
const ORG_B = "org-b";
const LOC_A1 = "loc-a1";
const LOC_A2 = "loc-a2";

let fake: ReturnType<typeof createFakeSupabase>;

vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: () => fake.client }));

const { POST: tokenRoute } = await import("@/app/api/v1/oauth/token/route");
const { GET: contextRoute } = await import("@/app/api/v1/context/route");
const { issueCredential, revokeCredential, rotateCredential } = await import(
    "@/lib/platform/principal/applicationCredential"
);

function seed(): Tables {
    return {
        developer_applications: [
            { id: "app-1", slug: "partner", ownership_mode: "partner_managed", environment: "production", status: "active" },
            { id: "app-2", slug: "tool", ownership_mode: "tenant_private", environment: "production", status: "active" },
        ],
        app_installations: [
            { id: "inst-a", application_id: "app-1", org_id: ORG_A, granted_scopes: ["children.read"],
              boundary_mode: "locations", location_boundary: [LOC_A1], producer_key: "p-a", status: "active" },
            { id: "inst-b", application_id: "app-2", org_id: ORG_B, granted_scopes: ["attendance.write"],
              boundary_mode: "org_wide", location_boundary: [], producer_key: "p-b", status: "active" },
        ],
        app_credentials: [],
        app_access_tokens: [],
        app_security_audit: [],
        app_api_activity: [],
    };
}

beforeEach(() => {
    fake = createFakeSupabase(seed());
});

async function issue(installationId: string) {
    const r = await issueCredential(fake.client, { installationId, label: "t" });
    if (!r.ok) throw new Error(r.reason);
    return r.issued;
}

function tokenRequest(body: Record<string, string>) {
    return new NextRequest("https://alloy.test/api/v1/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

async function exchange(clientId: string, clientSecret: string) {
    const res = await tokenRoute(
        tokenRequest({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    );
    return { res, body: (await res.json()) as Record<string, unknown> };
}

function contextRequest(token: string | null, extraHeaders: Record<string, string> = {}) {
    return new NextRequest("https://alloy.test/api/v1/context", {
        method: "GET",
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extraHeaders },
    });
}

async function getContext(token: string | null) {
    const res = await contextRoute(contextRequest(token));
    return { res, body: (await res.json()) as Record<string, unknown> };
}

describe("token exchange", () => {
    it("issues a bounded token for a valid credential", async () => {
        const c = await issue("inst-a");
        const { res, body } = await exchange(c.clientId, c.clientSecret);

        expect(res.status).toBe(200);
        expect(String(body.access_token)).toMatch(/^alloy_at_/);
        expect(body.token_type).toBe("Bearer");
        expect(body.expires_in).toBe(900);
        expect(res.headers.get("Cache-Control")).toBe("no-store");
        expect(res.headers.get("X-Request-Id")).toMatch(/^req_/);
    });

    it("refuses malformed, unknown and revoked identically", async () => {
        const c = await issue("inst-a");
        const credId = fake.rows("app_credentials")[0].id as string;

        const malformed = await exchange("", "");
        const unknown = await exchange(c.clientId, "alloy_sk_nope");
        await revokeCredential(fake.client, { credentialId: credId });
        const revoked = await exchange(c.clientId, c.clientSecret);

        for (const r of [malformed, unknown, revoked]) {
            expect(r.res.status).toBe(401);
            expect((r.body.error as Record<string, unknown>).code).toBe("invalid_credential");
        }
    });

    it("refuses a suspended installation, a revoked installation and a disabled application", async () => {
        const c = await issue("inst-a");

        fake.db.app_installations[0].status = "suspended";
        expect((await exchange(c.clientId, c.clientSecret)).res.status).toBe(401);

        fake.db.app_installations[0].status = "revoked";
        expect((await exchange(c.clientId, c.clientSecret)).res.status).toBe(401);

        fake.db.app_installations[0].status = "active";
        fake.db.developer_applications[0].status = "disabled";
        expect((await exchange(c.clientId, c.clientSecret)).res.status).toBe(401);
    });

    it("rejects a grant type it does not support", async () => {
        const c = await issue("inst-a");
        const res = await tokenRoute(
            tokenRequest({ grant_type: "password", client_id: c.clientId, client_secret: c.clientSecret }),
        );
        expect(res.status).toBe(400);
        expect(((await res.json()).error as Record<string, unknown>).code).toBe("unsupported_grant_type");
    });

    it("rate-limits through shared durable state, before verification", async () => {
        const c = await issue("inst-a");
        let limited = 0;
        // The budget is 30/minute; 32 attempts must produce refusals.
        for (let i = 0; i < 32; i++) {
            const { res } = await exchange(c.clientId, "alloy_sk_wrong");
            if (res.status === 429) limited++;
        }
        expect(limited).toBeGreaterThan(0);

        const { res } = await exchange(c.clientId, "alloy_sk_wrong");
        expect(res.status).toBe(429);
        expect(res.headers.get("Retry-After")).toBeTruthy();
        expect(res.headers.get("RateLimit-Limit")).toBe("30");
    });
});

describe("GET /api/v1/context", () => {
    it("returns only the caller's own bounded context", async () => {
        const c = await issue("inst-a");
        const { body: t } = await exchange(c.clientId, c.clientSecret);
        const { res, body } = await getContext(String(t.access_token));

        expect(res.status).toBe(200);
        expect((body.organization as Record<string, unknown>).id).toBe(ORG_A);
        expect((body.application as Record<string, unknown>).slug).toBe("partner");
        expect(body.scopes).toEqual(["children.read"]);
        expect(body.resource_boundary).toEqual({ mode: "locations", location_ids: [LOC_A1] });

        // Nothing internal, and nothing about a person.
        const serialized = JSON.stringify(body);
        for (const forbidden of ["permissionKeys", "role", "secret", "token_hash", "producer_key", "credential"]) {
            expect(serialized).not.toContain(forbidden);
        }
    });

    it("refuses a missing, altered or unknown token", async () => {
        const c = await issue("inst-a");
        const { body: t } = await exchange(c.clientId, c.clientSecret);
        const token = String(t.access_token);

        expect((await getContext(null)).res.status).toBe(401);
        expect((await getContext(token + "x")).res.status).toBe(401);
        expect((await getContext("alloy_at_nonsense")).res.status).toBe(401);
    });

    it("refuses an expired token", async () => {
        const c = await issue("inst-a");
        const { body: t } = await exchange(c.clientId, c.clientSecret);

        // Expire it in place.
        fake.rows("app_access_tokens")[0].expires_at = new Date(Date.now() - 1000).toISOString();
        expect((await getContext(String(t.access_token))).res.status).toBe(401);
    });
});

describe("tenant isolation over HTTP", () => {
    it("gives each token only its own organization", async () => {
        const a = await issue("inst-a");
        const b = await issue("inst-b");
        const ta = String((await exchange(a.clientId, a.clientSecret)).body.access_token);
        const tb = String((await exchange(b.clientId, b.clientSecret)).body.access_token);

        const ca = await getContext(ta);
        const cb = await getContext(tb);

        expect((ca.body.organization as Record<string, unknown>).id).toBe(ORG_A);
        expect((cb.body.organization as Record<string, unknown>).id).toBe(ORG_B);
    });

    it("ignores every caller-supplied identifier", async () => {
        const a = await issue("inst-a");
        const ta = String((await exchange(a.clientId, a.clientSecret)).body.access_token);

        const res = await contextRoute(
            new NextRequest(
                "https://alloy.test/api/v1/context?org_id=org-b&organization_id=org-b&installation_id=inst-b&application_id=app-2&location_id=" +
                    LOC_A2,
                {
                    method: "GET",
                    headers: {
                        authorization: `Bearer ${ta}`,
                        "x-org-id": ORG_B,
                        "x-installation-id": "inst-b",
                    },
                },
            ),
        );
        const body = (await res.json()) as Record<string, unknown>;

        expect(res.status).toBe(200);
        expect((body.organization as Record<string, unknown>).id).toBe(ORG_A);
        expect((body.installation as Record<string, unknown>).id).toBe("inst-a");
        expect(body.scopes).toEqual(["children.read"]);
        expect(body.resource_boundary).toEqual({ mode: "locations", location_ids: [LOC_A1] });
    });

    it("keeps org-wide and restricted boundaries distinct", async () => {
        const a = await issue("inst-a");
        const b = await issue("inst-b");
        const ca = await getContext(String((await exchange(a.clientId, a.clientSecret)).body.access_token));
        const cb = await getContext(String((await exchange(b.clientId, b.clientSecret)).body.access_token));

        expect(ca.body.resource_boundary).toEqual({ mode: "locations", location_ids: [LOC_A1] });
        expect(cb.body.resource_boundary).toEqual({ mode: "org_wide" });
    });
});

describe("revocation semantics against already-issued tokens", () => {
    async function liveToken() {
        const c = await issue("inst-a");
        const t = String((await exchange(c.clientId, c.clientSecret)).body.access_token);
        expect((await getContext(t)).res.status).toBe(200);
        return { credId: fake.rows("app_credentials")[0].id as string, token: t };
    }

    it("credential revocation kills its live tokens on the next request", async () => {
        const { credId, token } = await liveToken();
        await revokeCredential(fake.client, { credentialId: credId });
        expect((await getContext(token)).res.status).toBe(401);
    });

    it("credential rotation does NOT kill live tokens — stated, not assumed", async () => {
        const { credId, token } = await liveToken();
        await rotateCredential(fake.client, {
            credentialId: credId,
            overlapUntil: new Date(Date.now() + 60_000).toISOString(),
        });
        // Rotation changes what authenticates FUTURE exchanges. It is not a
        // revocation, and treating it as one would make every routine rotation
        // an outage for in-flight callers.
        expect((await getContext(token)).res.status).toBe(200);
    });

    it("installation suspension stops live tokens immediately", async () => {
        const { token } = await liveToken();
        fake.db.app_installations[0].status = "suspended";
        expect((await getContext(token)).res.status).toBe(401);
    });

    it("installation revocation stops live tokens immediately", async () => {
        const { token } = await liveToken();
        fake.db.app_installations[0].status = "revoked";
        expect((await getContext(token)).res.status).toBe(401);
    });

    it("application disable stops live tokens immediately", async () => {
        const { token } = await liveToken();
        fake.db.developer_applications[0].status = "disabled";
        expect((await getContext(token)).res.status).toBe(401);
    });

    it("scope and boundary changes take effect on the next request", async () => {
        const { token } = await liveToken();

        fake.db.app_installations[0].granted_scopes = [];
        fake.db.app_installations[0].location_boundary = [];

        const { body } = await getContext(token);
        // The token carried no snapshot, so there is nothing stale to honour.
        expect(body.scopes).toEqual([]);
        expect(body.resource_boundary).toEqual({ mode: "locations", location_ids: [] });
    });
});

describe("API activity", () => {
    it("records success and refusal, with a request id and a normalized route", async () => {
        const c = await issue("inst-a");
        const { body: t } = await exchange(c.clientId, c.clientSecret);
        await getContext(String(t.access_token));
        await getContext("alloy_at_bad");

        const rows = fake.rows("app_api_activity");
        expect(rows.length).toBeGreaterThanOrEqual(3);

        for (const r of rows) {
            expect(String(r.request_id)).toMatch(/^req_/);
            // The template, never a concrete path with identifiers in it.
            expect(["/api/v1/oauth/token", "/api/v1/context"]).toContain(r.route);
            expect(typeof r.status_code).toBe("number");
        }

        expect(rows.some((r) => r.outcome === "success")).toBe(true);
        expect(rows.some((r) => r.outcome === "client_error" && r.error_code === "invalid_credential")).toBe(true);
    });

    it("stores no secret, token or credential material", async () => {
        const c = await issue("inst-a");
        const { body: t } = await exchange(c.clientId, c.clientSecret);
        await getContext(String(t.access_token));

        const serialized = JSON.stringify(fake.rows("app_api_activity"));
        expect(serialized).not.toContain(c.clientSecret);
        expect(serialized).not.toContain(String(t.access_token));
        expect(serialized.toLowerCase()).not.toContain("authorization");
    });

    it("writes the security audit separately from activity", async () => {
        const c = await issue("inst-a");
        await exchange(c.clientId, c.clientSecret);

        const audit = fake.rows("app_security_audit");
        expect(audit.some((r) => r.event_type === "authentication.succeeded")).toBe(true);
        // Two stores, two jobs: the audit must stay small and readable.
        expect(fake.rows("app_api_activity").length).toBeGreaterThan(0);
        const serialized = JSON.stringify(audit);
        expect(serialized).not.toContain(c.clientSecret);
    });
});
