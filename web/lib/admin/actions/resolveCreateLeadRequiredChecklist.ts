import {
    isValidCreateLeadEmail,
    isValidCreateLeadPhone,
} from "@/lib/admin/actions/createLeadIntakeValidation";
import type { CreateLeadCommitSelection } from "@/lib/intake/commit/createLeadCommitSelection";
import { includedCommitRecords, primaryIncludedParent } from "@/lib/intake/commit/createLeadCommitSelection";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import type { IntakeHouseholdCandidate } from "@/lib/intake/types";
import type { IntakeReviewWarning } from "@/lib/intake/review/intakeReviewWarnings";

export type CreateLeadRequiredChecklistItem = {
    key: string;
    label: string;
    status: "ok" | "missing" | "ambiguous" | "na";
};

function trim(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function childRequiredBySpec(spec: ActionIntakeSpec | null | undefined): boolean {
    if (!spec) return false;
    return spec.required.some((field) => field.entity === "child" || field.payload_key.startsWith("child_"));
}

function resolveLocationStatus(input: {
    values: Record<string, string>;
    reviewWarnings?: readonly IntakeReviewWarning[];
}): CreateLeadRequiredChecklistItem["status"] {
    if (trim(input.values.location_id)) return "ok";
    const ambiguous = input.reviewWarnings?.some(
        (warning) => warning.code === "location_ambiguous" || warning.code === "location_unmatched",
    );
    return ambiguous ? "ambiguous" : "missing";
}

/** Compact required-to-create checklist for household commit review. */
export function resolveCreateLeadRequiredChecklist(input: {
    selection: CreateLeadCommitSelection;
    values: Record<string, string>;
    requireLocation?: boolean;
    intakeSpec?: ActionIntakeSpec | null;
    reviewWarnings?: readonly IntakeReviewWarning[];
    household?: IntakeHouseholdCandidate | null;
}): CreateLeadRequiredChecklistItem[] {
    const { parents, children } = includedCommitRecords(input.selection);
    const primary = primaryIncludedParent(input.selection);
    const householdEmail = trim(input.selection.household_contacts.email);
    const householdPhone = trim(input.selection.household_contacts.phone);
    const contactEmails = parents.map((p) => trim(p.email)).filter(Boolean);
    const contactPhones = parents.map((p) => trim(p.phone)).filter(Boolean);
    const hasValidContact =
        contactEmails.some((e) => isValidCreateLeadEmail(e)) ||
        contactPhones.some((p) => isValidCreateLeadPhone(p)) ||
        (householdEmail && isValidCreateLeadEmail(householdEmail)) ||
        (householdPhone && isValidCreateLeadPhone(householdPhone) && !input.selection.household_contacts.invalid_phone);

    const items: CreateLeadRequiredChecklistItem[] = [
        {
            key: "primary-guardian",
            label: "Primary guardian",
            status: primary && primary.commit_blockers.length === 0 ? "ok" : "missing",
        },
        {
            key: "valid-contact",
            label: "Valid contact",
            status: hasValidContact ? "ok" : "missing",
        },
    ];

    if (input.requireLocation !== false) {
        items.push({
            key: "location",
            label: "Location",
            status: resolveLocationStatus({
                values: input.values,
                reviewWarnings: input.reviewWarnings,
            }),
        });
    }

    const showChildRequirement =
        childRequiredBySpec(input.intakeSpec) || (input.household?.children.length ?? 0) > 0;
    if (showChildRequirement) {
        items.push({
            key: "included-children",
            label: "Included children",
            status: children.length > 0 ? "ok" : "missing",
        });
    }

    return items;
}
