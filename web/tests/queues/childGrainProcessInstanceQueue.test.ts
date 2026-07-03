import { describe, it, expect } from "vitest";
import {
    mapProcessInstanceToTrackRow,
    queryEnrollmentProcessInstanceTrackRows,
} from "@/lib/queues/childGrainProcessInstanceQueue";

const ORG = "11111111-1111-4111-8111-111111111111";
const WU = "22222222-2222-4222-8222-222222222222";
const LEAD = "33333333-3333-4333-8333-333333333333"; // one lead (opportunity)

type Rec = Record<string, unknown>;

/** Minimal chainable Supabase mock: resolves table data, honoring the process_instances stage_key filter. */
function mockSupabase(data: {
    process_instances: Rec[];
    opportunities: Rec[];
    customer_members: Rec[];
    location_program_categories?: Rec[];
}) {
    return {
        from(table: string) {
            const filters: Record<string, unknown> = {};
            const builder: Rec = {
                select() {
                    return builder;
                },
                eq(col: string, val: unknown) {
                    filters[col] = val;
                    return builder;
                },
                in() {
                    return builder;
                },
                then(resolve: (r: { data: Rec[]; error: null }) => void) {
                    let rows = (data as Record<string, Rec[]>)[table] ?? [];
                    if (table === "process_instances" && filters.stage_key !== undefined) {
                        rows = rows.filter((r) => r.stage_key === filters.stage_key);
                    }
                    resolve({ data: rows, error: null });
                },
            };
            return builder;
        },
    } as never;
}

const opp = (id: string) => ({
    id,
    name: "Rivera Family",
    title: null,
    status_key: "open",
    stage_key: "lead",
    customer_id: "c1",
    primary_person_id: "p1",
    primary_contact_id: null,
    work_unit_id: WU,
    location_id: null,
    metadata: {},
    created_at: "2026-07-01",
    updated_at: "2026-07-01",
});
const cm = (id: string, name: string) => ({
    id,
    display_name: name,
    first_name: name.split(" ")[0],
    last_name: name.split(" ")[1] ?? "",
    dob: null,
    person_id: null,
    relationship: "child",
    is_active: true,
});
const pi = (id: string, subjectId: string, stageKey: string, state: string | null) => ({
    id,
    org_id: ORG,
    subject_id: subjectId,
    context_id: LEAD,
    stage_key: stageKey,
    state,
    metadata: { program_category_id: "cat-infant" },
    updated_at: "2026-07-02",
    created_at: "2026-07-02",
});

describe("child-grain read cutover — process_instances", () => {
    it("pure mapper builds the child-grain row shape from a process instance", () => {
        const row = mapProcessInstanceToTrackRow(
            pi("pi-1", "child-A", "waitlist", "waitlisted") as never,
            opp(LEAD) as never,
            cm("child-A", "Mia Rivera") as never,
            { key: "infant", label: "Infant" },
        );
        expect(row.opportunity_id).toBe(LEAD);
        expect(row.customer_member_id).toBe("child-A");
        expect(row.outcome_status_key).toBe("waitlisted"); // state → outcome_status_key (shape compat)
        expect(row.program_category_id).toBe("cat-infant");
        expect((row as { _process_instance_id?: string })._process_instance_id).toBe("pi-1");
    });

    it("a lead with multiple children yields one row per process instance in the same stage", async () => {
        const supabase = mockSupabase({
            process_instances: [
                pi("pi-1", "child-A", "waitlist", "waitlisted"),
                pi("pi-2", "child-B", "waitlist", "waitlisted"),
            ],
            opportunities: [opp(LEAD)],
            customer_members: [cm("child-A", "Mia Rivera"), cm("child-B", "Leo Rivera")],
        });
        const rows = await queryEnrollmentProcessInstanceTrackRows({ supabase, orgId: ORG, workUnitId: WU, stageKey: "waitlist" });
        expect(rows).toHaveLength(2);
        expect(rows.map((r) => r.customer_member_id).sort()).toEqual(["child-A", "child-B"]);
        // one lead (context) shared, distinct subjects
        expect(new Set(rows.map((r) => r.opportunity_id))).toEqual(new Set([LEAD]));
    });

    it("siblings can be in different stages — each stage query returns only its own", async () => {
        const all = {
            process_instances: [
                pi("pi-1", "child-A", "waitlist", "waitlisted"),
                pi("pi-2", "child-B", "enrolling", "enrolling"),
            ],
            opportunities: [opp(LEAD)],
            customer_members: [cm("child-A", "Mia Rivera"), cm("child-B", "Leo Rivera")],
        };
        const waitlist = await queryEnrollmentProcessInstanceTrackRows({ supabase: mockSupabase(all), orgId: ORG, workUnitId: WU, stageKey: "waitlist" });
        const enrolling = await queryEnrollmentProcessInstanceTrackRows({ supabase: mockSupabase(all), orgId: ORG, workUnitId: WU, stageKey: "enrolling" });
        expect(waitlist.map((r) => r.customer_member_id)).toEqual(["child-A"]);
        expect(enrolling.map((r) => r.customer_member_id)).toEqual(["child-B"]);
    });

    it("returns [] when no process instances exist (caller falls back to OCM)", async () => {
        const rows = await queryEnrollmentProcessInstanceTrackRows({
            supabase: mockSupabase({ process_instances: [], opportunities: [], customer_members: [] }),
            orgId: ORG,
            workUnitId: WU,
            stageKey: "waitlist",
        });
        expect(rows).toEqual([]);
    });

    it("excludes instances whose context opportunity is not in the work unit", async () => {
        const supabase = mockSupabase({
            process_instances: [pi("pi-1", "child-A", "waitlist", "waitlisted")],
            opportunities: [], // opportunity not returned for this work unit
            customer_members: [cm("child-A", "Mia Rivera")],
        });
        const rows = await queryEnrollmentProcessInstanceTrackRows({ supabase, orgId: ORG, workUnitId: WU, stageKey: "waitlist" });
        expect(rows).toEqual([]);
    });
});
