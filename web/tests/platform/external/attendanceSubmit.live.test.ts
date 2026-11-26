/**
 * `POST /api/v1/attendance-events`, executed over HTTP against a running server.
 *
 * The first public write in Thread 7, certified against the canonical authority it delegates to
 * rather than against a mock of it. Everything here goes through a real listener, a real
 * `Authorization` header, real correlation rows and the real ingestion path.
 *
 * ── THESE FACTS ARE PERMANENT, AND THAT IS THE POINT ──
 *
 * `child_attendance_events` refuses DELETE: *"append-only: record a correction or reversal event
 * instead"*. A suite that certifies writing to a ledger therefore adds to it, and cannot tidy up
 * afterwards. Each run appends roughly a dozen facts for one certification child at one site,
 * every one carrying this run's producer key in its provenance, which is how they are identified
 * later. The installations and their correlation rows ARE removed; the facts they authored stay,
 * as the Director accepted for the boundary fixture.
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
const RIVERSIDE = "00000000-0000-4000-8000-000000000010";
const LAKESIDE = "00000000-0000-4000-8000-000000000011";
/** A child with an active enrollment at Riverside, and two Riverside rooms. */
const CERT_CHILD = "00000000-0000-4000-8000-000070000052";
const ROOM_A = "00000000-0000-4000-8000-000000000012";
const ROOM_B = "00000000-0000-4000-8000-000000000013";

const run = Date.now();
const EXT_CHILD = `cert-child-${run}`;
const EXT_ROOM_A = `cert-room-a-${run}`;
const EXT_ROOM_B = `cert-room-b-${run}`;
const evt = (name: string) => `cert-evt-${run}-${name}`;

type ItemOutcome = {
    external_event_id: string;
    outcome: "accepted" | "replayed" | "pending_mapping" | "conflict" | "rejected";
    attendance_event_id: string | null;
    code: string | null;
    message: string | null;
};
type SubmitBody = { results: ItemOutcome[] };
type ReadPage = { data: { id: string; entry_type: string; corrects_event_id: string | null; recorded_at: string }[]; next_cursor: string | null; sync_token: string | null };

describeLive("POST /api/v1/attendance-events, over the wire", () => {
    let supabase: SupabaseClient;
    const applicationIds: string[] = [];
    const installationIds: string[] = [];
    const creds = new Map<string, { clientId: string; secret: string }>();
    const tokens = new Map<string, string>();

    async function makeInstallation(
        key: string,
        scopes: string[],
        boundary: { mode: "org_wide" | "locations"; ids: string[] },
    ): Promise<string> {
        const registered = await supabase.rpc("register_developer_application", {
            p_slug: `attendance-write-cert-${key}-${run}`,
            p_name: `Attendance write certification ${key} ${run}`,
            p_publisher: "alloy-certification",
            p_ownership_mode: "alloy_managed",
            p_environment: "sandbox",
            p_distribution_mode: "private",
            p_status: "active",
            p_registered_by: "attendance-submit-cert",
            p_metadata: {},
        });
        const result = registered.data as { ok: boolean; application?: { id: string } };
        expect(result?.ok, JSON.stringify(registered.error ?? result)).toBe(true);
        const applicationId = result.application!.id;
        applicationIds.push(applicationId);

        const inst = await supabase.from("app_installations").insert({
            application_id: applicationId,
            org_id: ORG,
            producer_key: `attendance-write:${key}:${run}`,
            granted_scopes: scopes,
            boundary_mode: boundary.mode,
            location_boundary: boundary.ids,
            status: "active",
        }).select("id").single();
        expect(inst.error, `installation insert: ${inst.error?.message}`).toBeNull();
        const installationId = (inst.data as { id: string }).id;
        installationIds.push(installationId);

        const issued = await issueCredential(supabase, { installationId, label: `write cert ${key} ${run}` });
        expect(issued.ok, "credential issue").toBe(true);
        if (!issued.ok) throw new Error("credential issue failed");
        creds.set(key, { clientId: issued.issued.clientId, secret: issued.issued.clientSecret });
        return installationId;
    }

    /** Map one of the partner's identifiers to an Alloy resource, for one installation. */
    async function mapResource(
        installationId: string,
        resourceType: "child" | "location",
        externalId: string,
        alloyId: string,
    ) {
        const row: Record<string, unknown> = {
            installation_id: installationId,
            org_id: ORG,
            resource_type: resourceType,
            external_id: externalId,
            status: "active",
        };
        row[resourceType === "child" ? "child_customer_member_id" : "location_id"] = alloyId;
        const { error } = await supabase.from("integration_resource_refs").insert(row);
        expect(error, `map ${resourceType} ${externalId}: ${error?.message}`).toBeNull();
    }

    async function bearer(key: string): Promise<string> {
        const cached = tokens.get(key);
        if (cached) return cached;
        const c = creds.get(key)!;
        const res = await fetch(`${APP_URL}/api/v1/oauth/token`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ grant_type: "client_credentials", client_id: c.clientId, client_secret: c.secret }),
        });
        const body = (await res.json()) as { access_token?: string };
        expect(body.access_token, `token exchange for ${key} (status ${res.status})`).toBeTruthy();
        tokens.set(key, body.access_token!);
        return body.access_token!;
    }

    async function submit(key: string, events: Record<string, unknown>[]): Promise<Response> {
        return fetch(`${APP_URL}/api/v1/attendance-events`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${await bearer(key)}`,
            },
            body: JSON.stringify({ events }),
        });
    }

    async function submitOk(key: string, events: Record<string, unknown>[]): Promise<ItemOutcome[]> {
        const res = await submit(key, events);
        // Read the body ONCE: using it as the assertion message and then parsing it consumes the
        // stream twice, and the failure that produces hides the failure you were chasing.
        const text = await res.text();
        expect(res.status, text.slice(0, 400)).toBe(200);
        return (JSON.parse(text) as SubmitBody).results;
    }

    const readEvents = async (key: string, query: string): Promise<ReadPage> => {
        const res = await fetch(`${APP_URL}/api/v1/attendance-events?${query}`, {
            headers: { authorization: `Bearer ${await bearer(key)}` },
        });
        expect(res.status).toBe(200);
        return (await res.json()) as ReadPage;
    };

    const checkIn = (name: string, extra: Record<string, unknown> = {}) => ({
        external_event_id: evt(name),
        event_kind: "check_in",
        child_external_id: EXT_CHILD,
        room_external_id: EXT_ROOM_A,
        occurred_at: "2026-09-15T08:00:00Z",
        ...extra,
    });

    beforeAll(async () => {
        supabase = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        const writer = await makeInstallation("writer", ["attendance.write", "attendance.read"], { mode: "org_wide", ids: [] });
        await makeInstallation("readonly", ["attendance.read"], { mode: "org_wide", ids: [] });
        const elsewhere = await makeInstallation("elsewhere", ["attendance.write", "attendance.read"], { mode: "locations", ids: [LAKESIDE] });

        await mapResource(writer, "child", EXT_CHILD, CERT_CHILD);
        await mapResource(writer, "location", EXT_ROOM_A, ROOM_A);
        await mapResource(writer, "location", EXT_ROOM_B, ROOM_B);
        // The same Alloy child, mapped inside an installation that cannot reach its site.
        await mapResource(elsewhere, "child", EXT_CHILD, CERT_CHILD);
        await mapResource(elsewhere, "location", EXT_ROOM_A, ROOM_A);
    }, 180_000);

    afterAll(async () => {
        for (const id of installationIds) {
            await supabase.from("integration_resource_refs").delete().eq("installation_id", id);
            await supabase.from("app_credentials").delete().eq("installation_id", id);
            await supabase.from("app_installations").delete().eq("id", id);
        }
        for (const id of applicationIds) {
            await supabase.from("developer_applications").delete().eq("id", id);
        }
    }, 180_000);

    // ── AUTH ─────────────────────────────────────────────────────────────────
    it("refuses an unauthenticated submission", async () => {
        const res = await fetch(`${APP_URL}/api/v1/attendance-events`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ events: [checkIn("unauth")] }),
        });
        expect(res.status).toBe(401);
    });

    it("refuses a token that is not ours", async () => {
        const res = await fetch(`${APP_URL}/api/v1/attendance-events`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: "Bearer alloy_at_nope" },
            body: JSON.stringify({ events: [checkIn("badtoken")] }),
        });
        expect(res.status).toBe(401);
    });

    it("refuses the READ scope — reading attendance does not grant authoring it", async () => {
        const res = await submit("readonly", [checkIn("readonly")]);
        expect(res.status).toBe(403);
        expect(((await res.json()) as { error: { type: string } }).error.type).toBe("forbidden_scope");
    });

    it("refuses a malformed batch before any authority is spent", async () => {
        for (const body of [{ events: [] }, { events: [{ event_kind: "check_in" }] }, {}]) {
            const res = await fetch(`${APP_URL}/api/v1/attendance-events`, {
                method: "POST",
                headers: { "content-type": "application/json", authorization: `Bearer ${await bearer("writer")}` },
                body: JSON.stringify(body),
            });
            expect(res.status, JSON.stringify(body)).toBe(400);
        }
    });

    // ── WRITE ────────────────────────────────────────────────────────────────
    it("accepts an original fact and returns the canonical id", async () => {
        const [result] = await submitOk("writer", [checkIn("original")]);
        expect(result.outcome).toBe("accepted");
        expect(result.attendance_event_id).toBeTruthy();
        expect(result.code).toBeNull();
    });

    it("a replay returns the fact already recorded and creates nothing", async () => {
        const first = (await submitOk("writer", [checkIn("replay")]))[0];
        expect(first.outcome).toBe("accepted");

        const second = (await submitOk("writer", [checkIn("replay")]))[0];
        expect(second.outcome).toBe("replayed");
        expect(second.attendance_event_id).toBe(first.attendance_event_id);

        // And the ledger holds one fact, not two.
        const { count } = await supabase
            .from("child_attendance_events")
            .select("id", { count: "exact", head: true })
            .eq("id", first.attendance_event_id!);
        expect(count).toBe(1);
    });

    it("the same identity carrying different content is a conflict, not a second fact", async () => {
        await submitOk("writer", [checkIn("conflict")]);
        const [again] = await submitOk("writer", [checkIn("conflict", { occurred_at: "2026-09-15T09:30:00Z" })]);
        expect(again.outcome).toBe("conflict");
        expect(again.code).toBe("idempotency_conflict");
    });

    it("a batch is judged per item, and one refusal does not discard the rest", async () => {
        const results = await submitOk("writer", [
            checkIn("batch-good"),
            { ...checkIn("batch-unmapped"), child_external_id: `never-mapped-${run}` },
            { ...checkIn("batch-second"), room_external_id: EXT_ROOM_B },
        ]);
        expect(results).toHaveLength(3);
        expect(results[0].outcome).toBe("accepted");
        expect(results[1].outcome).toBe("pending_mapping");
        expect(results[1].code).toBe("unknown_external_id");
        expect(results[2].outcome).toBe("accepted");
    });

    it("an unmapped identifier is held, not invented", async () => {
        const [r] = await submitOk("writer", [{ ...checkIn("unmapped-room"), room_external_id: `no-such-room-${run}` }]);
        expect(r.outcome).toBe("pending_mapping");
        expect(r.attendance_event_id).toBeNull();
    });

    // ── CORRECTION / REVERSAL ────────────────────────────────────────────────
    it("a correction supersedes the fact it names, and both remain readable", async () => {
        const original = (await submitOk("writer", [checkIn("corr-original")]))[0];
        expect(original.outcome).toBe("accepted");

        const [correction] = await submitOk("writer", [{
            ...checkIn("corr-fix"),
            occurred_at: "2026-09-15T08:05:00Z",
            corrects_external_event_id: evt("corr-original"),
            correction_mode: "correction",
        }]);
        expect(correction.outcome).toBe("accepted");
        expect(correction.attendance_event_id).not.toBe(original.attendance_event_id);

        const { data } = await supabase
            .from("child_attendance_events")
            .select("id, entry_type, corrects_event_id")
            .eq("id", correction.attendance_event_id!)
            .single();
        expect((data as { entry_type: string }).entry_type).toBe("correction");
        expect((data as { corrects_event_id: string }).corrects_event_id).toBe(original.attendance_event_id);
    });

    it("a reversal voids the fact it names", async () => {
        const original = (await submitOk("writer", [checkIn("rev-original")]))[0];
        const [reversal] = await submitOk("writer", [{
            ...checkIn("rev-void"),
            corrects_external_event_id: evt("rev-original"),
            correction_mode: "reversal",
        }]);
        expect(reversal.outcome).toBe("accepted");

        const { data } = await supabase
            .from("child_attendance_events")
            .select("entry_type, corrects_event_id")
            .eq("id", reversal.attendance_event_id!)
            .single();
        expect((data as { entry_type: string }).entry_type).toBe("reversal");
        expect((data as { corrects_event_id: string }).corrects_event_id).toBe(original.attendance_event_id);
    });

    it("a correction naming an event Alloy never accepted is refused", async () => {
        const [r] = await submitOk("writer", [{
            ...checkIn("orphan-correction"),
            corrects_external_event_id: `never-submitted-${run}`,
            correction_mode: "correction",
        }]);
        expect(r.outcome).toBe("rejected");
        expect(r.code).toBe("unknown_correction_target");
        expect(r.attendance_event_id).toBeNull();
    });

    it("a correction may name an original earlier in the same batch", async () => {
        const results = await submitOk("writer", [
            checkIn("chain-a"),
            { ...checkIn("chain-b"), corrects_external_event_id: evt("chain-a"), correction_mode: "correction" },
        ]);
        expect(results[0].outcome).toBe("accepted");
        expect(results[1].outcome, "ordered application makes in-batch lineage possible").toBe("accepted");
    });

    // ── BOUNDARY ─────────────────────────────────────────────────────────────
    it("a mapped external id pointing outside the boundary is not a bypass", async () => {
        /*
         * `elsewhere` holds attendance.write and its OWN valid mapping to this child. The child's
         * enrollment is at Riverside, which its boundary does not reach — so authority is decided by
         * the child's site, not by the caller having produced a resolvable identifier.
         */
        const [r] = await submitOk("elsewhere", [{
            external_event_id: evt("bypass-attempt"),
            event_kind: "check_in",
            child_external_id: EXT_CHILD,
            room_external_id: EXT_ROOM_A,
            occurred_at: "2026-09-15T08:00:00Z",
        }]);
        expect(r.outcome).toBe("rejected");
        expect(r.code).toBe("location_not_authorized");
        expect(r.attendance_event_id).toBeNull();
    });

    it("an external id from another installation means nothing here", async () => {
        const [r] = await submitOk("elsewhere", [{
            external_event_id: evt("cross-install"),
            event_kind: "absence",
            child_external_id: `cert-child-${run}-writer-only`,
            occurred_at: "2026-09-15T08:00:00Z",
        }]);
        expect(r.outcome).toBe("pending_mapping");
    });

    it("one installation cannot replay another's event identity", async () => {
        // `writer` already submitted this id. The same id from `elsewhere` is a different event.
        const [r] = await submitOk("elsewhere", [{
            external_event_id: evt("original"),
            event_kind: "absence",
            child_external_id: EXT_CHILD,
            occurred_at: "2026-09-15T08:00:00Z",
        }]);
        expect(r.outcome, "not a replay of the other installation's fact").not.toBe("replayed");
    });

    // ── CONCURRENCY ──────────────────────────────────────────────────────────
    it("simultaneous identical submissions converge on one fact", async () => {
        const event = checkIn("concurrent");
        const [a, b] = await Promise.all([submitOk("writer", [event]), submitOk("writer", [event])]);
        /*
         * ONE FACT, AND NEITHER CALLER TOLD OTHERWISE.
         *
         * Whoever loses the race may truthfully answer either way: `replayed` if the winner had
         * already finished, or `accepted` if both were still in flight and the race-free canonical
         * write converged them onto one fact. What must never happen is a refusal — that is what a
         * partner would alarm on — or two different ids, which would mean two facts.
         */
        for (const outcome of [a[0].outcome, b[0].outcome]) {
            expect(["accepted", "replayed"]).toContain(outcome);
        }
        expect(a[0].attendance_event_id).toBe(b[0].attendance_event_id);
        expect(a[0].attendance_event_id).toBeTruthy();
    });

    it("independent simultaneous submissions both commit", async () => {
        const [a, b] = await Promise.all([
            submitOk("writer", [checkIn("par-a")]),
            submitOk("writer", [checkIn("par-b")]),
        ]);
        expect(a[0].outcome).toBe("accepted");
        expect(b[0].outcome).toBe("accepted");
        expect(a[0].attendance_event_id).not.toBe(b[0].attendance_event_id);
    });

    // ── CONVERGENCE ──────────────────────────────────────────────────────────
    it("a submitted fact is immediately readable, and an incremental pass picks it up", async () => {
        /*
         * Read against a watermark, not the head of the collection. Facts are ordered by when Alloy
         * recorded them, so a new one is at the END of a long history — a first page would not
         * contain it, and a test that looked there would be measuring the page size.
         */
        const watermark = new Date(Date.now() - 120_000).toISOString();

        const [written] = await submitOk("writer", [checkIn("convergence")]);
        expect(written.outcome).toBe("accepted");

        const fresh = await readEvents("writer", `limit=200&updated_since=${encodeURIComponent(watermark)}`);
        expect(fresh.data.map((r) => r.id), "readable immediately").toContain(written.attendance_event_id);

        /*
         * Checkpoint on the fact just written, not on the tail of the collection.
         *
         * The standing boundary fixture is recorded at year-2030 instants, so it sorts after
         * everything real — a token taken from the last row of a page is a position in the future,
         * and nothing follows it. The honest checkpoint for "did my write land" is the write's own
         * `recorded_at`, which slice 7.2 made exact to the microsecond.
         */
        const writtenAt = fresh.data.find((r) => r.id === written.attendance_event_id)!.recorded_at;

        const [later] = await submitOk("writer", [checkIn("convergence-2")]);
        expect(later.outcome).toBe("accepted");

        const resumed = await readEvents("writer", `limit=200&updated_since=${encodeURIComponent(writtenAt)}`);
        expect(resumed.data.map((r) => r.id), "an incremental consumer sees the new fact").toContain(later.attendance_event_id);
        expect(resumed.data.map((r) => r.id), "and is not re-sent what it already had").not.toContain(written.attendance_event_id);
    });

    it("a correction is visible in the read history with its lineage", async () => {
        const original = (await submitOk("writer", [checkIn("read-orig")]))[0];
        const correction = (await submitOk("writer", [{
            ...checkIn("read-corr"),
            corrects_external_event_id: evt("read-orig"),
            correction_mode: "correction",
        }]))[0];

        const page = await readEvents("writer", `limit=200&updated_since=${encodeURIComponent(new Date(Date.now() - 120_000).toISOString())}`);
        const seenCorrection = page.data.find((r) => r.id === correction.attendance_event_id);
        expect(seenCorrection).toBeTruthy();
        expect(seenCorrection!.entry_type).toBe("correction");
        expect(seenCorrection!.corrects_event_id).toBe(original.attendance_event_id);
    });

    // ── RATE LIMIT + REGRESSION ──────────────────────────────────────────────
    it("spends the authenticated-write budget, not the read budget", async () => {
        const res = await submit("writer", [checkIn("ratelimit")]);
        expect(res.status).toBe(200);
        expect(res.headers.get("RateLimit-Limit"), "the platform write class").toBe("120");
        expect(res.headers.get("X-Request-Id")).toBeTruthy();

        // A batch spends ONE unit, and reads keep their own budget.
        const read = await fetch(`${APP_URL}/api/v1/attendance-events?limit=1`, {
            headers: { authorization: `Bearer ${await bearer("writer")}` },
        });
        expect(read.headers.get("RateLimit-Limit")).toBe("600");
    });

    it("the existing operations do not regress, and scopes still bind", async () => {
        const token = await bearer("writer");
        // Context needs no scope; attendance.read is granted to this installation.
        for (const path of ["/api/v1/context", "/api/v1/attendance-events?limit=3"]) {
            const res = await fetch(`${APP_URL}${path}`, { headers: { authorization: `Bearer ${token}` } });
            expect(res.status, path).toBe(200);
        }
        // And a scope this installation was NOT granted is still refused — adding a write did not
        // widen anything. `writer` holds attendance.read and attendance.write, not locations.read.
        const locations = await fetch(`${APP_URL}/api/v1/locations?limit=3`, {
            headers: { authorization: `Bearer ${token}` },
        });
        expect(locations.status, "locations.read was never granted").toBe(403);
    });

    it("no internal detail reaches a partner on any refusal", async () => {
        const results = await submitOk("writer", [
            { ...checkIn("leak-check"), room_external_id: undefined },
        ]);
        const serialized = JSON.stringify(results);
        for (const forbidden of ["child_attendance_events", "check constraint", "relation", "integration_resource_refs", "supabase"]) {
            expect(serialized, forbidden).not.toContain(forbidden);
        }
    });
});
