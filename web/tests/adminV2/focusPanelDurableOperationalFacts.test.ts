/**
 * Focus Panel / record surface shows operational facts (program / room / schedule / start date) from the
 * DURABLE model (agreement + placement + schedule assignment) once materialized. OCM is the fallback for
 * children with no operational agreement, and fills gaps where a durable fact is absent.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/childcareOperational/inquiryChildrenDurableFactsOverlay", () => ({
    resolveDurableFactsForChildren: vi.fn(async () => new Map()),
}));

import { overlayDurableOperationalFacts } from "@/lib/admin/opportunityEntityRecord";
import { resolveDurableFactsForChildren, type DurableChildFacts } from "@/lib/childcareOperational/inquiryChildrenDurableFactsOverlay";

const ORG = "org-1";
const resolver = vi.mocked(resolveDurableFactsForChildren);
const sb = {} as never;

type Rec = Record<string, unknown>;
const child = (id: string, extra: Rec = {}): Rec => ({
    id: `ocm-${id}`,
    customer_member_id: id,
    location_id: "site-1",
    desired_program_label: "OCM Program",
    program_room_cohort_label: "OCM Room",
    desired_schedule_label: "OCM Schedule",
    start_date: "2026-01-01",
    program_category_id: "ocm-prog",
    ...extra,
});
const durable = (over: Partial<DurableChildFacts> = {}): DurableChildFacts => ({
    programLabel: "Preschool",
    roomLabel: "North Room",
    scheduleLabel: "Full Day (Mon, Tue, Wed, Thu, Fri)",
    startDate: "2026-09-01",
    programCategoryId: "prog-durable",
    roomLocationId: "room-1",
    siteLocationId: "site-1",
    agreementStatus: "active",
    ...over,
});

describe("overlayDurableOperationalFacts (Focus Panel)", () => {
    beforeEach(() => resolver.mockReset());

    it("shows program/room/schedule/start from the durable model when materialized", async () => {
        resolver.mockResolvedValueOnce(new Map([["child-A", durable()]]));
        const [row] = await overlayDurableOperationalFacts(sb, ORG, [child("child-A")] as never);
        expect(row.desired_program_label).toBe("Preschool");
        expect(row.program_room_cohort_label).toBe("North Room");
        expect(row.desired_schedule_label).toBe("Full Day (Mon, Tue, Wed, Thu, Fri)");
        expect(row.start_date).toBe("2026-09-01");
        expect(row.program_category_id).toBe("prog-durable");
        expect(row.location_id).toBe("site-1");
        expect(row._operational_facts_source).toBe("durable");
    });

    it("falls back to OCM for a child with no operational agreement", async () => {
        resolver.mockResolvedValueOnce(new Map()); // no durable facts
        const [row] = await overlayDurableOperationalFacts(sb, ORG, [child("child-A")] as never);
        expect(row.desired_program_label).toBe("OCM Program");
        expect(row.start_date).toBe("2026-01-01");
        expect(row._operational_facts_source).toBe("ocm");
    });

    it("mixes: durable child uses durable facts, sibling with none uses OCM", async () => {
        resolver.mockResolvedValueOnce(new Map([["child-A", durable({ programLabel: "Toddler" })]]));
        const rows = await overlayDurableOperationalFacts(sb, ORG, [child("child-A"), child("child-B")] as never);
        const a = rows.find((r) => r.customer_member_id === "child-A")!;
        const b = rows.find((r) => r.customer_member_id === "child-B")!;
        expect(a.desired_program_label).toBe("Toddler");
        expect(a._operational_facts_source).toBe("durable");
        expect(b.desired_program_label).toBe("OCM Program");
        expect(b._operational_facts_source).toBe("ocm");
    });

    it("durable wins but OCM fills gaps where a durable fact is null", async () => {
        resolver.mockResolvedValueOnce(new Map([["child-A", durable({ programLabel: null, scheduleLabel: null })]]));
        const [row] = await overlayDurableOperationalFacts(sb, ORG, [child("child-A")] as never);
        expect(row.desired_program_label).toBe("OCM Program"); // gap filled from OCM
        expect(row.desired_schedule_label).toBe("OCM Schedule"); // gap filled
        expect(row.program_room_cohort_label).toBe("North Room"); // durable present
        expect(row._operational_facts_source).toBe("durable"); // still materialized
    });

    it("returns [] for no children without querying", async () => {
        const rows = await overlayDurableOperationalFacts(sb, ORG, [] as never);
        expect(rows).toEqual([]);
        expect(resolver).not.toHaveBeenCalled();
    });
});
