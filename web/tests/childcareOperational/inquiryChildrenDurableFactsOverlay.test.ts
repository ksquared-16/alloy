/**
 * resolveDurableFactsForChildren: batch-load operational agreements for a set of children, then build the
 * operational enrollment read model per child that has one. Children without an agreement are absent
 * (caller falls back to OCM). Prefers the agreement at the child's site.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/childcareOperational/operationalEnrollmentReadModel", () => ({
    buildOperationalEnrollmentReadModelForAgreement: vi.fn(),
}));

import { resolveDurableFactsForChildren } from "@/lib/childcareOperational/inquiryChildrenDurableFactsOverlay";
import { buildOperationalEnrollmentReadModelForAgreement } from "@/lib/childcareOperational/operationalEnrollmentReadModel";

const ORG = "org-1";
const rm = vi.mocked(buildOperationalEnrollmentReadModelForAgreement);

type Rec = Record<string, unknown>;

/** Mock supabase answering only the child_enrollment_agreements batch query. */
function mockSupabase(agreements: Rec[]) {
    return {
        from(table: string) {
            const builder: Rec = {
                select: () => builder,
                eq: () => builder,
                in: () => builder,
                then(resolve: (r: { data: Rec[]; error: null }) => void) {
                    resolve({ data: table === "child_enrollment_agreements" ? agreements : [], error: null });
                },
            };
            return builder;
        },
    } as never;
}

const readModel = (over: Rec = {}): Rec => ({
    agreement: { id: "agr-1", site_location_id: "site-1", status: "active", start_date: "2026-09-01" },
    placement: { start_date: "2026-09-15", program_category_id: "prog-1", room_location_id: "room-1" },
    scheduleAssignment: { id: "sch-1" },
    schedulePattern: { id: "pat-1" },
    labels: { site: "Main", program: "Preschool", room: "North Room", schedule: "Full Day" },
    warnings: [],
    ...over,
});

describe("resolveDurableFactsForChildren", () => {
    beforeEach(() => rm.mockReset());

    it("returns durable facts for a child with an operational agreement", async () => {
        rm.mockResolvedValueOnce(readModel() as never);
        const supabase = mockSupabase([{ id: "agr-1", customer_member_id: "child-A", site_location_id: "site-1", status: "active" }]);
        const map = await resolveDurableFactsForChildren(supabase, ORG, [{ customerMemberId: "child-A", siteLocationId: "site-1" }]);
        const f = map.get("child-A")!;
        expect(f.programLabel).toBe("Preschool");
        expect(f.roomLabel).toBe("North Room");
        expect(f.scheduleLabel).toBe("Full Day");
        expect(f.startDate).toBe("2026-09-15"); // placement start preferred over agreement start
        expect(f.programCategoryId).toBe("prog-1");
        expect(f.siteLocationId).toBe("site-1");
    });

    it("omits children with no operational agreement", async () => {
        const supabase = mockSupabase([{ id: "agr-1", customer_member_id: "child-A", site_location_id: "site-1", status: "active" }]);
        rm.mockResolvedValueOnce(readModel() as never);
        const map = await resolveDurableFactsForChildren(supabase, ORG, [
            { customerMemberId: "child-A", siteLocationId: "site-1" },
            { customerMemberId: "child-B", siteLocationId: "site-1" },
        ]);
        expect(map.has("child-A")).toBe(true);
        expect(map.has("child-B")).toBe(false);
    });

    it("prefers the agreement matching the child's site", async () => {
        rm.mockResolvedValueOnce(readModel({ agreement: { id: "agr-site2", site_location_id: "site-2", status: "active", start_date: "2026-09-01" } }) as never);
        const supabase = mockSupabase([
            { id: "agr-site1", customer_member_id: "child-A", site_location_id: "site-1", status: "active" },
            { id: "agr-site2", customer_member_id: "child-A", site_location_id: "site-2", status: "active" },
        ]);
        await resolveDurableFactsForChildren(supabase, ORG, [{ customerMemberId: "child-A", siteLocationId: "site-2" }]);
        expect(rm.mock.calls[0][2]).toBe("agr-site2"); // built the read model for the site-matching agreement
    });

    it("returns an empty map when no agreements exist (caller falls back to OCM)", async () => {
        const supabase = mockSupabase([]);
        const map = await resolveDurableFactsForChildren(supabase, ORG, [{ customerMemberId: "child-A" }]);
        expect(map.size).toBe(0);
        expect(rm).not.toHaveBeenCalled();
    });
});
