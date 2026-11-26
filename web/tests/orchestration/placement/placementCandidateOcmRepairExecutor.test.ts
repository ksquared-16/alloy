/**
 * THE OCM REPAIR EXECUTOR — effects, not the plan.
 *
 * `placementCandidateOcmRepair.test.ts` imports `__testing.planPlacementCandidateOcmRepair` and
 * covers the DECISION. `runPlacementCandidateOcmRepair` — the function that issues the writes at
 * `:295` and `:321` — had no coverage at all. That matters more than usual here: repair in this
 * subsystem has already misbehaved on real tenant data, which is why the historical duplicate
 * repair remains deliberately governed.
 *
 * These tests pin the EXECUTION contract: what is written, in what shape, what a dry run does, and
 * what happens to the rest of the batch when one row fails. That last one is the interesting
 * difference from the bulk ensure hook — this executor writes per row and CONTINUES past a failure,
 * where the hook issues one statement and loses everything. Both behaviours are defensible; neither
 * was written down.
 */
import { describe, expect, it } from "vitest";
import { runPlacementCandidateOcmRepair } from "@/lib/orchestration/placement/repair/placementCandidateOcmRepair";

const ORG = "org-1";
type Rec = Record<string, unknown>;

type Fixture = {
    candidates: Rec[];
    ocms?: Rec[];
    /** Candidate ids whose update should fail. */
    failUpdatesFor?: string[];
    candidatesError?: { message: string } | null;
};

function mockSupabase(fx: Fixture) {
    const captured: { updates: Array<{ id: string; patch: Rec }> } = { updates: [] };
    const client = {
        from(table: string) {
            const filters: Rec = {};
            let pendingPatch: Rec | null = null;
            const builder: Rec = {
                select() { return builder; },
                eq(col: string, v: unknown) { filters[col] = v; return builder; },
                in(col: string, v: unknown) { filters[col] = v; return builder; },
                order() { return builder; },
                limit() { return builder; },
                update(patch: Rec) { pendingPatch = patch; return builder; },
                then(resolve: (v: { data?: unknown; error: { message: string } | null }) => unknown) {
                    if (pendingPatch) {
                        const id = String(filters.id);
                        captured.updates.push({ id, patch: pendingPatch });
                        const fail = (fx.failUpdatesFor ?? []).includes(id);
                        return Promise.resolve({
                            error: fail ? { message: `write refused for ${id}` } : null,
                        }).then(resolve);
                    }
                    if (table === "placement_candidates") {
                        return Promise.resolve({
                            data: fx.candidates,
                            error: fx.candidatesError ?? null,
                        }).then(resolve);
                    }
                    if (table === "opportunity_customer_members") {
                        return Promise.resolve({ data: fx.ocms ?? [], error: null }).then(resolve);
                    }
                    return Promise.resolve({ data: [], error: null }).then(resolve);
                },
            };
            return builder;
        },
    };
    return { client: client as never, captured };
}

const candidate = (id: string, over: Rec = {}): Rec => ({
    id,
    org_id: ORG,
    opportunity_customer_member_id: `ocm-${id}`,
    site_id: "site-old",
    program_room_cohort_key: "infant",
    program_room_group_label: "Infant",
    is_synthetic_fallback: false,
    metadata: { keep: "me" },
    status: "active",
    ...over,
});

/** An OCM that disagrees with the candidate on both site and cohort. */
const ocm = (id: string, over: Rec = {}): Rec => ({
    id: `ocm-${id}`,
    location_id: "site-new",
    program_room_cohort_key: "infant_0_18_months",
    program_category_id: "prog-1",
    location_program_categories: { key: "infant" },
    metadata: { program_room_group_label: "Infant — 0–18 months" },
    ...over,
});

describe("runPlacementCandidateOcmRepair — dry run writes nothing", () => {
    it("counts the repairs it would make and issues no update", async () => {
        const { client, captured } = mockSupabase({
            candidates: [candidate("c1")],
            ocms: [ocm("c1")],
        });
        const res = await runPlacementCandidateOcmRepair(client, { orgId: ORG, dryRun: true });
        expect(res.counts.scanned).toBe(1);
        expect(res.counts.repaired_site + res.counts.repaired_cohort).toBeGreaterThan(0);
        expect(captured.updates).toHaveLength(0); // the whole point of a dry run
    });
});

describe("runPlacementCandidateOcmRepair — the write it actually issues", () => {
    it("patches site, cohort key and label in one update, scoped to the row", async () => {
        const { client, captured } = mockSupabase({
            candidates: [candidate("c1")],
            ocms: [ocm("c1")],
        });
        const res = await runPlacementCandidateOcmRepair(client, { orgId: ORG });
        expect(captured.updates).toHaveLength(1);
        const { id, patch } = captured.updates[0]!;
        expect(id).toBe("c1");
        expect(patch.site_id).toBe("site-new");
        expect(patch.program_room_cohort_key).toBe("infant_0_18_months");
        // Existing candidate metadata survives the repair stamp.
        expect((patch.metadata as Rec).keep).toBe("me");
        expect(res.counts.errors).toBe(0);
    });

    it("does not write for a synthetic candidate", async () => {
        const { client, captured } = mockSupabase({
            candidates: [candidate("c1", { is_synthetic_fallback: true })],
            ocms: [ocm("c1")],
        });
        const res = await runPlacementCandidateOcmRepair(client, { orgId: ORG });
        expect(res.counts.skipped_synthetic).toBe(1);
        expect(captured.updates).toHaveLength(0);
    });

    it("does not write when the OCM is missing", async () => {
        const { client, captured } = mockSupabase({ candidates: [candidate("c1")], ocms: [] });
        const res = await runPlacementCandidateOcmRepair(client, { orgId: ORG });
        expect(res.counts.missing_ocm).toBe(1);
        expect(captured.updates).toHaveLength(0);
    });

    it("is idempotent: a candidate already agreeing with its OCM is left alone", async () => {
        const { client, captured } = mockSupabase({
            candidates: [
                candidate("c1", {
                    site_id: "site-new",
                    program_room_cohort_key: "infant_0_18_months",
                    program_room_group_label: "Infant — 0–18 months",
                }),
            ],
            ocms: [ocm("c1")],
        });
        const res = await runPlacementCandidateOcmRepair(client, { orgId: ORG });
        expect(res.counts.unchanged).toBe(1);
        expect(res.counts.repaired_site).toBe(0);
        expect(res.counts.repaired_cohort).toBe(0);
        expect(captured.updates).toHaveLength(0);
    });
});

describe("runPlacementCandidateOcmRepair — partial failure", () => {
    /**
     * PER-ROW, NOT ALL-OR-NOTHING — the opposite of the bulk ensure hook, and worth stating.
     *
     * One refused write must not abandon the rest of the scan, and it must be reported rather than
     * folded into a success count.
     */
    it("continues past a failed row, counts it, and names it", async () => {
        const { client, captured } = mockSupabase({
            candidates: [candidate("c1"), candidate("c2"), candidate("c3")],
            ocms: [ocm("c1"), ocm("c2"), ocm("c3")],
            failUpdatesFor: ["c2"],
        });
        const res = await runPlacementCandidateOcmRepair(client, { orgId: ORG });

        expect(captured.updates.map((u) => u.id)).toEqual(["c1", "c2", "c3"]); // all attempted
        expect(res.counts.errors).toBe(1);
        expect(res.error_messages).toHaveLength(1);
        expect(res.error_messages[0]).toContain("c2");
        // The lawful rows still landed — a failure is not contagious here.
        expect(res.counts.repaired_site).toBe(2);
    });

    it("a candidate load failure throws rather than reporting a clean empty run", async () => {
        const { client } = mockSupabase({
            candidates: [],
            candidatesError: { message: "connection reset" },
        });
        await expect(runPlacementCandidateOcmRepair(client, { orgId: ORG })).rejects.toThrow(
            /placement_candidates load failed/,
        );
    });
});
