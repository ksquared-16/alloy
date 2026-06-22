import type { CreateLeadCommitRecord } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import type { IntakeHouseholdCandidate, IntakePersonCandidate } from "@/lib/intake/types";

function personFromHousehold(
    household: IntakeHouseholdCandidate,
    record: CreateLeadCommitRecord,
): IntakePersonCandidate | undefined {
    const pool = record.entity_type === "parent" ? household.parents : household.children;
    return pool.find((p) => p.candidate_id === record.candidate_id);
}

/** Operator-facing hints rendered on Create Lead household commit cards. */
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

/** Lead-level validation issues suitable for the global blocker banner in Create Lead review. */
export function filterGlobalCreateLeadValidationIssues(issues: readonly string[]): string[] {
    return issues.filter((issue) => GLOBAL_VALIDATION_PATTERNS.some((pattern) => pattern.test(issue)));
}
