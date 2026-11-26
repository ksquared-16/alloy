/**
 * Focus Panel pre-materialization participation display sources program/room/schedule/start from
 * process_instances.metadata (no OCM). Priority: durable (materialized) > process-instance draft > OCM.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/childcareOperational/inquiryChildrenProcessDraftFactsOverlay", () => ({
    resolveProcessDraftFactsForChildren: vi.fn(async () => new Map()),
}));

import { overlayProcessDraftParticipation } from "@/lib/admin/opportunityEntityRecord";
import { resolveProcessDraftFactsForChildren, type ProcessDraftChildFacts } from "@/lib/childcareOperational/inquiryChildrenProcessDraftFactsOverlay";

const ORG = "org-1";
const OPP = "opp-1";
const sb = {} as never;
const resolver = vi.mocked(resolveProcessDraftFactsForChildren);

type Rec = Record<string, unknown>;
const child = (id: string, source: "durable" | "ocm" | undefined, extra: Rec = {}): Rec => ({
    id: `blk-${id}`,
    customer_member_id: id,
    desired_program_label: "OCM Program",
    program_room_cohort_label: "OCM Room",
    desired_schedule_label: "OCM Schedule",
    start_date: "2026-01-01",
    program_category_id: "ocm-prog",
    _operational_facts_source: source,
    ...extra,
});
const draft = (over: Partial<ProcessDraftChildFacts> = {}): ProcessDraftChildFacts => ({
    programLabel: "Preschool",
    roomLabel: "North Room",
    scheduleLabel: "Full Day",
    startDate: "2026-09-01",
    programCategoryId: "prog-draft",
    siteLocationId: "site-1",
    siteLocationLabel: null,
    ...over,
});

describe("overlayProcessDraftParticipation (Focus Panel pre-materialization)", () => {
    beforeEach(() => resolver.mockReset());

    it("shows PI-metadata participation facts for a non-materialized child", async () => {
        resolver.mockResolvedValueOnce(new Map([["child-A", draft()]]));
        const [row] = await overlayProcessDraftParticipation(sb, ORG, OPP, [child("child-A", "ocm")] as never);
        expect(row.desired_program_label).toBe("Preschool");
        expect(row.program_room_cohort_label).toBe("North Room");
        expect(row.desired_schedule_label).toBe("Full Day");
        expect(row.start_date).toBe("2026-09-01");
        expect(row.program_category_id).toBe("prog-draft");
        expect(row._operational_facts_source).toBe("process_instance");
    });

    it("does NOT override a materialized (durable) child — durable still wins", async () => {
        resolver.mockResolvedValueOnce(new Map([["child-A", draft({ programLabel: "SHOULD-NOT-APPEAR" })]]));
        const [row] = await overlayProcessDraftParticipation(sb, ORG, OPP, [child("child-A", "durable")] as never);
        expect(row.desired_program_label).toBe("OCM Program"); // unchanged; durable overlay already set it
        expect(row._operational_facts_source).toBe("durable");
        // durable children are excluded from the resolver call entirely
        expect(resolver).not.toHaveBeenCalled();
    });

    it("keeps OCM fallback when the child has no PI draft facts", async () => {
        resolver.mockResolvedValueOnce(new Map()); // no draft facts for anyone
        const [row] = await overlayProcessDraftParticipation(sb, ORG, OPP, [child("child-A", "ocm")] as never);
        expect(row.desired_program_label).toBe("OCM Program");
        expect(row._operational_facts_source).toBe("ocm");
    });

    it("gap-fills from OCM when a specific draft fact is null", async () => {
        resolver.mockResolvedValueOnce(new Map([["child-A", draft({ scheduleLabel: null })]]));
        const [row] = await overlayProcessDraftParticipation(sb, ORG, OPP, [child("child-A", "ocm")] as never);
        expect(row.desired_program_label).toBe("Preschool"); // from PI draft
        expect(row.desired_schedule_label).toBe("OCM Schedule"); // gap filled from OCM
        expect(row._operational_facts_source).toBe("process_instance");
    });
});
