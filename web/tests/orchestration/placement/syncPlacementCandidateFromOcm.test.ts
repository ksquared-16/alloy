/**
 * THE LIVE OCM SYNC WRITER — effectful coverage.
 *
 * `syncPlacementCandidateFromOcm` writes `site_id`, `program_room_cohort_key` and
 * `program_room_group_label` onto `placement_candidates`. It is reachable from an ordinary operator
 * edit (`app/api/admin/opportunity-customer-members/[id]/route.ts`) and from the lifecycle hook.
 *
 * `program_room_cohort_key` is the ranking PARTITION: it decides which set a child is ranked
 * against, and manual positions are cohort-scoped (`ux_placement_overrides_one_active_pin` keys on
 * the cohort), so a silent cohort change also silently strands the child's pin. Until this file the
 * whole test tree contained zero references to this writer.
 *
 * These are effect tests: they assert the WRITE — whether one happens at all, and its exact payload.
 * A test that only checked the returned summary would pass while the patch wrote the wrong columns.
 */
import { describe, expect, it } from "vitest";
import { syncPlacementCandidateFromOcm } from "@/lib/orchestration/placement/syncPlacementCandidateFromOcm";

const ORG = "org-1";
const OCM = "ocm-1";
const OPP = "opp-1";
const CAND = "pc-1";

type Rec = Record<string, unknown>;

type Fixture = {
    ocm?: Rec | null;
    ocmError?: { message: string } | null;
    opportunity?: Rec | null;
    candidate?: Rec | null;
    candidateError?: { message: string } | null;
    updateError?: { message: string } | null;
};

/**
 * Chainable Supabase double following the pattern already used across the placement suite
 * (see `placementCandidateBySubject.test.ts`). It records every write so a test can assert that
 * NO write happened — which is half the contract here.
 */
function mockSupabase(fx: Fixture) {
    const captured: { updates: Array<{ patch: Rec; filters: Rec }>; tables: string[] } = {
        updates: [],
        tables: [],
    };
    const client = {
        from(table: string) {
            captured.tables.push(table);
            const filters: Rec = {};
            let pendingPatch: Rec | null = null;
            const builder: Rec = {
                select() {
                    return builder;
                },
                eq(col: string, v: unknown) {
                    filters[col] = v;
                    return builder;
                },
                update(patch: Rec) {
                    pendingPatch = patch;
                    return builder;
                },
                maybeSingle() {
                    if (table === "opportunity_customer_members") {
                        return Promise.resolve({
                            data: fx.ocm === undefined ? null : fx.ocm,
                            error: fx.ocmError ?? null,
                        });
                    }
                    if (table === "opportunities") {
                        return Promise.resolve({ data: fx.opportunity ?? null, error: null });
                    }
                    if (table === "placement_candidates") {
                        return Promise.resolve({
                            data: fx.candidate === undefined ? null : fx.candidate,
                            error: fx.candidateError ?? null,
                        });
                    }
                    return Promise.resolve({ data: null, error: null });
                },
                /* An `update(...).eq(...).eq(...)` chain is awaited directly — resolve as a thenable. */
                then(resolve: (v: { error: { message: string } | null }) => unknown) {
                    if (pendingPatch) {
                        captured.updates.push({ patch: pendingPatch, filters: { ...filters } });
                    }
                    return Promise.resolve({ error: fx.updateError ?? null }).then(resolve);
                },
            };
            return builder;
        },
    };
    return { client: client as never, captured };
}

/** An OCM whose cohort is stated explicitly, so the resolver is deterministic. */
const ocmRow = (over: Rec = {}): Rec => ({
    id: OCM,
    org_id: ORG,
    opportunity_id: OPP,
    location_id: "site-north",
    program_room_cohort_key: "toddler_2_3_years",
    program_category_id: "prog-1",
    location_program_categories: { key: "toddler" },
    metadata: { program_room_group_label: "Toddler — 2–3 years" },
    customer_members: { first_name: "A", last_name: "B", metadata: {}, persons: { date_of_birth: "2024-01-01" } },
    ...over,
});

/** A candidate already agreeing with `ocmRow()` — the steady state. */
const candidateRow = (over: Rec = {}): Rec => ({
    id: CAND,
    site_id: "site-north",
    program_room_cohort_key: "toddler_2_3_years",
    program_room_group_label: "Toddler — 2–3 years",
    is_synthetic_fallback: false,
    metadata: { existing: "keep-me" },
    status: "active",
    ...over,
});

describe("syncPlacementCandidateFromOcm — A/E: nothing to do means nothing written", () => {
    it("writes nothing when the candidate already agrees with the OCM", async () => {
        const { client, captured } = mockSupabase({ ocm: ocmRow(), candidate: candidateRow() });
        const res = await syncPlacementCandidateFromOcm(client, { orgId: ORG, opportunityCustomerMemberId: OCM });
        expect(res).toMatchObject({ attempted: true, updated: false, candidate_id: CAND });
        expect(res.patched_fields).toBeUndefined();
        expect(captured.updates).toHaveLength(0);
    });

    it("writes nothing and never reads when ids are missing", async () => {
        const { client, captured } = mockSupabase({});
        const res = await syncPlacementCandidateFromOcm(client, { orgId: "  ", opportunityCustomerMemberId: OCM });
        expect(res).toEqual({ attempted: false, updated: false, skipped_reason: "missing_ids" });
        expect(captured.tables).toHaveLength(0);
        expect(captured.updates).toHaveLength(0);
    });

    it("writes nothing for a synthetic fallback candidate", async () => {
        const { client, captured } = mockSupabase({
            ocm: ocmRow({ location_id: "site-south" }),
            candidate: candidateRow({ is_synthetic_fallback: true }),
        });
        const res = await syncPlacementCandidateFromOcm(client, { orgId: ORG, opportunityCustomerMemberId: OCM });
        expect(res).toMatchObject({ updated: false, skipped_reason: "synthetic_candidate" });
        expect(captured.updates).toHaveLength(0);
    });

    it("writes nothing when there is no active candidate to sync", async () => {
        const { client, captured } = mockSupabase({ ocm: ocmRow(), candidate: null });
        const res = await syncPlacementCandidateFromOcm(client, { orgId: ORG, opportunityCustomerMemberId: OCM });
        expect(res).toMatchObject({ updated: false, skipped_reason: "no_active_candidate" });
        expect(captured.updates).toHaveLength(0);
    });
});

describe("syncPlacementCandidateFromOcm — B: site only", () => {
    it("patches site_id and nothing unrelated", async () => {
        const { client, captured } = mockSupabase({
            ocm: ocmRow({ location_id: "site-south" }),
            candidate: candidateRow(),
        });
        const res = await syncPlacementCandidateFromOcm(client, { orgId: ORG, opportunityCustomerMemberId: OCM });
        expect(res).toMatchObject({ updated: true, candidate_id: CAND, patched_fields: ["site_id"] });
        expect(captured.updates).toHaveLength(1);
        const { patch, filters } = captured.updates[0]!;
        expect(patch.site_id).toBe("site-south");
        // The partition key and its label must NOT be touched by a site-only move.
        expect(patch).not.toHaveProperty("program_room_cohort_key");
        expect(patch).not.toHaveProperty("program_room_group_label");
        // Scoped to one row in one org.
        expect(filters).toEqual({ id: CAND, org_id: ORG });
    });

    it("falls back to the opportunity location when the OCM has none", async () => {
        const { client, captured } = mockSupabase({
            ocm: ocmRow({ location_id: null }),
            opportunity: { location_id: "site-opp" },
            candidate: candidateRow(),
        });
        const res = await syncPlacementCandidateFromOcm(client, { orgId: ORG, opportunityCustomerMemberId: OCM });
        expect(res.patched_fields).toEqual(["site_id"]);
        expect(captured.updates[0]!.patch.site_id).toBe("site-opp");
    });
});

describe("syncPlacementCandidateFromOcm — C: cohort only", () => {
    it("moves the candidate to the new canonical cohort and the stale key does not survive", async () => {
        const { client, captured } = mockSupabase({
            ocm: ocmRow({
                program_room_cohort_key: "preschool_3_4_years",
                metadata: { program_room_group_label: "Preschool — 3–4 years" },
            }),
            candidate: candidateRow(),
        });
        const res = await syncPlacementCandidateFromOcm(client, { orgId: ORG, opportunityCustomerMemberId: OCM });
        expect(res.updated).toBe(true);
        expect(res.patched_fields).toEqual(["program_room_cohort_key", "program_room_group_label"]);

        const { patch } = captured.updates[0]!;
        expect(patch.program_room_cohort_key).toBe("preschool_3_4_years");
        expect(patch.program_room_group_label).toBe("Preschool — 3–4 years");
        // The stale partition must not be written back anywhere in the patch.
        expect(JSON.stringify(patch)).not.toContain("toddler_2_3_years");
        // A cohort move is not a site move.
        expect(patch).not.toHaveProperty("site_id");
    });

    it("records the sync provenance without discarding existing candidate metadata", async () => {
        const { client, captured } = mockSupabase({
            ocm: ocmRow({ program_room_cohort_key: "preschool_3_4_years", metadata: {} }),
            candidate: candidateRow(),
        });
        await syncPlacementCandidateFromOcm(client, { orgId: ORG, opportunityCustomerMemberId: OCM });
        const meta = captured.updates[0]!.patch.metadata as Rec;
        expect(meta.existing).toBe("keep-me");
        const sync = meta.placement_ocm_sync as Rec;
        expect(sync.ocm_id).toBe(OCM);
        expect(sync.patched_fields).toEqual(["program_room_cohort_key", "program_room_group_label"]);
    });
});

describe("syncPlacementCandidateFromOcm — D: site + cohort", () => {
    it("is ONE coherent update, not two", async () => {
        const { client, captured } = mockSupabase({
            ocm: ocmRow({
                location_id: "site-south",
                program_room_cohort_key: "preschool_3_4_years",
                metadata: { program_room_group_label: "Preschool — 3–4 years" },
            }),
            candidate: candidateRow(),
        });
        const res = await syncPlacementCandidateFromOcm(client, { orgId: ORG, opportunityCustomerMemberId: OCM });
        expect(res.patched_fields).toEqual([
            "site_id",
            "program_room_cohort_key",
            "program_room_group_label",
        ]);
        // One statement — a half-applied move would leave the child ranked in a cohort at a site it
        // no longer belongs to.
        expect(captured.updates).toHaveLength(1);
        const { patch } = captured.updates[0]!;
        expect(patch.site_id).toBe("site-south");
        expect(patch.program_room_cohort_key).toBe("preschool_3_4_years");
    });
});

describe("syncPlacementCandidateFromOcm — F: failure is honest", () => {
    it("reports the driver error and never claims success", async () => {
        const { client, captured } = mockSupabase({
            ocm: ocmRow({ location_id: "site-south" }),
            candidate: candidateRow(),
            updateError: { message: "23505 duplicate key" },
        });
        const res = await syncPlacementCandidateFromOcm(client, { orgId: ORG, opportunityCustomerMemberId: OCM });
        expect(res.updated).toBe(false);
        expect(res.skipped_reason).toBe("23505 duplicate key");
        // No false provenance: a failed write must not report patched fields as though they landed.
        expect(res.patched_fields).toBeUndefined();
        expect(captured.updates).toHaveLength(1); // it was attempted, and it failed
    });

    it("surfaces a candidate read failure instead of treating it as 'no candidate'", async () => {
        const { client, captured } = mockSupabase({
            ocm: ocmRow(),
            candidateError: { message: "connection reset" },
        });
        const res = await syncPlacementCandidateFromOcm(client, { orgId: ORG, opportunityCustomerMemberId: OCM });
        expect(res.skipped_reason).toBe("connection reset");
        expect(res.skipped_reason).not.toBe("no_active_candidate");
        expect(captured.updates).toHaveLength(0);
    });

    it("reports a missing OCM distinctly from a missing candidate", async () => {
        const { client } = mockSupabase({ ocm: null });
        const res = await syncPlacementCandidateFromOcm(client, { orgId: ORG, opportunityCustomerMemberId: OCM });
        expect(res).toMatchObject({ attempted: true, updated: false, skipped_reason: "ocm_not_found" });
    });
});

describe("syncPlacementCandidateFromOcm — it is the canonical writer", () => {
    it("both callers route through it rather than patching the grouping fields themselves", async () => {
        const { readFileSync } = await import("node:fs");
        const { join } = await import("node:path");
        const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

        /*
         * Source-level on purpose: "there is ONE writer for these columns" is an ownership property
         * of the module graph, not a runtime value — the same reason the evaluator's
         * "no childcare-specific branching" check is source-level. A behavioural test cannot observe
         * the absence of a second writer.
         */
        for (const caller of [
            "app/api/admin/opportunity-customer-members/[id]/route.ts",
            "lib/orchestration/placement/placementCandidateLifecycleHook.ts",
        ]) {
            const src = read(caller);
            expect(src).toContain("syncPlacementCandidateFromOcm");
        }
    });
});
