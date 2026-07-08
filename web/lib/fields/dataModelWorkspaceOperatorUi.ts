/**
 * Data Model workspace operator copy — domain-specific labels atop Configuration Workspace grammar.
 */

import { ADMIN_FIELD_TYPES, type AdminFieldType } from "@/lib/fields/adminFieldTypeList";
import {
    CONFIG_WORKSPACE_GHOST_ACTION_CLASS,
    CONFIG_WORKSPACE_ROW_CLASS,
    CONFIG_WORKSPACE_ROW_EXPANDED_CLASS,
    CONFIG_WORKSPACE_ROW_INNER_CLASS,
    CONFIG_WORKSPACE_INLINE_EDITOR_SHELL_CLASS,
    configurationOwnershipChipClass,
    slugifyConfigurationKey,
} from "@/lib/adminV2/configuration/configurationWorkspaceOperatorUi";

export {
    CONFIG_WORKSPACE_GHOST_ACTION_CLASS,
    CONFIG_WORKSPACE_ROW_CLASS,
    CONFIG_WORKSPACE_ROW_EXPANDED_CLASS,
    CONFIG_WORKSPACE_ROW_INNER_CLASS,
    CONFIG_WORKSPACE_INLINE_EDITOR_SHELL_CLASS,
};

export const ownershipChipClass = configurationOwnershipChipClass;
export const slugifyOperatorKey = slugifyConfigurationKey;

export const FIELD_TYPE_OPERATOR_LABELS: Readonly<Record<AdminFieldType, string>> = {
    text: "Text",
    email: "Email",
    phone: "Phone",
    number: "Number",
    date: "Date",
    datetime: "Date and time",
    boolean: "Yes / No",
    select: "Single choice",
    multiselect: "Multiple choice",
};

export function fieldTypeOperatorLabel(fieldType: string): string {
    const key = fieldType.trim().toLowerCase() as AdminFieldType;
    if (key in FIELD_TYPE_OPERATOR_LABELS) return FIELD_TYPE_OPERATOR_LABELS[key];
    return fieldType.replace(/_/g, " ");
}

export const RELATIONSHIP_KIND_OPERATOR_OPTIONS = [
    {
        value: "family_role" as const,
        label: "Family role",
        hint: "How someone relates to a household — e.g. Guardian, Authorized pickup, Billing contact.",
    },
    {
        value: "person_relationship" as const,
        label: "Person connection",
        hint: "How one person relates to another — e.g. Grandparent, Neighbor, Co-parent.",
    },
];

export const PERSON_ROLE_EXAMPLES = [
    "Parent",
    "Guardian",
    "Emergency contact",
    "Pickup contact",
    "Billing contact",
] as const;

export const PERSON_ROLES_TEACHING =
    "Person roles describe how someone participates on a family — they are not separate entities.";
