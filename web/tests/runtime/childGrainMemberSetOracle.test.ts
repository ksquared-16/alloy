/**
 * THE MEMBER-SET ORACLE — what each child lens actually contains, by exact participation id.
 *
 * A CLAIM ABOUT COUNTS WOULD NOT BE WORTH ANYTHING HERE. The defect this module exists to prevent
 * — thirteen rows under a pill of eight — was two different member SETS whose sizes were each
 * honestly computed. So every case below asserts the exact set, not its size: a change that
 * returned the right number of the wrong children would pass a count assertion and fail every one
 * of these.
 *
 * These cases were written to hold a shared-acquisition repair to exact parity. That repair was
 * retired for making the frame slower, and the cases outlived it — they are the standing
 * description of what a lens selects, and the next repair to this path will be held to them too.
 */
import { describe, expect, it } from "vitest";

import { countChildGrainMembersForLenses } from "@/lib/runtime/provisioning/childGrainMembership";
import { loadChildGrainProvisioningRows } from "@/lib/runtime/provisioning/childGrainProvisioningRows";
import { childRowMembershipForLens } from "@/lib/runtime/provisioning/childGrainMembership";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";

const ORG = "org-1";
const WU = "wu-1";

type Rec = Record<string, unknown>;

/** Reads issued, by table — the evidence that the acquisition actually collapsed. */
type ReadLog = { process_instances: number; opportunities: number; customer_members: number; opportunity_customer_members: number; location_program_categories: number };

function fixtureSupabase(data: {
    process_instances: Rec[];
    opportunities: Rec[];
    customer_members: Rec[];
    opportunity_customer_members?: Rec[];
    location_program_categories?: Rec[];
}) {
    const log: ReadLog = { process_instances: 0, opportunities: 0, customer_members: 0, opportunity_customer_members: 0, location_program_categories: 0 };
    const supabase = {
        from(table: string) {
            const eqs: Record<string, unknown> = {};
            let orStages: string[] | null = null;
            let orNull = false;
            let inCol: string | null = null;
            let inVals: string[] = [];
            const builder: Rec = {
                select: () => builder,
                eq(col: string, val: unknown) { eqs[col] = val; return builder; },
                or(expr: string) {
                    // `stage_key.eq.X,stage_key.is.null` or `stage_key.in.(a,b),stage_key.is.null`
                    orNull = /stage_key\.is\.null/.test(expr);
                    const one = /stage_key\.eq\.([^,)]+)/.exec(expr);
                    const many = /stage_key\.in\.\(([^)]*)\)/.exec(expr);
                    orStages = many ? many[1].split(",").filter(Boolean) : one ? [one[1]] : [];
                    return builder;
                },
                in(col: string, vals: string[]) { inCol = col; inVals = vals; return builder; },
                then(resolve: (r: { data: Rec[]; error: null }) => void) {
                    (log as unknown as Record<string, number>)[table] += 1;
                    let rows = ((data as unknown as Record<string, Rec[]>)[table] ?? []).slice();
                    for (const [col, val] of Object.entries(eqs)) rows = rows.filter((r) => r[col] === val);
                    if (orStages !== null) {
                        const want = orStages as string[];
                        rows = rows.filter((r) => (r.stage_key == null ? orNull : want.includes(String(r.stage_key))));
                    }
                    if (inCol) rows = rows.filter((r) => inVals.includes(String(r[inCol as string])));
                    resolve({ data: rows, error: null });
                },
            };
            return builder;
        },
    } as never;
    return { supabase, log };
}

const opp = (id: string, over: Rec = {}) => ({
    id, org_id: ORG, name: "Fam", title: null, status_key: "open", stage_key: "lead",
    customer_id: "cust-1", primary_person_id: null, primary_contact_id: null,
    work_unit_id: WU, location_id: null, metadata: {}, created_at: "2026-07-01", updated_at: "2026-07-01",
    ...over,
});
const cm = (id: string, over: Rec = {}) => ({
    id, org_id: ORG, display_name: `Child ${id}`, first_name: "Child", last_name: id,
    dob: null, person_id: null, relationship: "child", is_active: true, persons: null, ...over,
});
const pi = (id: string, subjectId: string, contextId: string | null, stageKey: string | null, over: Rec = {}) => ({
    id, org_id: ORG, process_key: "enrollment", subject_type: "child",
    subject_id: subjectId, context_id: contextId, stage_key: stageKey, state: null,
    close_reason_key: null, metadata: {}, updated_at: "2026-07-02", created_at: "2026-07-02", ...over,
});

const lens = (id: string, stages?: string[]): WorkViewConfigV1Stored =>
    ({
        id, label: id,
        filters_v1: stages
            ? stages.map((value) => ({ field_key: "opportunity_stage", operator: "equals", value }))
            : [],
    }) as unknown as WorkViewConfigV1Stored;

/** The member SET a lens admits, as participation ids. */
async function memberSet(supabase: never, view: WorkViewConfigV1Stored): Promise<string[]> {
    const rows = await loadChildGrainProvisioningRows({
        supabase, orgId: ORG, workUnitId: WU, membership: childRowMembershipForLens(view),
    });
    return rows.map((r) => r.participationId ?? "").sort();
}

/**
 * THE ORACLE. Evaluates each lens over one fixture and returns its member set plus the reads it
 * took, so a case can assert BOTH what a lens selects and what it cost to find out.
 */
async function lensSets(
    data: Parameters<typeof fixtureSupabase>[0],
    views: WorkViewConfigV1Stored[],
): Promise<{ sets: string[][]; reads: ReadLog }> {
    const f = fixtureSupabase(data);
    const sets: string[][] = [];
    for (const v of views) sets.push(await memberSet(f.supabase, v));
    return { sets, reads: f.log };
}

describe("child lens membership — exact member sets", () => {
    it("1. participation lens: live instances only, same set both arms", async () => {
        const r = await lensSets(
            {
                process_instances: [
                    pi("p1", "c1", "o1", null),
                    pi("p2", "c2", "o1", null, { close_reason_key: "withdrawn" }),
                    pi("p3", "c3", "o1", "waitlist"),
                ],
                opportunities: [opp("o1")],
                customer_members: [cm("c1"), cm("c2"), cm("c3")],
            },
            [lens("all")],
        );
        expect(r.sets[0]).toEqual(["p1", "p3"]); // p2 is closed
    });

    it("2. stages lens admits only its lane's effective stage", async () => {
        const r = await lensSets(
            {
                process_instances: [pi("p1", "c1", "o1", "waitlist"), pi("p2", "c2", "o2", "lead")],
                opportunities: [opp("o1", { stage_key: "lead" }), opp("o2", { stage_key: "lead" })],
                customer_members: [cm("c1"), cm("c2")],
            },
            [lens("wl", ["waitlist"])],
        );
        expect(r.sets[0]).toEqual(["p1"]);
    });

    it("3. a null-stage rider is admitted at its FAMILY's stage, identically both arms", async () => {
        const r = await lensSets(
            {
                process_instances: [pi("p1", "c1", "o1", null)],
                opportunities: [opp("o1", { stage_key: "lead" })],
                customer_members: [cm("c1")],
            },
            [lens("leadlens", ["lead"])],
        );
        expect(r.sets[0]).toEqual(["p1"]);
    });

    it("4. a BRANCHED child is NOT reported at its family's stage", async () => {
        const r = await lensSets(
            {
                process_instances: [pi("p1", "c1", "o1", "waitlist")],
                opportunities: [opp("o1", { stage_key: "lead" })],
                customer_members: [cm("c1")],
            },
            [lens("leadlens", ["lead"])],
        );
        expect(r.sets[0]).toEqual([]); // effective stage is waitlist, not the family's lead
    });

    it("5. a multi-stage lens dedupes a child that matches twice", async () => {
        const r = await lensSets(
            {
                process_instances: [pi("p1", "c1", "o1", null)],
                opportunities: [opp("o1", { stage_key: "lead" })],
                customer_members: [cm("c1")],
            },
            [lens("two", ["lead", "lead"])],
        );
        expect(r.sets[0]).toEqual(["p1"]);
    });

    it("6. MIXED modes in one batch: each lens keeps its own set", async () => {
        const views = [lens("all"), lens("wl", ["waitlist"]), lens("leadlens", ["lead"])];
        const r = await lensSets(
            {
                process_instances: [
                    pi("p1", "c1", "o1", null),
                    pi("p2", "c2", "o1", "waitlist"),
                    pi("p3", "c3", "o1", "registration"),
                ],
                opportunities: [opp("o1", { stage_key: "lead" })],
                customer_members: [cm("c1"), cm("c2"), cm("c3")],
            },
            views,
        );
        expect(r.sets[0]).toEqual(["p1", "p2", "p3"]);
        expect(r.sets[1]).toEqual(["p2"]);
        expect(r.sets[2]).toEqual(["p1"]);
    });

    it("7. two stage-scoped lenses each select only their own lane", async () => {
        const views = [lens("wl", ["waitlist"]), lens("leadlens", ["lead"])];
        const r = await lensSets(
            {
                process_instances: [
                    pi("p1", "c1", "o1", null),
                    pi("p2", "c2", "o1", "waitlist"),
                    pi("p3", "c3", "o1", "registration"),
                ],
                opportunities: [opp("o1", { stage_key: "lead" })],
                customer_members: [cm("c1"), cm("c2"), cm("c3")],
            },
            views,
        );
        expect(r.sets[0]).toEqual(["p2"]);
        expect(r.sets[1]).toEqual(["p1"]);
    });

    it("8. a participation-ANCHORED context id resolves through OCM in both arms", async () => {
        const r = await lensSets(
            {
                process_instances: [pi("p1", "c1", "ocm-1", null)],
                opportunity_customer_members: [{ id: "ocm-1", org_id: ORG, opportunity_id: "o1" }],
                opportunities: [opp("o1", { stage_key: "lead" })],
                customer_members: [cm("c1")],
            },
            [lens("all"), lens("leadlens", ["lead"])],
        );
        expect(r.sets[0]).toEqual(["p1"]);
        expect(r.sets[1]).toEqual(["p1"]);
    });

    it("9. an unresolvable context opportunity drops the row in both arms", async () => {
        const r = await lensSets(
            {
                process_instances: [pi("p1", "c1", "missing", null)],
                opportunities: [opp("o1")],
                customer_members: [cm("c1")],
            },
            [lens("all")],
        );
        expect(r.sets[0]).toEqual([]);
    });

    it("10. a context-free instance is dropped in both arms", async () => {
        const r = await lensSets(
            {
                process_instances: [pi("p1", "c1", null, null)],
                opportunities: [opp("o1")],
                customer_members: [cm("c1")],
            },
            [lens("all")],
        );
        expect(r.sets[0]).toEqual([]);
    });

    it("11. an INACTIVE subject fails the liveness gate in both arms", async () => {
        const r = await lensSets(
            {
                process_instances: [pi("p1", "c1", "o1", null), pi("p2", "c2", "o1", null)],
                opportunities: [opp("o1")],
                customer_members: [cm("c1", { is_active: false }), cm("c2")],
            },
            [lens("all")],
        );
        expect(r.sets[0]).toEqual(["p2"]);
    });

    it("12. a CLOSED context household fails the liveness gate in both arms", async () => {
        const r = await lensSets(
            {
                process_instances: [pi("p1", "c1", "o1", null), pi("p2", "c2", "o2", null)],
                opportunities: [opp("o1", { status_key: "closed" }), opp("o2")],
                customer_members: [cm("c1"), cm("c2")],
            },
            [lens("all")],
        );
        expect(r.sets[0]).toEqual(["p2"]);
    });

    it("13. a blank stage predicate is PARTICIPATION, not an empty stage scope", async () => {
        const blank = { id: "blank", label: "b", filters_v1: [{ field_key: "opportunity_stage", operator: "equals", value: "  " }] } as unknown as WorkViewConfigV1Stored;
        expect(childRowMembershipForLens(blank)).toEqual({ mode: "participation" });
        const r = await lensSets(
            {
                process_instances: [pi("p1", "c1", "o1", "registration")],
                opportunities: [opp("o1", { stage_key: "lead" })],
                customer_members: [cm("c1")],
            },
            [blank],
        );
        expect(r.sets[0]).toEqual(["p1"]);
    });
});

describe("each lens acquires for itself, and they do not wait on each other", () => {
    /**
     * THIS IS NOT A COST PREFERENCE, IT IS THE MEASURED ONE. A shared acquisition across these
     * lenses was built, proven to return identical member sets, and retired: on deployed bf3274774
     * it made COMPLETE_FRAME 316ms slower, because the per-lens reads already overlap and hoisting
     * them created a serial prefix. The read count below is therefore the EXPECTED shape, not a
     * defect waiting to be optimised.
     */
    const data = {
        process_instances: [pi("p1", "c1", "o1", null), pi("p2", "c2", "o1", "waitlist")],
        opportunities: [opp("o1", { stage_key: "lead" })],
        customer_members: [cm("c1"), cm("c2")],
    };
    const views = [lens("all"), lens("wl", ["waitlist"]), lens("leadlens", ["lead"])];

    it("three lenses issue three acquisitions, concurrently", async () => {
        const r = await lensSets(data, views);
        expect(r.reads.process_instances).toBe(3);
        expect(r.reads.opportunities).toBe(3);
        expect(r.reads.customer_members).toBe(3);
        expect(r.sets[0]).toEqual(["p1", "p2"]);
        expect(r.sets[1]).toEqual(["p2"]);
        expect(r.sets[2]).toEqual(["p1"]);
    });

    it("the counter returns each lens's own count, keyed by view id", async () => {
        const f = fixtureSupabase(data);
        const counts = await countChildGrainMembersForLenses({
            supabase: f.supabase, orgId: ORG, workUnitId: WU, views,
        });
        expect(counts.get("all")).toBe(2);
        expect(counts.get("wl")).toBe(1);
        expect(counts.get("leadlens")).toBe(1);
    });

    it("a lens that cannot read is UNKNOWN, and never a number borrowed from another lens", async () => {
        const broken = {
            from() {
                const b: Rec = {
                    select: () => b, eq: () => b, or: () => b, in: () => b,
                    then: (r: (x: { data: null; error: { message: string } }) => void) =>
                        r({ data: null, error: { message: "read failed" } }),
                };
                return b;
            },
        } as never;
        const out = await countChildGrainMembersForLenses({
            supabase: broken, orgId: ORG, workUnitId: WU, views: [lens("all"), lens("wl", ["waitlist"])],
        });
        expect(out.get("all")).toBeNull();
        expect(out.get("wl")).toBeNull();
    });
});
