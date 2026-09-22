/**
 * What the authenticated rate limit actually does — measured, not assumed.
 *
 * The partner guide said reads and writes have "separate rate budgets". The runtime has two
 * separate LIMITS, which is not the same thing: both classes consume the same per-installation
 * counter, so a partner that has spent the window reading finds its next write refused without
 * having written anything.
 *
 * That distinction is invisible from the code unless you notice `installationBucket` is keyed
 * `api_read` and used by both paths, and it is exactly the kind of claim a partner would design
 * around. So it is measured here over HTTP, and the documentation says what this proves.
 *
 * Skips without a certification environment and a running server.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { issueCredential } from "@/lib/platform/principal/applicationCredential";
import { RATE_LIMIT_POLICY } from "@/lib/platform/external/rateLimit";

function certEnv(): { url: string; serviceKey: string } | null {
    const p = { url: process.env.CERT_SUPABASE_URL ?? "", serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "" };
    if (p.url && p.serviceKey) return p;
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (k: string) => file.split("\n").find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch { return null; }
}

const env = certEnv();
const APP_URL = (process.env.CERT_APP_URL ?? "http://127.0.0.1:3018").replace(/\/+$/, "");
const describeLive = env ? describe : describe.skip;
const ORG = "00000000-0000-4000-8000-000000000001";
const RIVERSIDE = "00000000-0000-4000-8000-000000000010";
const run = Date.now();

describeLive("the authenticated rate-limit classes", () => {
    let supabase: SupabaseClient;
    let applicationId = "";
    let installationId = "";
    let token = "";

    beforeAll(async () => {
        supabase = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        const registered = await supabase.rpc("register_developer_application", {
            p_slug: `ratelimit-cert-${run}`, p_name: `Rate limit certification ${run}`,
            p_publisher: "alloy-certification", p_ownership_mode: "alloy_managed", p_environment: "sandbox",
            p_distribution_mode: "private", p_status: "active", p_registered_by: "ratelimit-cert", p_metadata: {},
        });
        const result = registered.data as { ok: boolean; application?: { id: string } };
        expect(result?.ok, JSON.stringify(registered.error ?? result)).toBe(true);
        applicationId = result.application!.id;

        const inst = await supabase.from("app_installations").insert({
            application_id: applicationId, org_id: ORG, producer_key: `ratelimit:${run}`,
            granted_scopes: ["locations.read", "enrollment.read", "enrollment.write"],
            boundary_mode: "locations", location_boundary: [RIVERSIDE], status: "active",
        }).select("id").single();
        expect(inst.error, `installation: ${inst.error?.message}`).toBeNull();
        installationId = (inst.data as { id: string }).id;

        const issued = await issueCredential(supabase, { installationId, label: `ratelimit ${run}` });
        expect(issued.ok).toBe(true);
        if (!issued.ok) throw new Error("credential failed");
        const res = await fetch(`${APP_URL}/api/v1/oauth/token`, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({
                grant_type: "client_credentials",
                client_id: issued.issued.clientId, client_secret: issued.issued.clientSecret,
            }),
        });
        const body = (await res.json()) as { access_token?: string };
        expect(body.access_token, `token (${res.status})`).toBeTruthy();
        token = body.access_token!;
    }, 120_000);

    afterAll(async () => {
        if (!supabase) return;
        if (installationId) await supabase.from("app_installations").delete().eq("id", installationId);
        if (applicationId) await supabase.from("developer_applications").delete().eq("id", applicationId);
    }, 120_000);

    const headers = () => ({ authorization: `Bearer ${token}` });
    const limitsOf = (res: Response) => ({
        limit: Number(res.headers.get("RateLimit-Limit")),
        remaining: Number(res.headers.get("RateLimit-Remaining")),
    });

    it("advertises the read limit on a read", async () => {
        const res = await fetch(`${APP_URL}/api/v1/locations?limit=1`, { headers: headers() });
        expect(res.status).toBe(200);
        expect(limitsOf(res).limit).toBe(RATE_LIMIT_POLICY.authenticatedRead.limit);
    }, 60_000);

    it("advertises the write limit on a write, and it is tighter than the read limit", async () => {
        // A refused operation still consumes budget and still carries the headers.
        const res = await fetch(`${APP_URL}/api/v1/enrollments`, {
            method: "POST", headers: { ...headers(), "content-type": "application/json" },
            body: JSON.stringify({ child_id: "not-an-id", site_id: RIVERSIDE }),
        });
        expect(res.status).toBe(400);
        const { limit } = limitsOf(res);
        expect(limit).toBe(RATE_LIMIT_POLICY.authenticatedWrite.limit);
        expect(limit).toBeLessThan(RATE_LIMIT_POLICY.authenticatedRead.limit);
    }, 60_000);

    it("spends ONE counter across both classes — the limits differ, the budget does not", async () => {
        /*
         * The measurement that matters. Both classes are keyed on the same per-installation
         * bucket, so `remaining` on each is that shared count subtracted from a different limit.
         * If the budgets were genuinely separate, reads would not move the write's remaining.
         */
        const readA = limitsOf(await fetch(`${APP_URL}/api/v1/locations?limit=1`, { headers: headers() }));
        const writeA = limitsOf(await fetch(`${APP_URL}/api/v1/enrollments`, {
            method: "POST", headers: { ...headers(), "content-type": "application/json" },
            body: JSON.stringify({ child_id: "not-an-id", site_id: RIVERSIDE }),
        }));

        // Spend three more READS and nothing else.
        for (let i = 0; i < 3; i += 1) {
            await fetch(`${APP_URL}/api/v1/locations?limit=1`, { headers: headers() });
        }

        const writeB = limitsOf(await fetch(`${APP_URL}/api/v1/enrollments`, {
            method: "POST", headers: { ...headers(), "content-type": "application/json" },
            body: JSON.stringify({ child_id: "not-an-id", site_id: RIVERSIDE }),
        }));

        // Reads consumed the write's headroom: four requests in between (3 reads + this write).
        expect(writeB.remaining, "reads must be visibly spending the write budget").toBeLessThan(writeA.remaining - 1);

        /*
         * And the arithmetic proves it outright. With one shared count `n`:
         *     read.remaining  = 600 - n
         *     write.remaining = 120 - (n + 1)      // the write is the next request
         * so the difference is exactly (600 - 120) + 1. Separate counters could not produce a
         * difference that tracks the LIMIT gap.
         */
        const readWriteGap = RATE_LIMIT_POLICY.authenticatedRead.limit - RATE_LIMIT_POLICY.authenticatedWrite.limit;
        expect(readA.remaining - writeA.remaining).toBe(readWriteGap + 1);
    }, 120_000);

    it("the documented numbers are the implemented numbers", () => {
        expect(RATE_LIMIT_POLICY.tokenExchange).toEqual({ limit: 30, windowSeconds: 60 });
        expect(RATE_LIMIT_POLICY.authenticatedRead).toEqual({ limit: 600, windowSeconds: 60 });
        expect(RATE_LIMIT_POLICY.authenticatedWrite).toEqual({ limit: 120, windowSeconds: 60 });
    });
});
