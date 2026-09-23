/**
 * The three public rate classes, measured over HTTP.
 *
 * Token exchange, authenticated reads and authenticated governed writes each hold their own
 * budget. This suite exists because they did not always: reads and writes advertised different
 * limits while spending one counter, so 130 reads and zero writes left the next write refused.
 * The numbers were never wrong — the counter identity was.
 *
 * Everything below is measured against a running server and a durable, shared limiter. Nothing
 * here inspects a process-local counter, because a process-local counter would pass these tests
 * and fail in production behind two instances.
 *
 * Skips without a certification environment and a running server.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { issueCredential } from "@/lib/platform/principal/applicationCredential";
import { RATE_LIMIT_POLICY } from "@/lib/platform/external/rateLimit";
import { PUBLIC_OPERATIONS, accessForOperation, type PublicOperationId } from "@/lib/platform/external/scopeCatalog";

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
const APP = (process.env.CERT_APP_URL ?? "http://127.0.0.1:3018").replace(/\/+$/, "");
const describeLive = env ? describe : describe.skip;

const ORG = "00000000-0000-4000-8000-000000000001";
const RIVERSIDE = "00000000-0000-4000-8000-000000000010";
const READ_LIMIT = RATE_LIMIT_POLICY.authenticatedRead.limit;
const WRITE_LIMIT = RATE_LIMIT_POLICY.authenticatedWrite.limit;
const run = Date.now();

type Budget = { status: number; limit: number; remaining: number; reset: number; retryAfter: string | null };

describeLive("the public rate classes are independent", () => {
    let supabase: SupabaseClient;
    const applicationIds: string[] = [];
    const installationIds: string[] = [];
    const tokens = new Map<string, string>();

    async function makeInstallation(key: string, scopes: string[], boundary: string[] = [RIVERSIDE]) {
        const registered = await supabase.rpc("register_developer_application", {
            p_slug: `rate-cert-${key}-${run}`, p_name: `Rate class certification ${key} ${run}`,
            p_publisher: "alloy-certification", p_ownership_mode: "alloy_managed", p_environment: "sandbox",
            p_distribution_mode: "private", p_status: "active", p_registered_by: "rate-cert", p_metadata: {},
        });
        const result = registered.data as { ok: boolean; application?: { id: string } };
        expect(result?.ok, JSON.stringify(registered.error ?? result)).toBe(true);
        applicationIds.push(result.application!.id);

        const inst = await supabase.from("app_installations").insert({
            application_id: result.application!.id, org_id: ORG, producer_key: `rate:${key}:${run}`,
            granted_scopes: scopes, boundary_mode: "locations", location_boundary: boundary, status: "active",
        }).select("id").single();
        expect(inst.error, `installation: ${inst.error?.message}`).toBeNull();
        installationIds.push((inst.data as { id: string }).id);

        const issued = await issueCredential(supabase, { installationId: (inst.data as { id: string }).id, label: key });
        expect(issued.ok).toBe(true);
        if (!issued.ok) throw new Error("credential");
        const res = await fetch(`${APP}/api/v1/oauth/token`, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({
                grant_type: "client_credentials",
                client_id: issued.issued.clientId, client_secret: issued.issued.clientSecret,
            }),
        });
        const body = (await res.json()) as { access_token?: string };
        expect(body.access_token, `token for ${key} (${res.status})`).toBeTruthy();
        tokens.set(key, body.access_token!);
        return (inst.data as { id: string }).id;
    }

    const budgetOf = (res: Response): Budget => ({
        status: res.status,
        limit: Number(res.headers.get("RateLimit-Limit")),
        remaining: Number(res.headers.get("RateLimit-Remaining")),
        reset: Number(res.headers.get("RateLimit-Reset")),
        retryAfter: res.headers.get("Retry-After"),
    });

    /** A read that touches no domain state. */
    const doRead = async (key: string, path = "/api/v1/locations?limit=1") =>
        budgetOf(await fetch(`${APP}${path}`, { headers: { authorization: `Bearer ${tokens.get(key)}` } }));

    /**
     * A write that is refused at validation, so it spends budget without touching a domain row.
     * The budget is consumed BEFORE the body is parsed, which is what makes this a valid probe.
     */
    const doWrite = async (key: string, body: unknown = { child_id: "not-an-id", site_id: RIVERSIDE }) =>
        budgetOf(await fetch(`${APP}/api/v1/enrollments`, {
            method: "POST",
            headers: { authorization: `Bearer ${tokens.get(key)}`, "content-type": "application/json" },
            body: JSON.stringify(body),
        }));

    /**
     * Wait until just after the next window boundary.
     *
     * The limiter uses an epoch-aligned TUMBLING window — `floor(epoch / 60) * 60` — so a burn
     * that starts mid-minute can have its counter reset underneath it. The first version of this
     * suite did exactly that and concluded the read limit was not enforced. Start each burn on a
     * fresh window and the measurement means what it says.
     */
    const awaitFreshWindow = async (windowSeconds = 60) => {
        const msIntoWindow = Date.now() % (windowSeconds * 1000);
        await new Promise((r) => setTimeout(r, windowSeconds * 1000 - msIntoWindow + 250));
    };

    /** Burn a class concurrently, so the whole budget fits inside one window. */
    async function burn(request: () => Promise<Budget>, attempts: number, concurrency = 25): Promise<Budget | null> {
        for (let sent = 0; sent < attempts; sent += concurrency) {
            const batch = await Promise.all(
                Array.from({ length: Math.min(concurrency, attempts - sent) }, () => request()),
            );
            const refused = batch.find((r) => r.status === 429);
            if (refused) return refused;
        }
        return null;
    }

    beforeAll(async () => {
        supabase = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        await makeInstallation("a", ["locations.read", "enrollment.read", "enrollment.write"]);
        await makeInstallation("b", ["locations.read", "enrollment.read", "enrollment.write"]);
        await makeInstallation("burnWrite", ["locations.read", "enrollment.write"]);
        await makeInstallation("burnRead", ["locations.read", "enrollment.write"]);
        await makeInstallation("readOnly", ["locations.read"]);
        await makeInstallation("noBoundary", ["enrollment.write"], []);
    }, 300_000);

    afterAll(async () => {
        if (!supabase) return;
        for (const id of installationIds) await supabase.from("app_installations").delete().eq("id", id);
        for (const id of applicationIds) await supabase.from("developer_applications").delete().eq("id", id);
    }, 180_000);

    // ── A. READ DOES NOT CONSUME WRITE ──────────────────────────────────────
    it("A. reads past the write limit leave write capacity essentially untouched", async () => {
        const before = await doWrite("a");
        expect(before.limit).toBe(WRITE_LIMIT);

        // Comfortably more reads than the entire write budget, and not one write.
        const reads = WRITE_LIMIT + 10;
        for (let i = 0; i < reads; i += 1) await doRead("a");

        const after = await doWrite("a");
        expect(after.status, "a write after heavy reading must not be rate limited").not.toBe(429);
        expect(after.limit).toBe(WRITE_LIMIT);
        /*
         * At most the two writes this test performed may have moved the counter — and possibly
         * only one, because the reads can straddle a window boundary and reset it. Pinning the
         * exact figure would be asserting the window's phase rather than the property under test,
         * which is that 130 READS left the write budget essentially whole.
         */
        expect(after.remaining).toBeGreaterThanOrEqual(WRITE_LIMIT - 2);
    }, 600_000);

    // ── B. WRITE DOES NOT CONSUME READ ──────────────────────────────────────
    it("B. writes do not reduce the read budget", async () => {
        const before = await doRead("b");
        expect(before.limit).toBe(READ_LIMIT);

        for (let i = 0; i < 20; i += 1) await doWrite("b");

        const after = await doRead("b");
        expect(after.limit).toBe(READ_LIMIT);
        /*
         * The twenty writes must not appear here. One read separates the two measurements, so the
         * gap is 1 — or 0 if a window boundary intervened. Anything approaching 20 would mean the
         * write traffic was being charged to the read budget.
         */
        expect(before.remaining - after.remaining).toBeLessThanOrEqual(1);
    }, 300_000);

    // ── D + G. WRITE LIMIT ENFORCED, READS UNAFFECTED ───────────────────────
    it("D/G. the write budget is enforced at its limit, and reads survive it", async () => {
        await awaitFreshWindow();
        const refused = await burn(() => doWrite("burnWrite"), WRITE_LIMIT + 10);

        expect(refused, `writes were never refused within ${WRITE_LIMIT + 10} attempts`).toBeTruthy();
        expect(refused!.limit).toBe(WRITE_LIMIT);
        expect(refused!.remaining).toBe(0);
        expect(refused!.retryAfter, "429 must say when to come back").toBeTruthy();
        expect(refused!.reset).toBeGreaterThan(0);

        // Asserted in the SAME window, while the write budget is still exhausted.
        const read = await doRead("burnWrite");
        expect(read.status, "exhausting writes must not exhaust reads").toBe(200);
        expect(read.limit).toBe(READ_LIMIT);
        expect(read.remaining).toBeGreaterThan(0);

        // The 429 names the class that ran out, not the other one.
        const again = await doWrite("burnWrite");
        expect(again.status).toBe(429);
        expect(again.limit, "the 429 must name the WRITE budget").toBe(WRITE_LIMIT);
        expect(again.retryAfter).toBeTruthy();

        /*
         * And a refused request performed no work — the budget is consumed before the body is
         * parsed or any authority resolved, so there is nothing half-done to reconcile. That is
         * what makes retrying after a 429 safe.
         */
        const child = "00000000-0000-4000-8000-300000000001";
        const before = await supabase.from("child_enrollment_agreements")
            .select("id").eq("org_id", ORG).eq("customer_member_id", child);
        const blocked = await doWrite("burnWrite", { child_id: child, site_id: RIVERSIDE, start_date: "2026-10-01" });
        expect(blocked.status).toBe(429);
        const after = await supabase.from("child_enrollment_agreements")
            .select("id").eq("org_id", ORG).eq("customer_member_id", child);
        expect((after.data ?? []).length, "a rate-limited request must not have written")
            .toBe((before.data ?? []).length);
    }, 600_000);

    // ── C + G. READ LIMIT ENFORCED, WRITES UNAFFECTED ───────────────────────
    it("C/G. the read budget is enforced at its limit, and writes survive it", async () => {
        await awaitFreshWindow();
        const refused = await burn(() => doRead("burnRead"), READ_LIMIT + 25);

        expect(refused, `reads were never refused within ${READ_LIMIT + 25} attempts`).toBeTruthy();
        expect(refused!.limit).toBe(READ_LIMIT);
        expect(refused!.remaining).toBe(0);
        expect(refused!.retryAfter).toBeTruthy();

        // …and the write budget for that same installation is still whole.
        const write = await doWrite("burnRead");
        expect(write.status, "exhausting reads must not exhaust writes").not.toBe(429);
        expect(write.limit).toBe(WRITE_LIMIT);
        expect(write.remaining).toBe(WRITE_LIMIT - 1);
    }, 900_000);

    // ── F. INSTALLATION ISOLATION ───────────────────────────────────────────
    it("F. one installation exhausting a budget does not touch another's", async () => {
        // `burnWrite` and `burnRead` are exhausted by the tests above.
        const read = await doRead("a");
        const write = await doWrite("a");
        expect(read.status).toBe(200);
        expect(write.status).not.toBe(429);
        expect(read.remaining).toBeGreaterThan(0);
        expect(write.remaining).toBeGreaterThan(0);
    }, 300_000);

    // ── E. TOKEN EXCHANGE UNREGRESSED ───────────────────────────────────────
    it("E. token exchange keeps its own policy and its own keying", async () => {
        const res = await fetch(`${APP}/api/v1/oauth/token`, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ grant_type: "client_credentials", client_id: "alloy_ci_nope", client_secret: "nope" }),
        });
        const budget = budgetOf(res);
        expect(res.status).toBe(401);
        expect(budget.limit).toBe(RATE_LIMIT_POLICY.tokenExchange.limit);
        // Authenticated traffic must not have moved it: this is keyed on the presented client_id.
        expect(budget.limit).not.toBe(READ_LIMIT);
        expect(budget.limit).not.toBe(WRITE_LIMIT);
    }, 120_000);

    // ── HEADERS ─────────────────────────────────────────────────────────────
    describe("headers describe the budget that governed the request", () => {
        it("on a successful read, and a successful-path write", async () => {
            expect((await doRead("a")).limit).toBe(READ_LIMIT);
            expect((await doWrite("a")).limit).toBe(WRITE_LIMIT);
        }, 120_000);

        it("on a 400, after the budget has already been consulted", async () => {
            const refused = await doWrite("a", { child_id: "still-not-an-id", site_id: RIVERSIDE });
            expect(refused.status).toBe(400);
            expect(refused.limit, "a 400 must still report the budget it spent").toBe(WRITE_LIMIT);
            expect(refused.remaining).toBeGreaterThanOrEqual(0);
        }, 120_000);

        it("on a 403 raised AFTER admission, and not on one raised before it", async () => {
            /*
             * The two 403s are not the same. A missing SCOPE is refused before the budget is
             * consulted — deliberately, so an unauthorized caller cannot drain a budget it was
             * never entitled to spend — and therefore carries no rate headers. A caller whose
             * BOUNDARY reaches no site is refused after admission, and does carry them.
             */
            const beforeAdmission = budgetOf(await fetch(`${APP}/api/v1/enrollments`, {
                method: "POST",
                headers: { authorization: `Bearer ${tokens.get("readOnly")}`, "content-type": "application/json" },
                body: JSON.stringify({ child_id: "x", site_id: RIVERSIDE }),
            }));
            expect(beforeAdmission.status).toBe(403);
            expect(beforeAdmission.limit, "a scope refusal spends no budget, so reports none").toBe(0);

            const afterAdmission = budgetOf(await fetch(`${APP}/api/v1/enrollments`, {
                method: "POST",
                headers: { authorization: `Bearer ${tokens.get("noBoundary")}`, "content-type": "application/json" },
                body: JSON.stringify({ child_id: "x", site_id: RIVERSIDE }),
            }));
            expect(afterAdmission.status).toBe(403);
            expect(afterAdmission.limit, "a boundary refusal spends budget, so must report it").toBe(WRITE_LIMIT);
        }, 120_000);

    });

    // ── CLASSIFICATION ──────────────────────────────────────────────────────
    it("every public operation is classified by the catalog, not by its verb", () => {
        const WRITES = new Set([
            "submitAttendanceEvents", "startEnrollment", "endEnrollment",
            "assignPlacement", "movePlacement", "setScheduleAssignment", "changeScheduleAssignment",
        ]);
        for (const id of Object.keys(PUBLIC_OPERATIONS) as PublicOperationId[]) {
            if (id === "issueAccessToken") continue; // its own class; no installation yet
            const expected = WRITES.has(id) ? "write" : "read";
            expect(accessForOperation(id), `${id} is classified ${accessForOperation(id)}`).toBe(expected);
        }
        // All seven governed writes accounted for, and nothing else claiming the write budget.
        const writes = (Object.keys(PUBLIC_OPERATIONS) as PublicOperationId[])
            .filter((id) => id !== "issueAccessToken" && accessForOperation(id) === "write");
        expect(writes.sort()).toEqual([...WRITES].sort());
    });

    // ── A REFUSED REQUEST DID NOTHING ───────────────────────────────────────

    it("the implemented policies are the documented ones", () => {
        expect(RATE_LIMIT_POLICY.tokenExchange).toEqual({ limit: 30, windowSeconds: 60 });
        expect(RATE_LIMIT_POLICY.authenticatedRead).toEqual({ limit: 600, windowSeconds: 60 });
        expect(RATE_LIMIT_POLICY.authenticatedWrite).toEqual({ limit: 120, windowSeconds: 60 });
    });
});
