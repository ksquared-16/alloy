import { describe, it, expect } from "vitest";
import {
    mapProcessInstanceToTrackRow,
    queryEnrollmentProcessInstanceParticipationRows,
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
                or(expr: string) {
                    // Effective-stage query: "stage_key.eq.<X>,stage_key.is.null".
                    filters.__or_stage = /stage_key\.eq\.([^,]+)/.exec(expr)?.[1] ?? null;
                    return builder;
                },
                in() {
                    return builder;
                },
                then(resolve: (r: { data: Rec[]; error: null }) => void) {
                    let rows = (data as Record<string, Rec[]>)[table] ?? [];
                    if (table === "process_instances") {
                        if (filters.stage_key !== undefined) {
                            rows = rows.filter((r) => r.stage_key === filters.stage_key);
                        } else if (filters.__or_stage !== undefined) {
                            // stage_key == X OR stage_key IS NULL (family-track riders)
                            rows = rows.filter((r) => r.stage_key === filters.__or_stage || r.stage_key == null);
                        }
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

    it("carries the child's EFFECTIVE stage, not the family's, once the child has branched", () => {
        const branched = mapProcessInstanceToTrackRow(
            pi("pi-1", "child-A", "waitlist", "waitlisted") as never,
            opp(LEAD) as never, // family case is still at `lead`
            cm("child-A", "Mia Rivera") as never,
            null,
        );
        expect((branched as { _effective_stage_key?: string | null })._effective_stage_key).toBe("waitlist");

        const riding = mapProcessInstanceToTrackRow(
            { ...pi("pi-2", "child-B", "waitlist", null), stage_key: null } as never,
            opp(LEAD) as never,
            cm("child-B", "Leo Rivera") as never,
            null,
        );
        expect((riding as { _effective_stage_key?: string | null })._effective_stage_key).toBe("lead");
    });
});

// ── PARTICIPATION MEMBERSHIP ────────────────────────────────────────────────────────────────────
// "Whose enrollment journey is still running", which is NOT "the stage rule run over every stage".

const piLive = (
    id: string,
    subjectId: string,
    stageKey: string | null,
    state: string | null,
    closeReasonKey: string | null = null,
    contextId: string = LEAD,
) => ({
    id,
    org_id: ORG,
    process_key: "enrollment",
    subject_type: "child",
    subject_id: subjectId,
    context_id: contextId,
    stage_key: stageKey,
    state,
    close_reason_key: closeReasonKey,
    metadata: {},
    updated_at: "2026-07-02",
    created_at: "2026-07-02",
});

describe("participation membership — stage-independent child rows", () => {
    it("admits every live child in the work unit, at whatever stage", async () => {
        const supabase = mockSupabase({
            process_instances: [
                piLive("pi-1", "child-A", null, null), // riding the family track (`lead`)
                piLive("pi-2", "child-B", "waitlist", "waitlisted"), // branched
                piLive("pi-3", "child-C", "enrolled", "enrolled"), // still a live participation
            ],
            opportunities: [opp(LEAD)],
            customer_members: [cm("child-A", "Mia Rivera"), cm("child-B", "Leo Rivera"), cm("child-C", "Ana Rivera")],
        });
        const rows = await queryEnrollmentProcessInstanceParticipationRows({ supabase, orgId: ORG, workUnitId: WU });
        expect(rows.map((r) => r.customer_member_id).sort()).toEqual(["child-A", "child-B", "child-C"]);
        // Effective stage travels with the row, for display — membership did not come from it.
        const byChild = new Map(
            rows.map((r) => [r.customer_member_id, (r as { _effective_stage_key?: string | null })._effective_stage_key]),
        );
        expect(byChild.get("child-A")).toBe("lead"); // inherited from the family case
        expect(byChild.get("child-B")).toBe("waitlist");
    });

    it("excludes a CLOSED participation even though its family case sits in an active stage", async () => {
        // This is the case a stage enumeration gets wrong: the child is done, the family is not.
        const supabase = mockSupabase({
            process_instances: [
                piLive("pi-1", "child-A", null, null),
                piLive("pi-2", "child-B", null, "withdrawn", "family_withdrew"),
            ],
            opportunities: [opp(LEAD)], // still `lead`, still open
            customer_members: [cm("child-A", "Mia Rivera"), cm("child-B", "Leo Rivera")],
        });
        const rows = await queryEnrollmentProcessInstanceParticipationRows({ supabase, orgId: ORG, workUnitId: WU });
        expect(rows.map((r) => r.customer_member_id)).toEqual(["child-A"]);
    });

    it("excludes a child whose subject record is inactive", async () => {
        const supabase = mockSupabase({
            process_instances: [piLive("pi-1", "child-A", null, null), piLive("pi-2", "child-B", null, null)],
            opportunities: [opp(LEAD)],
            customer_members: [cm("child-A", "Mia Rivera"), { ...cm("child-B", "Leo Rivera"), is_active: false }],
        });
        const rows = await queryEnrollmentProcessInstanceParticipationRows({ supabase, orgId: ORG, workUnitId: WU });
        expect(rows.map((r) => r.customer_member_id)).toEqual(["child-A"]);
    });

    it("excludes children whose family case is closed", async () => {
        const supabase = mockSupabase({
            process_instances: [piLive("pi-1", "child-A", null, null)],
            opportunities: [{ ...opp(LEAD), status_key: "closed" }],
            customer_members: [cm("child-A", "Mia Rivera")],
        });
        const rows = await queryEnrollmentProcessInstanceParticipationRows({ supabase, orgId: ORG, workUnitId: WU });
        expect(rows).toEqual([]);
    });

    it("excludes instances whose context opportunity is not in the work unit", async () => {
        const supabase = mockSupabase({
            process_instances: [piLive("pi-1", "child-A", null, null)],
            opportunities: [], // scoped read returns nothing for this work unit
            customer_members: [cm("child-A", "Mia Rivera")],
        });
        const rows = await queryEnrollmentProcessInstanceParticipationRows({ supabase, orgId: ORG, workUnitId: WU });
        expect(rows).toEqual([]);
    });

    it("does not admit a non-enrollment subject type through the enrollment lens", async () => {
        const supabase = mockSupabase({
            process_instances: [
                piLive("pi-1", "child-A", null, null),
                { ...piLive("pi-2", "staff-1", null, null), subject_type: "staff" },
            ],
            opportunities: [opp(LEAD)],
            customer_members: [cm("child-A", "Mia Rivera"), cm("staff-1", "Not A Child")],
        });
        const rows = await queryEnrollmentProcessInstanceParticipationRows({ supabase, orgId: ORG, workUnitId: WU });
        expect(rows.map((r) => r.customer_member_id)).toEqual(["child-A"]);
    });
});
