/**
 * AN INCLUDE-ALL WORK VIEW IS THE PROCESS POPULATION — never an execution lane.
 *
 * "All Leads" has no predicates, so it means "every record in this process". It rendered 8 rows and
 * counted 7, because the count came from `primary_total_queue` → the `lifecycle_lead` lane, whose
 * allowlist is `case_status in (open, new_inquiry, new)`. One family sitting at `tour_scheduled` was
 * invisible to that lane. A record must never drop out of a count because its status is off some
 * worklist.
 *
 * These proofs are about the population read itself: what it selects, what it refuses to widen, and
 * that it is the SAME projection the rows come from.
 */
import { describe, expect, it, vi } from "vitest";
import {
    PROCESS_POPULATION_CAP,
    PROCESS_POPULATION_SELECT,
    loadWorkUnitProcessPopulation,
} from "@/lib/runtime/provisioning/workUnitProcessPopulation";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Minimal recording stub shaped like the PostgREST builder chain. */
function stubSupabase(rows: Record<string, unknown>[]) {
    const calls: Record<string, unknown> = { eq: [] as unknown[], in: [] as unknown[] };
    const builder: Record<string, unknown> = {
        select: vi.fn((s: string) => {
            calls.select = s;
            return builder;
        }),
        eq: vi.fn((k: string, v: unknown) => {
            (calls.eq as unknown[]).push([k, v]);
            return builder;
        }),
        in: vi.fn((k: string, v: unknown) => {
            (calls.in as unknown[]).push([k, v]);
            return builder;
        }),
        limit: vi.fn((n: number) => {
            calls.limit = n;
            return Promise.resolve({ data: rows, error: null });
        }),
    };
    return {
        supabase: { from: vi.fn((t: string) => ((calls.from = t), builder)) } as never,
        calls,
    };
}

const scope = { orgId: "org-1", workUnitId: "wu-1" };

describe("the process population", () => {
    it("reads the work unit's records with NO status predicate", async () => {
        const { supabase, calls } = stubSupabase([{ id: "a" }, { id: "b" }]);
        const pop = await loadWorkUnitProcessPopulation({ supabase, ...scope });

        expect(calls.from).toBe("opportunities");
        expect(calls.eq).toEqual([
            ["org_id", "org-1"],
            ["work_unit_id", "wu-1"],
        ]);
        // THE POINT: nothing NARROWS by status. `status_key` is selected (predicates read it) but is
        // never filtered on — a lane's allowlist has no business defining the process population.
        expect(JSON.stringify({ eq: calls.eq, in: calls.in })).not.toContain("status");
        expect(calls.select).toContain("status_key");
        expect(pop.rows).toHaveLength(2);
        expect(pop.truncated).toBe(false);
    });

    it("selects the SAME fields the provisioning answer publishes rows from", () => {
        // A count evaluated over fewer fields than the rows would silently disagree on any predicate
        // that reads a missing one. The answer imports these constants rather than restating them.
        const answer = readFileSync(
            join(process.cwd(), "lib/runtime/provisioning/workUnitProvisioningAnswer.ts"),
            "utf8",
        );
        expect(answer).toContain("PROCESS_POPULATION_SELECT");
        expect(answer).toContain("PROCESS_POPULATION_CAP");
        expect(answer).not.toContain('.select("id, org_id, work_unit_id, status_key');
        expect(PROCESS_POPULATION_SELECT).toContain("status_key");
        expect(PROCESS_POPULATION_SELECT).toContain("stage_key");
    });

    it("APPLIES the caller's record scope — a population must not widen what a restricted operator sees", async () => {
        const { supabase, calls } = stubSupabase([{ id: "a" }]);
        await loadWorkUnitProcessPopulation({
            supabase,
            ...scope,
            scope: { workUnitIds: ["wu-1"], locationIds: ["loc-1"], impossible: false },
        });
        expect(calls.in).toEqual([
            ["work_unit_id", ["wu-1"]],
            ["location_id", ["loc-1"]],
        ]);
    });

    it("an IMPOSSIBLE scope is an empty population, never an unscoped one", async () => {
        const { supabase, calls } = stubSupabase([{ id: "leak" }]);
        const pop = await loadWorkUnitProcessPopulation({ supabase, ...scope, scopeImpossible: true });
        expect(pop.rows).toEqual([]);
        // It must not have queried at all — an unscoped read that is then discarded is still a read.
        expect(calls.from).toBeUndefined();
    });

    it("reports truncation rather than letting a capped read undercount silently", async () => {
        const many = Array.from({ length: PROCESS_POPULATION_CAP }, (_, i) => ({ id: String(i) }));
        const { supabase } = stubSupabase(many);
        const pop = await loadWorkUnitProcessPopulation({ supabase, ...scope });
        expect(pop.truncated).toBe(true);
    });

    it("propagates a read failure — the caller reports unknown, never a substitute number", async () => {
        const builder: Record<string, unknown> = {
            select: () => builder,
            eq: () => builder,
            in: () => builder,
            limit: () => Promise.resolve({ data: null, error: { message: "boom" } }),
        };
        const supabase = { from: () => builder } as never;
        await expect(loadWorkUnitProcessPopulation({ supabase, ...scope })).rejects.toThrow(/boom/);
    });
});

describe("the totals route counts over the population, not the lane", () => {
    const ROUTE = readFileSync(join(process.cwd(), "app/api/admin/queue-view-totals/route.ts"), "utf8");

    it("uses the process population where a Business Process governs the work unit", () => {
        expect(ROUTE).toContain("loadWorkUnitProcessPopulation");
        expect(ROUTE).toContain("if (stages.length > 0)");
    });

    it("does not prefer a separate lane total for an include-all view", () => {
        // `exactLaneTotal` on the population branch is the population's own size — preferring a lane's
        // total is exactly what substituted a worklist for the process.
        expect(ROUTE).toContain("exactLaneTotal: population.truncated ? null : population.rows.length");
    });

    it("keeps the lane path for work units with no Business Process", () => {
        expect(ROUTE).toContain("getWorkUnitQueueItems");
        expect(ROUTE).toContain("} else {");
    });
});
