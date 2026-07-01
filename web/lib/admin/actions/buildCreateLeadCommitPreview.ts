import type { CreateLeadCommitSelection } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import {
    includedCommitRecords,
    primaryIncludedChild,
    primaryIncludedParent,
} from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
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

function recordDisplayName(record: { first_name: string; last_name: string }): string {
    return [record.first_name, record.last_name].filter(Boolean).join(" ").trim();
}

function primaryParentName(
    guardians: IntakePersonCandidate[],
    values: Record<string, string>,
): string {
    const fromHousehold = personDisplayName(guardians[0]);
    if (fromHousehold) return fromHousehold;
    return [values.first_name, values.last_name].filter(Boolean).join(" ").trim();
}

function buildLegacyPreview(input: {
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
        not_created.push({
            label: "Additional parent / guardian",
            detail: personDisplayName(guardians[i]) || undefined,
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

function recordCommitPreviewLabel(
    record: { first_name: string; last_name: string; entity_type: string; primary?: boolean; resolution?: { action?: string; match_display_name?: string; state?: string } },
): { label: string; detail?: string } {
    const name = recordDisplayName(record);
    const role =
        record.entity_type === "parent" ?
            record.primary ? "Parent (primary)"
            :   "Parent"
        :   "Child";

    if (!record.resolution) {
        return {
            label: role,
            detail: name || undefined,
        };
    }

    if (record.resolution.action === "link_existing" && record.resolution.match_display_name) {
        return {
            label: `Link existing ${role.toLowerCase().replace("(primary)", "").trim()}`,
            detail: record.resolution.match_display_name,
        };
    }
    if (record.resolution.action === "review_required") {
        return {
            label: `${role} — review required`,
            detail: name || record.resolution.match_display_name || undefined,
        };
    }
    if (record.resolution.state === "conflict") {
        return {
            label: `${role} — conflict`,
            detail: name || undefined,
        };
    }
    return {
        label: `Create new ${role.toLowerCase().replace("(primary)", "").trim()}`,
        detail: name || undefined,
    };
}

function buildSelectionPreview(input: {
    selection: CreateLeadCommitSelection;
    household?: IntakeHouseholdCandidate | null;
}): CreateLeadCommitPreview {
    const { selection, household } = input;
    const will_create: CreateLeadCommitPreviewItem[] = [];
    const not_created: CreateLeadCommitPreviewItem[] = [];

    const { parents, children } = includedCommitRecords(selection);
    const primaryParent = primaryIncludedParent(selection);

    for (const parent of parents) {
        const preview = recordCommitPreviewLabel(parent);
        will_create.push({ label: preview.label, detail: preview.detail });
    }

    const householdResolution = selection.household_resolution;
    if (householdResolution?.action === "link_existing" && householdResolution.match_display_name) {
        will_create.push({
            label: "Link existing household",
            detail: householdResolution.match_display_name,
        });
    } else {
        will_create.push({
            label: "Household (customer)",
            detail: primaryParent ? `${recordDisplayName(primaryParent)} household` : undefined,
        });
    }

    if (selection.lead_resolution?.linked_opportunity_id) {
        not_created.push({
            label: "Existing open lead detected",
            detail: selection.lead_resolution.reasons[0] ?? undefined,
        });
    }
    will_create.push({ label: "Lead (opportunity)" });

    for (const child of children) {
        const preview = recordCommitPreviewLabel(child);
        will_create.push({ label: preview.label, detail: preview.detail });
    }

    for (const parent of selection.parents.filter((p) => !p.include_in_commit)) {
        const detail = [recordDisplayName(parent), ...parent.commit_blockers].filter(Boolean).join(" — ");
        not_created.push({
            label: "Parent excluded",
            detail: detail || undefined,
        });
    }

    for (const child of selection.children.filter((c) => !c.include_in_commit)) {
        const detail = [recordDisplayName(child), ...child.commit_blockers].filter(Boolean).join(" — ");
        not_created.push({
            label: "Child excluded",
            detail: detail || undefined,
        });
    }

    if (selection.household_contacts.invalid_phone) {
        not_created.push({
            label: "Invalid phone",
            detail: selection.household_contacts.phone ?? undefined,
        });
    }

    if (selection.address_review_only || household?.address?.lines?.length) {
        not_created.push({
            label: "Address (review only)",
            detail: household?.address?.lines.join(" · "),
        });
    }

    return { will_create, not_created };
}

/** Action-agnostic commit scope preview for Create Lead household intake. */
export function buildCreateLeadCommitPreview(input: {
    values: Record<string, string>;
    household?: IntakeHouseholdCandidate | null;
    selection?: CreateLeadCommitSelection | null;
}): CreateLeadCommitPreview {
    if (input.selection) {
        return buildSelectionPreview({ selection: input.selection, household: input.household });
    }
    return buildLegacyPreview(input);
}
