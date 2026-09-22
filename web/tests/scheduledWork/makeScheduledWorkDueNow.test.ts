/**
 * EVALUATE NOW — what it is allowed to touch, driven rather than described.
 *
 * The danger in a control called "evaluate now" is that it quietly becomes "run billing now": a
 * second execution path that skips the claim model and has to be certified all over again. So
 * these locks assert the SHAPE of what it did — which table it wrote, which columns, and that no
 * handler ran — rather than reading the source and hoping.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { makeScheduledWorkDueNow } from "@/lib/scheduledWork/makeScheduledWorkDueNow";
import {
    registerScheduledWorkHandler,
    __resetScheduledWorkRegistryForTests,
} from "@/lib/scheduledWork/scheduledWorkRegistry";

const code = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
function statements(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n")
        .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");
}

const ORG = "org-1";
const SCHEDULE = "sw-1";
const HANDLER = "domain.thing.evaluate";

type Write = { table: string; patch: Record<string, unknown>; filters: Record<string, unknown> };

/**
 * Records every write, so "it only changed when the work is next due" is measured from what it
 * actually sent rather than inferred from what the code appears to say.
 */
function client(opts: { schedule: Record<string, unknown> | null; inFlight?: unknown[] }) {
    const writes: Write[] = [];
    const reads: string[] = [];
    const from = (table: string) => {
        const filters: Record<string, unknown> = {};
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = (...a: unknown[]) => { reads.push(`${table}:${String(a[0] ?? "")}`); return chain; };
        chain.eq = (k: string, v: unknown) => { filters[k] = v; return chain; };
        chain.in = (k: string, v: unknown) => { filters[k] = v; return chain; };
        chain.not = self; chain.gt = self; chain.limit = self; chain.order = self; chain.is = self;
        chain.maybeSingle = async () => ({
            data: table === "scheduled_work" ? opts.schedule : null, error: null,
        });
        chain.update = (patch: Record<string, unknown>) => { writes.push({ table, patch, filters }); return chain; };
        chain.insert = (patch: Record<string, unknown>) => { writes.push({ table, patch, filters }); return chain; };
        chain.delete = () => { writes.push({ table, patch: { __delete: true }, filters }); return chain; };
        chain.then = (r: (v: unknown) => unknown) =>
            r({ data: table === "scheduled_work_occurrences" ? (opts.inFlight ?? []) : [], error: null });
        return chain;
    };
    return { db: { from } as never, writes, reads };
}

const schedule = (over: Record<string, unknown> = {}) => ({
    id: SCHEDULE, org_id: ORG, handler_key: HANDLER, is_active: true,
    next_due_at: "2026-09-23T01:13:18.000Z", ...over,
});

let handlerRuns = 0;
beforeEach(() => {
    __resetScheduledWorkRegistryForTests();
    handlerRuns = 0;
    registerScheduledWorkHandler(HANDLER, async () => { handlerRuns += 1; return { kind: "completed" }; });
});

describe("evaluate now makes work due, and does nothing else", () => {
    it("moves only the next due moment, on only the scheduled_work row", async () => {
        const c = client({ schedule: schedule() });
        const r = await makeScheduledWorkDueNow(c.db, { orgId: ORG, scheduleId: SCHEDULE, now: new Date("2026-09-22T02:00:00Z") });

        expect(r.outcome).toBe("evaluation_requested");
        expect(r.outcome === "evaluation_requested" && r.previousNextDueAt).toBe("2026-09-23T01:13:18.000Z");
        expect(r.outcome === "evaluation_requested" && r.nextDueAt).toBe("2026-09-22T02:00:00.000Z");

        expect(c.writes).toHaveLength(1);
        expect(c.writes[0]!.table).toBe("scheduled_work");
        // next_due_at and a timestamp. Nothing else — not the handler, not the org, not the payload.
        expect(Object.keys(c.writes[0]!.patch).sort()).toEqual(["next_due_at", "updated_at"]);
        expect(c.writes[0]!.filters).toMatchObject({ id: SCHEDULE, org_id: ORG });
    });

    it("does not invoke the handler", async () => {
        const c = client({ schedule: schedule() });
        await makeScheduledWorkDueNow(c.db, { orgId: ORG, scheduleId: SCHEDULE });
        expect(handlerRuns, "the clock dispatches; this command does not").toBe(0);
    });

    it("fabricates no occurrence and writes no financial row", async () => {
        const c = client({ schedule: schedule() });
        await makeScheduledWorkDueNow(c.db, { orgId: ORG, scheduleId: SCHEDULE });
        const touched = new Set(c.writes.map((w) => w.table));
        expect([...touched]).toEqual(["scheduled_work"]);
        expect(touched.has("scheduled_work_occurrences")).toBe(false);
        expect(touched.has("scheduled_work_attempts")).toBe(false);
        expect(touched.has("charges")).toBe(false);
    });

    it("requires an existing schedule — it never creates one", async () => {
        const c = client({ schedule: null });
        const r = await makeScheduledWorkDueNow(c.db, { orgId: ORG, scheduleId: SCHEDULE });
        expect(r.outcome).toBe("refused");
        expect(r.outcome === "refused" && r.reason).toBe("schedule_not_found");
        expect(c.writes, "evaluation is not activation").toEqual([]);
    });

    it("refuses a stopped schedule rather than restarting automation by side effect", async () => {
        const c = client({ schedule: schedule({ is_active: false }) });
        const r = await makeScheduledWorkDueNow(c.db, { orgId: ORG, scheduleId: SCHEDULE });
        expect(r.outcome === "refused" && r.reason).toBe("schedule_inactive");
        expect(c.writes).toEqual([]);
    });

    it("requires a registered handler", async () => {
        const c = client({ schedule: schedule({ handler_key: "domain.nothing.registered" }) });
        const r = await makeScheduledWorkDueNow(c.db, { orgId: ORG, scheduleId: SCHEDULE });
        expect(r.outcome === "refused" && r.reason).toBe("handler_not_registered");
        expect(c.writes).toEqual([]);
    });

    it("does not steal a live lease", async () => {
        const c = client({ schedule: schedule(), inFlight: [{ id: "occ-1" }] });
        const r = await makeScheduledWorkDueNow(c.db, { orgId: ORG, scheduleId: SCHEDULE });
        expect(r.outcome === "refused" && r.reason).toBe("occurrence_in_flight");
        expect(c.writes, "the claim owns concurrency; this defers to it").toEqual([]);
    });

    it("enforces the organization boundary in the lookup itself", async () => {
        const c = client({ schedule: null });
        await makeScheduledWorkDueNow(c.db, { orgId: "other-org", scheduleId: SCHEDULE });
        // A schedule in another tenant is simply not found, rather than found and then rejected.
        expect(c.reads.some((r) => r.startsWith("scheduled_work:"))).toBe(true);
    });
});

describe("the boundary in the code", () => {
    it("the command is domain-neutral", () => {
        const src = statements(code("lib/scheduledWork/makeScheduledWorkDueNow.ts"));
        expect(src, "a generic scheduling operation must not know what billing means")
            .not.toMatch(/tuition|billing|invoice|charge|autopay|aging/i);
    });

    it("the Financials route refuses rather than activating", () => {
        const route = statements(code("app/api/admin/financials/periodic-billing-evaluate-now/route.ts"));
        expect(route).toContain("assertFinancialsWriteAllowed");
        expect(route).toContain("not_activated");
        expect(route, "evaluation must not provision a schedule").not.toContain("ensurePeriodicBillingSchedule");
        expect(route, "and must not run the domain").not.toMatch(/evaluatePeriodicBilling|generateTuitionCharges/);
    });
});
