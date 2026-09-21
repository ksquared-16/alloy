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
    AUTOPAY_HANDLER_KEY,
    BILLING_PERIODIC_HANDLER_KEY,
    CHARGE_AGING_HANDLER_KEY,
    registerScheduledWorkConsumers,
} from "@/lib/scheduledWork/scheduledWorkConsumers";
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


const CONSUMER_TAG = "qa_sched_consumers_v1";

async function cleanupConsumers() {
    if (!LIVE) return;
    const { data } = await db.from("scheduled_work").select("id").eq("label", CONSUMER_TAG);
    for (const s of (data ?? []) as { id: string }[]) {
        await db.from("scheduled_work").delete().eq("id", s.id);
    }
}

const CONSUMERS = [
    { key: BILLING_PERIODIC_HANDLER_KEY, domain: "periodic_billing", ref: { billing_period_id: "bp-1" } },
    { key: CHARGE_AGING_HANDLER_KEY, domain: "charge_aging", ref: { as_of: "2026-09-21" } },
    { key: AUTOPAY_HANDLER_KEY, domain: "autopay", ref: { mandate_id: "m-1", attempt_window: "am" } },
] as const;


describe.runIf(LIVE)("governed scheduled work — three consumers, one runtime", () => {
    beforeEach(async () => {
        __resetScheduledWorkRegistryForTests();
        // NOT the `ensure` wrapper: its module-level latch would make this a no-op
        // after a reset, and the suite would then certify an empty registry.
        registerScheduledWorkConsumers();
        await cleanupConsumers();
    });
    afterAll(cleanupConsumers);

    it("one wake serves all three real consumers through the registered-handler boundary", async () => {
        const past = new Date(Date.now() - 60_000).toISOString();
        const ids = new Map<string, string>();
        for (const c of CONSUMERS) {
            const { data } = await db
                .from("scheduled_work")
                .insert({
                    handler_key: c.key, recurrence_kind: "one_time",
                    next_due_at: past, label: CONSUMER_TAG, domain_ref: c.ref,
                })
                .select("id").single();
            ids.set(c.key, (data as { id: string }).id);
        }

        const result = await runScheduledWorkWake(db);

        expect(result.claimed).toBe(3);
        expect(result.completed).toBe(3);
        // The failure this guards is the one that matters: a consumer whose key is
        // declared but never registered fails terminally instead of running.
        expect(result.unregisteredHandler).toBe(0);
        expect(result.terminallyFailed).toBe(0);
        expect(result.retryScheduled).toBe(0);

        // One worker identity served all three — this is the "one runtime" half.
        expect(new Set([result.workerId]).size).toBe(1);

        for (const c of CONSUMERS) {
            const { data: occ } = await db
                .from("scheduled_work_occurrences")
                .select("id,status,handler_key")
                .eq("scheduled_work_id", ids.get(c.key)!)
                .single();
            const row = occ as { id: string; status: string; handler_key: string };
            expect(row.status).toBe("completed");
            expect(row.handler_key).toBe(c.key);

            const { data: attempts } = await db
                .from("scheduled_work_attempts")
                .select("worker_id,outcome,diagnostic,attempt_number")
                .eq("occurrence_id", row.id);
            const list = (attempts ?? []) as {
                worker_id: string; outcome: string; attempt_number: number;
                diagnostic: Record<string, unknown> | null;
            }[];
            expect(list).toHaveLength(1);
            expect(list[0].outcome).toBe("completed");
            expect(list[0].attempt_number).toBe(1);
            expect(list[0].worker_id).toBe(result.workerId);

            // The handler that ran was THIS domain's, and the opaque reference it was
            // handed back is the one the schedule stored.
            const diag = list[0].diagnostic ?? {};
            expect(diag.domain).toBe(c.domain);
            expect(diag.domain_ref_keys).toEqual(Object.keys(c.ref).sort());
            expect(diag.mutation).toBe("not_productized_v1");
        }
    });

    it("a consumer key that is NOT registered fails terminally rather than silently passing", async () => {
        // The control for the test above: if `unregisteredHandler === 0` were vacuous,
        // this would also read zero.
        const past = new Date(Date.now() - 60_000).toISOString();
        await db.from("scheduled_work").insert({
            handler_key: "financials.periodic_billing.evaluate.NOT_REGISTERED",
            recurrence_kind: "one_time", next_due_at: past, label: CONSUMER_TAG,
        });

        const result = await runScheduledWorkWake(db);

        expect(result.claimed).toBe(1);
        expect(result.unregisteredHandler).toBe(1);
        expect(result.terminallyFailed).toBe(1);
        expect(result.completed).toBe(0);
    });

    it("V1 consumers mutate nothing — every outcome is a completed evaluation", async () => {
        // Stated as a limitation in the consumers file; asserted here so productizing
        // a mutation cannot happen without this test being consciously changed.
        const past = new Date(Date.now() - 60_000).toISOString();
        for (const c of CONSUMERS) {
            await db.from("scheduled_work").insert({
                handler_key: c.key, recurrence_kind: "one_time",
                next_due_at: past, label: CONSUMER_TAG, domain_ref: c.ref,
            });
        }
        const result = await runScheduledWorkWake(db);
        expect(result.completed).toBe(3);

        const { data } = await db
            .from("scheduled_work_attempts")
            .select("diagnostic")
            .in("handler_key", CONSUMERS.map((c) => c.key));
        const diags = ((data ?? []) as { diagnostic: Record<string, unknown> | null }[])
            .map((r) => r.diagnostic?.mutation);
        expect(diags.length).toBeGreaterThanOrEqual(3);
        expect(new Set(diags)).toEqual(new Set(["not_productized_v1"]));
    });
});

describe.runIf(LIVE)("governed scheduled work — the clock leaves a mark", () => {
    beforeEach(async () => {
        __resetScheduledWorkRegistryForTests();
        await cleanupConsumers();
    });
    afterAll(cleanupConsumers);

    async function clock() {
        const { data } = await db
            .from("scheduled_work_clock")
            .select("first_wake_at,last_wake_at,wake_count,last_worker_id,last_summary")
            .eq("id", "singleton")
            .single();
        return data as {
            first_wake_at: string | null; last_wake_at: string | null; wake_count: number;
            last_worker_id: string | null; last_summary: Record<string, number> | null;
        };
    }

    it("a wake with NOTHING due is still recorded — the empty environment case", async () => {
        // This is the whole reason the clock exists. A freshly deployed scheduler has
        // no schedules, so occurrences and attempts stay empty and a real external
        // wake is indistinguishable from a cron that never fired.
        const before = await clock();
        const result = await runScheduledWorkWake(db);
        expect(result.claimed).toBe(0);

        const after = await clock();
        expect(after.wake_count).toBe(before.wake_count + 1);
        expect(after.last_worker_id).toBe(result.workerId);
        expect(result.clockRecordedAt).not.toBeNull();
        expect(after.last_wake_at).toBe(result.clockRecordedAt);
    });

    it("the recorded time is the DATABASE's, not the caller's", async () => {
        // A clock certified against the caller's own clock certifies nothing.
        const wildlyWrong = new Date("2001-01-01T00:00:00.000Z");
        const result = await runScheduledWorkWake(db, { now: wildlyWrong });
        const after = await clock();
        expect(after.last_wake_at).not.toBeNull();
        expect(new Date(after.last_wake_at!).getUTCFullYear()).toBeGreaterThan(2020);
        expect(result.clockRecordedAt).toBe(after.last_wake_at);
    });

    it("first_wake_at is set once and never moves", async () => {
        await runScheduledWorkWake(db);
        const first = await clock();
        expect(first.first_wake_at).not.toBeNull();
        await runScheduledWorkWake(db);
        const second = await clock();
        expect(second.first_wake_at).toBe(first.first_wake_at);
        expect(second.wake_count).toBe(first.wake_count + 1);
    });

    it("overlapping wakes do not lose a tick", async () => {
        // The counter exists to observe a clock under load, so losing increments
        // under concurrency would break it exactly when it matters. Read-then-write
        // in the app would; the atomic increment in the database does not.
        const before = await clock();
        await Promise.all(Array.from({ length: 5 }, () => runScheduledWorkWake(db)));
        const after = await clock();
        expect(after.wake_count).toBe(before.wake_count + 5);
    });

    it("the summary records what the wake actually did", async () => {
        registerScheduledWorkConsumers();
        const past = new Date(Date.now() - 60_000).toISOString();
        await db.from("scheduled_work").insert({
            handler_key: BILLING_PERIODIC_HANDLER_KEY, recurrence_kind: "one_time",
            next_due_at: past, label: CONSUMER_TAG,
        });
        await runScheduledWorkWake(db);
        const after = await clock();
        expect(after.last_summary).toMatchObject({ claimed: 1, completed: 1 });
    });

    it("a wake that THROWS is still recorded — arrival is not the same as success", async () => {
        // Otherwise a scheduler broken at materialize time reads to an operator as a
        // clock that never fired, and they go looking in the wrong place.
        const exploding = {
            ...db,
            from(table: string) {
                if (table === "scheduled_work") throw new Error("materialize exploded");
                return (db as unknown as { from: (t: string) => unknown }).from(table);
            },
            rpc: (...args: unknown[]) =>
                (db as unknown as { rpc: (...a: unknown[]) => unknown }).rpc(...args),
        } as unknown as SupabaseClient;

        const before = await clock();
        await expect(runScheduledWorkWake(exploding)).rejects.toThrow(/materialize exploded/);
        const after = await clock();
        expect(after.wake_count).toBe(before.wake_count + 1);
    });
});
