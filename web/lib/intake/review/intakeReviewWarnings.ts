import type { IntakePersonCandidate } from "@/lib/intake/types";

export type IntakeReviewWarningCode =
    | "extra_parents_commit_limited"
    | "extra_children_commit_limited"
    | "address_no_action_field"
    | "child_last_name_inferred"
    | "child_last_name_needs_review"
    | "parent_last_name_inferred"
    | "invalid_phone"
    | "invalid_email"
    | "location_ambiguous"
    | "location_unmatched";

export type IntakeReviewWarningSeverity = "info" | "warning";

export type IntakeReviewWarning = {
    code: IntakeReviewWarningCode;
    message: string;
    severity: IntakeReviewWarningSeverity;
};

function personName(person: IntakePersonCandidate): string {
    return [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
}

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
    has_invalid_email?: boolean;
    invalid_email_value?: string | null;
}): IntakeReviewWarning[] {
    const warnings: IntakeReviewWarning[] = [];
    const extraParents = Math.max(0, input.parents.length - 1);
    const extraChildren = Math.max(0, input.children.length - 1);
    const primaryParent = personName(input.parents[0] ?? ({} as IntakePersonCandidate));

    if (extraParents > 0) {
        const extraNames = input.parents.slice(1).map(personName).filter(Boolean);
        warnings.push({
            code: "extra_parents_commit_limited",
            severity: "info",
            message:
                extraNames.length ?
                    `Additional guardians detected (${extraNames.join(", ")}) — included in commit when selected and valid.`
                :   `${input.parents.length} parents/guardians detected — review commit selection before creating the lead.`,
        });
    }

    if (extraChildren > 0) {
        const extraNames = input.children.slice(1).map(personName).filter(Boolean);
        warnings.push({
            code: "extra_children_commit_limited",
            severity: "info",
            message:
                extraNames.length ?
                    `Additional children detected (${extraNames.join(", ")}) — included in commit when selected and valid.`
                :   `${input.children.length} children detected — review commit selection before creating the lead.`,
        });
    }

    if (input.has_address && !input.action_has_address_field) {
        warnings.push({
            code: "address_no_action_field",
            severity: "info",
            message:
                "Address was detected but Create Lead has no address field — copy it manually or add it after opening the lead.",
        });
    }

    if (input.has_invalid_phone) {
        warnings.push({
            code: "invalid_phone",
            severity: "warning",
            message: `Phone${input.invalid_phone_value ? ` (${input.invalid_phone_value})` : ""} is invalid — enter a 10-digit US number or remove it. A valid email can still satisfy contact requirements.`,
        });
    }

    if (input.has_invalid_email) {
        warnings.push({
            code: "invalid_email",
            severity: "warning",
            message: `Email${input.invalid_email_value ? ` (${input.invalid_email_value})` : ""} is invalid — correct the address or use a valid phone number instead.`,
        });
    }

    for (const parent of input.parents) {
        if (parent.last_name_inferred) {
            warnings.push({
                code: "parent_last_name_inferred",
                severity: "info",
                message: `Last name "${parent.last_name}" inferred for ${parent.first_name ?? "guardian"} from shared household surname — confirm before commit.`,
            });
        }
    }

    for (const child of input.children) {
        if (child.last_name_inferred) {
            warnings.push({
                code: "child_last_name_inferred",
                severity: "info",
                message: `Child last name "${child.last_name}" inferred for ${child.first_name ?? "child"} from household parents — confirm before commit.`,
            });
        } else if (child.first_name && !child.last_name?.trim() && !child.last_name_inferred) {
            warnings.push({
                code: "child_last_name_needs_review",
                severity: "warning",
                message: `Child "${child.first_name}" is missing a last name — add it before commit or confirm the household surname.`,
            });
        }
    }

    return warnings;
}

export function mergeIntakeReviewWarnings(
    ...groups: readonly (readonly IntakeReviewWarning[])[]
): IntakeReviewWarning[] {
    const seen = new Set<string>();
    const out: IntakeReviewWarning[] = [];
    for (const group of groups) {
        for (const warning of group) {
            const key = `${warning.code}:${warning.message}`;
            if (seen.has(key)) continue;
            seen.add(key);
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
