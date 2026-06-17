import type { IntakeHouseholdCandidate, IntakePersonCandidate } from "@/lib/intake/types";

export type IntakeReviewWarningCode =
    | "extra_parents_commit_limited"
    | "extra_children_commit_limited"
    | "address_no_action_field"
    | "child_last_name_inferred"
    | "child_last_name_needs_review"
    | "parent_last_name_inferred"
    | "invalid_phone"
    | "location_ambiguous"
    | "location_unmatched";

export type IntakeReviewWarningSeverity = "info" | "warning";

export type IntakeReviewWarning = {
    code: IntakeReviewWarningCode;
    message: string;
    severity: IntakeReviewWarningSeverity;
};

export function formatIntakeReviewWarnings(warnings: readonly IntakeReviewWarning[]): string[] {
    return warnings.map((w) => w.message);
}

export function buildHouseholdReviewWarnings(input: {
    parents: IntakePersonCandidate[];
    children: IntakePersonCandidate[];
    has_address: boolean;
    action_has_address_field?: boolean;
    has_invalid_phone?: boolean;
    invalid_phone_value?: string | null;
}): IntakeReviewWarning[] {
    const warnings: IntakeReviewWarning[] = [];
    const extraParents = Math.max(0, input.parents.length - 1);
    const extraChildren = Math.max(0, input.children.length - 1);

    if (extraParents > 0) {
        warnings.push({
            code: "extra_parents_commit_limited",
            severity: "warning",
            message: `${input.parents.length} parents/guardians detected. Only the primary parent will be created by this action.`,
        });
    }

    if (extraChildren > 0) {
        warnings.push({
            code: "extra_children_commit_limited",
            severity: "warning",
            message: `${input.children.length} children detected. Only the first child will be created by this action.`,
        });
    }

    if (input.has_address && !input.action_has_address_field) {
        warnings.push({
            code: "address_no_action_field",
            severity: "info",
            message: "Address detected but no address field exists on this action.",
        });
    }

    if (input.has_invalid_phone) {
        warnings.push({
            code: "invalid_phone",
            severity: "warning",
            message: `Phone number${input.invalid_phone_value ? ` (${input.invalid_phone_value})` : ""} is invalid — US phone numbers must be 10 digits. Email can still be used as contact.`,
        });
    }

    for (const parent of input.parents) {
        if (parent.last_name_inferred) {
            warnings.push({
                code: "parent_last_name_inferred",
                severity: "info",
                message: `Parent/guardian last name "${parent.last_name}" inferred for ${parent.first_name ?? "guardian"}.`,
            });
        }
    }

    for (const child of input.children) {
        if (child.last_name_inferred) {
            warnings.push({
                code: "child_last_name_inferred",
                severity: "info",
                message: `Child last name "${child.last_name}" inferred from household for ${child.first_name ?? "child"}.`,
            });
        } else if (child.first_name && !child.last_name?.trim() && !child.last_name_inferred) {
            warnings.push({
                code: "child_last_name_needs_review",
                severity: "warning",
                message: `Child "${child.first_name}" is missing a last name — please review before commit.`,
            });
        }
    }

    return warnings;
}

export function mergeIntakeReviewWarnings(
    ...groups: readonly (readonly IntakeReviewWarning[])[]
): IntakeReviewWarning[] {
    const seen = new Set<IntakeReviewWarningCode>();
    const out: IntakeReviewWarning[] = [];
    for (const group of groups) {
        for (const warning of group) {
            if (seen.has(warning.code)) continue;
            seen.add(warning.code);
            out.push(warning);
        }
    }
    return out;
}

export function householdCommitLimited(warnings: readonly IntakeReviewWarning[]): boolean {
    return warnings.some(
        (w) => w.code === "extra_parents_commit_limited" || w.code === "extra_children_commit_limited",
    );
}
