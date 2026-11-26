/**
 * Focus Panel / record surface reads ENROLLMENT PARTICIPATION (state) and PROCESS STAGE from
 * process_instances (source of truth), overlaid onto the OCM-derived child blocks. Each child's
 * stage is independent (per process_instance). OCM remains only as a documented fallback for children
 * with no process instance yet (legacy pre-cutover leads).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { overlayProcessInstanceParticipation } from "@/lib/admin/opportunityEntityRecord";

const ORG = "11111111-1111-4111-8111-111111111111";
const LEAD = "33333333-3333-4333-8333-333333333333";

type Rec = Record<string, unknown>;

/** Mock Supabase: process_instances read used by listEnrollmentInstancesForLead. */
function mockSupabase(processInstances: Rec[]) {
    return {
        from(table: string) {
            const filters: Rec = {};
            const builder: Rec = {
                select: () => builder,
                eq(col: string, val: unknown) {
                    filters[col] = val;
                    return builder;
                },
                then(resolve: (r: { data: Rec[]; error: null }) => void) {
                    const rows =
                        table === "process_instances"
                            ? processInstances.filter((r) =>
                                  Object.entries(filters).every(([k, v]) => r[k] === v),
                              )
                            : [];
                    resolve({ data: rows, error: null });
                },
            };
            return builder;
        },
    } as never;
}

const pi = (subjectId: string, stageKey: string | null, state: string | null): Rec => ({
    id: `pi-${subjectId}`,
    org_id: ORG,
    process_key: "enrollment",
    subject_type: "child",
    subject_id: subjectId,
    context_type: "opportunity",
    context_id: LEAD,
    stage_key: stageKey,
    state,
    close_reason_key: null,
    metadata: {},
    created_at: "2026-07-01",
    updated_at: "2026-07-02",
});

const child = (cmId: string, ocmStatus: string | null): Rec => ({
    id: `ocm-${cmId}`,
    ocm_id: `ocm-${cmId}`,
    customer_member_id: cmId,
    display_name: `Child ${cmId}`,
    outcome_status_key: ocmStatus,
    outcome_status_label: ocmStatus ? `OCM ${ocmStatus}` : null,
    program_category_id: "cat-1",
    start_date: "2026-09-01",
});

const LABELS = new Map<string, string>([
    ["waitlisted", "Waitlisted"],
    ["enrolled", "Enrolled"],
    ["enrolling", "Enrolling"],
]);

describe("Focus Panel participation overlay — process_instances source of truth", () => {
    it("overlays participation state + process stage from process_instances", async () => {
        const supabase = mockSupabase([pi("child-A", "waitlist", "waitlisted")]);
        const [row] = await overlayProcessInstanceParticipation(supabase, ORG, LEAD, [child("child-A", "stale_ocm_status")] as never, LABELS);
        expect(row.outcome_status_key).toBe("waitlisted"); // from PI.state, not the stale OCM value
        expect(row.outcome_status_label).toBe("Waitlisted");
        expect(row.stage_key).toBe("waitlist"); // process stage from PI
        expect(row._participation_source).toBe("process_instances");
    });

    it("shows an independent stage per child (one process_instance each)", async () => {
        const supabase = mockSupabase([
            pi("child-A", "waitlist", "waitlisted"),
            pi("child-B", "enrolling", "enrolling"),
        ]);
        const rows = await overlayProcessInstanceParticipation(
            supabase,
            ORG,
            LEAD,
            [child("child-A", null), child("child-B", null)] as never,
            LABELS,
        );
        expect(rows.map((r) => r.stage_key)).toEqual(["waitlist", "enrolling"]);
        expect(rows.map((r) => r.outcome_status_key)).toEqual(["waitlisted", "enrolling"]);
        expect(rows.every((r) => r._participation_source === "process_instances")).toBe(true);
    });

    it("falls back to OCM only when a child has no process instance", async () => {
        // child-A has a PI; child-B does not.
        const supabase = mockSupabase([pi("child-A", "enrolling", "enrolled")]);
        const rows = await overlayProcessInstanceParticipation(
            supabase,
            ORG,
            LEAD,
            [child("child-A", "old"), child("child-B", "ocm_only_status")] as never,
            LABELS,
        );
        const a = rows.find((r) => r.customer_member_id === "child-A")!;
        const b = rows.find((r) => r.customer_member_id === "child-B")!;
        expect(a._participation_source).toBe("process_instances");
        expect(a.outcome_status_key).toBe("enrolled");
        // Legacy fallback: no PI → keep the OCM-sourced status, marked as bridge.
        expect(b._participation_source).toBe("ocm");
        expect(b.outcome_status_key).toBe("ocm_only_status");
    });

    it("marks all children as OCM-sourced when the lead has no process instances", async () => {
        const supabase = mockSupabase([]);
        const rows = await overlayProcessInstanceParticipation(supabase, ORG, LEAD, [child("child-A", "s")] as never, LABELS);
        expect(rows[0]._participation_source).toBe("ocm");
        expect(rows[0].outcome_status_key).toBe("s"); // unchanged fallback
    });

    it("preserves the child identity fields actions rely on (customer_member_id, ocm_id)", async () => {
        const supabase = mockSupabase([pi("child-A", "waitlist", "waitlisted")]);
        const [row] = await overlayProcessInstanceParticipation(supabase, ORG, LEAD, [child("child-A", null)] as never, LABELS);
        expect(row.customer_member_id).toBe("child-A"); // subject id for process-instance targeting
        expect(row.ocm_id).toBe("ocm-child-A"); // OCM id still present for the participation-detail edit bridge
    });

    it("returns [] for no children (no process_instances query needed)", async () => {
        const rows = await overlayProcessInstanceParticipation(mockSupabase([]), ORG, LEAD, [] as never, LABELS);
        expect(rows).toEqual([]);
    });

    it("Focus Panel children card does not render operator-facing 'Enrollment Status' text", () => {
        const src = readFileSync(
            path.join(__dirname, "../../lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence.ts"),
            "utf8",
        );
        expect(src).not.toContain("Enrollment Status");
    });
});
