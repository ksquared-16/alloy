import { describe, expect, it } from "vitest";
import { resolveQueueRowSubjectFocus } from "@/lib/presentation/runtime/resolveQueueRowSubjectFocus";
import type {
    QueueRowContext,
    RelatedSubjectSummary,
} from "@/lib/workUnits/lifecycleSubjectContracts";

function sibling(id: string, name: string): RelatedSubjectSummary {
    return { subject_type: "child", subject_id: id, display_name: name, status_label: "Waitlisted" };
}

function ctx(over: Partial<QueueRowContext>): QueueRowContext {
    return {
        contract_version: "1.1-partial",
        row_subject: { subject_type: "case", subject_id: "opp-1", display_name: "Smith Household" },
        case_context: {
            case_id: "opp-1",
            display_name: "Smith Household",
            case_type_label: "Enrollment Case",
            case_status_key: "open",
            case_status_label: "Active",
        },
        primary_contact: { display_name: "Sarah Smith" },
        related_subjects_summary: [],
        row_stage: "New Leads",
        lifecycle_key: "enrollment",
        row_status_key: "open",
        row_status_label: "New Lead",
        attention_summary: null,
        work_summary: null,
        current_work_summary: null,
        next_best_action: null,
        drawer_open: { entity_type: "opportunities", entity_id: "opp-1" },
        ...over,
    } as QueueRowContext;
}

describe("resolveQueueRowSubjectFocus", () => {
    it("household (default) anchors on the case, contact supports, siblings summarized", () => {
        const f = resolveQueueRowSubjectFocus(
            ctx({ related_subjects_summary: [sibling("c1", "Ava"), sibling("c2", "Ben")] }),
            undefined,
        );
        expect(f.focus).toBe("household");
        expect(f.primary).toEqual({ subject_type: "case", subject_id: "opp-1", display_name: "Smith Household" });
        expect(f.supportingLines).toEqual(["Sarah Smith"]);
        expect(f.siblings).toEqual({ count: 2, summary: "Ava, Ben" });
    });

    it("active_child anchors on the highlighted child; household+contact support; siblings summarized", () => {
        const f = resolveQueueRowSubjectFocus(
            ctx({
                row_subject: { subject_type: "child", subject_id: "c1", display_name: "Ava" },
                related_subjects_summary: [sibling("c1", "Ava"), sibling("c2", "Ben")],
            }),
            "active_child",
        );
        expect(f.focus).toBe("active_child");
        expect(f.primary.display_name).toBe("Ava");
        expect(f.supportingLines).toEqual(["Smith Household", "Sarah Smith"]);
        expect(f.siblings).toEqual({ count: 1, summary: "Ben" }); // excludes the active child
    });

    it("placement_candidate_child anchors on the candidate; siblings as COUNT only", () => {
        const f = resolveQueueRowSubjectFocus(
            ctx({
                row_subject: { subject_type: "candidate", subject_id: "pc1", display_name: "Ava" },
                related_subjects_summary: [sibling("c2", "Ben")],
            }),
            "placement_candidate_child",
        );
        expect(f.focus).toBe("placement_candidate_child");
        expect(f.primary.subject_type).toBe("candidate");
        expect(f.siblings).toEqual({ count: 1, summary: null }); // count only, no names
    });

    it("placement_candidate_child surfaces the waitlist rank + household as supporting (Phase 5)", () => {
        const f = resolveQueueRowSubjectFocus(
            ctx({
                row_subject: { subject_type: "candidate", subject_id: "pc1", display_name: "Ava" },
                waitlist_context: { position_label: "#3 of 12", wait_since: "2026-05-01" },
            }),
            "placement_candidate_child",
        );
        expect(f.supportingLines).toEqual(["#3 of 12", "Smith Household"]);
    });

    it("placement_candidate_child falls back to household only when no waitlist rank", () => {
        const f = resolveQueueRowSubjectFocus(
            ctx({ row_subject: { subject_type: "candidate", subject_id: "pc1", display_name: "Ava" } }),
            "placement_candidate_child",
        );
        expect(f.supportingLines).toEqual(["Smith Household"]);
    });

    it("opportunity anchors on the case with no sibling rollup", () => {
        const f = resolveQueueRowSubjectFocus(ctx({ related_subjects_summary: [sibling("c1", "Ava")] }), "opportunity");
        expect(f.focus).toBe("opportunity");
        expect(f.primary.subject_type).toBe("case");
        expect(f.siblings).toBeNull();
    });

    it("fails safe to household when the requested focus subject is not present", () => {
        // active_child requested but the row is a case → fall back to household (never invents a child).
        const f = resolveQueueRowSubjectFocus(ctx({}), "active_child");
        expect(f.focus).toBe("household");
        expect(f.primary.subject_type).toBe("case");
    });
});
