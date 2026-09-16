import { describe, expect, it } from "vitest";

import { listEnrollmentInstancesForLead } from "@/lib/process/processInstances";

/**
 * The per-child Decision panel rendered no children, and the configuration was never the problem.
 *
 * A child's Enrollment journey may anchor to the Opportunity (legacy) or to the child's
 * participation — `context_type = enrollment_participation`, `context_id` = the OCM id — which
 * `processInstances.ts` states is "now every NEW journey". The writers were taught to read either
 * anchor; this reader was not, so it compared an Opportunity id against an OCM id and matched
 * nothing.
 *
 * Measured before the fix: asking the participant-decision surface with the Certopp Opportunity id
 * returned 0 participants; asking with the participation id returned Pathb Certopp and all three
 * configured decisions. Same configuration, same stage, same template — different anchor.
 */

type Row = Record<string, unknown>;

/** A Supabase stand-in that answers only the two queries this function makes. */
function client(opts: { participations: string[]; instances: Row[] }) {
    const seen: { table: string; anchors?: unknown }[] = [];
    return {
        seen,
        from(table: string) {
            seen.push({ table });
            if (table === "opportunity_customer_members") {
                const b: Record<string, unknown> = {
                    select: () => b,
                    eq: () => b,
                    then: (res: (v: unknown) => unknown) =>
                        Promise.resolve({ data: opts.participations.map((id) => ({ id })), error: null }).then(res),
                };
                return b;
            }
            let anchors: string[] = [];
            const b: Record<string, unknown> = {
                select: () => b,
                eq: () => b,
                in: (_col: string, values: string[]) => {
                    anchors = values;
                    seen.push({ table, anchors: values });
                    return b;
                },
                then: (res: (v: unknown) => unknown) =>
                    Promise.resolve({
                        data: opts.instances.filter((r) => anchors.includes(String(r.context_id))),
                        error: null,
                    }).then(res),
            };
            return b;
        },
    };
}

const OPP = "opportunity-1";
const PARTICIPATION_A = "ocm-child-a";
const PARTICIPATION_B = "ocm-child-b";

describe("a lead's enrollment journeys are found under either anchor", () => {
    it("finds a participation-anchored journey — the shape that rendered no children", async () => {
        const db = client({
            participations: [PARTICIPATION_A],
            instances: [
                { id: "pi-1", subject_id: "child-a", context_id: PARTICIPATION_A, context_type: "enrollment_participation" },
            ],
        });

        const rows = await listEnrollmentInstancesForLead(db as never, { orgId: "org-1", opportunityId: OPP });

        expect(rows.map((r) => (r as Row).id)).toEqual(["pi-1"]);
    });

    it("still finds a legacy opportunity-anchored journey", async () => {
        const db = client({
            participations: [],
            instances: [{ id: "pi-legacy", subject_id: "child-a", context_id: OPP, context_type: "opportunity" }],
        });

        const rows = await listEnrollmentInstancesForLead(db as never, { orgId: "org-1", opportunityId: OPP });

        expect(rows.map((r) => (r as Row).id)).toEqual(["pi-legacy"]);
    });

    it("finds BOTH anchors at once — a lead mid-migration is not half-visible", async () => {
        const db = client({
            participations: [PARTICIPATION_A, PARTICIPATION_B],
            instances: [
                { id: "pi-legacy", subject_id: "child-a", context_id: OPP },
                { id: "pi-new", subject_id: "child-b", context_id: PARTICIPATION_B },
            ],
        });

        const rows = await listEnrollmentInstancesForLead(db as never, { orgId: "org-1", opportunityId: OPP });

        expect(rows.map((r) => (r as Row).id).sort()).toEqual(["pi-legacy", "pi-new"]);
    });

    it("keeps one child per participation, so a multi-child family decides per child", async () => {
        const db = client({
            participations: [PARTICIPATION_A, PARTICIPATION_B],
            instances: [
                { id: "pi-a", subject_id: "child-a", context_id: PARTICIPATION_A },
                { id: "pi-b", subject_id: "child-b", context_id: PARTICIPATION_B },
            ],
        });

        const rows = await listEnrollmentInstancesForLead(db as never, { orgId: "org-1", opportunityId: OPP });

        // The decision surface derives its participants from subject_id, one row per child.
        expect(new Set(rows.map((r) => (r as Row).subject_id))).toEqual(new Set(["child-a", "child-b"]));
    });

    it("does not claim another lead's journey", async () => {
        const db = client({
            participations: [PARTICIPATION_A],
            instances: [{ id: "pi-other", subject_id: "child-z", context_id: "ocm-of-another-lead" }],
        });

        const rows = await listEnrollmentInstancesForLead(db as never, { orgId: "org-1", opportunityId: OPP });

        expect(rows).toEqual([]);
    });

    it("asks for the lead's participations before matching anchors", async () => {
        const db = client({ participations: [PARTICIPATION_A], instances: [] });

        await listEnrollmentInstancesForLead(db as never, { orgId: "org-1", opportunityId: OPP });

        expect(db.seen[0]?.table).toBe("opportunity_customer_members");
        const anchored = db.seen.find((s) => Array.isArray(s.anchors));
        // Both anchors are offered — the legacy id is not dropped on the way to fixing the new one.
        expect(anchored?.anchors).toEqual([OPP, PARTICIPATION_A]);
    });
});
