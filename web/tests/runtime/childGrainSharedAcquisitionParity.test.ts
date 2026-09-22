/**
 * SAME MEMBERSHIP ANSWER. CHEAPER ACQUISITION.
 *
 * The child lenses of one work unit each ran the whole membership projection, so three lenses meant
 * three acquisitions of the same org's enrollment instances and three resolutions of the same
 * opportunities, children and program categories. `acquireEnrollmentChildBase` hoists that
 * acquisition; nothing else moves.
 *
 * A CLAIM ABOUT COUNTS WOULD NOT BE WORTH ANYTHING HERE. The defect this whole module exists to
 * prevent — thirteen rows under a pill of eight — was two different member sets whose sizes were
 * each honestly computed. So every parity proof below compares the MEMBER SETS by participation id,
 * exactly, in both directions. A repair that returned the right number of the wrong children would
 * pass a count assertion and fail every one of these.
 */
import { describe, expect, it } from "vitest";

import {
    childBaseScopeForLenses,
    countChildGrainMembersForLenses,
} from "@/lib/runtime/provisioning/childGrainMembership";
import { loadChildGrainProvisioningRows } from "@/lib/runtime/provisioning/childGrainProvisioningRows";
import { childRowMembershipForLens } from "@/lib/runtime/provisioning/childGrainMembership";
import {
    acquireEnrollmentChildBase,
    queryEnrollmentProcessInstanceParticipationRows,
    queryEnrollmentProcessInstanceTrackRows,
} from "@/lib/queues/childGrainProcessInstanceQueue";
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
async function memberSet(
    supabase: never,
    view: WorkViewConfigV1Stored,
    base?: Awaited<ReturnType<typeof acquireEnrollmentChildBase>>,
): Promise<string[]> {
    const rows = await loadChildGrainProvisioningRows({
        supabase, orgId: ORG, workUnitId: WU, membership: childRowMembershipForLens(view), base,
    });
    return rows.map((r) => r.participationId ?? "").sort();
}

/**
 * THE ORACLE. Runs every lens both ways over one fixture and asserts exact set equality per lens,
 * returning the read log of each arm so the acquisition claim is evidence rather than assertion.
 */
async function bothArms(
    data: Parameters<typeof fixtureSupabase>[0],
    views: WorkViewConfigV1Stored[],
): Promise<{ sets: string[][]; perLensReads: ReadLog; sharedReads: ReadLog }> {
    const a = fixtureSupabase(data);
    const perLens: string[][] = [];
    for (const v of views) perLens.push(await memberSet(a.supabase, v));

    const b = fixtureSupabase(data);
    const scope = childBaseScopeForLenses(views);
    const base = await acquireEnrollmentChildBase({
        supabase: b.supabase, orgId: ORG, workUnitId: WU, stageKeys: scope.stageKeys,
    });
    const shared: string[][] = [];
    for (const v of views) shared.push(await memberSet(b.supabase, v, base));

    // EXACT SET EQUALITY, per lens, in one place so no case can forget to check it.
    expect(shared).toEqual(perLens);
    return { sets: perLens, perLensReads: a.log, sharedReads: b.log };
}

describe("shared child-lens acquisition — exact member-set parity", () => {
    it("1. participation lens: live instances only, same set both arms", async () => {
        const r = await bothArms(
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
        const r = await bothArms(
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
        const r = await bothArms(
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
        const r = await bothArms(
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
        const r = await bothArms(
            {
                process_instances: [pi("p1", "c1", "o1", null)],
                opportunities: [opp("o1", { stage_key: "lead" })],
                customer_members: [cm("c1")],
            },
            [lens("two", ["lead", "lead"])],
        );
        expect(r.sets[0]).toEqual(["p1"]);
    });

    it("6. MIXED modes in one batch: the base widens to `all` and no lens's set changes", async () => {
        const views = [lens("all"), lens("wl", ["waitlist"]), lens("leadlens", ["lead"])];
        expect(childBaseScopeForLenses(views).stageKeys).toBeNull();
        const r = await bothArms(
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

    it("7. stages-only lenses narrow the base to the stage UNION, sets unchanged", async () => {
        const views = [lens("wl", ["waitlist"]), lens("leadlens", ["lead"])];
        expect(childBaseScopeForLenses(views).stageKeys?.sort()).toEqual(["lead", "waitlist"]);
        const r = await bothArms(
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
        const r = await bothArms(
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
        const r = await bothArms(
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
        const r = await bothArms(
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
        const r = await bothArms(
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
        const r = await bothArms(
            {
                process_instances: [pi("p1", "c1", "o1", null), pi("p2", "c2", "o2", null)],
                opportunities: [opp("o1", { status_key: "closed" }), opp("o2")],
                customer_members: [cm("c1"), cm("c2")],
            },
            [lens("all")],
        );
        expect(r.sets[0]).toEqual(["p2"]);
    });

    it("13. a blank stage predicate is PARTICIPATION, and still widens the base to `all`", async () => {
        const blank = { id: "blank", label: "b", filters_v1: [{ field_key: "opportunity_stage", operator: "equals", value: "  " }] } as unknown as WorkViewConfigV1Stored;
        expect(childRowMembershipForLens(blank)).toEqual({ mode: "participation" });
        expect(childBaseScopeForLenses([blank]).stageKeys).toBeNull();
        const r = await bothArms(
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

describe("the acquisition is what collapsed, and nothing else", () => {
    const data = {
        process_instances: [pi("p1", "c1", "o1", null), pi("p2", "c2", "o1", "waitlist")],
        opportunities: [opp("o1", { stage_key: "lead" })],
        customer_members: [cm("c1"), cm("c2")],
    };
    const views = [lens("all"), lens("wl", ["waitlist"]), lens("leadlens", ["lead"])];

    it("three lenses issue three acquisitions unshared, and ONE shared", async () => {
        const r = await bothArms(data, views);
        expect(r.perLensReads.process_instances).toBe(3);
        expect(r.perLensReads.opportunities).toBe(3);
        expect(r.perLensReads.customer_members).toBe(3);
        expect(r.sharedReads.process_instances).toBe(1);
        expect(r.sharedReads.opportunities).toBe(1);
        expect(r.sharedReads.customer_members).toBe(1);
    });

    it("the batch counter returns the same counts on both arms", async () => {
        const a = fixtureSupabase(data);
        const b = fixtureSupabase(data);
        const unshared = await countChildGrainMembersForLenses({
            supabase: a.supabase, orgId: ORG, workUnitId: WU, views, shareAcquisition: false,
        });
        const shared = await countChildGrainMembersForLenses({
            supabase: b.supabase, orgId: ORG, workUnitId: WU, views, shareAcquisition: true,
        });
        expect([...shared.entries()].sort()).toEqual([...unshared.entries()].sort());
        expect(shared.get("all")).toBe(2);
        expect(shared.get("wl")).toBe(1);
        expect(shared.get("leadlens")).toBe(1);
        expect(b.log.process_instances).toBe(1);
        expect(a.log.process_instances).toBe(3);
    });
});

describe("a base that does not cover a lens is REFUSED, never used", () => {
    const data = {
        process_instances: [pi("p1", "c1", "o1", null)],
        opportunities: [opp("o1", { stage_key: "lead" })],
        customer_members: [cm("c1")],
    };

    it("participation membership refuses a stage-scoped base", async () => {
        const { supabase } = fixtureSupabase(data);
        const base = await acquireEnrollmentChildBase({ supabase, orgId: ORG, workUnitId: WU, stageKeys: ["lead"] });
        await expect(
            queryEnrollmentProcessInstanceParticipationRows({ supabase, orgId: ORG, workUnitId: WU, base }),
        ).rejects.toThrow(/unscoped enrollment child base/);
    });

    it("a stages lens refuses a base that omits its stage", async () => {
        const { supabase } = fixtureSupabase(data);
        const base = await acquireEnrollmentChildBase({ supabase, orgId: ORG, workUnitId: WU, stageKeys: ["lead"] });
        await expect(
            queryEnrollmentProcessInstanceTrackRows({ supabase, orgId: ORG, workUnitId: WU, stageKey: "waitlist", base }),
        ).rejects.toThrow(/does not cover stage waitlist/);
    });

    it("an unsafe stage token widens to `all` rather than being spliced into a filter", async () => {
        const { supabase } = fixtureSupabase(data);
        const base = await acquireEnrollmentChildBase({
            supabase, orgId: ORG, workUnitId: WU, stageKeys: ["lead,stage_key.not.is.null"],
        });
        expect(base.scope).toBe("all");
    });

    it("a failed shared acquisition yields UNKNOWN for every lens, never a number", async () => {
        const broken = {
            from() {
                const builder: Rec = {
                    select: () => builder, eq: () => builder, or: () => builder, in: () => builder,
                    then: (resolve: (r: { data: null; error: { message: string } }) => void) =>
                        resolve({ data: null, error: { message: "read failed" } }),
                };
                return builder;
            },
        } as never;
        const out = await countChildGrainMembersForLenses({
            supabase: broken, orgId: ORG, workUnitId: WU,
            views: [lens("all"), lens("wl", ["waitlist"])], shareAcquisition: true,
        });
        expect(out.get("all")).toBeNull();
        expect(out.get("wl")).toBeNull();
    });
});
