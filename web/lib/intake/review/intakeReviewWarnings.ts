import type { IntakeHouseholdCandidate, IntakePersonCandidate } from "@/lib/intake/types";

export type IntakeReviewWarningCode =
    | "extra_parents_commit_limited"
    | "extra_children_commit_limited"
    | "address_no_action_field"
    | "child_last_name_inferred"
    | "child_last_name_needs_review"
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
