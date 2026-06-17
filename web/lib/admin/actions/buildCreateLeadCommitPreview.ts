import type { IntakeHouseholdCandidate, IntakePersonCandidate } from "@/lib/intake/types";

export type CreateLeadCommitPreviewItem = {
    label: string;
    detail?: string;
};

export type CreateLeadCommitPreview = {
    will_create: CreateLeadCommitPreviewItem[];
    not_created: CreateLeadCommitPreviewItem[];
};

function personDisplayName(person: IntakePersonCandidate | undefined): string {
    if (!person) return "";
    return [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
}

function primaryParentName(
    guardians: IntakePersonCandidate[],
    values: Record<string, string>,
): string {
    const fromHousehold = personDisplayName(guardians[0]);
    if (fromHousehold) return fromHousehold;
    return [values.first_name, values.last_name].filter(Boolean).join(" ").trim();
}

/** Action-agnostic commit scope preview for Create Lead household intake. */
export function buildCreateLeadCommitPreview(input: {
    values: Record<string, string>;
    household?: IntakeHouseholdCandidate | null;
}): CreateLeadCommitPreview {
    const { values, household } = input;
    const guardians =
        household?.parents_guardians?.length ? household.parents_guardians : (household?.parents ?? []);
    const children = household?.children ?? [];

    const will_create: CreateLeadCommitPreviewItem[] = [];
    const not_created: CreateLeadCommitPreviewItem[] = [];

    const primaryName = primaryParentName(guardians, values);
    if (primaryName) {
        will_create.push({ label: "Primary parent / guardian", detail: primaryName });
    } else {
        will_create.push({ label: "Primary parent / guardian" });
    }

    will_create.push({
        label: "Household (customer)",
        detail: primaryName ? `${primaryName} household` : undefined,
    });
    will_create.push({ label: "Lead (opportunity)" });

    const childFirst = (values.child_first_name ?? "").trim();
    const childLast = (values.child_last_name ?? "").trim();
    if (childFirst && childLast) {
        will_create.push({
            label: "First child",
            detail: `${childFirst} ${childLast}`.trim(),
        });
    } else if (children.length > 0) {
        not_created.push({
            label: "First child",
            detail: `${personDisplayName(children[0]) || "Child detected"} — missing last name on commit payload`,
        });
    }

    for (let i = 1; i < guardians.length; i++) {
        const name = personDisplayName(guardians[i]);
        not_created.push({
            label: "Additional parent / guardian",
            detail: name || undefined,
        });
    }

    for (let i = 1; i < children.length; i++) {
        not_created.push({
            label: "Additional child",
            detail: personDisplayName(children[i]) || undefined,
        });
    }

    if (household?.address?.lines?.length) {
        not_created.push({
            label: "Address",
            detail: household.address.lines.join(" · "),
        });
    }

    const householdContacts = household?.household_contacts ?? [];
    const invalidPhone = householdContacts.find((c) => c.kind === "phone" && c.validation_state === "invalid");
    if (invalidPhone) {
        not_created.push({
            label: "Invalid phone (not saved as contact)",
            detail: invalidPhone.raw_value,
        });
    }

    return { will_create, not_created };
}
