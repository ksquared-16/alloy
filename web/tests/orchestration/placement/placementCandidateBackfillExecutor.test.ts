/**
 * THE BACKFILL EXECUTOR — effects, not the plan.
 *
 * `placementCandidateBackfill.test.ts` imports `__testing.buildCandidateRowsForOpportunity` and
 * covers the PLAN: seed-key determinism, eligibility, site precedence. It never calls
 * `runPlacementCandidateBackfill`, the function that actually issues the inserts at `:411`. Its
 * closing test — "does not delete or mutate existing candidates (planning only)" — is worth reading
 * carefully: the planner is a pure function with no client, so there is nothing there that COULD
 * mutate. The reassuring name covers the executor; the assertion does not reach it.
 *
 * That gap matters because backfill writes rows for real tenants, in bulk, and its idempotency is
 * enforced by a seed-key lookup in application code rather than by the database alone.
 *
 * These tests pin the EXECUTION contract, and deliberately mirror
 * `placementCandidateOcmRepairExecutor.test.ts` so the two executors' differing failure semantics
 * can be compared side by side. Both continue past a failed row; the bulk lifecycle hook does not.
 */
import { describe, expect, it } from "vitest";
import { runPlacementCandidateBackfill } from "@/lib/orchestration/placement/backfill/placementCandidateBackfill";

const ORG = "org-1";
type Rec = Record<string, unknown>;

type Fixture = {
    opps: Rec[];
    /** OCM rows keyed by opportunity id. */
    ocms?: Record<string, Rec[]>;
    /** Seed keys already present — the idempotency guard. */
    existingSeedKeys?: string[];
    /** Seed keys whose insert should be refused. */
    failInsertsFor?: string[];
    oppsError?: { message: string } | null;
    ocmError?: { message: string } | null;
};

function mockSupabase(fx: Fixture) {
    const captured = {
        inserts: [] as Rec[],
        oppLimit: null as number | null,
        ocmLoads: [] as string[],
    };
    const client = {
        from(table: string) {
            const filters: Rec = {};
            let pendingInsert: Rec | null = null;
            const builder: Rec = {
                select() { return builder; },
                eq(c: string, v: unknown) { filters[c] = v; return builder; },
                in(c: string, v: unknown) { filters[c] = v; return builder; },
                limit(n: number) { captured.oppLimit = n; return builder; },
                insert(row: Rec) { pendingInsert = row; return builder; },
                maybeSingle() {
                    const seed = String(filters.seed_key);
                    const hit = (fx.existingSeedKeys ?? []).includes(seed);
                    return Promise.resolve({ data: hit ? { id: `pc-${seed}` } : null, error: null });
                },
                then(resolve: (v: { data?: unknown; error: { message: string } | null }) => unknown) {
                    if (pendingInsert) {
                        const row = pendingInsert as Rec;
                        captured.inserts.push(row);
                        const fail = (fx.failInsertsFor ?? []).includes(String(row.seed_key));
                        return Promise.resolve({
                            error: fail ? { message: `insert refused for ${String(row.seed_key)}` } : null,
                        }).then(resolve);
                    }
                    if (table === "opportunities") {
                        return Promise.resolve({
                            data: fx.opps,
                            error: fx.oppsError ?? null,
                        }).then(resolve);
                    }
                    if (table === "opportunity_customer_members") {
                        const oppId = String(filters.opportunity_id);
                        captured.ocmLoads.push(oppId);
                        return Promise.resolve({
                            data: (fx.ocms ?? {})[oppId] ?? [],
                            error: fx.ocmError ?? null,
                        }).then(resolve);
                    }
                    return Promise.resolve({ data: [], error: null }).then(resolve);
                },
            };
            return builder;
        },
    };
    return { client: client as never, captured };
}

const opp = (id: string, over: Rec = {}): Rec => ({
    id,
    customer_id: "cust-1",
    location_id: "site-opp",
    status_key: "waitlisted",
    created_at: "2026-01-01T00:00:00.000Z",
    metadata: {},
    ...over,
});

const ocm = (id: string, over: Rec = {}): Rec => ({
    id,
    customer_member_id: `cm-${id}`,
    outcome_status_key: "waitlisted",
    start_date: null,
    program_category_id: null,
    location_program_categories: { key: "infant" },
    location_id: "site-ocm",
    program_room_cohort_key: null,
    metadata: {},
    customer_members: {
        person_id: `person-${id}`,
        display_name: `Child ${id}`,
        metadata: {},
        persons: { date_of_birth: "2024-01-01" },
    },
    ...over,
});

describe("runPlacementCandidateBackfill — a dry run creates nothing", () => {
    it("proposes rows and issues no insert", async () => {
        const { client, captured } = mockSupabase({
            opps: [opp("opp-1")],
            ocms: { "opp-1": [ocm("ocm-1")] },
        });
        const res = await runPlacementCandidateBackfill(client, { orgId: ORG, dryRun: true });

        // The guard is pointless if nothing was planned.
        expect(res.counts.real_candidates_proposed).toBeGreaterThan(0);
        expect(res.counts.real_candidates_created).toBe(0);
        expect(captured.inserts).toHaveLength(0);
    });
});

describe("runPlacementCandidateBackfill — the rows it actually writes", () => {
    it("inserts one org-scoped candidate per eligible child", async () => {
        const { client, captured } = mockSupabase({
            opps: [opp("opp-1")],
            ocms: { "opp-1": [ocm("ocm-1"), ocm("ocm-2")] },
        });
        const res = await runPlacementCandidateBackfill(client, { orgId: ORG });

        expect(captured.inserts).toHaveLength(2);
        expect(res.counts.real_candidates_created).toBe(2);
        for (const row of captured.inserts) {
            expect(row.org_id).toBe(ORG);
            expect(row.opportunity_id).toBe("opp-1");
            expect(row.status).toBe("active");
            expect(row.is_synthetic_fallback).toBe(false);
            expect(typeof row.seed_key).toBe("string");
        }
        // Each child gets its own row, not a shared one.
        expect(captured.inserts.map((r) => r.opportunity_customer_member_id).sort()).toEqual([
            "ocm-1",
            "ocm-2",
        ]);
        // Seed keys are what makes a re-run safe, so they must differ per child.
        expect(new Set(captured.inserts.map((r) => r.seed_key)).size).toBe(2);
    });

    it("is idempotent: a child whose seed key already exists is not written again", async () => {
        // Derive the real seed key from a first run rather than hardcoding its format.
        const probe = mockSupabase({ opps: [opp("opp-1")], ocms: { "opp-1": [ocm("ocm-1"), ocm("ocm-2")] } });
        await runPlacementCandidateBackfill(probe.client, { orgId: ORG });
        const seeded = probe.captured.inserts.find((r) => r.opportunity_customer_member_id === "ocm-1")!;

        const { client, captured } = mockSupabase({
            opps: [opp("opp-1")],
            ocms: { "opp-1": [ocm("ocm-1"), ocm("ocm-2")] },
            existingSeedKeys: [String(seeded.seed_key)],
        });
        const res = await runPlacementCandidateBackfill(client, { orgId: ORG });

        expect(res.counts.skipped_existing).toBe(1);
        expect(captured.inserts).toHaveLength(1);
        expect(captured.inserts[0]!.opportunity_customer_member_id).toBe("ocm-2");
    });

    it("a fully seeded tenant is a no-op on re-run", async () => {
        const probe = mockSupabase({ opps: [opp("opp-1")], ocms: { "opp-1": [ocm("ocm-1"), ocm("ocm-2")] } });
        await runPlacementCandidateBackfill(probe.client, { orgId: ORG });
        const allSeeds = probe.captured.inserts.map((r) => String(r.seed_key));

        const { client, captured } = mockSupabase({
            opps: [opp("opp-1")],
            ocms: { "opp-1": [ocm("ocm-1"), ocm("ocm-2")] },
            existingSeedKeys: allSeeds,
        });
        const res = await runPlacementCandidateBackfill(client, { orgId: ORG });

        expect(captured.inserts).toHaveLength(0);
        expect(res.counts.real_candidates_created).toBe(0);
        expect(res.counts.skipped_existing).toBe(2);
    });

    it("does not load children for, or write against, a non-waitlist opportunity", async () => {
        const { client, captured } = mockSupabase({
            opps: [opp("opp-1", { status_key: "enrolled" })],
            ocms: { "opp-1": [ocm("ocm-1")] },
        });
        const res = await runPlacementCandidateBackfill(client, { orgId: ORG });

        expect(res.counts.skipped_not_waitlist).toBe(1);
        expect(captured.ocmLoads).toHaveLength(0); // skipped before the child read
        expect(captured.inserts).toHaveLength(0);
    });
});

describe("runPlacementCandidateBackfill — partial failure", () => {
    /**
     * PER-ROW, NOT ALL-OR-NOTHING.
     *
     * One refused insert must not abandon the scan, and it must be reported rather than folded
     * into a success count. This is the same contract as the OCM repair executor and the OPPOSITE
     * of `ensurePlacementCandidatesForWaitlistedChildrenBulk`, which issues a single statement and
     * loses the whole batch. Both are defensible; neither was written down.
     */
    it("continues past a refused insert, counts it, and names the seed key", async () => {
        const probe = mockSupabase({ opps: [opp("opp-1")], ocms: { "opp-1": [ocm("ocm-1"), ocm("ocm-2"), ocm("ocm-3")] } });
        await runPlacementCandidateBackfill(probe.client, { orgId: ORG });
        const doomed = String(probe.captured.inserts.find((r) => r.opportunity_customer_member_id === "ocm-2")!.seed_key);

        const { client, captured } = mockSupabase({
            opps: [opp("opp-1")],
            ocms: { "opp-1": [ocm("ocm-1"), ocm("ocm-2"), ocm("ocm-3")] },
            failInsertsFor: [doomed],
        });
        const res = await runPlacementCandidateBackfill(client, { orgId: ORG });

        expect(captured.inserts).toHaveLength(3); // all attempted
        expect(res.counts.errors).toBe(1);
        expect(res.counts.real_candidates_created).toBe(2); // the lawful rows still landed
        expect(res.error_messages).toHaveLength(1);
        expect(res.error_messages[0]).toContain(doomed);
    });

    it("a child-load failure is reported and does not abort the whole run", async () => {
        const { client, captured } = mockSupabase({
            opps: [opp("opp-1")],
            ocms: { "opp-1": [ocm("ocm-1")] },
            ocmError: { message: "connection reset" },
        });
        const res = await runPlacementCandidateBackfill(client, { orgId: ORG });

        expect(res.counts.errors).toBe(1);
        expect(res.error_messages[0]).toContain("opp-1");
        expect(captured.inserts).toHaveLength(0);
    });

    it("an opportunity load failure throws rather than reporting a clean empty run", async () => {
        const { client } = mockSupabase({ opps: [], oppsError: { message: "connection reset" } });
        await expect(runPlacementCandidateBackfill(client, { orgId: ORG })).rejects.toThrow(
            /opportunities load failed/,
        );
    });
});

describe("runPlacementCandidateBackfill — scan bound", () => {
    /**
     * The limit is clamped, not trusted. An operator asking for a million rows must not get a
     * million-row scan against a tenant database.
     */
    it("clamps an over-large limit and floors a nonsensical one", async () => {
        const high = mockSupabase({ opps: [] });
        await runPlacementCandidateBackfill(high.client, { orgId: ORG, limit: 10_000_000 });
        expect(high.captured.oppLimit).toBe(10000);

        const low = mockSupabase({ opps: [] });
        await runPlacementCandidateBackfill(low.client, { orgId: ORG, limit: -5 });
        expect(low.captured.oppLimit).toBe(1);
    });
});
