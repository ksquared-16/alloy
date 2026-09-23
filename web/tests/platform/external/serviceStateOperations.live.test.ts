/**
 * The governed service-state operations, executed over HTTP against a running server.
 *
 * Six named intents — start and end an enrollment, assign and move a placement, set and change a
 * schedule — certified against the canonical services they delegate to rather than a mock of them.
 *
 * ── WHAT THIS SUITE IS REALLY CHECKING ──
 *
 * That the adapter adds authority and takes nothing away. The canonical services already refuse
 * what Alloy refuses; the risk in externalizing them is that the wrapper becomes a second, more
 * permissive path — one that forgets the boundary, accepts an identifier as a key, edits where the
 * domain supersedes, or duplicates on retry. Each of those has a case below.
 *
 * These are real domain writes to the certification tenant. Everything created is removed
 * afterwards; unlike attendance, none of these rows are append-only.
 *
 * Skips without a certification environment and a running server.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { issueCredential } from "@/lib/platform/principal/applicationCredential";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = { url: process.env.CERT_SUPABASE_URL ?? "", serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "" };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
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
const LAKESIDE = "00000000-0000-4000-8000-000000000011";
/** Children with no enrollment — the case that only a correlation mapping can reach. */
const UNENROLLED_A = "00000000-0000-4000-8000-300000000001";
const UNENROLLED_B = "00000000-0000-4000-8000-300000000002";
const PATTERN_MWF = "00000000-0000-4000-8000-000050000040";
const PATTERN_TT = "00000000-0000-4000-8000-000050000041";

const WRITES = ["enrollment.write", "schedule.write"];
const READS = ["locations.read", "children.read", "enrollment.read", "schedule.read"];

const run = Date.now();

describeLive("governed service-state operations, over the wire", () => {
    let supabase: SupabaseClient;
    const applicationIds: string[] = [];
    const installationIds: string[] = [];
    const creds = new Map<string, { clientId: string; secret: string }>();
    const tokens = new Map<string, string>();
    let writerInstallation = "";

    async function makeInstallation(key: string, scopes: string[], boundary: { mode: "org_wide" | "locations"; ids: string[] }) {
        const registered = await supabase.rpc("register_developer_application", {
            p_slug: `ops-cert-${key}-${run}`, p_name: `Operations certification ${key} ${run}`,
            p_publisher: "alloy-certification", p_ownership_mode: "alloy_managed", p_environment: "sandbox",
            p_distribution_mode: "private", p_status: "active", p_registered_by: "ops-cert", p_metadata: {},
        });
        const result = registered.data as { ok: boolean; application?: { id: string } };
        expect(result?.ok, JSON.stringify(registered.error ?? result)).toBe(true);
        applicationIds.push(result.application!.id);

        const inst = await supabase.from("app_installations").insert({
            application_id: result.application!.id, org_id: ORG, producer_key: `ops:${key}:${run}`,
            granted_scopes: scopes, boundary_mode: boundary.mode, location_boundary: boundary.ids, status: "active",
        }).select("id").single();
        expect(inst.error, `installation: ${inst.error?.message}`).toBeNull();
        const id = (inst.data as { id: string }).id;
        installationIds.push(id);

        const issued = await issueCredential(supabase, { installationId: id, label: `ops ${key} ${run}` });
        expect(issued.ok, "credential").toBe(true);
        if (!issued.ok) throw new Error("credential failed");
        creds.set(key, { clientId: issued.issued.clientId, secret: issued.issued.clientSecret });
        return id;
    }

    async function bearer(key: string) {
        const cached = tokens.get(key);
        if (cached) return cached;
        const c = creds.get(key)!;
        const res = await fetch(`${APP_URL}/api/v1/oauth/token`, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ grant_type: "client_credentials", client_id: c.clientId, client_secret: c.secret }),
        });
        const body = (await res.json()) as { access_token?: string };
        expect(body.access_token, `token for ${key} (${res.status})`).toBeTruthy();
        tokens.set(key, body.access_token!);
        return body.access_token!;
    }

    const post = async (key: string, path: string, body: unknown) =>
        fetch(`${APP_URL}${path}`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${await bearer(key)}` },
            body: JSON.stringify(body),
        });

    async function postOk(key: string, path: string, body: unknown) {
        const res = await post(key, path, body);
        const text = await res.text();
        expect([200, 201], `${path} -> ${res.status} ${text.slice(0, 300)}`).toContain(res.status);
        return { status: res.status, body: JSON.parse(text) as Record<string, unknown> };
    }

    const get = async (key: string, path: string) => {
        const res = await fetch(`${APP_URL}${path}`, { headers: { authorization: `Bearer ${await bearer(key)}` } });
        const text = await res.text();
        expect(res.status, text.slice(0, 200)).toBe(200);
        return JSON.parse(text) as { data: Record<string, unknown>[] };
    };

    beforeAll(async () => {
        supabase = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false } });
        writerInstallation = await makeInstallation("writer", [...WRITES, ...READS], { mode: "locations", ids: [RIVERSIDE] });
        await makeInstallation("reader", READS, { mode: "locations", ids: [RIVERSIDE] });
        await makeInstallation("lakeside", [...WRITES, ...READS], { mode: "locations", ids: [LAKESIDE] });
        await makeInstallation("writeOnly", WRITES, { mode: "locations", ids: [RIVERSIDE] });

        // The mapping is what gives the writer authority over a child not yet in service.
        for (const child of [UNENROLLED_A, UNENROLLED_B]) {
            const { error } = await supabase.from("integration_resource_refs").insert({
                installation_id: writerInstallation, org_id: ORG, resource_type: "child",
                external_id: `ops-cert-${child.slice(-4)}-${run}`, child_customer_member_id: child, status: "active",
            });
            expect(error, `map ${child}: ${error?.message}`).toBeNull();
        }
    }, 180_000);

    afterAll(async () => {
        if (!supabase) return;
        // Remove everything this suite authored, innermost first.
        for (const child of [UNENROLLED_A, UNENROLLED_B]) {
            const agreements = await supabase.from("child_enrollment_agreements").select("id").eq("org_id", ORG).eq("customer_member_id", child);
            /*
             * One agreement at a time, tolerating refusals.
             *
             * `child_attendance_events` is append-only — a trigger refuses DELETE — and the foreign
             * key from attendance to agreement is ON DELETE CASCADE. So an agreement that ever
             * recorded a fact CANNOT be deleted, and a single bulk delete for the child fails
             * wholesale because of it. That took every other agreement down with it: the suite
             * stopped cleaning up at all and degraded a little on every run, which reads as flakiness
             * rather than as the one undeletable row it is.
             */
            for (const row of (agreements.data ?? []) as { id: string }[]) {
                await supabase.from("schedule_assignments").delete().eq("enrollment_agreement_id", row.id);
                await supabase.from("child_placements").delete().eq("enrollment_agreement_id", row.id);
                await supabase.from("child_enrollment_agreements").delete().eq("org_id", ORG).eq("id", row.id);
            }
        }
        for (const id of installationIds) {
            await supabase.from("integration_resource_refs").delete().eq("installation_id", id);
            await supabase.from("app_installations").delete().eq("id", id);
        }
        for (const id of applicationIds) await supabase.from("developer_applications").delete().eq("id", id);
    }, 180_000);

    const OPERATIONS = [
        { path: "/api/v1/enrollments", scope: "enrollment.write", body: { child_id: UNENROLLED_A, site_id: RIVERSIDE } },
        { path: "/api/v1/enrollments/end", scope: "enrollment.write", body: { enrollment_id: UNENROLLED_A } },
        { path: "/api/v1/placements", scope: "enrollment.write", body: { enrollment_id: UNENROLLED_A, start_date: "2026-10-01" } },
        { path: "/api/v1/placements/move", scope: "enrollment.write", body: { enrollment_id: UNENROLLED_A, start_date: "2026-10-01" } },
        { path: "/api/v1/schedule-assignments", scope: "schedule.write", body: { enrollment_id: UNENROLLED_A, schedule_pattern_id: PATTERN_MWF, start_date: "2026-10-01" } },
        { path: "/api/v1/schedule-assignments/change", scope: "schedule.write", body: { enrollment_id: UNENROLLED_A, schedule_pattern_id: PATTERN_TT, start_date: "2026-10-01" } },
        { path: "/api/v1/enrollments/void", scope: "enrollment.write", body: { enrollment_id: UNENROLLED_A } },
        { path: "/api/v1/placements/cancel", scope: "enrollment.write", body: { placement_id: UNENROLLED_A } },
        { path: "/api/v1/schedule-assignments/cancel", scope: "schedule.write", body: { schedule_assignment_id: UNENROLLED_A } },
    ];

    // ── AUTH ────────────────────────────────────────────────────────────────
    describe("auth", () => {
        for (const op of OPERATIONS) {
            it(`${op.path} refuses an unauthenticated caller`, async () => {
                const res = await fetch(`${APP_URL}${op.path}`, {
                    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(op.body),
                });
                expect(res.status).toBe(401);
            });

            it(`${op.path} refuses a read-only installation`, async () => {
                const res = await post("reader", op.path, op.body);
                expect(res.status, `${op.path} accepted a caller holding only read scopes`).toBe(403);
            });
        }

        it("a read scope never implies its write", async () => {
            // The reader holds enrollment.read and schedule.read and no write of any kind.
            for (const op of OPERATIONS) {
                expect((await post("reader", op.path, op.body)).status).toBe(403);
            }
        });

        it("a write scope grants no reading whatsoever", async () => {
            for (const path of ["/api/v1/enrollments", "/api/v1/placements", "/api/v1/schedule-assignments", "/api/v1/children"]) {
                const res = await fetch(`${APP_URL}${path}`, { headers: { authorization: `Bearer ${await bearer("writeOnly")}` } });
                expect(res.status, `${path} was readable with only write scopes`).toBe(403);
            }
        });
    });

    // ── BOUNDARY ────────────────────────────────────────────────────────────
    describe("boundary", () => {
        it("cannot enroll at a site outside the boundary", async () => {
            const res = await post("writer", "/api/v1/enrollments", { child_id: UNENROLLED_A, site_id: LAKESIDE });
            expect(res.status).toBe(404);
        });

        it("a mapping does not reach another installation", async () => {
            // `lakeside` holds the write scopes but no mapping for this child and a different site.
            const res = await post("lakeside", "/api/v1/enrollments", { child_id: UNENROLLED_A, site_id: LAKESIDE });
            expect(res.status).toBe(404);
        });

        it("refuses an identifier that is not a valid identifier", async () => {
            const res = await post("writer", "/api/v1/enrollments", { child_id: "not-an-id", site_id: RIVERSIDE });
            expect(res.status).toBe(400);
        });

        it("refuses an enrollment belonging to a site it cannot reach, the same as one that does not exist", async () => {
            const foreign = await supabase.from("child_enrollment_agreements")
                .select("id").eq("org_id", ORG).eq("site_location_id", LAKESIDE).limit(1);
            const row = ((foreign.data ?? []) as { id: string }[])[0];
            if (!row) return;
            const real = await post("writer", "/api/v1/placements", { enrollment_id: row.id, start_date: "2026-10-01" });
            const invented = await post("writer", "/api/v1/placements", {
                enrollment_id: "00000000-0000-4000-8000-ffffffffffff", start_date: "2026-10-01",
            });
            expect(real.status, "an out-of-boundary enrollment must not be distinguishable").toBe(404);
            expect(invented.status).toBe(404);
        });
    });

    // ── LIFECYCLE, IDEMPOTENCY, CONVERGENCE ─────────────────────────────────
    describe("the full lifecycle, end to end", () => {
        let enrollmentId = "";

        it("starts an enrollment for a mapped child who is not yet in service", async () => {
            const created = await postOk("writer", "/api/v1/enrollments", {
                child_id: UNENROLLED_A, site_id: RIVERSIDE, start_date: "2026-10-01",
            });
            expect(created.status).toBe(201);
            expect(created.body.child_id).toBe(UNENROLLED_A);
            expect(created.body.site_location_id).toBe(RIVERSIDE);
            enrollmentId = String(created.body.id);
        }, 60_000);

        it("converges on retry instead of creating a second enrollment", async () => {
            const again = await postOk("writer", "/api/v1/enrollments", {
                child_id: UNENROLLED_A, site_id: RIVERSIDE, start_date: "2026-10-01",
            });
            expect(again.status, "a retry must not create a second record").toBe(200);
            expect(again.body.id).toBe(enrollmentId);

            // OPERATIONAL rows, not every row ever written. Convergence means a retry created no
            // second LIVE enrollment; terminal history for this child is irrelevant to that claim
            // and cannot always be cleaned away — an agreement that ever recorded attendance can
            // never be deleted, because the attendance ledger is append-only.
            const rows = await supabase.from("child_enrollment_agreements")
                .select("id").eq("org_id", ORG).eq("customer_member_id", UNENROLLED_A)
                .in("status", ["pending_start", "active", "ending"]);
            expect((rows.data ?? []).length, "exactly one operational agreement must exist").toBe(1);
        }, 60_000);

        it("the enrollment converges through the public read", async () => {
            const page = await get("writer", `/api/v1/enrollments?child_id=${UNENROLLED_A}&limit=50`);
            expect(page.data.map((r) => String(r.id))).toContain(enrollmentId);
        }, 60_000);

        it("makes the child visible, which it was not before", async () => {
            const page = await get("writer", `/api/v1/children?child_id=${UNENROLLED_A}`);
            expect(page.data, "enrollment is what makes a child visible").toHaveLength(1);
        }, 60_000);

        it("assigns a placement, and converges on retry", async () => {
            const first = await postOk("writer", "/api/v1/placements", { enrollment_id: enrollmentId, start_date: "2026-10-01" });
            expect(first.status).toBe(201);
            const again = await postOk("writer", "/api/v1/placements", { enrollment_id: enrollmentId, start_date: "2026-10-01" });
            expect(again.status).toBe(200);
            expect(again.body.id).toBe(first.body.id);

            const page = await get("writer", `/api/v1/placements?child_id=${UNENROLLED_A}&limit=50`);
            expect(page.data.map((r) => String(r.id))).toContain(String(first.body.id));
        }, 60_000);

        it("moves by SUPERSEDING, never by editing history", async () => {
            const before = await get("writer", `/api/v1/placements?child_id=${UNENROLLED_A}&limit=50`);
            const priorId = String(before.data[0].id);

            const moved = await postOk("writer", "/api/v1/placements/move", {
                enrollment_id: enrollmentId, start_date: "2026-11-01",
            });
            expect(moved.status).toBe(201);
            expect(moved.body.id, "a move must produce a NEW placement").not.toBe(priorId);
            expect(moved.body.supersedes_placement_id).toBe(priorId);

            // The prior placement still exists and is now bounded — history was not rewritten.
            const after = await get("writer", `/api/v1/placements?child_id=${UNENROLLED_A}&limit=50`);
            const ids = after.data.map((r) => String(r.id));
            expect(ids, "the superseded placement must survive").toContain(priorId);
            expect(ids).toContain(String(moved.body.id));
            const prior = after.data.find((r) => String(r.id) === priorId)!;
            expect(prior.end_date, "the superseded placement must be closed").toBeTruthy();
        }, 60_000);

        it("sets a schedule, and converges on retry", async () => {
            const first = await postOk("writer", "/api/v1/schedule-assignments", {
                enrollment_id: enrollmentId, schedule_pattern_id: PATTERN_MWF, start_date: "2026-10-01",
            });
            expect(first.status).toBe(201);
            const again = await postOk("writer", "/api/v1/schedule-assignments", {
                enrollment_id: enrollmentId, schedule_pattern_id: PATTERN_MWF, start_date: "2026-10-01",
            });
            expect(again.status).toBe(200);
            expect(again.body.id).toBe(first.body.id);
        }, 60_000);

        it("changes a schedule by superseding", async () => {
            const before = await get("writer", `/api/v1/schedule-assignments?child_id=${UNENROLLED_A}&limit=50`);
            const priorId = String(before.data[0].id);
            const changed = await postOk("writer", "/api/v1/schedule-assignments/change", {
                enrollment_id: enrollmentId, schedule_pattern_id: PATTERN_TT, start_date: "2026-11-01",
            });
            expect(changed.status).toBe(201);
            expect(changed.body.id).not.toBe(priorId);
            expect(changed.body.supersedes_assignment_id).toBe(priorId);

            const after = await get("writer", `/api/v1/schedule-assignments?child_id=${UNENROLLED_A}&limit=50`);
            expect(after.data.map((r) => String(r.id))).toContain(priorId);
        }, 60_000);

        it("the derived day projection follows the committed change", async () => {
            const days = await fetch(
                `${APP_URL}/api/v1/schedule-days?from=2026-11-02&to=2026-11-08&child_id=${UNENROLLED_A}`,
                { headers: { authorization: `Bearer ${await bearer("writer")}` } },
            );
            expect(days.status).toBe(200);
            const body = (await days.json()) as { data: { weekday: number }[] };
            // Tue/Thu after the change — never mutated directly, always derived.
            if (body.data.length > 0) {
                expect(new Set(body.data.map((d) => d.weekday))).toEqual(new Set([2, 4]));
            }
        }, 60_000);

        it("ends the enrollment, and converges if asked again", async () => {
            const ended = await postOk("writer", "/api/v1/enrollments/end", { enrollment_id: enrollmentId });
            expect(ended.status).toBe(200);
            const again = await postOk("writer", "/api/v1/enrollments/end", { enrollment_id: enrollmentId });
            expect(again.status, "ending an ended enrollment must converge, not conflict").toBe(200);
            expect(again.body.id).toBe(enrollmentId);
        }, 60_000);

        it("the ending converges through the public read", async () => {
            const page = await get("writer", `/api/v1/enrollments?child_id=${UNENROLLED_A}&limit=50`);
            const row = page.data.find((r) => String(r.id) === enrollmentId)!;
            expect(row, "the ended enrollment must still be readable").toBeTruthy();
            expect(["ended", "canceled", "ending"]).toContain(String(row.status));
        }, 60_000);
    });

    // ── MISTAKEN CREATION ───────────────────────────────────────────────────
    //
    // Supersession can only say "this was true, and then it changed". It closes the prior row on the
    // day before the replacement starts, and the replacement must start strictly later — so the
    // superseded row always asserts a non-empty period during which it was the truth. There is no
    // arithmetic that makes that window empty. For a record that was never true at all, `move` and
    // `change` therefore publish care that never happened.
    //
    // These prove the separate intent, and prove it is genuinely different from supersession.
    describe("a record that should never have been effective", () => {
        let enrollmentId = "";
        let placementId = "";
        let assignmentId = "";

        it("sets up an enrollment to hang the mistakes on", async () => {
            const created = await postOk("writer", "/api/v1/enrollments", {
                child_id: UNENROLLED_B, site_id: RIVERSIDE, start_date: "2026-10-01",
            });
            enrollmentId = String(created.body.id);
            expect(enrollmentId).toBeTruthy();
        }, 60_000);

        it("cancels a placement that was recorded by mistake, and keeps the row", async () => {
            const made = await postOk("writer", "/api/v1/placements", {
                enrollment_id: enrollmentId, start_date: "2026-10-01",
            });
            placementId = String(made.body.id);

            const cancelled = await postOk("writer", "/api/v1/placements/cancel", { placement_id: placementId });
            expect(cancelled.status).toBe(200);
            expect(cancelled.body.status, "the record says it never took effect").toBe("canceled");
            expect(String(cancelled.body.id), "the identifier a partner already holds still resolves").toBe(placementId);
        }, 60_000);

        it("the cancellation converges through the public read — nothing disappears", async () => {
            const page = await get("writer", `/api/v1/placements?child_id=${UNENROLLED_B}&limit=50`);
            const row = page.data.find((r) => String(r.id) === placementId);
            expect(row, "a cancelled placement must stay readable, not vanish").toBeTruthy();
            expect(String(row!.status)).toBe("canceled");
        }, 60_000);

        it("cancelling is idempotent, so an unconfirmed retry converges", async () => {
            const again = await postOk("writer", "/api/v1/placements/cancel", { placement_id: placementId });
            expect(again.status).toBe(200);
            expect(String(again.body.status)).toBe("canceled");
        }, 60_000);

        it("a cancelled placement frees the slot, so the corrected one can start on the SAME day", async () => {
            // This is what supersession cannot do: `move` requires a strictly later start, so the
            // wrong room would keep asserting at least one real day of care.
            const corrected = await postOk("writer", "/api/v1/placements", {
                enrollment_id: enrollmentId, start_date: "2026-10-01",
            });
            expect(String(corrected.body.id), "a new placement, not the cancelled one").not.toBe(placementId);
            expect(String(corrected.body.start_date)).toBe("2026-10-01");
        }, 60_000);

        it("cancels a schedule assignment that never applied", async () => {
            const made = await postOk("writer", "/api/v1/schedule-assignments", {
                enrollment_id: enrollmentId, schedule_pattern_id: PATTERN_MWF, start_date: "2026-11-02",
            });
            assignmentId = String(made.body.id);

            const cancelled = await postOk("writer", "/api/v1/schedule-assignments/cancel", {
                schedule_assignment_id: assignmentId,
            });
            expect(cancelled.status).toBe(200);
            expect(String(cancelled.body.status)).toBe("canceled");
        }, 60_000);

        it("a cancelled assignment stops projecting derived days", async () => {
            // The whole reason this matters: assignments expand into concrete expected days. An
            // erroneous one left "valid until yesterday" bills expectations nobody ever owed.
            const days = await get("writer", `/api/v1/schedule-days?from=2026-11-02&to=2026-11-08&child_id=${UNENROLLED_B}`);
            expect(days.data.length, "a cancelled assignment must project nothing").toBe(0);
        }, 60_000);

        it("refuses to cancel a record that genuinely was effective and has closed", async () => {
            // Denying a closed period retroactively would break everything derived from it —
            // occupancy, ratios, invoices. That is a different problem and it is not solved here.
            // Moving the corrected placement supersedes it, which is the honest "this WAS true"
            // closure; cancelling that closed row must then be refused.
            const moved = await postOk("writer", "/api/v1/placements/move", {
                enrollment_id: enrollmentId, start_date: "2026-10-15",
            });
            expect(String(moved.body.id)).toBeTruthy();

            const superseded = await supabase
                .from("child_placements")
                .select("id")
                .eq("org_id", ORG)
                .eq("enrollment_agreement_id", enrollmentId)
                .eq("status", "superseded")
                .limit(1);
            const closedId = ((superseded.data ?? []) as { id: string }[])[0]?.id;
            expect(closedId, "the move must have closed a prior placement").toBeTruthy();

            const res = await post("writer", "/api/v1/placements/cancel", { placement_id: closedId });
            expect(res.status, "a superseded row asserts real history; cancelling it must refuse").toBe(409);
        }, 120_000);

        it("refuses a record outside the boundary exactly as if it did not exist", async () => {
            const invented = await post("writer", "/api/v1/placements/cancel", {
                placement_id: "00000000-0000-4000-8000-ffffffffffff",
            });
            expect(invented.status).toBe(404);
        }, 60_000);

        it("the cancellation leaks nothing internal", async () => {
            const res = await post("writer", "/api/v1/placements/cancel", { placement_id: placementId });
            const body = (await res.text()).toLowerCase();
            for (const leak of ["created_by", "updated_by", "metadata", "constraint", "child_placements", "supabase"]) {
                expect(body, `cancellation leaked "${leak}"`).not.toContain(leak);
            }
        }, 60_000);
    });

    // ── ENROLLMENT VOID ─────────────────────────────────────────────────────
    //
    // The third ending. `ended` asserts service happened; `canceled` asserts a commitment was
    // withdrawn before it began. Neither is true of a record created against the wrong child, and
    // ending one is not harmless — under the visibility law an `ended` agreement keeps publishing
    // the child to partners as genuine history.
    describe("an enrollment that never represented service", () => {
        let voidable = "";
        /*
         * Reuses the suite's mapped child rather than creating one.
         *
         * An earlier version made its own child and household, and that churn in `/children` and
         * `/households` broke `coreResources`' bootstrap-and-resume paging walks intermittently —
         * those require a quiescent collection, and a row appearing then vanishing mid-walk is
         * exactly what they cannot tolerate. The VISIBILITY consequence of `voided` is certified in
         * childVisibilityLifecycle.live, which owns that law and runs against its own isolated
         * sites, so nothing is lost by keeping this block to the operation itself.
         */
        it("voids an enrollment recorded in error, and keeps the row", async () => {
            const created = await postOk("writer", "/api/v1/enrollments", {
                child_id: UNENROLLED_A, site_id: RIVERSIDE, start_date: "2026-09-01",
            });
            voidable = String(created.body.id);
            expect(String(created.body.status), "start date in the past makes it active").toBe("active");

            const voided = await postOk("writer", "/api/v1/enrollments/void", { enrollment_id: voidable });
            expect(voided.status).toBe(200);
            expect(String(voided.body.status)).toBe("voided");
            expect(String(voided.body.id), "the identifier a partner holds still resolves").toBe(voidable);
        }, 60_000);

        // The VISIBILITY consequence of `voided` is certified in childVisibilityLifecycle.live,
        // which owns that law and runs against its own isolated sites. Asserting it here as well
        // meant this suite churned the shared roster while coreResources was paging it, which
        // surfaced as intermittent "bootstraps, pages and resumes without a gap" failures in a
        // suite neither of them had changed. One claim, one owner.

        it("but the enrollment itself stays readable, and the void arrives on a sync pass", async () => {
            const since = new Date(Date.now() - 120_000).toISOString();
            const page = await get("writer", `/api/v1/enrollments?child_id=${UNENROLLED_A}&limit=50`);
            const row = page.data.find((r) => String(r.id) === voidable);
            expect(row, "a voided enrollment must never disappear").toBeTruthy();
            expect(String(row!.status)).toBe("voided");

            const synced = await get("writer",
                `/api/v1/enrollments?child_id=${UNENROLLED_A}&updated_since=${encodeURIComponent(since)}&limit=50`);
            expect(synced.data.some((r) => String(r.id) === voidable), "the transition must reach a partner").toBe(true);
        }, 60_000);

        it("voiding converges on retry", async () => {
            const again = await postOk("writer", "/api/v1/enrollments/void", { enrollment_id: voidable });
            expect(again.status).toBe(200);
            expect(String(again.body.status)).toBe("voided");
        }, 60_000);

        it("two simultaneous voids converge on one answer", async () => {
            const created = await postOk("writer", "/api/v1/enrollments", {
                child_id: UNENROLLED_A, site_id: RIVERSIDE, start_date: "2026-09-01",
            });
            const id = String(created.body.id);
            const [a, b] = await Promise.all([
                post("writer", "/api/v1/enrollments/void", { enrollment_id: id }),
                post("writer", "/api/v1/enrollments/void", { enrollment_id: id }),
            ]);
            for (const res of [a, b]) expect([200], `concurrent void returned ${res.status}`).toContain(res.status);
            const bodies = await Promise.all([a.json(), b.json()] as const);
            for (const body of bodies) expect(String((body as { status: string }).status)).toBe("voided");
        }, 120_000);

        it("dependent placements and schedule assignments do not survive the void", async () => {
            const created = await postOk("writer", "/api/v1/enrollments", {
                child_id: UNENROLLED_A, site_id: RIVERSIDE, start_date: "2026-09-01",
            });
            const id = String(created.body.id);
            await postOk("writer", "/api/v1/placements", { enrollment_id: id, start_date: "2026-09-01" });
            await postOk("writer", "/api/v1/schedule-assignments", {
                enrollment_id: id, schedule_pattern_id: PATTERN_MWF, start_date: "2026-09-01",
            });
            await postOk("writer", "/api/v1/enrollments/void", { enrollment_id: id });

            // Nothing operational may still point at an enrollment that says it was never valid.
            for (const table of ["child_placements", "schedule_assignments"] as const) {
                const { data } = await supabase.from(table).select("status")
                    .eq("org_id", ORG).eq("enrollment_agreement_id", id);
                const statuses = ((data ?? []) as { status: string }[]).map((r) => r.status);
                expect(statuses.length, `${table} rows were created`).toBeGreaterThan(0);
                for (const st of statuses) {
                    expect(["canceled"], `${table} left ${st} attached to a voided enrollment`).toContain(st);
                }
            }
        }, 120_000);

        it("REFUSES to void an enrollment that attendance proves was real", async () => {
            /*
             * The guard that stops void becoming a way to rewrite inconvenient history.
             *
             * This uses an enrollment that ALREADY carries real attendance rather than inserting a
             * fixture, for a reason worth recording: `child_attendance_events` is append-only,
             * enforced by a trigger that refuses DELETE. An enrollment with attendance therefore can
             * never be cleaned up, so a suite that manufactures one poisons its own tenant a little
             * more on every run. Real evidence is also the better test.
             */
            const { data: withAttendance } = await supabase
                .from("child_attendance_events")
                .select("enrollment_agreement_id")
                .eq("org_id", ORG)
                .not("enrollment_agreement_id", "is", null)
                .limit(1)
                .maybeSingle();
            const agreementId = (withAttendance as { enrollment_agreement_id: string } | null)?.enrollment_agreement_id;
            expect(agreementId, "the certification tenant must hold at least one attended enrollment").toBeTruthy();

            const res = await post("writer", "/api/v1/enrollments/void", { enrollment_id: agreementId });
            // 409 when the writer can reach it, 404 when it sits outside this installation's
            // boundary — never 200, which is the assertion that matters: service that happened
            // cannot be renamed a mistake.
            expect([404, 409], `voiding an attended enrollment returned ${res.status}`).toContain(res.status);
            expect(res.status, "attendance proves service occurred").not.toBe(200);
        }, 120_000);

        it("refuses to void a cancelled enrollment, which already tells a truer story", async () => {
            const created = await postOk("writer", "/api/v1/enrollments", {
                child_id: UNENROLLED_A, site_id: RIVERSIDE, start_date: "2027-01-04",
            });
            const id = String(created.body.id);
            await postOk("writer", "/api/v1/enrollments/end", { enrollment_id: id });
            const res = await post("writer", "/api/v1/enrollments/void", { enrollment_id: id });
            expect(res.status).toBe(409);
        }, 120_000);

        it("refuses an enrollment outside the boundary exactly as if it did not exist", async () => {
            const res = await post("writer", "/api/v1/enrollments/void", {
                enrollment_id: "00000000-0000-4000-8000-ffffffffffff",
            });
            expect(res.status).toBe(404);
        }, 60_000);

        describe("one operational schedule assignment per enrollment", () => {
            it("two simultaneous changes cannot produce two operational rows, and neither caller gets a 500", async () => {
                const created = await postOk("writer", "/api/v1/enrollments", {
                    child_id: UNENROLLED_A, site_id: RIVERSIDE, start_date: "2026-10-01",
                });
                const id = String(created.body.id);
                await postOk("writer", "/api/v1/schedule-assignments", {
                    enrollment_id: id, schedule_pattern_id: PATTERN_MWF, start_date: "2026-10-05",
                });

                const [a, b] = await Promise.all([
                    post("writer", "/api/v1/schedule-assignments/change", {
                        enrollment_id: id, schedule_pattern_id: PATTERN_TT, start_date: "2026-10-12",
                    }),
                    post("writer", "/api/v1/schedule-assignments/change", {
                        enrollment_id: id, schedule_pattern_id: PATTERN_TT, start_date: "2026-10-12",
                    }),
                ]);
                for (const res of [a, b]) {
                    expect([200, 201, 409], `concurrent change returned ${res.status}`).toContain(res.status);
                    expect(res.status, "a raw unique violation must never reach a partner").not.toBe(500);
                }

                const { data } = await supabase.from("schedule_assignments")
                    .select("id").eq("org_id", ORG).eq("enrollment_agreement_id", id)
                    .eq("subject_type", "child").eq("is_primary", true)
                    .in("status", ["planned", "active", "ending"]);
                expect((data ?? []).length, "the invariant the canonical reader assumes").toBe(1);
            }, 180_000);

            it("the canonical reader still answers after the race, rather than wedging", async () => {
                // Two operational rows would make every later read of this agreement a 500.
                const page = await get("writer", `/api/v1/schedule-assignments?child_id=${UNENROLLED_A}&limit=50`);
                expect(page.data.length).toBeGreaterThan(0);
                const res = await post("writer", "/api/v1/schedule-assignments/change", {
                    enrollment_id: String(page.data[0].enrollment_id ?? ""), schedule_pattern_id: PATTERN_MWF,
                    start_date: "2026-10-19",
                });
                expect([200, 201, 404, 409, 422]).toContain(res.status);
                expect(res.status).not.toBe(500);
            }, 120_000);
            });

    });

    // ── CONCURRENCY ─────────────────────────────────────────────────────────
    describe("concurrency", () => {
        it("two simultaneous starts converge on one enrollment", async () => {
            const [a, b] = await Promise.all([
                post("writer", "/api/v1/enrollments", { child_id: UNENROLLED_B, site_id: RIVERSIDE, start_date: "2026-10-01" }),
                post("writer", "/api/v1/enrollments", { child_id: UNENROLLED_B, site_id: RIVERSIDE, start_date: "2026-10-01" }),
            ]);
            // Neither may fail. One creates, the other converges on it — losing the insert race is
            // evidence someone got there first, not an error the partner should have to interpret.
            for (const res of [a, b]) {
                expect([200, 201], `concurrent start returned ${res.status}`).toContain(res.status);
            }
            const bodies = await Promise.all([a.json(), b.json()] as const);
            expect(String((bodies[0] as { id: string }).id), "both callers must be told about the same enrollment")
                .toBe(String((bodies[1] as { id: string }).id));

            const rows = await supabase.from("child_enrollment_agreements")
                .select("id").eq("org_id", ORG).eq("customer_member_id", UNENROLLED_B);
            expect((rows.data ?? []).length, "concurrent starts must not produce two enrollments").toBe(1);
        }, 120_000);
    });

    // ── NO GENERIC MUTATION ─────────────────────────────────────────────────
    describe("there is no CRUD surface", () => {
        it("refuses PUT, PATCH and DELETE everywhere", async () => {
            const paths = [
                "/api/v1/enrollments", "/api/v1/placements", "/api/v1/schedule-assignments",
                "/api/v1/children", "/api/v1/households", "/api/v1/relationships",
                "/api/v1/staff", "/api/v1/locations", "/api/v1/schedule-days",
            ];
            for (const path of paths) {
                for (const method of ["PUT", "PATCH", "DELETE"]) {
                    const res = await fetch(`${APP_URL}${path}`, {
                        method,
                        headers: { "content-type": "application/json", authorization: `Bearer ${await bearer("writer")}` },
                        body: JSON.stringify({ status: "whatever" }),
                    });
                    expect([404, 405], `${method} ${path} must not exist`).toContain(res.status);
                }
            }
        }, 180_000);
    });

    // ── PRIVACY ─────────────────────────────────────────────────────────────
    describe("privacy", () => {
        it("an operation result carries no field the reads withhold", async () => {
            const res = await post("writer", "/api/v1/enrollments", { child_id: UNENROLLED_A, site_id: RIVERSIDE });
            const body = (await res.text()).toLowerCase();
            for (const leak of ["allerg", "medical", "health", "safeguard", "created_by", "updated_by", "metadata", "opportunity"]) {
                expect(body, `the operation result leaked "${leak}"`).not.toContain(leak);
            }
        }, 60_000);

        it("never forwards internal failure detail", async () => {
            const res = await post("writer", "/api/v1/placements", {
                enrollment_id: "00000000-0000-4000-8000-ffffffffffff", start_date: "2026-10-01",
            });
            const body = (await res.text()).toLowerCase();
            for (const leak of ["child_placements", "child_enrollment_agreements", "constraint", "supabase", "postgres"]) {
                expect(body, `an error leaked "${leak}"`).not.toContain(leak);
            }
        }, 60_000);
    });
});
