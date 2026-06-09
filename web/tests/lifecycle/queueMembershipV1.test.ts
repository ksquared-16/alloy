import { describe, expect, it } from "vitest";
import {
    defaultQueueMembershipForEnrollmentStage,
    parseQueueMembershipV1,
    resolveQueueMembershipForStage,
    type QueueMembershipV1,
} from "@/lib/lifecycle/queueMembershipV1";

const VALID_MEMBERSHIP: QueueMembershipV1 = {
    version: 1,
    lifecycle_key: "enrollment",
    stage_key: "tour",
    subject_type: "child",
    count_unit: "enrollment_tracks",
    included_disposition_keys: ["tour_requested", "tour_scheduled"],
    included_status_keys: ["tour_scheduled"],
    location_scope_source: "ocm_site",
    placement_scope: "active_only",
    queue_builder_key: "tours",
};

describe("parseQueueMembershipV1", () => {
    it("accepts valid config", () => {
        expect(parseQueueMembershipV1(VALID_MEMBERSHIP)).toEqual(VALID_MEMBERSHIP);
    });

    it("normalizes trimmed strings and drops empty disposition entries", () => {
        expect(
            parseQueueMembershipV1({
                version: 1,
                lifecycle_key: " enrollment ",
                stage_key: " enrollment ",
                subject_type: "child",
                count_unit: "enrollment_tracks",
                included_disposition_keys: [" offer_pending ", "", "registration_pending"],
            }),
        ).toEqual({
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "enrollment",
            subject_type: "child",
            count_unit: "enrollment_tracks",
            included_disposition_keys: ["offer_pending", "registration_pending"],
        });
    });

    it("returns null for invalid config", () => {
        expect(parseQueueMembershipV1(null)).toBeNull();
        expect(parseQueueMembershipV1([])).toBeNull();
        expect(parseQueueMembershipV1({ version: 2 })).toBeNull();
        expect(parseQueueMembershipV1({ ...VALID_MEMBERSHIP, version: 0 })).toBeNull();
        expect(parseQueueMembershipV1({ ...VALID_MEMBERSHIP, lifecycle_key: "" })).toBeNull();
        expect(parseQueueMembershipV1({ ...VALID_MEMBERSHIP, stage_key: "   " })).toBeNull();
        expect(parseQueueMembershipV1({ ...VALID_MEMBERSHIP, subject_type: "household" })).toBeNull();
        expect(parseQueueMembershipV1({ ...VALID_MEMBERSHIP, count_unit: "families" })).toBeNull();
        expect(parseQueueMembershipV1({ ...VALID_MEMBERSHIP, included_disposition_keys: "bad" })).toBeNull();
        expect(parseQueueMembershipV1({ ...VALID_MEMBERSHIP, included_status_keys: "bad" })).toBeNull();
        expect(parseQueueMembershipV1({ ...VALID_MEMBERSHIP, location_scope_source: "bad" })).toBeNull();
        expect(parseQueueMembershipV1({ ...VALID_MEMBERSHIP, placement_scope: "bad" })).toBeNull();
        expect(parseQueueMembershipV1({ ...VALID_MEMBERSHIP, queue_builder_key: 123 })).toBeNull();
    });

    it("ignores unknown fields for forward compatibility", () => {
        expect(
            parseQueueMembershipV1({
                ...VALID_MEMBERSHIP,
                future_lane_policy: { rollup: "sibling" },
            }),
        ).toEqual(VALID_MEMBERSHIP);
    });

    it("accepts null optional scope fields", () => {
        expect(
            parseQueueMembershipV1({
                ...VALID_MEMBERSHIP,
                location_scope_source: null,
                placement_scope: null,
                queue_builder_key: null,
            }),
        ).toEqual({
            ...VALID_MEMBERSHIP,
            location_scope_source: null,
            placement_scope: null,
            queue_builder_key: null,
        });
    });
});

describe("defaultQueueMembershipForEnrollmentStage", () => {
    it("returns expected defaults for each canonical enrollment stage", () => {
        expect(defaultQueueMembershipForEnrollmentStage("lead")).toEqual({
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "lead",
            subject_type: "case",
            count_unit: "cases",
            included_disposition_keys: [],
            included_status_keys: ["new_inquiry"],
        });

        expect(defaultQueueMembershipForEnrollmentStage("qualification")).toEqual({
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "qualification",
            subject_type: "case",
            count_unit: "cases",
            included_disposition_keys: ["needs_qualification", "qualified"],
        });

        expect(defaultQueueMembershipForEnrollmentStage("tour")).toEqual({
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "tour",
            subject_type: "child",
            count_unit: "enrollment_tracks",
            included_disposition_keys: [
                "tour_requested",
                "tour_scheduled",
                "tour_completed",
                "decision_pending",
            ],
        });

        expect(defaultQueueMembershipForEnrollmentStage("waitlist")).toEqual({
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "waitlist",
            subject_type: "candidate",
            count_unit: "candidates",
            included_disposition_keys: ["waitlisted", "waitlist_paused"],
        });

        expect(defaultQueueMembershipForEnrollmentStage("enrollment")).toEqual({
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "enrollment",
            subject_type: "child",
            count_unit: "enrollment_tracks",
            included_disposition_keys: [
                "offer_pending",
                "registration_pending",
                "paperwork_pending",
                "start_date_scheduled",
            ],
        });

        expect(defaultQueueMembershipForEnrollmentStage("enrolled")).toEqual({
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "enrolled",
            subject_type: "child",
            count_unit: "enrollment_tracks",
            included_disposition_keys: ["enrolled"],
        });
    });

    it("maps enrollment stage key to Enrolling dispositions without enrolling slug", () => {
        const membership = defaultQueueMembershipForEnrollmentStage("enrollment");
        expect(membership?.stage_key).toBe("enrollment");
        expect(membership?.included_disposition_keys).toEqual([
            "offer_pending",
            "registration_pending",
            "paperwork_pending",
            "start_date_scheduled",
        ]);
        expect(defaultQueueMembershipForEnrollmentStage("enrolling")).toBeNull();
    });

    it("returns null for unknown stage", () => {
        expect(defaultQueueMembershipForEnrollmentStage("onboarding")).toBeNull();
        expect(defaultQueueMembershipForEnrollmentStage("")).toBeNull();
    });
});

describe("resolveQueueMembershipForStage", () => {
    it("prefers explicit valid config over default", () => {
        const explicit = {
            version: 1 as const,
            lifecycle_key: "enrollment",
            stage_key: "tour",
            subject_type: "candidate" as const,
            count_unit: "candidates" as const,
            included_disposition_keys: ["custom_disposition"],
        };

        expect(
            resolveQueueMembershipForStage(
                { queue_membership_v1: explicit, key: "tour" },
                "tour",
            ),
        ).toEqual(explicit);

        expect(resolveQueueMembershipForStage({ queue_membership_v1: explicit }, "tour")).toEqual(
            explicit,
        );
    });

    it("falls back to default when explicit config is invalid", () => {
        expect(
            resolveQueueMembershipForStage(
                { queue_membership_v1: { version: 2 }, key: "waitlist" },
                "waitlist",
            ),
        ).toEqual(defaultQueueMembershipForEnrollmentStage("waitlist"));
    });

    it("falls back to default when queue_membership_v1 is absent", () => {
        expect(resolveQueueMembershipForStage({ key: "enrolled" }, "enrolled")).toEqual(
            defaultQueueMembershipForEnrollmentStage("enrolled"),
        );
    });

    it("returns null for unknown stage with no explicit config", () => {
        expect(resolveQueueMembershipForStage({ key: "custom_stage" }, "custom_stage")).toBeNull();
        expect(resolveQueueMembershipForStage(null, "custom_stage")).toBeNull();
    });
});
