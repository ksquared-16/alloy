import type { CreateLeadCommitRecord } from "@/lib/intake/commit/createLeadCommitSelection";
import type { IntakeHouseholdCandidate, IntakePersonCandidate } from "@/lib/intake/types";
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

function personFromHousehold(
    household: IntakeHouseholdCandidate,
    record: CreateLeadCommitRecord,
): IntakePersonCandidate | undefined {
    const pool = record.entity_type === "parent" ? household.parents : household.children;
    return pool.find((p) => p.candidate_id === record.candidate_id);
}

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

/** Operator-facing hints rendered on household commit cards. */
export function buildCreateLeadRecordCardHints(input: {
    record: CreateLeadCommitRecord;
    household: IntakeHouseholdCandidate;
}): string[] {
    const hints: string[] = [];
    const person = personFromHousehold(input.household, input.record);
    const { record } = input;

    if (record.include_in_commit) {
        hints.push("Included in commit");
    }

    if (record.entity_type === "parent" && !record.primary && input.household.parents.length > 1) {
        hints.push("Secondary guardian");
    }

    if (person?.last_name_inferred) {
        hints.push("Last name inferred — confirm");
    } else if (
        record.entity_type === "child" &&
        record.first_name &&
        !record.last_name?.trim() &&
        !person?.last_name_inferred
    ) {
        hints.push("Missing last name — confirm");
    }

    return hints;
}

const GLOBAL_VALIDATION_PATTERNS = [
    /^Include at least one parent/i,
    /^Select a primary parent/i,
    /^A valid email or phone is required/i,
    /^Location is required/i,
];

/** Lead-level validation issues suitable for the global blocker banner. */
export function filterGlobalCreateLeadValidationIssues(issues: readonly string[]): string[] {
    return issues.filter((issue) => GLOBAL_VALIDATION_PATTERNS.some((pattern) => pattern.test(issue)));
}
