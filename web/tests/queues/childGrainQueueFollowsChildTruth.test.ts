/**
 * A CHILD-GRAIN LANE FOLLOWS CHILD-GRAIN LIFECYCLE TRUTH.
 *
 * The Waitlist lane's subject is a child. Its base population was bounded by something that belongs
 * to the FAMILY — `opportunities.status_key` on the lifecycle path, `opportunities.work_unit_id`
 * otherwise. Either is the right rule for a case lane and the wrong one here, because it makes a
 * child's membership a property of their siblings.
 *
 * Measured on the running app: a child with process-instance stage `waitlist`, disposition
 * `waitlisted` and an active placement candidate was absent from the Waitlist lane, because their
 * household still sat at Lead for a sibling who had not moved. Every lifecycle check passed while
 * the queue stayed empty — which is the worst shape this can take, since nothing errors.
 *
 * Child membership is now UNIONED in from the child's own process instance. These tests hold the
 * union to four things: it admits a child the family lens cannot see, it does not admit siblings who
 * are elsewhere, it does not replace the family-sourced rows, and it stays bounded.
 */

import { describe, expect, it } from "vitest";

import { __testing } from "@/lib/queues/candidateGrainWaitlistQueue";

const ORG = "11111111-1111-4111-8111-111111111111";
const FAMILY = "22222222-2222-4222-8222-222222222222";

type PiRow = {
    id: string;
    org_id: string;
    process_key: string;
    subject_id: string;
    context_id: string | null;
    context_type: string | null;
    stage_key: string | null;
    state: string | null;
    close_reason_key: string | null;
    metadata: Record<string, unknown> | null;
    updated_at: string | null;
    created_at: string | null;
};

type OppRow = {
    id: string;
    org_id: string;
    name: string;
    title: string | null;
    status_key: string | null;
    stage_key: string | null;
    customer_id: string | null;
    primary_person_id: string | null;
    primary_contact_id: string | null;
    work_unit_id: string | null;
    location_id: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string | null;
    updated_at: string | null;
};

type CandRow = {
    id: string;
    org_id: string;
    opportunity_id: string;
    status: string;
    site_id: string | null;
    wait_since: string | null;
    program_room_cohort_key: string | null;
    program_room_group_label: string | null;
    opportunity_customer_member_id: string | null;
    customer_id: string | null;
    customer_member_id: string | null;
};

type OcmRow = {
    id: string;
    org_id: string;
    opportunity_id: string;
    customer_member_id: string;
    outcome_status_key: string | null;
};

type CmRow = { id: string; org_id: string; display_name: string | null; relationship: string };

type Db = {
    process_instances: PiRow[];
    opportunities: OppRow[];
    placement_candidates: CandRow[];
    opportunity_customer_members: OcmRow[];
    customer_members: CmRow[];
};

/**
 * A Supabase double over plain arrays, supporting only what these queries use: eq / in / or /
 * select-with-embeds. Embedded rows (`opportunities!inner`, `opportunity_customer_members`) are
 * resolved from the same store so a candidate row reaches the filters in its real shape.
 */
function makeSupabase(db: Db) {
    const calls: Array<{ table: string; filters: Record<string, unknown>; ins: Record<string, unknown[]> }> = [];
    function builder(table: string) {
        const filters: Record<string, unknown> = {};
        const ins: Record<string, unknown[]> = {};
        let orClause: string | null = null;
        const rows = (): Array<Record<string, unknown>> => {
            const src = (db as unknown as Record<string, Array<Record<string, unknown>>>)[table] ?? [];
            return src.filter((r) => {
                for (const [k, v] of Object.entries(filters)) if (r[k] !== v) return false;
                for (const [k, vals] of Object.entries(ins)) if (!vals.includes(r[k])) return false;
                if (orClause) {
                    // Only shape used: "stage_key.eq.X,stage_key.is.null"
                    const parts = orClause.split(",");
                    const ok = parts.some((p) => {
                        if (p.endsWith(".is.null")) return r[p.split(".")[0]!] == null;
                        const [col, , val] = p.split(".");
                        return r[col!] === val;
                    });
                    if (!ok) return false;
                }
                return true;
            });
        };
        const withEmbeds = (list: Array<Record<string, unknown>>) =>
            list.map((r) => {
                if (table !== "placement_candidates") return r;
                const opp = db.opportunities.find((o) => o.id === r.opportunity_id) ?? null;
                const ocm = db.opportunity_customer_members.find(
                    (m) => m.id === r.opportunity_customer_member_id,
                );
                return {
                    ...r,
                    opportunities: opp,
                    opportunity_customer_members: ocm ? { outcome_status_key: ocm.outcome_status_key } : null,
                };
            });
        const api: Record<string, unknown> = {
            select: () => api,
            eq(col: string, val: unknown) {
                filters[col] = val;
                return api;
            },
            in(col: string, vals: unknown[]) {
                ins[col] = vals;
                return api;
            },
            or(clause: string) {
                orClause = clause;
                return api;
            },
            order: () => api,
            limit: () => api,
            maybeSingle: () => Promise.resolve({ data: withEmbeds(rows())[0] ?? null, error: null }),
            then(resolve: (r: { data: Array<Record<string, unknown>>; error: null }) => void) {
                calls.push({ table, filters: { ...filters }, ins: { ...ins } });
                resolve({ data: withEmbeds(rows()), error: null });
            },
        };
        return api;
    }
    return { supabase: { from: (t: string) => builder(t) } as never, calls };
}

const opp = (over: Partial<OppRow> = {}): OppRow => ({
    id: FAMILY,
    org_id: ORG,
    name: "Kurzman Family",
    title: null,
    status_key: "open",
    stage_key: "lead",
    customer_id: "cust-1",
    primary_person_id: null,
    primary_contact_id: null,
    work_unit_id: "wu-lead",
    location_id: "site-1",
    metadata: {},
    created_at: null,
    updated_at: null,
    ...over,
});

const pi = (subjectId: string, stageKey: string | null): PiRow => ({
    id: `pi-${subjectId}`,
    org_id: ORG,
    process_key: "enrollment",
    subject_id: subjectId,
    context_id: FAMILY,
    context_type: null,
    stage_key: stageKey,
    state: null,
    close_reason_key: null,
    metadata: {},
    updated_at: null,
    created_at: null,
});

const cand = (id: string, memberId: string, ocmId: string, status = "active"): CandRow => ({
    id,
    org_id: ORG,
    opportunity_id: FAMILY,
    status,
    site_id: "site-1",
    wait_since: null,
    program_room_cohort_key: "infant",
    program_room_group_label: "infant",
    opportunity_customer_member_id: ocmId,
    customer_id: "cust-1",
    customer_member_id: memberId,
});

const ocm = (id: string, memberId: string, status: string): OcmRow => ({
    id,
    org_id: ORG,
    opportunity_id: FAMILY,
    customer_member_id: memberId,
    outcome_status_key: status,
});

const cm = (id: string, name: string): CmRow => ({
    id,
    org_id: ORG,
    display_name: name,
    relationship: "child",
});

/** The live shape: family at Lead, Child A waitlisted, Child B enrolling. */
function multiChildDb(): Db {
    return {
        opportunities: [opp()],
        process_instances: [pi("child-A", "waitlist"), pi("child-B", "enrolling")],
        placement_candidates: [cand("cand-A", "child-A", "ocm-A"), cand("cand-B", "child-B", "ocm-B")],
        opportunity_customer_members: [ocm("ocm-A", "child-A", "waitlisted"), ocm("ocm-B", "child-B", "enrolling")],
        customer_members: [cm("child-A", "Ayla"), cm("child-B", "Bram")],
    };
}

async function childStageRows(db: Db, stageKey: string) {
    const { supabase, calls } = makeSupabase(db);
    const rows = await __testing.queryChildStageMemberCandidateRows({
        supabase,
        orgId: ORG,
        workUnitId: "wu-waitlist",
        stageKey,
        candidateStatuses: ["active", "paused"],
        recordScopeConstraints: null,
        locationScopeSource: "placement_site",
    } as never);
    return { rows: rows as CandRow[], calls };
}

describe("child-grain Waitlist membership comes from the child's process instance", () => {
    it("admits a waitlisted child whose family is still Lead", async () => {
        const db = multiChildDb();
        expect(db.opportunities[0]!.stage_key).toBe("lead"); // the family lens would exclude both
        const { rows } = await childStageRows(db, "waitlist");
        expect(rows.map((r) => r.customer_member_id)).toEqual(["child-A"]);
    });

    /** THE DECISIVE GRAIN TEST — one family, two children, two different lanes. */
    it("excludes the sibling who is in a different stage", async () => {
        const db = multiChildDb();
        const waitlist = await childStageRows(db, "waitlist");
        const enrolling = await childStageRows(db, "enrolling");

        expect(waitlist.rows.map((r) => r.customer_member_id)).toEqual(["child-A"]);
        expect(enrolling.rows.map((r) => r.customer_member_id)).toEqual(["child-B"]);
        expect(waitlist.rows.map((r) => r.id)).not.toContain("cand-B");
        expect(enrolling.rows.map((r) => r.id)).not.toContain("cand-A");
    });

    /**
     * A family's other children have candidate rows on the SAME opportunity. Bounding the candidate
     * query by opportunity id alone would pull them in behind the one child who actually moved.
     */
    it("does not pull a sibling in on the shared opportunity id", async () => {
        const db = multiChildDb();
        const { rows } = await childStageRows(db, "waitlist");
        expect(rows).toHaveLength(1);
        expect(rows[0]!.customer_member_id).toBe("child-A");
    });

    it("keeps a child riding the family track out of a child lane they are not in", async () => {
        // stage_key null → effective stage is the family's `lead`, so not a Waitlist member.
        const db = multiChildDb();
        db.process_instances = [pi("child-A", null)];
        const { rows } = await childStageRows(db, "waitlist");
        expect(rows).toHaveLength(0);
    });

    it("admits that same child to the lane their family track actually puts them in", async () => {
        const db = multiChildDb();
        db.process_instances = [pi("child-A", null)];
        const { rows } = await childStageRows(db, "lead");
        expect(rows.map((r) => r.customer_member_id)).toEqual(["child-A"]);
    });

    it("respects the lane's configured candidate statuses", async () => {
        const db = multiChildDb();
        db.placement_candidates = [cand("cand-A", "child-A", "ocm-A", "withdrawn")];
        const { rows } = await childStageRows(db, "waitlist");
        expect(rows).toHaveLength(0);
    });

    it("yields nothing rather than inventing a row when the child has no candidate", async () => {
        const db = multiChildDb();
        db.placement_candidates = [];
        const { rows } = await childStageRows(db, "waitlist");
        expect(rows).toHaveLength(0);
    });

    /**
     * BOUNDEDNESS. The instruction this work answers forbids replacing a bounded opportunity query
     * with an unbounded child scan. Membership is read org + Enrollment + this stage (or null stage,
     * resolved in code), and the candidate query is then bounded by an explicit opportunity-id list
     * — never an org-wide candidate read.
     */
    it("stays bounded: stage-scoped membership, then an explicit id list", async () => {
        const db = multiChildDb();
        const { calls } = await childStageRows(db, "waitlist");

        const piCall = calls.find((c) => c.table === "process_instances");
        expect(piCall, "membership must be read from process_instances").toBeTruthy();
        expect(piCall!.filters.org_id).toBe(ORG);
        expect(piCall!.filters.process_key).toBe("enrollment");

        const candCall = calls.find((c) => c.table === "placement_candidates");
        expect(candCall, "candidates must be read").toBeTruthy();
        expect(candCall!.filters.org_id).toBe(ORG);
        expect(Array.isArray(candCall!.ins.opportunity_id)).toBe(true);
        expect((candCall!.ins.opportunity_id ?? []).length).toBeGreaterThan(0);
        expect(candCall!.ins.status).toEqual(["active", "paused"]);
    });

    it("does not query candidates at all when no child is in the stage", async () => {
        const db = multiChildDb();
        db.process_instances = [pi("child-B", "enrolling")];
        const { calls } = await childStageRows(db, "waitlist");
        expect(calls.some((c) => c.table === "placement_candidates")).toBe(false);
    });
});
