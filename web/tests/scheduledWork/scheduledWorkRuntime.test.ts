/**
 * THE RUNTIME'S THREE HARD PROMISES.
 *
 * Delivery is at-least-once, so the interesting cases are not "it ran" but: a
 * duplicate wake, two workers racing, and a worker that came back after losing its
 * lease. Each is asserted against a real Postgres, because every one of them is a
 * claim about what the DATABASE does under concurrency and a mock would only
 * restate the code's own assumptions back to it.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
    __resetScheduledWorkRegistryForTests,
    registerScheduledWorkHandler,
} from "@/lib/scheduledWork/scheduledWorkRegistry";
import { runScheduledWorkWake } from "@/lib/scheduledWork/scheduledWorkRuntime";
import { SCHEDULED_WORK_MAX_ATTEMPTS } from "@/lib/scheduledWork/scheduledWorkTypes";

const URL = "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const LIVE = KEY.length > 0;

const db: SupabaseClient = LIVE
    ? createClient(URL, KEY, { auth: { persistSession: false } })
    : (null as unknown as SupabaseClient);

const TAG = "qa_sched_v1";
let scheduleId = "";

async function seed(handlerKey: string, dueAt: string) {
    const { data } = await db
        .from("scheduled_work")
        .insert({ handler_key: handlerKey, recurrence_kind: "one_time", next_due_at: dueAt, label: TAG })
        .select("id").single();
    scheduleId = (data as { id: string }).id;
    return scheduleId;
}

async function cleanup() {
    if (!LIVE) return;
    const { data } = await db.from("scheduled_work").select("id").eq("label", TAG);
    for (const s of (data ?? []) as { id: string }[]) {
        await db.from("scheduled_work").delete().eq("id", s.id);
    }
}

describe.runIf(LIVE)("governed scheduled work — at-least-once convergence", () => {
    beforeEach(async () => {
        __resetScheduledWorkRegistryForTests();
        await cleanup();
    });
    afterAll(cleanup);

    it("a duplicate wake produces ONE occurrence, not two", async () => {
        let runs = 0;
        registerScheduledWorkHandler("qa.once", async () => { runs += 1; return { kind: "completed" }; });
        const past = new Date(Date.now() - 60_000).toISOString();
        const id = await seed("qa.once", past);

        await runScheduledWorkWake(db, {});
        await runScheduledWorkWake(db, {});

        const { data } = await db.from("scheduled_work_occurrences").select("id").eq("scheduled_work_id", id);
        // Identity is (schedule, due_at). A second wake converges onto the same row.
        expect((data ?? []).length).toBe(1);
        expect(runs).toBe(1);
    });

    it("two workers racing one occurrence yield exactly one execution", async () => {
        let runs = 0;
        registerScheduledWorkHandler("qa.race", async () => {
            runs += 1;
            await new Promise((r) => setTimeout(r, 40));
            return { kind: "completed" };
        });
        await seed("qa.race", new Date(Date.now() - 60_000).toISOString());

        // Started together. The claim is one conditional UPDATE, so the database
        // picks the winner and the loser's update matches nothing.
        await Promise.all([
            runScheduledWorkWake(db, { workerId: "worker-a" }),
            runScheduledWorkWake(db, { workerId: "worker-b" }),
        ]);
        expect(runs).toBe(1);
    });

    it("a live lease is respected — a second worker claims nothing", async () => {
        /*
         * Deterministic, deliberately. The two-worker race above depends on the
         * two wakes interleaving inside a millisecond-wide window, and removing
         * the claim guard did NOT fail it — so that test does not prove the guard
         * and this one does. Here the lease is placed by hand, so the outcome does
         * not depend on scheduling luck.
         */
        let runs = 0;
        registerScheduledWorkHandler("qa.leased", async () => { runs += 1; return { kind: "completed" }; });
        const id = await seed("qa.leased", new Date(Date.now() - 60_000).toISOString());
        await runScheduledWorkWake(db, {});          // materialize
        await db.from("scheduled_work_occurrences")
            .update({
                status: "claimed",
                claim_token: "00000000-0000-4000-8000-000000000001",
                claimed_by: "worker-holding",
                lease_expires_at: new Date(Date.now() + 600_000).toISOString(),
            })
            .eq("scheduled_work_id", id);
        const before = runs;

        const r = await runScheduledWorkWake(db, { workerId: "worker-intruder" });
        expect(r.claimed).toBe(0);
        expect(runs).toBe(before);
    });

    it("an EXPIRED lease is reclaimed — a crashed worker does not park work forever", async () => {
        let runs = 0;
        registerScheduledWorkHandler("qa.expired", async () => { runs += 1; return { kind: "completed" }; });
        const id = await seed("qa.expired", new Date(Date.now() - 60_000).toISOString());
        await runScheduledWorkWake(db, {});
        // A worker that died mid-attempt leaves exactly this: claimed, lease past.
        await db.from("scheduled_work_occurrences")
            .update({
                status: "claimed",
                claim_token: "00000000-0000-4000-8000-000000000002",
                claimed_by: "worker-that-died",
                lease_expires_at: new Date(Date.now() - 60_000).toISOString(),
            })
            .eq("scheduled_work_id", id);

        // The first wake already executed it once; recovery is the SECOND run.
        const before = runs;
        const r = await runScheduledWorkWake(db, { workerId: "worker-recovering" });
        expect(r.claimed).toBe(1);
        expect(runs).toBe(before + 1);
    });

    it("a domain no-op is a SUCCESSFUL run, not a failure", async () => {
        // Billing finding nothing due is the ordinary case. Recording it as failure
        // would fill the failure surface with healthy days.
        registerScheduledWorkHandler("qa.noop", async () => ({
            kind: "completed", reason: "nothing was due",
        }));
        const id = await seed("qa.noop", new Date(Date.now() - 60_000).toISOString());
        const r = await runScheduledWorkWake(db, {});
        expect(r.completed).toBe(1);
        const { data } = await db.from("scheduled_work_occurrences")
            .select("status").eq("scheduled_work_id", id).single();
        expect((data as { status: string }).status).toBe("completed");
    });

    it("a retryable failure reschedules and does NOT retry forever", async () => {
        registerScheduledWorkHandler("qa.flaky", async () => ({
            kind: "retryable_failure", reason: "transient",
        }));
        const id = await seed("qa.flaky", new Date(Date.now() - 60_000).toISOString());

        // Each wake uses a `now` past the backoff so the retry is due again.
        for (let i = 0; i < SCHEDULED_WORK_MAX_ATTEMPTS + 2; i += 1) {
            await runScheduledWorkWake(db, { now: new Date(Date.now() + i * 3_600_000) });
        }
        const { data } = await db.from("scheduled_work_occurrences")
            .select("status, attempt_count").eq("scheduled_work_id", id).single();
        const occ = data as { status: string; attempt_count: number };
        expect(occ.status).toBe("failed");
        // Bounded: the budget stops it rather than the clock running out of patience.
        expect(occ.attempt_count).toBeLessThanOrEqual(SCHEDULED_WORK_MAX_ATTEMPTS);
    });

    it("a terminal failure is recorded once and not re-run", async () => {
        let runs = 0;
        registerScheduledWorkHandler("qa.terminal", async () => {
            runs += 1;
            return { kind: "terminal_failure", reason: "cannot ever succeed" };
        });
        await seed("qa.terminal", new Date(Date.now() - 60_000).toISOString());
        await runScheduledWorkWake(db, {});
        await runScheduledWorkWake(db, { now: new Date(Date.now() + 86_400_000) });
        expect(runs).toBe(1);
    });

    it("one poisoned schedule does not stop unrelated due work", async () => {
        let healthy = 0;
        registerScheduledWorkHandler("qa.poison", async () => { throw new Error("boom"); });
        registerScheduledWorkHandler("qa.healthy", async () => { healthy += 1; return { kind: "completed" }; });
        const past = new Date(Date.now() - 60_000).toISOString();
        await seed("qa.poison", past);
        await seed("qa.healthy", past);

        const r = await runScheduledWorkWake(db, {});
        expect(healthy).toBe(1);
        expect(r.claimed).toBeGreaterThanOrEqual(2);
    });

    it("a row naming unregistered code cannot execute", async () => {
        await seed("qa.not_registered_anywhere", new Date(Date.now() - 60_000).toISOString());
        const r = await runScheduledWorkWake(db, {});
        expect(r.unregisteredHandler).toBe(1);
        expect(r.terminallyFailed).toBe(1);
    });

    it("every attempt is audited, one row per try", async () => {
        registerScheduledWorkHandler("qa.audit", async () => ({ kind: "completed" }));
        const id = await seed("qa.audit", new Date(Date.now() - 60_000).toISOString());
        await runScheduledWorkWake(db, { workerId: "worker-audit" });
        const { data: occ } = await db.from("scheduled_work_occurrences")
            .select("id").eq("scheduled_work_id", id).single();
        const { data: attempts } = await db.from("scheduled_work_attempts")
            .select("attempt_number, worker_id, outcome").eq("occurrence_id", (occ as { id: string }).id);
        expect((attempts ?? []).length).toBe(1);
        expect((attempts ?? [])[0]).toMatchObject({ attempt_number: 1, worker_id: "worker-audit", outcome: "completed" });
    });
});

describe("contract invariants that need no database", () => {
    it("registering one key twice is refused rather than silently last-wins", async () => {
        __resetScheduledWorkRegistryForTests();
        registerScheduledWorkHandler("qa.dup", async () => ({ kind: "completed" }));
        expect(() => registerScheduledWorkHandler("qa.dup", async () => ({ kind: "completed" })))
            .toThrow(/already registered/);
    });
});

describe("the wake is a machine endpoint, and fails closed", () => {
    const code = (rel: string) =>
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        (require("node:fs") as typeof import("node:fs")).readFileSync(
            (require("node:path") as typeof import("node:path")).join(__dirname, "../../", rel), "utf8");

    function statements(src: string): string {
        return src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n")
            .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");
    }

    it("an empty or missing secret never authorizes", () => {
        // The failure that matters is an environment missing CRON_SECRET leaving the
        // endpoint open. Both checks require the EXPECTED value to be non-empty.
        const src = statements(code("app/api/scheduled-work/wake/route.ts"));
        expect(src).toMatch(/if \(bearerExpected && bearer === `Bearer \$\{bearerExpected\}`\) return true;/);
        expect(src).toMatch(/return Boolean\(tokenExpected && token && token === tokenExpected\);/);
    });

    it("both verbs gate on the same check — one behaviour, not two", () => {
        const src = statements(code("app/api/scheduled-work/wake/route.ts"));
        const gates = src.match(/if \(!isAuthorizedClock\(request\)\)/g) ?? [];
        expect(gates.length).toBe(2);
    });

    it("the external clock calls the GENERIC wake, never a domain endpoint", () => {
        const vercel = JSON.parse(code("vercel.json")) as { crons?: { path: string }[] };
        expect(vercel.crons?.map((c) => c.path)).toEqual(["/api/scheduled-work/wake"]);
        // Infrastructure carrying domain cadence is how business logic ends up in a
        // cron expression nobody thinks to read.
        for (const c of vercel.crons ?? []) {
            expect(c.path).not.toMatch(/billing|autopay|aging|payment/i);
        }
    });

    it("the scheduler contains no domain economics", () => {
        for (const rel of [
            "lib/scheduledWork/scheduledWorkRuntime.ts",
            "lib/scheduledWork/scheduledWorkRegistry.ts",
            "app/api/scheduled-work/wake/route.ts",
        ]) {
            const src = statements(code(rel));
            expect(src, `${rel} must not know what billing means`)
                .not.toMatch(/invoice|charge|late_fee|autopay|tuition|payment_method|collect/i);
        }
    });
});
