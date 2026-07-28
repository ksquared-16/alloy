/**
 * resolveProcessDraftFactsForChildren: read the lead's enrollment process instances and surface
 * pre-materialization participation facts (program/room/schedule/start) with labels resolved. No OCM.
 */
import { describe, it, expect } from "vitest";
import { resolveProcessDraftFactsForChildren } from "@/lib/childcareOperational/inquiryChildrenProcessDraftFactsOverlay";

const ORG = "org-1";
const OPP = "33333333-3333-4333-8333-333333333333";
type Rec = Record<string, unknown>;

function mockSupabase(data: { process_instances: Rec[]; location_program_categories?: Rec[]; locations?: Rec[] }) {
    let ocmAccess = 0;
    const client = {
        from(table: string) {
            if (table === "opportunity_customer_members") ocmAccess++;
            const builder: Rec = {
                select: () => builder,
                eq: () => builder,
                in: () => builder,
                then(resolve: (r: { data: Rec[]; error: null }) => void) {
                    resolve({ data: (data as Record<string, Rec[]>)[table] ?? [], error: null });
                },
            };
            return builder;
        },
    };
    return { client: client as never, ocmAccess: () => ocmAccess };
}

const pi = (subjectId: string, metadata: Rec): Rec => ({
    id: `pi-${subjectId}`,
    org_id: ORG,
    process_key: "enrollment",
    subject_type: "child",
    subject_id: subjectId,
    context_type: "opportunity",
    context_id: OPP,
    stage_key: null,
    state: null,
    metadata,
    created_at: "2026-07-01",
    updated_at: "2026-07-01",
});

describe("resolveProcessDraftFactsForChildren", () => {
    it("resolves program/room/schedule/start from PI metadata with labels; no OCM read", async () => {
        const supabase = mockSupabase({
            process_instances: [pi("child-A", { program_category_id: "cat-1", room_location_id: "550e8400-e29b-41d4-a716-446655440000", schedule_type: "full_day", start_date: "2026-09-01" })],
            location_program_categories: [{ id: "cat-1", label: "Preschool", key: "preschool" }],
            locations: [{ id: "550e8400-e29b-41d4-a716-446655440000", label: "North Room" }],
        });
        const map = await resolveProcessDraftFactsForChildren(supabase.client, ORG, OPP, [{ customerMemberId: "child-A" }]);
        const f = map.get("child-A")!;
        expect(f.programLabel).toBe("Preschool");
        expect(f.roomLabel).toBe("North Room");
        expect(f.scheduleLabel).toBe("Full Day"); // humanized schedule_type
        expect(f.startDate).toBe("2026-09-01");
        expect(f.programCategoryId).toBe("cat-1");
        expect(supabase.ocmAccess()).toBe(0);
    });

    it("surfaces location-only Create Lead participation with the site label (not UUID)", async () => {
        const siteId = "550e8400-e29b-41d4-a716-446655440099";
        const supabase = mockSupabase({
            process_instances: [pi("child-A", { location_id: siteId })],
            locations: [{ id: siteId, label: "North Campus" }],
        });
        const map = await resolveProcessDraftFactsForChildren(supabase.client, ORG, OPP, [
            { customerMemberId: "child-A" },
        ]);
        const f = map.get("child-A")!;
        expect(f.siteLocationId).toBe(siteId);
        expect(f.siteLocationLabel).toBe("North Campus");
        expect(f.siteLocationLabel).not.toBe(siteId);
    });

    it("humanizes a non-uuid room key when no location matches", async () => {
        const supabase = mockSupabase({ process_instances: [pi("child-A", { program_room_cohort_key: "infant_room", start_date: "2026-09-01" })] });
        const map = await resolveProcessDraftFactsForChildren(supabase.client, ORG, OPP, [{ customerMemberId: "child-A" }]);
        expect(map.get("child-A")!.roomLabel).toBe("Infant Room");
    });

    it("omits children with no participation facts on the process instance", async () => {
        const supabase = mockSupabase({ process_instances: [pi("child-A", {})] });
        const map = await resolveProcessDraftFactsForChildren(supabase.client, ORG, OPP, [{ customerMemberId: "child-A" }]);
        expect(map.has("child-A")).toBe(false);
    });

    it("only returns facts for the requested children", async () => {
        const supabase = mockSupabase({
            process_instances: [pi("child-A", { start_date: "2026-09-01" }), pi("child-B", { start_date: "2026-10-01" })],
        });
        const map = await resolveProcessDraftFactsForChildren(supabase.client, ORG, OPP, [{ customerMemberId: "child-A" }]);
        expect(map.has("child-A")).toBe(true);
        expect(map.has("child-B")).toBe(false);
    });
});
