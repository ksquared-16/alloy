import {
    isValidCreateLeadEmail,
    isValidCreateLeadPhone,
} from "@/lib/admin/actions/createLeadIntakeValidation";
import type { CreateLeadCommitSelection } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { includedCommitRecords, primaryIncludedParent } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { isCreateLeadLocationRequired } from "@/lib/admin/actions/createLead/resolveCreateLeadLocationPolicy";
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

function contactRequiredBySpec(spec: ActionIntakeSpec | null | undefined): boolean {
    if (!spec) return true;
    const emailRequired = spec.required.some((field) => field.payload_key === "email");
    const phoneRequired = spec.required.some((field) => field.payload_key === "phone");
    if (emailRequired || phoneRequired) return true;
    return spec.constraints.some(
        (constraint) =>
            constraint.kind === "at_least_one" &&
            constraint.rule_ids.some((ruleId) => ruleId === "person:email" || ruleId === "person:phone"),
    );
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
    intakeSpec?: ActionIntakeSpec | null;
    requiredPayloadKeys?: readonly string[];
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
    ];

    if (contactRequiredBySpec(input.intakeSpec)) {
        items.push({
            key: "valid-contact",
            label: "Valid contact",
            status: hasValidContact ? "ok" : "missing",
        });
    }

    if (
        isCreateLeadLocationRequired({
            intakeSpec: input.intakeSpec,
            requiredPayloadKeys: input.requiredPayloadKeys,
        })
    ) {
        items.push({
            key: "location",
            label: "Location",
            status: resolveLocationStatus({
                values: input.values,
                reviewWarnings: input.reviewWarnings,
            }),
        });
    }

    if (childRequiredBySpec(input.intakeSpec)) {
        items.push({
            key: "included-children",
            label: "Included children",
            status: children.length > 0 ? "ok" : "missing",
        });
    } else if ((input.household?.children.length ?? 0) > 0) {
        items.push({
            key: "included-children",
            label: "Included children",
            status: children.length > 0 ? "ok" : "na",
        });
    }

    return items;
}
