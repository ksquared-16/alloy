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

    it("filters enrollment disposition rows by stage metadata and template keys", () => {
        const rows = [
            row("waitlisted", "Waitlisted", {
                alloy_layer: "enrollment_disposition",
                stage_key: "waitlist",
            }),
            row("offer_pending", "Offer pending", {
                alloy_layer: "enrollment_disposition",
                stage_key: "enrolling",
            }),
            row("new_inquiry", "New inquiry", {
                alloy_layer: "enrollment_disposition",
                stage_key: "lead",
            }),
        ];

        const waitlist = filterEnrollmentTrackStatusRowsForStage(rows, "waitlist");
        expect(waitlist.map((r) => r.status_key)).toEqual(["waitlisted", "offer_pending"]);

        const enrolling = filterEnrollmentTrackStatusRowsForStage(rows, "enrolling");
        expect(enrolling.map((r) => r.status_key)).toContain("offer_pending");
        expect(enrolling.map((r) => r.status_key)).not.toContain("new_inquiry");
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

    it("matches closed_withdrawn via template disposition keys", () => {
        const rows = [
            row("family_withdrew", "Family withdrew", {
                alloy_layer: "enrollment_disposition",
                stage_key: "tour",
            }),
            row("withdrawn", "Withdrawn", {
                alloy_layer: "enrollment_disposition",
                stage_key: "tour",
                deprecated: true,
            }),
        ];

        const matched = filterEnrollmentTrackStatusRowsForStage(rows, "closed_withdrawn");
        expect(matched.map((r) => r.status_key).sort()).toEqual(["family_withdrew", "withdrawn"]);
    });
});
