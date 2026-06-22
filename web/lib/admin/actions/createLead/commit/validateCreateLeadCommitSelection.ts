import {
    isValidCreateLeadEmail,
    isValidCreateLeadPhone,
} from "@/lib/admin/actions/createLeadIntakeValidation";
import type { CreateLeadCommitSelection } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { includedCommitRecords, primaryIncludedParent } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { commitBlockedByResolution, linkedPersonIdFromCommitRecord } from "@/lib/intake/resolve/applyResolutionToCommitSelection";

function trim(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

export type CreateLeadCommitValidationResult =
    | { ok: true }
    | { ok: false; issues: string[] };

/** Lead-level validation for multi-member commit selection. */
export function validateCreateLeadCommitSelection(input: {
    selection: CreateLeadCommitSelection;
    values: Record<string, string>;
    requireLocation?: boolean;
}): CreateLeadCommitValidationResult {
    const issues: string[] = [];
    const { parents, children } = includedCommitRecords(input.selection);
    const primary = primaryIncludedParent(input.selection);

    if (parents.length === 0) {
        issues.push("Include at least one parent/guardian to create this lead.");
    }
    if (!primary) {
        issues.push("Select a primary parent/guardian for this lead.");
    } else if (primary.commit_blockers.length > 0) {
        issues.push(`Primary parent: ${primary.commit_blockers.join(" ")}`);
    }

    const contactEmails = parents.map((p) => trim(p.email)).filter(Boolean);
    const contactPhones = parents.map((p) => trim(p.phone)).filter(Boolean);
    const householdEmail = trim(input.selection.household_contacts.email);
    const householdPhone = trim(input.selection.household_contacts.phone);
    const hasValidContact =
        contactEmails.some((e) => isValidCreateLeadEmail(e)) ||
        contactPhones.some((p) => isValidCreateLeadPhone(p)) ||
        (householdEmail && isValidCreateLeadEmail(householdEmail)) ||
        (householdPhone && isValidCreateLeadPhone(householdPhone) && !input.selection.household_contacts.invalid_phone);

    if (!hasValidContact) {
        issues.push("A valid email or phone is required for this lead.");
    }

    if (input.requireLocation !== false && !trim(input.values.location_id)) {
        issues.push("Location is required.");
    }

    for (const child of children) {
        if (child.include_in_commit && child.commit_blockers.length > 0) {
            issues.push(`${child.first_name || "Child"}: ${child.commit_blockers.join(" ")}`);
        }
    }

    for (const issue of commitBlockedByResolution(input.selection)) {
        if (!issues.includes(issue)) issues.push(issue);
    }

    return issues.length ? { ok: false, issues } : { ok: true };
}
