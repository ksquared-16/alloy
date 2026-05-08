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
        ).toMatch(/waitlist priority preview/i);
        expect(
            buildPlacementProjectionQueueHint({
                evaluated_count: 2,
                skipped_due_to_cap_count: 0,
                reorder_applied: true,
                shadow_mode: false,
                row_evaluation_errors: 0,
                profile_revision_mismatch: false,
            })
        ).toMatch(/this page/i);
    });

    it("hint strings never advertise rank position", () => {
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
        });
        for (const s of [shadow ?? "", sorted ?? ""]) {
            expect(s.toLowerCase()).not.toMatch(/\brank\b|\#\d|top of|guaranteed|ai recommended/i);
        }
    });
});
