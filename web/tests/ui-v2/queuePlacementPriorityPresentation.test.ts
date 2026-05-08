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

    it("parses bucket_label, reasons, warnings, shadow_mode", () => {
        const vm = parseQueueRowPlacementPriorityVm({
            bucket_key: "tier_staff_community",
            bucket_label: "Staff / community priority",
            reasons: [
                { code: "rule_matched", label: "Placement tier matched policy rules." },
                { code: "extra", label: "Second reason line." },
                { code: "ignored", label: "Third should not appear." },
            ],
            warnings: [{ code: "unknown_fact", message: "Sibling enrollment could not be verified." }],
            shadow_mode: true,
            evaluated_at_ms: 1,
        });
        expect(vm?.cohortLabel).toBe("Staff / community priority");
        expect(vm?.reasonLines).toEqual(["Placement tier matched policy rules.", "Second reason line."]);
        expect(vm?.warningLines).toEqual(["Sibling enrollment could not be verified."]);
        expect(vm?.shadowMode).toBe(true);
    });

    it("parses evaluate_error without implying cohort", () => {
        const vm = parseQueueRowPlacementPriorityVm({
            evaluate_error: true,
            code: "UNSUPPORTED_COHORT",
            message: "queue_key pipeline_total not supported by profile cohort_filter",
            shadow_mode: false,
        });
        expect(vm?.evaluateError).toBe(true);
        expect(vm?.cohortLabel).toBe("");
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
        ).toMatch(/preview/i);
        expect(
            buildPlacementProjectionQueueHint({
                evaluated_count: 2,
                skipped_due_to_cap_count: 0,
                reorder_applied: true,
                shadow_mode: false,
                row_evaluation_errors: 0,
                profile_revision_mismatch: false,
            })
        ).toMatch(/loaded on this page/i);
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
