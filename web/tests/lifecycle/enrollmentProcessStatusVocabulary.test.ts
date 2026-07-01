import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import {
    ENROLLMENT_CHILD_TRACK_STATUS_VOCABULARY,
    ENROLLMENT_FAMILY_TRACK_STATUS_VOCABULARY,
    enrollmentStatusVocabularyForStage,
    isGenericEnrollmentCaseContainerStatus,
} from "@/lib/lifecycle/enrollmentProcessStatusVocabulary";
import {
    filterEnrollmentTrackStatusRowsForStage,
    filterFamilyTrackStatusRowsForStage,
} from "@/lib/lifecycle/loadQueueMembershipStatusOptions";

function oppRow(
    status_key: string,
    status_label: string,
    metadata: Record<string, unknown> | null = null
): StatusDefinitionRow {
    return {
        id: status_key,
        org_id: "org",
        entity_type: "opportunities",
        status_key,
        status_label,
        sort_order: 10,
        is_active: true,
        is_system: false,
        industry_key: null,
        metadata,
    };
}

function ocmRow(
    status_key: string,
    status_label: string,
    metadata: Record<string, unknown> | null = null
): StatusDefinitionRow {
    return { ...oppRow(status_key, status_label, metadata), entity_type: "opportunity_customer_members" };
}

const GENERIC_CASE_ROWS = [
    oppRow("open", "Open", { alloy_layer: "case_status" }),
    oppRow("closed", "Closed", { alloy_layer: "case_status" }),
    oppRow("inactive", "Inactive", { alloy_layer: "case_status" }),
    oppRow("archived", "Archived", { alloy_layer: "case_status" }),
];

const FAMILY_PIPELINE_ROWS = [
    oppRow("new_inquiry", "New Lead", { alloy_layer: "lead_pipeline", process_stage_key: "lead" }),
    oppRow("needs_qualification", "Contacting", { alloy_layer: "lead_pipeline", process_stage_key: "lead" }),
    oppRow("qualified", "Qualified", { alloy_layer: "lead_pipeline", process_stage_key: "qualification" }),
    oppRow("tour_requested", "Tour Requested", { alloy_layer: "lead_pipeline", process_stage_key: "tour" }),
    oppRow("tour_scheduled", "Tour Scheduled", { alloy_layer: "lead_pipeline", process_stage_key: "tour" }),
    oppRow("tour_completed", "Tour Completed", { alloy_layer: "lead_pipeline", process_stage_key: "tour" }),
    oppRow("decision_pending", "Decision Pending", { alloy_layer: "lead_pipeline", process_stage_key: "decision" }),
    oppRow("lost", "Lost", { alloy_layer: "lead_pipeline", process_stage_key: "closed" }),
    oppRow("withdrawn", "Withdrawn", { alloy_layer: "lead_pipeline", process_stage_key: "closed" }),
    oppRow("not_a_fit", "Not a Fit", { alloy_layer: "lead_pipeline", process_stage_key: "closed" }),
    oppRow("aged_out", "No Longer Eligible", { alloy_layer: "lead_pipeline", process_stage_key: "closed" }),
    oppRow("not_enrolling", "Closed", { alloy_layer: "lead_pipeline", process_stage_key: "closed" }),
];

const CHILD_PIPELINE_ROWS = [
    ocmRow("waitlisted", "Waitlisted", { alloy_layer: "enrollment_disposition", stage_key: "waitlist" }),
    ocmRow("offer_pending", "Offer Pending", { alloy_layer: "enrollment_disposition", stage_key: "waitlist" }),
    ocmRow("waitlist_paused", "Waitlist Paused", { alloy_layer: "enrollment_disposition", stage_key: "waitlist" }),
    ocmRow("enrolling", "Enrolling", { alloy_layer: "enrollment_disposition", stage_key: "enrolling" }),
    ocmRow("registration_pending", "Registration Pending", { alloy_layer: "enrollment_disposition", stage_key: "enrolling" }),
    ocmRow("paperwork_pending", "Documents Pending", { alloy_layer: "enrollment_disposition", stage_key: "enrolling" }),
    ocmRow("start_date_scheduled", "Future Start", { alloy_layer: "enrollment_disposition", stage_key: "enrolling" }),
    ocmRow("enrolled", "Enrolled", { alloy_layer: "enrollment_disposition", stage_key: "enrolled" }),
    ocmRow("withdrawn", "Withdrawn", { alloy_layer: "enrollment_disposition", stage_key: "closed_withdrawn" }),
    ocmRow("family_withdrew", "Family Withdrew", { alloy_layer: "enrollment_disposition", stage_key: "closed_withdrawn" }),
    ocmRow("not_moving_forward", "Not Moving Forward", { alloy_layer: "enrollment_disposition", stage_key: "closed_withdrawn" }),
    ocmRow("aged_out", "No Longer Eligible", { alloy_layer: "enrollment_disposition", stage_key: "closed_withdrawn" }),
    ocmRow("not_enrolling", "Closed", { alloy_layer: "enrollment_disposition", stage_key: "closed_withdrawn" }),
];

describe("enrollment process status vocabulary", () => {
    it("defines family and child canonical vocabulary rows", () => {
        expect(ENROLLMENT_FAMILY_TRACK_STATUS_VOCABULARY.length).toBeGreaterThan(0);
        expect(ENROLLMENT_CHILD_TRACK_STATUS_VOCABULARY.length).toBeGreaterThan(0);
        expect(enrollmentStatusVocabularyForStage("lead", "opportunities").map((r) => r.status_label)).toEqual([
            "New Lead",
            "Contacting",
        ]);
    });

    it("identifies generic opportunity container statuses", () => {
        expect(isGenericEnrollmentCaseContainerStatus("open", { alloy_layer: "case_status" })).toBe(true);
        expect(isGenericEnrollmentCaseContainerStatus("new_inquiry", { alloy_layer: "lead_pipeline" })).toBe(false);
    });

    it("lead stage shows New Lead and Contacting, not generic Open", () => {
        const rows = [...GENERIC_CASE_ROWS, ...FAMILY_PIPELINE_ROWS];
        const keys = filterFamilyTrackStatusRowsForStage(rows, "lead").map((r) => r.status_key);
        expect(keys).toContain("new_inquiry");
        expect(keys).toContain("needs_qualification");
        expect(keys).not.toContain("open");
        expect(keys).not.toContain("closed");
    });

    it("qualification stage shows Qualified only", () => {
        const keys = filterFamilyTrackStatusRowsForStage(FAMILY_PIPELINE_ROWS, "qualification").map((r) => r.status_key);
        expect(keys).toEqual(["qualified"]);
    });

    it("tour stage shows tour pipeline statuses", () => {
        const keys = filterFamilyTrackStatusRowsForStage(FAMILY_PIPELINE_ROWS, "tour").map((r) => r.status_key);
        expect(keys).toEqual(["tour_requested", "tour_scheduled", "tour_completed"]);
    });

    it("decision stage shows Decision Pending", () => {
        const keys = filterFamilyTrackStatusRowsForStage(FAMILY_PIPELINE_ROWS, "decision").map((r) => r.status_key);
        expect(keys).toEqual(["decision_pending"]);
    });

    it("family closed stage shows lead closed vocabulary", () => {
        const keys = filterFamilyTrackStatusRowsForStage(FAMILY_PIPELINE_ROWS, "closed").map((r) => r.status_key);
        expect(keys).toEqual(["lost", "withdrawn", "not_a_fit", "aged_out", "not_enrolling"]);
    });

    it("waitlist stage shows waitlist child statuses", () => {
        const keys = filterEnrollmentTrackStatusRowsForStage(CHILD_PIPELINE_ROWS, "waitlist").map((r) => r.status_key);
        expect(keys).toEqual(["waitlisted", "offer_pending", "waitlist_paused"]);
    });

    it("enrolling stage shows enrolling child statuses", () => {
        const keys = filterEnrollmentTrackStatusRowsForStage(CHILD_PIPELINE_ROWS, "enrolling").map((r) => r.status_key);
        expect(keys).toEqual([
            "enrolling",
            "registration_pending",
            "paperwork_pending",
            "start_date_scheduled",
        ]);
    });

    it("enrolled stage shows Enrolled", () => {
        const keys = filterEnrollmentTrackStatusRowsForStage(CHILD_PIPELINE_ROWS, "enrolled").map((r) => r.status_key);
        expect(keys).toEqual(["enrolled"]);
    });

    it("child closed_withdrawn stage shows child closed vocabulary", () => {
        const keys = filterEnrollmentTrackStatusRowsForStage(CHILD_PIPELINE_ROWS, "closed_withdrawn")
            .map((r) => r.status_key)
            .sort();
        expect(keys).toEqual([
            "aged_out",
            "family_withdrew",
            "not_enrolling",
            "not_moving_forward",
            "withdrawn",
        ]);
    });

    it("does not fall back to generic Open when enrollment statuses exist", () => {
        const keys = filterFamilyTrackStatusRowsForStage(
            [...GENERIC_CASE_ROWS, ...FAMILY_PIPELINE_ROWS],
            "lead"
        ).map((r) => r.status_key);
        expect(keys.some((k) => GENERIC_CASE_ROWS.map((r) => r.status_key).includes(k))).toBe(false);
    });

    it("returns empty when no stage-specific statuses exist", () => {
        expect(filterFamilyTrackStatusRowsForStage(GENERIC_CASE_ROWS, "lead")).toEqual([]);
        expect(filterEnrollmentTrackStatusRowsForStage([], "waitlist")).toEqual([]);
    });

    it("repair migration is upsert-only with vocabulary metadata", () => {
        const sql = readFileSync(
            resolve(__dirname, "../../../supabase/migrations/20260612120000_enrollment_process_status_vocabulary_repair.sql"),
            "utf8"
        );
        expect(sql).toContain("'lead_pipeline'");
        expect(sql).toContain("'New Lead'");
        expect(sql).toContain("'Documents Pending'");
        expect(sql).toContain("excluded_from_enrollment_stage_picker");
        expect(sql.toLowerCase()).not.toContain("delete from");
    });
});
