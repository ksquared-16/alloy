import { describe, expect, it } from "vitest";
import {
    buildPlacementProjectionQueueHint,
    parseQueueRowPlacementPriorityVm,
} from "@/lib/ui-v2/queuePlacementPriorityPresentation";

describe("queuePlacementPriorityPresentation", () => {
    it("parseQueueRowPlacementPriorityVm returns undefined when absent", () => {
        expect(parseQueueRowPlacementPriorityVm(undefined)).toBeUndefined();
        expect(parseQueueRowPlacementPriorityVm(null)).toBeUndefined();
        expect(parseQueueRowPlacementPriorityVm({})).toBeUndefined();
    });

    it("parses bucket_label, program room group, reasons, warnings, shadow_mode", () => {
        const vm = parseQueueRowPlacementPriorityVm({
            bucket_key: "tier_staff_community",
            bucket_label: "Staff / community priority",
            program_room_group_label: "Infant",
            reasons: [
                { code: "rule_matched", label: "Priority rule matched for this program / room group." },
                { code: "extra", label: "Second reason line." },
                { code: "ignored", label: "Third should not appear." },
            ],
            warnings: [{ code: "unknown_fact", message: "Sibling enrollment could not be verified." }],
            shadow_mode: true,
            evaluated_at_ms: 1,
        });
        expect(vm?.priorityRuleLabel).toBe("Staff / community priority");
        expect(vm?.programGroupSectionTitle).toBe("Infant");
        expect(vm?.reasonLines).toEqual([
            "Priority rule matched for this program / room group.",
            "Second reason line.",
        ]);
        expect(vm?.warningLines).toEqual(["Sibling enrollment could not be verified."]);
        expect(vm?.shadowMode).toBe(true);
        expect(vm?.scopedWaitlistPosition).toBeUndefined();
    });

    it("non-shadow parses scoped waitlist position fields", () => {
        const vm = parseQueueRowPlacementPriorityVm({
            bucket_label: "Standard family",
            program_room_group_label: "Toddler",
            scoped_waitlist_position: 3,
            scoped_waitlist_position_label: "Position in Toddler waitlist",
            reasons: [],
            warnings: [],
            shadow_mode: false,
            evaluated_at_ms: 1,
        });
        expect(vm?.scopedWaitlistPosition).toBe(3);
        expect(vm?.scopedWaitlistPositionLabel).toBe("Position in Toddler waitlist");
    });

    it("shadow mode ignores scoped position fields on payload", () => {
        const vm = parseQueueRowPlacementPriorityVm({
            bucket_label: "Standard family",
            scoped_waitlist_position: 1,
            scoped_waitlist_position_label: "Position in Toddler waitlist",
            reasons: [],
            warnings: [],
            shadow_mode: true,
            evaluated_at_ms: 1,
        });
        expect(vm?.scopedWaitlistPosition).toBeUndefined();
    });

    it("missing program_room_group_label maps to unspecified section title", () => {
        const vm = parseQueueRowPlacementPriorityVm({
            bucket_label: "Standard family",
            reasons: [],
            warnings: [],
            shadow_mode: true,
            evaluated_at_ms: 1,
        });
        expect(vm?.programGroupSectionTitle).toBe("Program / room not specified");
    });

    it("parses evaluate_error without implying priority rule chip text", () => {
        const vm = parseQueueRowPlacementPriorityVm({
            evaluate_error: true,
            code: "UNSUPPORTED_COHORT",
            message: "queue_key pipeline_total not supported by profile cohort_filter",
            shadow_mode: false,
        });
        expect(vm?.evaluateError).toBe(true);
        expect(vm?.priorityRuleLabel).toBe("");
        expect(vm?.errorMessage).toContain("pipeline_total");
    });

    it("buildPlacementProjectionQueueHint: shadow vs active sort copy avoids global waitlist claims", () => {
        expect(
            buildPlacementProjectionQueueHint({
                evaluated_count: 2,
                skipped_due_to_cap_count: 0,
                reorder_applied: false,
                shadow_mode: true,
                row_evaluation_errors: 0,
                profile_revision_mismatch: false,
            })
        ).toMatch(/position numbers are hidden/i);
        expect(
            buildPlacementProjectionQueueHint({
                evaluated_count: 2,
                skipped_due_to_cap_count: 0,
                reorder_applied: true,
                shadow_mode: false,
                row_evaluation_errors: 0,
                profile_revision_mismatch: false,
                placement_positions_partial_evaluation: false,
            })
        ).toMatch(/position numbers/i);
        expect(
            buildPlacementProjectionQueueHint({
                evaluated_count: 2,
                skipped_due_to_cap_count: 0,
                reorder_applied: true,
                shadow_mode: false,
                row_evaluation_errors: 0,
                profile_revision_mismatch: false,
                placement_positions_partial_evaluation: false,
            })
        ).toMatch(/pagination/i);
    });

    it("hint discloses evaluation_cap when placement_positions_partial_evaluation", () => {
        const hint = buildPlacementProjectionQueueHint({
            evaluated_count: 1,
            skipped_due_to_cap_count: 3,
            reorder_applied: true,
            shadow_mode: false,
            row_evaluation_errors: 0,
            profile_revision_mismatch: false,
            placement_positions_page_local: true,
            placement_positions_partial_evaluation: true,
        });
        expect(hint?.toLowerCase()).toMatch(/evaluation_cap/);
    });

    it("hint strings do not imply guaranteed global waitlist placement", () => {
        const shadow = buildPlacementProjectionQueueHint({
            evaluated_count: 1,
            skipped_due_to_cap_count: 0,
            reorder_applied: false,
            shadow_mode: true,
            row_evaluation_errors: 0,
            profile_revision_mismatch: false,
        });
        const sorted = buildPlacementProjectionQueueHint({
            evaluated_count: 1,
            skipped_due_to_cap_count: 0,
            reorder_applied: true,
            shadow_mode: false,
            row_evaluation_errors: 0,
            profile_revision_mismatch: false,
            placement_positions_partial_evaluation: false,
        });
        for (const s of [shadow ?? "", sorted ?? ""]) {
            expect(s.toLowerCase()).not.toMatch(/\bguaranteed\b|\bai recommended\b/i);
        }
    });
});
