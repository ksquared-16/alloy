import { describe, expect, it } from "vitest";
import {
    filterEnrollmentTrackStatusRowsForStage,
    filterFamilyTrackStatusRowsForStage,
} from "@/lib/lifecycle/loadQueueMembershipStatusOptions";
import {
    defaultSubjectTypeForStage,
    queueMembershipSubjectForStatusOptions,
    statusEntityTypeForStage,
} from "@/lib/lifecycle/stageStatusRollup";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";

function row(
    status_key: string,
    status_label: string,
    metadata: Record<string, unknown> | null = null
): StatusDefinitionRow {
    return {
        id: status_key,
        org_id: "org",
        entity_type: "opportunity_customer_members",
        status_key,
        status_label,
        sort_order: 10,
        is_active: true,
        is_system: false,
        industry_key: null,
        metadata,
    };
}

describe("stage status source routing", () => {
    it("routes family-track stages to opportunity status entity", () => {
        expect(defaultSubjectTypeForStage("lead", "family_track")).toBe("case");
        expect(statusEntityTypeForStage("tour", "family_track")).toBe("opportunities");
    });

    it("routes child-track stages to enrollment status entity", () => {
        expect(defaultSubjectTypeForStage("waitlist", "child_track")).toBe("candidate");
        expect(defaultSubjectTypeForStage("enrolling", "child_track")).toBe("child");
        expect(statusEntityTypeForStage("enrolled", "child_track")).toBe("opportunity_customer_members");
    });

    it("ignores stale case subject on child-track stages", () => {
        expect(
            queueMembershipSubjectForStatusOptions({
                stageKey: "enrolling",
                trackKey: "child_track",
                queueMembership: {
                    version: 1,
                    lifecycle_key: "enrollment",
                    stage_key: "enrolling",
                    subject_type: "case",
                    count_unit: "cases",
                    included_disposition_keys: [],
                },
            })
        ).toBe("child");
    });

    it("filters collapsed enrollment disposition rows by persisted stage metadata (S4)", () => {
        // S4: statuses collapse to waitlisted|enrolling|enrolled|withdrawn|not_enrolling and stage
        // membership is by the persisted stage_key metadata — no template status→stage expansion.
        const rows = [
            row("waitlisted", "Waitlisted", {
                alloy_layer: "enrollment_disposition",
                stage_key: "waitlist",
            }),
            row("enrolling", "Enrolling", {
                alloy_layer: "enrollment_disposition",
                stage_key: "enrolling",
            }),
            row("enrolled", "Enrolled", {
                alloy_layer: "enrollment_disposition",
                stage_key: "enrolled",
            }),
        ];

        const waitlist = filterEnrollmentTrackStatusRowsForStage(rows, "waitlist");
        expect(waitlist.map((r) => r.status_key)).toEqual(["waitlisted"]);

        const enrolling = filterEnrollmentTrackStatusRowsForStage(rows, "enrolling");
        expect(enrolling.map((r) => r.status_key)).toContain("enrolling");
        expect(enrolling.map((r) => r.status_key)).not.toContain("waitlisted");
    });

    it("excludes generic opportunity case container statuses from family track picker", () => {
        const rows = [
            {
                ...row("open", "Open", { alloy_layer: "case_status" }),
                entity_type: "opportunities",
            },
            {
                ...row("new_inquiry", "New Lead", { alloy_layer: "lead_pipeline", process_stage_key: "lead" }),
                entity_type: "opportunities",
            },
        ];
        const matched = filterFamilyTrackStatusRowsForStage(rows, "lead");
        expect(matched.map((r) => r.status_key)).toEqual(["new_inquiry"]);
    });

    it("matches closed_withdrawn via persisted stage metadata (S4)", () => {
        // S4: collapsed terminal child statuses are withdrawn|not_enrolling and membership keys off
        // the persisted stage_key metadata, not template disposition-key expansion.
        const rows = [
            row("not_enrolling", "Not enrolling", {
                alloy_layer: "enrollment_disposition",
                stage_key: "closed_withdrawn",
            }),
            row("withdrawn", "Withdrawn", {
                alloy_layer: "enrollment_disposition",
                stage_key: "closed_withdrawn",
            }),
        ];

        const matched = filterEnrollmentTrackStatusRowsForStage(rows, "closed_withdrawn");
        expect(matched.map((r) => r.status_key).sort()).toEqual(["not_enrolling", "withdrawn"]);
    });
});
