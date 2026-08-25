/**
 * Law 36 at the placement attachment boundary.
 *
 * The surface guards prove a canonical order survives to the screen; this proves the attachment
 * actually HANDS OVER a canonical order, rather than the caller's original one. Only the collaborators
 * that reach the database are stubbed — the canonical sorter and the position assigner are the real
 * ones, so the order under test is the shipped order.
 */
import { describe, expect, it, vi } from "vitest";

const { candidateRows } = vi.hoisted(() => ({ candidateRows: vi.fn() }));

vi.mock("@/lib/orchestration/placement/resolvePlacementQueueConfig", () => ({
    resolvePlacementQueueConfig: () => ({
        status: "enabled",
        queue_key: "waitlisted",
        engine_version: "v2",
        profile: { buckets: [], labels: {}, tie_breakers: [] },
        merged: {},
        options: { shadow_mode: false, evaluation_cap: 100, strict_required_facts: false, display: {}, profile_revision_mismatch: false },
    }),
}));
vi.mock("@/lib/orchestration/placement/bulkLoadPlacementCandidatesByOpportunity", () => ({
    bulkLoadPlacementCandidatesByOpportunity: async () => new Map(),
}));
vi.mock("@/lib/orchestration/placement/loadPlacementEvaluationHouseholdContext", () => ({
    loadPlacementEvaluationHouseholdContext: async () => ({}),
}));
vi.mock("@/lib/locations/loadLocationProgramCategoriesForOrg", () => ({
    loadLocationProgramCategoriesForOrg: async () => [],
}));
vi.mock("@/lib/orchestration/placement/placementCandidateLifecycleHook", () => ({
    ensurePlacementCandidatesForWaitlistedChildrenBulk: async () => ({ attempted: 0, created: 0, skipped_existing: 0 }),
}));
vi.mock("@/lib/orchestration/placement/applyPlacementV2ToOpportunityQueueRows", () => ({
    applyPlacementV2ToOpportunityQueueRows: () => ({ rows: [], diagnostics: null }),
}));
vi.mock("@/lib/orchestration/placement/placementWaitlistCandidateRowProjection", () => ({
    expandOpportunityRowsToPlacementCandidateRows: () => ({ rows: candidateRows() }),
}));
vi.mock("@/lib/admin/dbQueryTiming", () => ({ logDbTiming: () => {} }));

const { attachChildGrainWaitlistPlacement } = await import(
    "@/lib/runtime/provisioning/attachChildGrainWaitlistPlacement"
);

/** A candidate row as the projection emits it — cohort decides order before the tuple does. */
function candidate(candidateId: string, oppId: string, name: string, cohort: string, ordinal: number) {
    return {
        id: candidateId,
        _placement_waitlist_row: {
            row_projection: "placement_candidate",
            placement_candidate_id: candidateId,
            opportunity_id: oppId,
            child_display_name: name,
            program_room_cohort_key: cohort,
            program_room_group_label: "Infant",
            wait_since: null,
            placement_priority_v2: { active_override_kinds: [], sort_tuple: [cohort, ordinal, 0] },
        },
        __placement_v2_sort_tuple: [cohort, ordinal, 0],
    } as Record<string, unknown>;
}

const child = (contextId: string, title: string) =>
    ({ contextId, title, subjectId: `subj-${title}`, participationId: `part-${title}` }) as never;

async function run(childRows: unknown[]) {
    return attachChildGrainWaitlistPlacement({
        supabase: {} as never,
        orgId: "org",
        workUnitId: "wu",
        workUnitMetadata: null,
        departmentMetadata: null,
        placementQueueKeys: ["waitlisted"],
        childRows: childRows as never,
    });
}

describe("law 36 — the attachment hands over canonical order", () => {
    // Input order is the REVERSE of canonical order, so returning the input unchanged fails loudly.
    const setup = () => {
        candidateRows.mockReturnValue([
            candidate("cand-late", "opp-late", "Later", "infant_0_18_months", 1),
            candidate("cand-early", "opp-early", "Earlier", "infant", 1),
        ]);
        return [child("opp-late", "Later"), child("opp-early", "Earlier")];
    };

    it("1 + 2: returns canonical order, and positions match that order", async () => {
        const out = await run(setup());
        expect(out.map((r) => r.title)).toEqual(["Earlier", "Later"]);
        expect(out.map((r) => r.placementWaitlistRow?.runtime_position)).toEqual([1, 2]);
    });

    it("3: the caller's array and its row objects are not mutated", async () => {
        const input = setup();
        const orderBefore = input.map((r) => (r as { title: string }).title);
        const out = await run(input);
        expect(input.map((r) => (r as { title: string }).title)).toEqual(orderBefore);
        expect(out[0]).not.toBe(input[0]);   // rows are copies, never the caller's objects
    });

    it("4: membership is permutation-identical", async () => {
        const input = setup();
        const out = await run(input);
        expect(out).toHaveLength(input.length);
        expect(out.map((r) => r.title).sort()).toEqual(input.map((r) => (r as { title: string }).title).sort());
    });

    it("5: non-placement payload is carried through untouched", async () => {
        const out = await run(setup());
        const earlier = out.find((r) => r.title === "Earlier")!;
        expect(earlier.contextId).toBe("opp-early");
        expect((earlier as unknown as { subjectId: string }).subjectId).toBe("subj-Earlier");
        expect((earlier as unknown as { participationId: string }).participationId).toBe("part-Earlier");
    });

    it("a child with no placement candidate keeps its relative order after the ranked rows", async () => {
        candidateRows.mockReturnValue([candidate("cand-early", "opp-early", "Earlier", "infant", 1)]);
        const out = await run([child("opp-none", "Unranked"), child("opp-early", "Earlier")]);
        expect(out.map((r) => r.title)).toEqual(["Earlier", "Unranked"]);
    });

    it("the same input produces the same order", async () => {
        const a = await run(setup());
        const b = await run(setup());
        expect(a.map((r) => r.title)).toEqual(b.map((r) => r.title));
    });
});
