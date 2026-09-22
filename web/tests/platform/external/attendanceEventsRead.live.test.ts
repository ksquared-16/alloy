/**
 * `GET /api/v1/attendance-events`, executed over HTTP against a running server.
 *
 * The sibling of `publicApiQuickstart.live.test.ts`, and deliberately in its style: the same
 * reason applies. A handler-level test proves the contract as written; only a real listener with a
 * real `Authorization` header proves the contract as SERVED, and the boundary is the part where
 * being wrong is expensive.
 *
 * WHAT THE FIXTURE PROVES. Three installations are created here with the service role and removed
 * afterwards — an org-wide one that may read, a restricted one bound to a site with no attendance
 * data, and one holding the WRITE scope but not the read. The certification organization already
 * holds real attendance facts at one site, including corrections and a reversal, so the boundary
 * cases are measured against data nobody wrote for this test.
 *
 * Skips without a certification environment and a running server.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { issueCredential } from "@/lib/platform/principal/applicationCredential";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = {
        url: process.env.CERT_SUPABASE_URL ?? "",
        serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "",
    };
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
/** The site the certification organization's attendance facts live at. */
const RIVERSIDE = "00000000-0000-4000-8000-000000000010";
/** A real sibling site with no attendance facts — the boundary's negative case. */
const LAKESIDE = "00000000-0000-4000-8000-000000000011";
const run = Date.now();

type PublicEvent = {
    id: string;
    child_id: string;
    child_external_id: string | null;
    site_id: string;
    event_kind: string;
    entry_type: string;
    corrects_event_id: string | null;
    event_at: string;
    service_date: string;
    actor_type: string;
    source: string;
    recorded_at: string;
};
type Page = { data: PublicEvent[]; next_cursor: string | null; sync_token: string | null };

describeLive("GET /api/v1/attendance-events, over the wire", () => {
    let supabase: SupabaseClient;
    const applicationIds: string[] = [];
    const installationIds: string[] = [];
    const creds = new Map<string, { clientId: string; secret: string }>();

    async function makeInstallation(
        key: string,
        scopes: string[],
        boundary: { mode: "org_wide" | "locations"; ids: string[] },
    ) {
        const registered = await supabase.rpc("register_developer_application", {
            p_slug: `attendance-read-cert-${key}-${run}`,
            p_name: `Attendance read certification ${key} ${run}`,
            p_publisher: "alloy-certification",
            p_ownership_mode: "alloy_managed",
            p_environment: "sandbox",
            p_distribution_mode: "private",
            p_status: "active",
            p_registered_by: "attendance-events-read-cert",
            p_metadata: {},
        });
        const result = registered.data as { ok: boolean; application?: { id: string } };
        expect(result?.ok, JSON.stringify(registered.error ?? result)).toBe(true);
        const applicationId = result.application!.id;
        applicationIds.push(applicationId);

        const inst = await supabase
            .from("app_installations")
            .insert({
                application_id: applicationId,
                org_id: ORG,
                producer_key: `attendance-read:${key}:${run}`,
                granted_scopes: scopes,
                boundary_mode: boundary.mode,
                location_boundary: boundary.ids,
                status: "active",
            })
            .select("id")
            .single();
        expect(inst.error, `installation insert: ${inst.error?.message}`).toBeNull();
        const installationId = (inst.data as { id: string }).id;
        installationIds.push(installationId);

        const issued = await issueCredential(supabase, {
            installationId,
            label: `attendance read ${key} ${run}`,
        });
        expect(issued.ok, "credential issue").toBe(true);
        if (!issued.ok) throw new Error("credential issue failed");
        creds.set(key, { clientId: issued.issued.clientId, secret: issued.issued.clientSecret });
        return installationId;
    }

    async function bearer(key: string): Promise<string> {
        const c = creds.get(key)!;
        const res = await fetch(`${APP_URL}/api/v1/oauth/token`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                grant_type: "client_credentials",
                client_id: c.clientId,
                client_secret: c.secret,
            }),
        });
        const body = (await res.json()) as { access_token: string };
        return body.access_token;
    }

    const get = (path: string, accessToken?: string) =>
        fetch(`${APP_URL}${path}`, {
            headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
        });

    beforeAll(async () => {
        supabase = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        await makeInstallation("reader", ["context.read", "locations.read", "attendance.read"], {
            mode: "org_wide",
            ids: [],
        });
        await makeInstallation("elsewhere", ["attendance.read"], { mode: "locations", ids: [LAKESIDE] });
        await makeInstallation("writer", ["attendance.write"], { mode: "org_wide", ids: [] });
    }, 120_000);

    afterAll(async () => {
        for (const id of installationIds) {
            await supabase.from("app_credentials").delete().eq("installation_id", id);
            await supabase.from("app_installations").delete().eq("id", id);
        }
        for (const id of applicationIds) {
            await supabase.from("developer_applications").delete().eq("id", id);
        }
    }, 120_000);

    // ── admission ────────────────────────────────────────────────────────────
    it("refuses an unauthenticated request", async () => {
        const res = await get("/api/v1/attendance-events");
        expect(res.status).toBe(401);
        const body = (await res.json()) as { error: { type: string } };
        expect(body.error.type).toBe("unauthenticated");
    });

    it("refuses a token that is not one of ours", async () => {
        const res = await get("/api/v1/attendance-events", "alloy_at_not_a_real_token_value_here");
        expect(res.status).toBe(401);
    });

    it("refuses the WRITE scope — holding attendance.write does not grant reading", async () => {
        const res = await get("/api/v1/attendance-events", await bearer("writer"));
        expect(res.status).toBe(403);
        const body = (await res.json()) as { error: { type: string } };
        expect(body.error.type).toBe("forbidden_scope");
    });

    it("accepts the read scope", async () => {
        const res = await get("/api/v1/attendance-events?limit=5", await bearer("reader"));
        expect(res.status).toBe(200);
        const page = (await res.json()) as Page;
        expect(page.data.length).toBeGreaterThan(0);
        expect(page.data.length).toBeLessThanOrEqual(5);
    });

    // ── boundary ─────────────────────────────────────────────────────────────
    it("an installation bound to a site with no facts reads nothing, and is not told why", async () => {
        const res = await get("/api/v1/attendance-events", await bearer("elsewhere"));
        expect(res.status).toBe(200);
        const page = (await res.json()) as Page;
        expect(page.data).toEqual([]);
        expect(page.next_cursor).toBeNull();
    });

    it("a site filter naming a site outside the boundary narrows to nothing rather than widening", async () => {
        const res = await get(
            `/api/v1/attendance-events?site_id=${RIVERSIDE}`,
            await bearer("elsewhere"),
        );
        // 200 and empty, not 403: a refusal would confirm the site exists.
        expect(res.status).toBe(200);
        expect(((await res.json()) as Page).data).toEqual([]);
    });

    it("every row returned is inside the caller's organization and boundary", async () => {
        const page = (await (await get("/api/v1/attendance-events?limit=200", await bearer("reader"))).json()) as Page;
        expect(page.data.length).toBeGreaterThan(0);
        for (const row of page.data) {
            expect(row.site_id).toBe(RIVERSIDE);
        }
    });

    // ── representation ───────────────────────────────────────────────────────
    it("publishes the allow-list and nothing else", async () => {
        const page = (await (await get("/api/v1/attendance-events?limit=1", await bearer("reader"))).json()) as Page;
        const [row] = page.data;
        expect(Object.keys(row).sort()).toEqual([
            "actor_type", "child_external_id", "child_id", "corrects_event_id", "entry_type",
            "event_at", "event_kind", "from_room_id", "id", "recorded_at", "room_id",
            "service_date", "site_id", "source", "to_room_id",
        ]);
    });

    it("leaks no internal field, no named actor and no absence reason", async () => {
        const raw = await (await get("/api/v1/attendance-events?limit=200", await bearer("reader"))).text();
        for (const forbidden of [
            "org_id", "enrollment_agreement_id", "actor_user_id", "actor_person_id",
            "actor_label", "source_key", "reason_key", "metadata", "created_by", "note",
            "illness", "medical_appointment",
        ]) {
            expect(raw, forbidden).not.toContain(forbidden);
        }
    });

    it("corrections and reversals are visible as facts that name what they supersede", async () => {
        const page = (await (await get("/api/v1/attendance-events?limit=200", await bearer("reader"))).json()) as Page;
        const superseding = page.data.filter((r) => r.entry_type !== "original");
        expect(superseding.length, "the certification data carries corrections").toBeGreaterThan(0);
        for (const row of superseding) {
            expect(row.corrects_event_id, `${row.entry_type} names its target`).toBeTruthy();
        }
    });

    // ── collection and checkpoint ────────────────────────────────────────────
    it("pages deterministically, with no duplicate and no gap", async () => {
        const seen: string[] = [];
        let cursor: string | null = null;
        for (let i = 0; i < 12; i += 1) {
            const url: string = `/api/v1/attendance-events?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
            const page = (await (await get(url, await bearer("reader"))).json()) as Page;
            seen.push(...page.data.map((r) => r.id));
            cursor = page.next_cursor;
            if (!cursor) break;
        }
        expect(seen.length).toBeGreaterThan(25);
        expect(new Set(seen).size, "no row appeared on two pages").toBe(seen.length);

        const straight = (await (await get("/api/v1/attendance-events?limit=200", await bearer("reader"))).json()) as Page;
        expect(seen.slice(0, straight.data.length)).toEqual(straight.data.map((r) => r.id));
    });

    it("orders by the recording time, ascending, so a late correction cannot be missed", async () => {
        const page = (await (await get("/api/v1/attendance-events?limit=200", await bearer("reader"))).json()) as Page;
        const recorded = page.data.map((r) => r.recorded_at);
        expect([...recorded].sort()).toEqual(recorded);
    });

    it("a cursor cannot cross an authority boundary", async () => {
        // A cursor minted by an org-wide reader, replayed by a restricted installation.
        const first = (await (await get("/api/v1/attendance-events?limit=1", await bearer("reader"))).json()) as Page;
        expect(first.next_cursor).toBeTruthy();
        const res = await get(
            `/api/v1/attendance-events?cursor=${encodeURIComponent(first.next_cursor!)}`,
            await bearer("elsewhere"),
        );
        expect(res.status).toBe(200);
        expect(((await res.json()) as Page).data).toEqual([]);
    });

    it("updated_since advances on recorded_at and requires an offset", async () => {
        /*
         * Measured against a small window rather than the whole collection: the certification
         * organization holds more facts than one page returns, so "fewer rows after the watermark"
         * would compare two full pages and prove nothing. What must be true is exact — everything
         * at or before the watermark is gone, and everything returned is strictly after it.
         */
        const token = await bearer("reader");
        const head = (await (await get("/api/v1/attendance-events?limit=10", token)).json()) as Page;
        expect(head.data.length).toBe(10);
        const watermark = head.data[4].recorded_at;
        const excluded = new Set(
            head.data.filter((r) => r.recorded_at <= watermark).map((r) => r.id),
        );
        expect(excluded.size).toBeGreaterThan(0);

        const after = (await (await get(
            `/api/v1/attendance-events?limit=10&updated_since=${encodeURIComponent(watermark)}`,
            token,
        )).json()) as Page;

        /*
         * THE GUARANTEE IS "NO GAP", NOT "NO REPEAT" — and the difference is measured, not assumed.
         *
         * `created_at` is stored with microsecond precision; the watermark is normalized through a
         * JavaScript Date, which holds milliseconds. A fact recorded at .346845 therefore survives a
         * watermark of .346, and a consumer can see it twice. That is at-least-once delivery, which
         * is safe and is the direction this must err in: the unsafe failure would be a fact that
         * falls between two syncs and is never delivered at all, and none does.
         *
         * Cursors are exact — they carry the stored string, not a re-parsed instant — so paging has
         * no such overlap. Only the watermark is coarse, and partners deduplicate by `id`.
         */
        for (const row of after.data) {
            expect(row.recorded_at >= watermark.slice(0, 23), "never before the watermark").toBe(true);
        }
        const redelivered = after.data.filter((r) => excluded.has(r.id));
        expect(redelivered.length, "at most the boundary row repeats").toBeLessThanOrEqual(1);

        // No gap: every fact the head page reported after the watermark is present here.
        const expectedAfter = head.data.filter((r) => r.recorded_at > watermark).map((r) => r.id);
        for (const id of expectedAfter) {
            expect(after.data.map((r) => r.id), "a fact after the watermark was skipped").toContain(id);
        }

        const bare = await get("/api/v1/attendance-events?updated_since=2026-01-01T00:00:00", token);
        expect(bare.status).toBe(400);
    });

    // ── the exact sync law (7.2) ─────────────────────────────────────────────
    it("a microsecond watermark is honoured exactly — the boundary fact does not repeat", async () => {
        /*
         * The defect slice 7.1 measured and 7.2 removed. The watermark used to be rounded to
         * milliseconds on the way in, so asking for "everything after .346845" actually asked for
         * "everything after .346" and the boundary fact came back again. Certified here against a
         * real stored timestamp, which carries microseconds.
         */
        const token = await bearer("reader");
        const head = (await (await get("/api/v1/attendance-events?limit=5", token)).json()) as Page;
        const boundary = head.data[2];
        expect(boundary.recorded_at, "the fixture carries sub-millisecond precision").toMatch(/\.\d{4,}/);

        const after = (await (await get(
            `/api/v1/attendance-events?limit=10&updated_since=${encodeURIComponent(boundary.recorded_at)}`,
            token,
        )).json()) as Page;
        expect(after.data.map((r) => r.id)).not.toContain(boundary.id);
        for (const row of after.data) expect(row.recorded_at > boundary.recorded_at).toBe(true);
    });

    it("every page returns a sync token, including the last one", async () => {
        const token = await bearer("reader");
        const page = (await (await get("/api/v1/attendance-events?limit=5", token)).json()) as Page;
        expect(page.sync_token, "a page with rows always offers a checkpoint").toBeTruthy();
        expect(page.next_cursor).toBeTruthy();

        // Walk to the end and confirm the final page still hands back a checkpoint.
        let cursor: string | null = page.next_cursor;
        let last: Page = page;
        for (let i = 0; i < 40 && cursor; i += 1) {
            last = (await (await get(
                `/api/v1/attendance-events?limit=50&cursor=${encodeURIComponent(cursor)}`,
                token,
            )).json()) as Page;
            cursor = last.next_cursor;
        }
        expect(last.next_cursor, "we reached the end").toBeNull();
        expect(last.sync_token, "the last page is the one worth remembering").toBeTruthy();
    });

    it("since_token resumes exactly where a previous pass stopped, with no gap and no repeat", async () => {
        const token = await bearer("reader");
        const first = (await (await get("/api/v1/attendance-events?limit=7", token)).json()) as Page;
        expect(first.data).toHaveLength(7);

        const resumed = (await (await get(
            `/api/v1/attendance-events?limit=7&since_token=${encodeURIComponent(first.sync_token!)}`,
            token,
        )).json()) as Page;

        const firstIds = new Set(first.data.map((r) => r.id));
        for (const row of resumed.data) {
            expect(firstIds.has(row.id), "a fact was delivered twice across passes").toBe(false);
        }

        // And nothing fell between the two passes: a single 14-row read is the concatenation.
        const straight = (await (await get("/api/v1/attendance-events?limit=14", token)).json()) as Page;
        expect([...first.data, ...resumed.data].map((r) => r.id)).toEqual(straight.data.map((r) => r.id));
    });

    it("a sync token is a position, not a permission", async () => {
        const reader = (await (await get("/api/v1/attendance-events?limit=1", await bearer("reader"))).json()) as Page;
        const res = await get(
            `/api/v1/attendance-events?since_token=${encodeURIComponent(reader.sync_token!)}`,
            await bearer("elsewhere"),
        );
        expect(res.status).toBe(200);
        expect(((await res.json()) as Page).data).toEqual([]);
    });

    it("a malformed sync token is refused, not ignored", async () => {
        const res = await get("/api/v1/attendance-events?since_token=not-a-token", await bearer("reader"));
        expect(res.status).toBe(400);
        expect(((await res.json()) as { error: { code: string } }).error.code).toBe("invalid_since_token");
    });

    // ── filters ──────────────────────────────────────────────────────────────
    it("filters narrow and are validated for shape", async () => {
        const token = await bearer("reader");
        const all = (await (await get("/api/v1/attendance-events?limit=200", token)).json()) as Page;

        const checkIns = (await (await get("/api/v1/attendance-events?limit=200&event_kind=check_in", token)).json()) as Page;
        expect(checkIns.data.length).toBeGreaterThan(0);
        expect(checkIns.data.length).toBeLessThanOrEqual(all.data.length);
        for (const row of checkIns.data) expect(row.event_kind).toBe("check_in");

        const child = all.data[0].child_id;
        const byChild = (await (await get(`/api/v1/attendance-events?limit=200&child_id=${child}`, token)).json()) as Page;
        for (const row of byChild.data) expect(row.child_id).toBe(child);

        for (const bad of [
            "event_kind=not_a_kind",
            "child_id=not-a-uuid",
            "site_id=not-a-uuid",
            "service_date_from=03-02-2026",
        ]) {
            const res = await get(`/api/v1/attendance-events?${bad}`, token);
            expect(res.status, bad).toBe(400);
            expect(((await res.json()) as { error: { code: string } }).error.code).toContain("invalid_");
        }
    });

    it("a service-date window narrows to that window", async () => {
        const token = await bearer("reader");
        const all = (await (await get("/api/v1/attendance-events?limit=200", token)).json()) as Page;
        const day = all.data[0].service_date;
        const scoped = (await (await get(
            `/api/v1/attendance-events?limit=200&service_date_from=${day}&service_date_to=${day}`,
            token,
        )).json()) as Page;
        expect(scoped.data.length).toBeGreaterThan(0);
        for (const row of scoped.data) expect(row.service_date).toBe(day);
    });

    // ── the rest of the contract still holds ─────────────────────────────────
    it("the existing three operations do not regress", async () => {
        const token = await bearer("reader");
        expect((await get("/api/v1/context", token)).status).toBe(200);
        expect((await get("/api/v1/locations?limit=5", token)).status).toBe(200);

        const context = (await (await get("/api/v1/context", token)).json()) as { scopes?: string[] };
        expect(context.scopes).toContain("attendance.read");
    });

    it("carries the standard rate-limit and correlation headers", async () => {
        const res = await get("/api/v1/attendance-events?limit=1", await bearer("reader"));
        expect(res.headers.get("RateLimit-Limit")).toBe("600");
        expect(res.headers.get("X-Request-Id")).toBeTruthy();
    });
});
