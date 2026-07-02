import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildChildTrackLaneFromMembership } from "@/lib/businessProcesses/resolveChildTrackLaneFromMembership";
import { resolveStatusProcessStageAssignment } from "@/lib/businessProcesses/resolveStatusProcessStageAssignment";
import { stageOperatingPlanDraftFromSaved } from "@/lib/lifecycle/stageOperatingPlanEditorModel";
import { legacyEnrollmentOperatingPlanDefault } from "@/lib/businessProcessTemplates/enrollmentLegacyCompat";
import {
    ENROLLMENT_CHILD_STAGE_SPECS,
    ENROLLMENT_FAMILY_STAGE_SPECS,
    ENROLLMENT_STAGE_SPECS,
} from "@/lib/businessProcessTemplates/enrollmentProcessTemplate";
import { filterQueueRelevantInquiryChildren } from "@/lib/workUnits/filterQueueRelevantInquiryChildren";
import { buildChildGrainQueueRowContext } from "@/lib/workUnits/buildChildGrainQueueRowContext";
import { enrollmentOffersChildQueueRowId } from "@/lib/queues/childGrainEnrollmentQueue";
import { STATUS_SETTINGS_SECTION_TITLES } from "@/lib/admin/statusSettingsClarity";
import type { QueueMembershipV1 } from "@/lib/lifecycle/queueMembershipV1";

const root = resolve(__dirname, "../..");

const smithChildren = [
    { ocm_id: "ocm-emma", display_name: "Emma", outcome_status_key: "waitlisted" },
    { ocm_id: "ocm-noah", display_name: "Noah", outcome_status_key: "enrolling" },
    { ocm_id: "ocm-ava", display_name: "Ava", outcome_status_key: "enrolling" },
];

describe("business process runtime cleanup", () => {
    it("generic queue row context does not hardcode enrollment queue keys", () => {
        const src = readFileSync(resolve(root, "lib/workUnits/buildChildGrainQueueRowContext.ts"), "utf8");
        expect(src).not.toMatch(/QUEUE_KEY_ENROLLMENT_STAGE/);
        expect(src).not.toMatch(/enrollment_offers/);
    });

    it("generic runtime does not import enrollment template modules from queueMembershipV1", () => {
        const src = readFileSync(resolve(root, "lib/lifecycle/queueMembershipV1.ts"), "utf8");
        expect(src).not.toMatch(/^import\s+.*businessProcessTemplates/m);
        expect(src).not.toMatch(/^import\s+.*enrollmentProcessTemplate/m);
    });

    it("OCM child-track lane resolves from builder membership metadata", () => {
        const membership: QueueMembershipV1 = {
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "enrolling",
            subject_type: "child",
            count_unit: "enrollment_tracks",
            included_disposition_keys: ["enrolling", "offer_pending"],
            included_status_keys: [],
        };
        const lane = buildChildTrackLaneFromMembership({
            executableQueueKey: "enrollment_offers",
            membership,
            stageLabel: "Enrolling",
        });
        expect(lane?.stageKey).toBe("enrolling");
        expect(lane?.dispositionKeys).toEqual(["enrolling", "offer_pending"]);
    });

    it("Waitlist row shows waitlisted child first; enrolling row shows enrolling siblings", () => {
        const waitlist = filterQueueRelevantInquiryChildren({
            row: { _inquiry_children: smithChildren },
            activeSubjectId: "ocm-emma",
            dispositionKeys: ["waitlisted"],
        });
        expect(waitlist.map((c) => c.display_name)).toEqual(["Emma"]);

        const enrolling = filterQueueRelevantInquiryChildren({
            row: { _inquiry_children: smithChildren },
            activeSubjectId: "ocm-noah",
            dispositionKeys: ["enrolling", "offer_pending"],
        });
        expect(enrolling.map((c) => c.display_name)).toEqual(["Noah", "Ava"]);
    });

    it("irrelevant siblings hidden from child-grain row context", () => {
        const queue = {
            key: "enrollment_offers",
            label: "Enrolling",
            lifecycle_key: "enrollment",
            stage_key: "enrolling",
            subject_grain: "child" as const,
            included_disposition_keys: ["enrolling"],
        };
        const ctx = buildChildGrainQueueRowContext({
            row: {
                id: enrollmentOffersChildQueueRowId("opp-smith", "ocm-noah"),
                opportunity_id: "opp-smith",
                opportunity_customer_member_id: "ocm-noah",
                row_grain: "child",
                name: "Smith Family",
                _child_display_name: "Noah",
                child_lifecycle_status: "enrolling",
                _ocm_enrollment_track_row: {
                    opportunity_customer_member_id: "ocm-noah",
                    outcome_status_key: "enrolling",
                    stage_key: "enrolling",
                    disposition_keys: ["enrolling"],
                },
                _queue_lane_disposition_keys: ["enrolling"],
                _inquiry_children: smithChildren,
            },
            queue,
        });
        expect(ctx?.drawer_open.entity_type).toBe("opportunities");
        expect(ctx?.drawer_open.entity_id).toBe("opp-smith");
        expect(ctx?.related_subjects_summary.map((s) => s.display_name)).toEqual(["Ava"]);
        expect(ctx?.related_subjects_summary.some((s) => s.display_name === "Emma")).toBe(false);
    });

    it("status stage assignment uses process_stage_key metadata first", () => {
        const resolved = resolveStatusProcessStageAssignment(
            "tour_scheduled",
            { process_stage_key: "tour" },
            ["lead", "tour", "decision"],
        );
        expect(resolved).toEqual({ stage: "tour", source: "metadata" });
    });

    it("operating plan editor hydrates empty when no saved plan (non-template)", () => {
        const draft = stageOperatingPlanDraftFromSaved(null, "billing_review");
        expect(draft.work_templates).toEqual([]);
        expect(draft.outcomes).toEqual([]);
    });

    it("operating plan editor can use explicit template default", () => {
        const template = legacyEnrollmentOperatingPlanDefault("lead");
        expect(template).not.toBeNull();
        const draft = stageOperatingPlanDraftFromSaved(null, "lead", { templateDefault: template });
        expect(draft.work_templates.length).toBeGreaterThan(0);
    });

    it("billing process fixture can hydrate operating plan editor without enrollment defaults", () => {
        const draft = stageOperatingPlanDraftFromSaved(
            {
                version: 1,
                lifecycle_key: "billing",
                stage_key: "past_due",
                journey_segment: "family",
                purpose: "Collect payment",
                work_templates: [],
                outcomes: [{ outcome_key: "paid", label: "Paid", successful: true }],
                outcome_rules: [],
                attention_rules: [],
            },
            "past_due",
        );
        expect(draft.purpose).toBe("Collect payment");
        expect(draft.outcomes[0]?.outcome_key).toBe("paid");
    });

    it("enrollment template uses rollup stages (8) — qualification folded into lead (Part 9)", () => {
        expect(ENROLLMENT_FAMILY_STAGE_SPECS).toHaveLength(4);
        expect(ENROLLMENT_CHILD_STAGE_SPECS).toHaveLength(4);
        expect(ENROLLMENT_STAGE_SPECS).toHaveLength(8);
        expect(ENROLLMENT_STAGE_SPECS.map((s) => s.key)).not.toContain("new_lead");
        expect(ENROLLMENT_STAGE_SPECS.map((s) => s.key)).not.toContain("contacting");
        expect(ENROLLMENT_STAGE_SPECS.map((s) => s.key)).not.toContain("qualification");
    });

    it("status settings expose Lead, Enrollment, and People — not Children", () => {
        expect(STATUS_SETTINGS_SECTION_TITLES.opportunities).toBe("Lead / Case Statuses");
        expect(STATUS_SETTINGS_SECTION_TITLES.opportunity_customer_members).toBe("Enrollment Statuses");
        expect(STATUS_SETTINGS_SECTION_TITLES.persons).toBe("People Statuses");
        expect(STATUS_SETTINGS_SECTION_TITLES).not.toHaveProperty("children");
        expect(STATUS_SETTINGS_SECTION_TITLES).not.toHaveProperty("customer_members");
    });
});
