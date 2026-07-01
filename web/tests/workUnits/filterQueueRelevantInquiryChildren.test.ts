import { describe, expect, it } from "vitest";
import {
    buildQueueRelevantCrmCompactChildren,
    filterQueueRelevantInquiryChildren,
} from "@/lib/workUnits/filterQueueRelevantInquiryChildren";
import { buildChildGrainQueueRowContext } from "@/lib/workUnits/buildChildGrainQueueRowContext";
import { enrollmentOffersChildQueueRowId } from "@/lib/queues/childGrainEnrollmentQueue";

const smithInquiryChildren = [
    {
        ocm_id: "ocm-emma",
        display_name: "Emma",
        outcome_status_key: "waitlisted",
    },
    {
        ocm_id: "ocm-noah",
        display_name: "Noah",
        outcome_status_key: "enrolling",
    },
    {
        ocm_id: "ocm-ava",
        display_name: "Ava",
        outcome_status_key: "enrolling",
    },
];

describe("filterQueueRelevantInquiryChildren", () => {
    it("Waitlist row shows only Emma", () => {
        const relevant = filterQueueRelevantInquiryChildren({
            row: { _inquiry_children: smithInquiryChildren },
            activeSubjectId: "ocm-emma",
            dispositionKeys: ["waitlisted", "waitlist_paused"],
        });
        expect(relevant.map((c) => c.display_name)).toEqual(["Emma"]);
    });

    it("Enrolling row shows Noah first then Ava", () => {
        const relevant = filterQueueRelevantInquiryChildren({
            row: { _inquiry_children: smithInquiryChildren },
            activeSubjectId: "ocm-noah",
            dispositionKeys: ["enrolling", "offer_pending", "registration_pending"],
        });
        expect(relevant.map((c) => c.display_name)).toEqual(["Noah", "Ava"]);
    });

    it("Enrolling row excludes waitlisted Emma", () => {
        const relevant = filterQueueRelevantInquiryChildren({
            row: { _inquiry_children: smithInquiryChildren },
            activeSubjectId: "ocm-ava",
            dispositionKeys: ["enrolling", "offer_pending"],
        });
        expect(relevant.map((c) => c.display_name)).toEqual(["Ava", "Noah"]);
        expect(relevant.some((c) => c.display_name === "Emma")).toBe(false);
    });
});

describe("buildQueueRelevantCrmCompactChildren", () => {
    it("builds enrolling lane child lines with active child first", () => {
        const lines = buildQueueRelevantCrmCompactChildren({
            row: { _inquiry_children: smithInquiryChildren },
            activeSubjectId: "ocm-noah",
            activeDisplayName: "Noah",
            dispositionKeys: ["enrolling", "offer_pending"],
        });
        expect(lines.map((l) => l.primary)).toEqual(["Noah", "Ava"]);
    });
});

describe("buildChildGrainQueueRowContext sibling filtering", () => {
    const queue = {
        key: "enrollment_offers",
        label: "Enrolling",
        lifecycle_key: "enrollment",
        stage_key: "enrolling",
        subject_grain: "child" as const,
        included_disposition_keys: ["enrolling", "offer_pending"],
    };

    it("related_subjects_summary excludes waitlisted sibling", () => {
        const row = {
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
                disposition_keys: ["enrolling", "offer_pending"],
            },
            _queue_lane_disposition_keys: ["enrolling", "offer_pending"],
            _inquiry_children: smithInquiryChildren,
        };

        const ctx = buildChildGrainQueueRowContext({ row, queue });
        expect(ctx?.related_subjects_summary.map((s) => s.display_name)).toEqual(["Ava"]);
    });
});
