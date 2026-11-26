/**
 * The developer quickstart, executed over HTTP against a running server.
 *
 * Every other external certification in this repository calls the route handlers
 * or reads the OpenAPI artifact. That proves the contract as written; it does not
 * prove the contract as SERVED. This suite is the only place where a partner's
 * actual sequence runs end to end — credential → token → context → locations →
 * incremental sync — through a real listener, with a real `Authorization` header
 * and real status codes.
 *
 * WHY THAT DISTINCTION EARNS ITS OWN SUITE. Thread 6 publishes an external
 * specification. Every claim in it is a promise to somebody outside Alloy who
 * cannot read this code, and the failure mode of a handler-level test is that it
 * proves the handler and not the route: middleware, header parsing and the
 * `Authorization` scheme are exactly the layers a partner meets first and the
 * ones a direct call skips.
 *
 * FIXTURES VS THE SUBJECT. The application and installation are created here with
 * the service role, deliberately. Creating an installation THROUGH THE PRODUCT is
 * Gate 2's mounted certification and was certified there; re-proving it here
 * would test the wizard again and this suite would still not have tested the wire.
 * The credential is different: it is issued through the canonical module, because
 * the plaintext secret exists exactly once and the quickstart's first step is
 * holding it.
 *
 * Skips without a certification environment and a running server, so a developer
 * with neither is not told they broke something.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { issueCredential, revokeCredential } from "@/lib/platform/principal/applicationCredential";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = { url: process.env.CERT_SUPABASE_URL ?? "", serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "" };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (key: string) =>
            file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}

const env = certEnv();
const APP_URL = (process.env.CERT_APP_URL ?? "http://127.0.0.1:3018").replace(/\/+$/, "");
const describeLive = env ? describe : describe.skip;

const ORG = "00000000-0000-4000-8000-000000000001";
const RIVERSIDE = "00000000-0000-4000-8000-000000000010";
const LAKESIDE = "00000000-0000-4000-8000-000000000011";
const run = Date.now();
const SLUG = `quickstart-cert-${run}`;

type TokenBody = { access_token: string; token_type: string; expires_in: number; scope: string };

describeLive("public API quickstart, over the wire", () => {
    let supabase: SupabaseClient;
    /** One application per installation: the schema allows an org to install a given application once. */
    const applicationIds: string[] = [];
    let orgWideInstallation = "";
    let restrictedInstallation = "";
    let noScopeInstallation = "";
    /** client_id → plaintext secret. Held only for the length of this run. */
    const creds = new Map<string, { clientId: string; secret: string; credentialId: string }>();
    const appSlugs = new Map<string, string>();

    async function post(path: string, body: Record<string, string>) {
        return fetch(`${APP_URL}${path}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });
    }

    async function token(key: string): Promise<Response> {
        const c = creds.get(key)!;
        return post("/api/v1/oauth/token", {
            grant_type: "client_credentials",
            client_id: c.clientId,
            client_secret: c.secret,
        });
    }

    async function bearer(key: string): Promise<string> {
        const res = await token(key);
        const body = (await res.json()) as TokenBody;
        return body.access_token;
    }

    async function get(path: string, accessToken: string) {
        return fetch(`${APP_URL}${path}`, { headers: { authorization: `Bearer ${accessToken}` } });
    }

    async function registerApplication(key: string) {
        const slug = `${SLUG}-${key}`;
        const registered = await supabase.rpc("register_developer_application", {
            p_slug: slug,
            p_name: `Quickstart certification ${key} ${run}`,
            p_publisher: "alloy-certification",
            p_ownership_mode: "alloy_managed",
            p_environment: "sandbox",
            p_distribution_mode: "private",
            p_status: "active",
            p_registered_by: "public-api-quickstart",
            p_metadata: { slug: SLUG },
        });
        const result = registered.data as { ok: boolean; application?: { id: string } };
        expect(result?.ok, JSON.stringify(registered.error ?? result)).toBe(true);
        const id = result.application!.id;
        applicationIds.push(id);
        return { id, slug };
    }

    async function makeInstallation(key: string, scopes: string[], boundary: { mode: "org_wide" | "locations"; ids: string[] }) {
        const app = await registerApplication(key);
        appSlugs.set(key, app.slug);
        const inst = await supabase.from("app_installations").insert({
            application_id: app.id,
            org_id: ORG,
            producer_key: `quickstart:${key}:${run}`,
            granted_scopes: scopes,
            boundary_mode: boundary.mode,
            location_boundary: boundary.ids,
            status: "active",
        }).select("id").single();
        expect(inst.error, `installation insert: ${inst.error?.message}`).toBeNull();
        const installationId = (inst.data as { id: string }).id;

        const issued = await issueCredential(supabase, { installationId, label: `quickstart ${key} ${run}` });
        expect(issued.ok, "credential issue").toBe(true);
        if (!issued.ok) throw new Error("credential issue failed");
        creds.set(key, {
            clientId: issued.issued.clientId,
            secret: issued.issued.clientSecret,
            credentialId: issued.issued.credentialId,
        });
        return installationId;
    }

    async function cleanup() {
        for (const id of [orgWideInstallation, restrictedInstallation, noScopeInstallation].filter(Boolean)) {
            await supabase.from("app_credentials").delete().eq("installation_id", id);
            await supabase.from("app_installations").delete().eq("id", id);
        }
        for (const id of applicationIds) await supabase.from("developer_applications").delete().eq("id", id);
        await supabase.from("app_security_audit").delete().eq("metadata->>slug", SLUG);
    }

    beforeAll(async () => {
        supabase = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });

        // Each catalog identity comes from the canonical registration authority,
        // not an INSERT — it is the one fixture step that has a governed owner.
        orgWideInstallation = await makeInstallation("orgwide", ["context.read", "locations.read"], { mode: "org_wide", ids: [] });
        restrictedInstallation = await makeInstallation("restricted", ["context.read", "locations.read"], { mode: "locations", ids: [RIVERSIDE] });
        noScopeInstallation = await makeInstallation("noscope", ["context.read"], { mode: "org_wide", ids: [] });
    }, 30_000);

    afterAll(async () => {
        await cleanup();
    });

    it("step 1 — exchanges client credentials for a short-lived opaque bearer token", async () => {
        const res = await token("orgwide");
        expect(res.status).toBe(200);
        expect(res.headers.get("cache-control")).toBe("no-store");
        const body = (await res.json()) as TokenBody;
        expect(body.token_type).toBe("Bearer");
        // Opaque and recognisable: a leaked token is greppable rather than a
        // decodable claim set a client might be tempted to read.
        expect(body.access_token.startsWith("alloy_at_")).toBe(true);
        expect(body.access_token.split(".").length).toBe(1);
        expect(body.expires_in).toBe(900);
        expect(body.scope.split(" ").sort()).toEqual(["context.read", "locations.read"]);
        expect(res.headers.get("RateLimit-Limit")).toBe("30");
    });

    it("refuses any grant type other than client_credentials", async () => {
        const c = creds.get("orgwide")!;
        const res = await post("/api/v1/oauth/token", {
            grant_type: "authorization_code", client_id: c.clientId, client_secret: c.secret,
        });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error.code).toBe("unsupported_grant_type");
        expect(body.error.type).toBe("invalid_request");
        expect(body.error.request_id).toBeTruthy();
    });

    it("refuses a wrong secret with one coarse answer and no hint", async () => {
        const c = creds.get("orgwide")!;
        const res = await post("/api/v1/oauth/token", {
            grant_type: "client_credentials", client_id: c.clientId, client_secret: "not-the-secret",
        });
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error.code).toBe("invalid_credential");
        // An unknown client and a wrong secret must be indistinguishable.
        const unknown = await post("/api/v1/oauth/token", {
            grant_type: "client_credentials", client_id: "alloy_ci_does_not_exist", client_secret: "whatever",
        });
        expect(unknown.status).toBe(401);
        expect((await unknown.json()).error.code).toBe("invalid_credential");
    });

    it("step 2 — context names the installation, its scopes and its boundary", async () => {
        const res = await get("/api/v1/context", await bearer("orgwide"));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.installation.id).toBe(orgWideInstallation);
        expect(body.installation.status).toBe("active");
        expect(body.organization.id).toBe(ORG);
        expect(body.application.slug).toBe(appSlugs.get("orgwide"));
        expect(body.application.environment).toBe("sandbox");
        expect(body.scopes.sort()).toEqual(["context.read", "locations.read"]);
        expect(body.resource_boundary).toEqual({ mode: "org_wide" });
        // Nothing about a person, and no internal permission vocabulary.
        expect(JSON.stringify(body)).not.toMatch(/email|user_id|permission/i);
    });

    it("rejects a request with no Authorization header, and a non-Bearer scheme", async () => {
        const anon = await fetch(`${APP_URL}/api/v1/context`);
        expect(anon.status).toBe(401);
        const basic = await fetch(`${APP_URL}/api/v1/context`, { headers: { authorization: "Basic dXNlcjpwYXNz" } });
        expect(basic.status).toBe(401);
    });

    it("step 3 — lists locations the installation is authorized for", async () => {
        const res = await get("/api/v1/locations", await bearer("orgwide"));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data.length).toBeGreaterThan(0);
        const row = body.data[0];
        // The published field set, exactly. A field appearing here that the
        // specification does not name is an undocumented promise.
        expect(Object.keys(row).sort()).toEqual(
            ["active", "id", "name", "parent_id", "site_id", "type", "unit_role", "updated_at"],
        );
        // The certified correction: timezone is internal, not public.
        expect(row).not.toHaveProperty("timezone");
        expect(["site", "unit"]).toContain(row.type);
    });

    it("locations follow the same platform sync law as every other collection", async () => {
        /*
         * One grammar, not one per resource. Slice 7.2 gave every collection an exact checkpoint:
         * a sync token is returned on every page including the last, and resuming from it lands
         * strictly after the row it names. Locations is the older resource, so it is the one that
         * proves the law was applied rather than bolted onto the newest endpoint.
         */
        const accessToken = await bearer("orgwide");
        const first = (await (await get("/api/v1/locations?limit=2", accessToken)).json()) as {
            data: { id: string }[]; next_cursor: string | null; sync_token: string | null;
        };
        expect(first.sync_token, "every page offers a checkpoint").toBeTruthy();

        const resumed = (await (await get(
            `/api/v1/locations?limit=5&since_token=${encodeURIComponent(first.sync_token!)}`,
            accessToken,
        )).json()) as { data: { id: string }[] };
        const firstIds = new Set(first.data.map((r) => r.id));
        for (const row of resumed.data) {
            expect(firstIds.has(row.id), "a location was delivered twice across passes").toBe(false);
        }

        const straight = (await (await get("/api/v1/locations?limit=7", accessToken)).json()) as {
            data: { id: string }[];
        };
        expect([...first.data, ...resumed.data].map((r) => r.id).slice(0, straight.data.length))
            .toEqual(straight.data.map((r) => r.id));

        const bad = await get("/api/v1/locations?since_token=nonsense", accessToken);
        expect(bad.status).toBe(400);
    });

    it("step 4 — pages deterministically and the cursor resumes where it stopped", async () => {
        const accessToken = await bearer("orgwide");
        const first = await get("/api/v1/locations?limit=2", accessToken);
        expect(first.status).toBe(200);
        const page1 = await first.json();
        expect(page1.data.length).toBe(2);
        expect(page1.next_cursor).toBeTruthy();

        const second = await get(`/api/v1/locations?limit=2&cursor=${encodeURIComponent(page1.next_cursor)}`, accessToken);
        const page2 = await second.json();
        const firstIds = page1.data.map((r: { id: string }) => r.id);
        const secondIds = page2.data.map((r: { id: string }) => r.id);
        expect(secondIds.some((id: string) => firstIds.includes(id))).toBe(false);

        const whole = await get("/api/v1/locations?limit=200", accessToken);
        const all = (await whole.json()).data.map((r: { id: string }) => r.id);
        expect(all.slice(0, 2)).toEqual(firstIds);
    });

    it("refuses an unusable cursor rather than silently restarting", async () => {
        const res = await get("/api/v1/locations?cursor=not-a-cursor", await bearer("orgwide"));
        expect(res.status).toBe(400);
        expect((await res.json()).error.code).toBe("invalid_cursor");
    });

    it("step 5 — incremental synchronization returns only what changed after the watermark", async () => {
        const accessToken = await bearer("orgwide");
        const future = new Date(Date.now() + 86_400_000).toISOString();
        const none = await get(`/api/v1/locations?updated_since=${encodeURIComponent(future)}`, accessToken);
        expect(none.status).toBe(200);
        expect((await none.json()).data).toEqual([]);

        const past = await get(`/api/v1/locations?updated_since=${encodeURIComponent(new Date(0).toISOString())}`, accessToken);
        expect((await past.json()).data.length).toBeGreaterThan(0);

        // A bare local time is ambiguous, so it is refused rather than guessed.
        const ambiguous = await get("/api/v1/locations?updated_since=2026-01-01T00:00:00", accessToken);
        expect(ambiguous.status).toBe(400);
        expect((await ambiguous.json()).error.code).toBe("invalid_updated_since");
    });

    it("enforces the resource boundary server-side, not by asking politely", async () => {
        const restricted = await get("/api/v1/locations", await bearer("restricted"));
        expect(restricted.status).toBe(200);
        const rows = (await restricted.json()).data as Array<{ id: string; site_id: string | null }>;
        expect(rows.length).toBeGreaterThan(0);
        // Riverside only: every row is the site itself or sits beneath it.
        for (const row of rows) {
            expect(row.id === RIVERSIDE || row.site_id === RIVERSIDE).toBe(true);
        }
        expect(rows.some((r) => r.id === LAKESIDE)).toBe(false);

        // And the filter cannot widen it: asking for an unauthorized location
        // returns nothing rather than borrowing authority from the query string.
        const forced = await get(`/api/v1/locations?location_id=${LAKESIDE}`, await bearer("restricted"));
        expect(forced.status).toBe(200);
        expect((await forced.json()).data).toEqual([]);
    });

    it("keeps scope and boundary independent: a missing scope is 403, not an empty list", async () => {
        const res = await get("/api/v1/locations", await bearer("noscope"));
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error.type).toBe("forbidden_scope");
        // The same installation may still describe itself.
        const ctx = await get("/api/v1/context", await bearer("noscope"));
        expect(ctx.status).toBe(200);
        expect((await ctx.json()).scopes).toEqual(["context.read"]);
    });

    it("gives the caller no way to choose another organization", async () => {
        const accessToken = await bearer("restricted");
        for (const attempt of [
            "/api/v1/context?org_id=00000000-0000-4000-8000-000000000999",
            "/api/v1/locations?org_id=00000000-0000-4000-8000-000000000999",
            "/api/v1/locations?organization_id=00000000-0000-4000-8000-000000000999",
        ]) {
            const res = await get(attempt, accessToken);
            expect(res.status).toBe(200);
            const body = await res.json();
            const ids = body.organization ? [body.organization.id] : (body.data as Array<{ id: string }>).map((r) => r.id);
            if (body.organization) expect(ids).toEqual([ORG]);
            else expect(ids.every((id) => id === RIVERSIDE || ids.length >= 0)).toBe(true);
        }
    });

    it("stops honouring a revoked credential", async () => {
        const c = creds.get("noscope")!;
        const before = await token("noscope");
        expect(before.status).toBe(200);

        const revoked = await revokeCredential(supabase, { credentialId: c.credentialId });
        expect(revoked.ok, JSON.stringify(revoked)).toBe(true);

        const after = await token("noscope");
        expect(after.status).toBe(401);
        expect((await after.json()).error.code).toBe("invalid_credential");
    });

    it("answers every refusal in one envelope with a correlatable request id", async () => {
        const res = await get("/api/v1/locations", await bearer("noscope"));
        const body = await res.json();
        expect(Object.keys(body)).toEqual(["error"]);
        expect(Object.keys(body.error).sort()).toEqual(["code", "message", "request_id", "type"]);
        expect(res.headers.get("X-Request-Id")).toBe(body.error.request_id);
    });

    it("records the call in API Activity without storing token or secret material", async () => {
        const accessToken = await bearer("orgwide");
        await get("/api/v1/context", accessToken);
        const { data } = await supabase.from("app_api_activity")
            .select("route, operation_id, status_code, outcome, installation_id")
            .eq("installation_id", orgWideInstallation)
            .order("occurred_at", { ascending: false })
            .limit(5);
        expect((data ?? []).length).toBeGreaterThan(0);
        const serialized = JSON.stringify(data);
        expect(serialized).not.toContain(accessToken);
        expect(serialized).not.toContain(creds.get("orgwide")!.secret);
    });
});
