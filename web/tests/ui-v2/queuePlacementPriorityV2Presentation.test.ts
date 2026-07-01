import { describe, expect, it } from "vitest";
import {
    buildCandidateDetailLine,
    formatPlacementBucketLabel,
    parseQueueRowPlacementPriorityV2Vm,
} from "@/lib/ui-v2/queuePlacementPriorityV2Presentation";

describe("queuePlacementPriorityV2Presentation", () => {
    it("returns undefined when absent", () => {
        expect(parseQueueRowPlacementPriorityV2Vm(undefined)).toBeUndefined();
        expect(parseQueueRowPlacementPriorityV2Vm({ projection_mode: "other" })).toBeUndefined();
    });

    it("parses family rollup and candidate lines", () => {
        const vm = parseQueueRowPlacementPriorityV2Vm({
            projection_mode: "family_row",
            primary_group_fact_key: "program_room_cohort_key",
            evaluated: true,
            shadow_mode: true,
            candidates: [
                {
                    placement_candidate_id: "pc-1",
                    child_display_name: "Alex",
                    program_room_cohort_key: "preschool_3_4",
                    program_room_group_label: "Preschool (3–4 years)",
                    bucket: "tier_general_waitlist",
                    sort_tuple: ["preschool_3_4", 100, "2024-01-01T00:00:00.000Z"],
                    link_mode: "independent",
                    active_override_kinds: [],
                },
                {
                    placement_candidate_id: "pc-2",
                    child_display_name: "Sam",
                    program_room_cohort_key: "toddler",
                    program_room_group_label: "Toddler (2 years)",
                    bucket: "tier_staff_community",
                    sort_tuple: ["toddler", 10, "2024-02-12T00:00:00.000Z"],
                    link_mode: "preferred_together",
                    active_override_kinds: ["pin"],
                },
            ],
            family_rollup: {
                bucket: "tier_staff_community",
                sort_tuple: ["toddler", 10, "2024-02-12T00:00:00.000Z"],
                candidate_count: 2,
            },
        });
        expect(vm?.evaluated).toBe(true);
        expect(vm?.candidateCount).toBe(2);
        expect(vm?.childCountLabel).toBe("2 children waitlisted");
        expect(vm?.familyBucketLabel).toBe(formatPlacementBucketLabel("tier_employee_family"));
        expect(vm?.primaryCohortLabel).toBe("Toddler (2 years)");
        expect(vm?.candidates).toHaveLength(2);
        expect(vm?.candidates[1]?.linkModeLabel).toBe("Preferred together");
        expect(vm?.candidates[1]?.hasActiveOverride).toBe(true);
        expect(vm?.showPlacementV2Badge).toBe(true);
    });

    it("fallback_to_v1 suppresses V2 badge", () => {
        const vm = parseQueueRowPlacementPriorityV2Vm({
            projection_mode: "family_row",
            evaluated: true,
            shadow_mode: true,
            fallback_to_v1: true,
            candidates: [],
            family_rollup: { bucket: "tier_general_waitlist", sort_tuple: [], candidate_count: 0 },
        });
        expect(vm?.fallbackToV1).toBe(true);
        expect(vm?.showPlacementV2Badge).toBe(false);
    });

    it("marks synthetic fallback in detail line", () => {
        const line = buildCandidateDetailLine({
            childDisplayName: "Family",
            cohortLabel: "Unknown program",
            bucketLabel: "Standard family",
            waitSinceLabel: null,
            linkModeLabel: null,
            isSyntheticFallback: true,
            hasActiveOverride: false,
        });
        expect(line).toContain("No child on file");
    });

    it("prefers explicit wait_since on candidate payload over sort_tuple", () => {
        const vm = parseQueueRowPlacementPriorityV2Vm({
            projection_mode: "family_row",
            evaluated: true,
            shadow_mode: true,
            candidates: [
                {
                    placement_candidate_id: "pc-1",
                    child_display_name: "Alex",
                    wait_since: "2024-01-15T00:00:00.000Z",
                    program_room_cohort_key: "infant",
                    bucket: "tier_general_waitlist",
                    sort_tuple: ["infant", 100, null, 1_700_000_000_000],
                    link_mode: "independent",
                    active_override_kinds: [],
                },
            ],
            family_rollup: { bucket: "tier_general_waitlist", sort_tuple: [], candidate_count: 1 },
        });
        expect(vm?.candidates[0]?.detailLine).toMatch(/Waiting since/);
    });

    it("strict link flags on family rollup", () => {
        const vm = parseQueueRowPlacementPriorityV2Vm({
            projection_mode: "family_row",
            evaluated: true,
            shadow_mode: false,
            candidates: [
                {
                    placement_candidate_id: "a",
                    child_display_name: "A",
                    program_room_cohort_key: "infant",
                    bucket: "tier_general_waitlist",
                    sort_tuple: ["infant", 100, "2024-01-01"],
                    link_mode: "strictly_together",
                    active_override_kinds: [],
                },
            ],
            family_rollup: {
                bucket: "tier_general_waitlist",
                sort_tuple: ["infant", 100, "2024-09-01"],
                candidate_count: 2,
                blocked_by_strict_link: true,
            },
        });
        expect(vm?.blockedByStrictLink).toBe(true);
    });
});
