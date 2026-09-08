/**
 * THE BULK CANDIDATE ENSURE — effectful correctness, independent of the performance budget.
 *
 * `ensurePlacementCandidatesForWaitlistedChildrenBulk` had one direct test: a round-trip PERFORMANCE
 * budget. A perf budget passes happily while the hook creates nothing, because creating nothing is
 * fast. "Fast" is not correctness.
 *
 * What actually matters here is collision behaviour. The hook reads existing seed keys and then
 * inserts the remainder as ONE statement (`placementCandidateLifecycleHook.ts:428`), so the
 * questions a maintainer needs answered are: does an already-seeded child suppress only itself, and
 * what happens to the lawful children sharing that batch when the insert fails?
 *
 * The seed-key format is deliberately NOT hardcoded — the first case derives it from a real run, so
 * these tests keep working if the key derivation changes and still prove idempotency.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { ensurePlacementCandidatesForWaitlistedChildrenBulk } from "@/lib/orchestration/placement/placementCandidateLifecycleHook";

const ORG = "org-1";
const OPP = "opp-1";
type Rec = Record<string, unknown>;

type Fixture = {
    /** Rows the "existing candidates" read returns (no status filter). */
    existing?: Rec[];
    /** Rows the subject-uniqueness read returns (status = active). */
    activeBySubject?: Rec[];
    insertError?: { message: string } | null;
};

function mockSupabase(fx: Fixture) {
    const captured: { inserts: Rec[][]; } = { inserts: [] };
    const client = {
        from(table: string) {
            const filters: Rec = {};
            const builder: Rec = {
                select() { return builder; },
                eq(col: string, v: unknown) { filters[col] = v; return builder; },
                in(col: string, v: unknown) { filters[col] = v; return builder; },
                insert(rows: Rec[]) {
                    captured.inserts.push(Array.isArray(rows) ? rows : [rows]);
                    return Promise.resolve({ error: fx.insertError ?? null });
                },
                update() { return builder; },
                maybeSingle() { return Promise.resolve({ data: null, error: null }); },
                then(resolve: (v: { data: unknown; error: null }) => unknown) {
                    let data: unknown = [];
                    if (table === "opportunities") {
                        data = [{ id: OPP, customer_id: "cust-1", location_id: "site-1" }];
                    } else if (table === "process_instances") {
                        data = [
                            piRow("child-existing"),
                            piRow("child-new"),
                        ];
                    } else if (table === "customer_members") {
                        data = [
                            { id: "child-existing", person_id: "p1", dob: "2024-01-01" },
                            { id: "child-new", person_id: "p2", dob: "2024-02-01" },
                        ];
                    } else if (table === "placement_candidates") {
                        // The subject-uniqueness read filters on status; the "existing rows" read does not.
                        data = filters.status === "active" ? (fx.activeBySubject ?? []) : (fx.existing ?? []);
                    }
                    return Promise.resolve({ data, error: null }).then(resolve);
                },
            };
            return builder;
        },
    };
    return { client: client as never, captured };
}

const piRow = (subjectId: string): Rec => ({
    id: `pi-${subjectId}`,
    context_id: OPP,
    subject_id: subjectId,
    stage_entered_at: "2026-06-01T00:00:00Z",
    metadata: {
        program_category_id: "prog-1",
        location_id: "site-1",
        program_room_cohort_key: "toddler_2_3_years",
        start_date: "2026-09-01",
    },
});

const CHILDREN = [
    { opportunityId: OPP, customerMemberId: "child-existing" },
    { opportunityId: OPP, customerMemberId: "child-new" },
];

describe("bulk candidate ensure — effects", () => {
    beforeEach(() => {
        delete process.env.ALLOY_PLACEMENT_LIFECYCLE_CANDIDATE_HOOK_DISABLED;
    });

    it("creates a candidate per lawful child when none exist", async () => {
        const { client, captured } = mockSupabase({});
        const res = await ensurePlacementCandidatesForWaitlistedChildrenBulk(client, {
            orgId: ORG,
            children: CHILDREN,
        });
        expect(res.attempted).toBe(2);
        expect(res.created).toBe(2);
        expect(res.skipped_existing).toBe(0);
        expect(captured.inserts).toHaveLength(1);
        expect(captured.inserts[0]).toHaveLength(2);
        const members = captured.inserts[0]!.map((r) => r.customer_member_id).sort();
        expect(members).toEqual(["child-existing", "child-new"]);
    });

    it("a seeded child suppresses ONLY itself — the lawful sibling in the batch still lands", async () => {
        // Derive the real seed key from an unseeded run rather than hardcoding its format.
        const probe = mockSupabase({});
        await ensurePlacementCandidatesForWaitlistedChildrenBulk(probe.client, { orgId: ORG, children: CHILDREN });
        const seeded = probe.captured.inserts[0]!.find((r) => r.customer_member_id === "child-existing")!;
        expect(typeof seeded.seed_key).toBe("string");

        const { client, captured } = mockSupabase({
            existing: [{ id: "pc-existing", seed_key: seeded.seed_key, opportunity_id: OPP }],
        });
        const res = await ensurePlacementCandidatesForWaitlistedChildrenBulk(client, {
            orgId: ORG,
            children: CHILDREN,
        });

        expect(res.skipped_existing).toBe(1);
        expect(res.created).toBe(1);
        expect(captured.inserts).toHaveLength(1);
        const inserted = captured.inserts[0]!;
        expect(inserted).toHaveLength(1);
        expect(inserted[0]!.customer_member_id).toBe("child-new");
        // No duplicate for the child that already had one.
        expect(inserted.map((r) => r.customer_member_id)).not.toContain("child-existing");
    });

    it("is idempotent: a second pass over fully seeded children writes nothing", async () => {
        const probe = mockSupabase({});
        await ensurePlacementCandidatesForWaitlistedChildrenBulk(probe.client, { orgId: ORG, children: CHILDREN });
        const existing = probe.captured.inserts[0]!.map((r, i) => ({
            id: `pc-${i}`,
            seed_key: r.seed_key,
            opportunity_id: OPP,
        }));

        const { client, captured } = mockSupabase({ existing });
        const res = await ensurePlacementCandidatesForWaitlistedChildrenBulk(client, {
            orgId: ORG,
            children: CHILDREN,
        });
        expect(res.created).toBe(0);
        expect(res.skipped_existing).toBe(2);
        expect(captured.inserts).toHaveLength(0);
    });

    /**
     * ALL-OR-NOTHING, STATED RATHER THAN INFERRED.
     *
     * The hook issues one `insert(rows)`; a Postgres multi-row insert is atomic, so a single
     * conflicting row loses the whole batch. This test PINS that as the current contract and makes
     * the blast radius visible: `created: 0` for children that were individually lawful, with the
     * driver error discarded (`:429` returns without surfacing it).
     *
     * If the hook is ever changed to per-row inserts or an upsert, this test SHOULD fail — that is
     * the point of writing it down.
     */
    it("a single conflicting row loses the whole batch, and the error is not surfaced", async () => {
        const { client, captured } = mockSupabase({
            insertError: { message: 'duplicate key value violates unique constraint "ux_placement_candidates_org_seed_key"' },
        });
        const res = await ensurePlacementCandidatesForWaitlistedChildrenBulk(client, {
            orgId: ORG,
            children: CHILDREN,
        });
        expect(captured.inserts).toHaveLength(1);
        expect(captured.inserts[0]).toHaveLength(2); // both were lawful and both were attempted
        expect(res.created).toBe(0); // neither landed
        expect(res.attempted).toBe(2);
        // The driver error is dropped entirely — no field on the result carries it.
        expect(JSON.stringify(res)).not.toContain("duplicate key");
    });

    it("writes nothing when the hook is disabled", async () => {
        process.env.ALLOY_PLACEMENT_LIFECYCLE_CANDIDATE_HOOK_DISABLED = "1";
        const { client, captured } = mockSupabase({});
        const res = await ensurePlacementCandidatesForWaitlistedChildrenBulk(client, {
            orgId: ORG,
            children: CHILDREN,
        });
        expect(res).toEqual({ attempted: 0, created: 0, skipped_existing: 0 });
        expect(captured.inserts).toHaveLength(0);
    });

    it("writes nothing for an empty or unusable child set", async () => {
        const { client, captured } = mockSupabase({});
        const res = await ensurePlacementCandidatesForWaitlistedChildrenBulk(client, {
            orgId: ORG,
            children: [{ opportunityId: "", customerMemberId: "" }],
        });
        expect(res.created).toBe(0);
        expect(captured.inserts).toHaveLength(0);
    });
});
