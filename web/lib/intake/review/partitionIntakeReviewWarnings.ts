import type { IntakeReviewWarning, IntakeReviewWarningCode } from "@/lib/intake/review/intakeReviewWarnings";

const GLOBAL_WARNING_CODES = new Set<IntakeReviewWarningCode>([
    "location_ambiguous",
    "location_unmatched",
]);

const RECORD_WARNING_CODES = new Set<IntakeReviewWarningCode>([
    "extra_parents_commit_limited",
    "extra_children_commit_limited",
    "parent_last_name_inferred",
    "child_last_name_inferred",
    "child_last_name_needs_review",
    "address_no_action_field",
]);

/** Split household review warnings into global banner vs record/section scoped. */
export function partitionIntakeReviewWarnings(warnings: readonly IntakeReviewWarning[]): {
    globalWarnings: IntakeReviewWarning[];
    addressWarnings: IntakeReviewWarning[];
} {
    const globalWarnings: IntakeReviewWarning[] = [];
    const addressWarnings: IntakeReviewWarning[] = [];
    for (const warning of warnings) {
        if (GLOBAL_WARNING_CODES.has(warning.code)) {
            globalWarnings.push(warning);
        } else if (warning.code === "address_no_action_field") {
            addressWarnings.push(warning);
        } else if (RECORD_WARNING_CODES.has(warning.code)) {
            continue;
        } else {
            globalWarnings.push(warning);
        }
    }
    return { globalWarnings, addressWarnings };
}
