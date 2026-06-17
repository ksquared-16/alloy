/**
 * Layout editor — relationship-aware contact block roles.
 * Fields inherit refKeys from the selected role; operators never pick raw name fields.
 */

export const LAYOUT_EDITOR_CONTACT_ROLES = [
    "primary",
    "secondary",
    "emergency",
    "billing",
    "any",
] as const;

export type LayoutEditorContactRole = (typeof LAYOUT_EDITOR_CONTACT_ROLES)[number];

export const LAYOUT_EDITOR_CONTACT_ROLE_METADATA_KEY = "layoutEditorContactRole" as const;

export type LayoutEditorContactRoleFieldRefs = {
    name: string;
    email: string;
    phone: string;
};

export const LAYOUT_EDITOR_CONTACT_ROLE_LABELS: Record<LayoutEditorContactRole, string> = {
    primary: "Primary",
    secondary: "Secondary",
    emergency: "Emergency",
    billing: "Billing/Payer",
    any: "Any",
};

export const LAYOUT_EDITOR_CONTACT_ROLE_BLOCK_TITLES: Record<LayoutEditorContactRole, string> = {
    primary: "Primary Contact Card",
    secondary: "Secondary Contact Card",
    emergency: "Emergency Contact Card",
    billing: "Billing/Payer Contact Card",
    any: "Contact Card",
};

const CONTACT_ROLE_FIELD_REFS: Record<LayoutEditorContactRole, LayoutEditorContactRoleFieldRefs> = {
    primary: {
        name: "person.primary_contact_name",
        email: "person.primary_email",
        phone: "person.primary_phone",
    },
    secondary: {
        name: "person.secondary_contact_name",
        email: "person.secondary_email",
        phone: "person.secondary_phone",
    },
    emergency: {
        name: "person.emergency_contact_name",
        email: "person.emergency_contact_email",
        phone: "person.emergency_contact_phone",
    },
    billing: {
        name: "person.billing_contact_name",
        email: "person.billing_contact_email",
        phone: "person.billing_contact_phone",
    },
    any: {
        name: "person.contact_name",
        email: "person.contact_email",
        phone: "person.contact_phone",
    },
};

export function isLayoutEditorContactRole(v: unknown): v is LayoutEditorContactRole {
    return typeof v === "string" && (LAYOUT_EDITOR_CONTACT_ROLES as readonly string[]).includes(v);
}

export function readLayoutEditorContactRole(metadata: Record<string, unknown> | undefined): LayoutEditorContactRole {
    const raw = metadata?.[LAYOUT_EDITOR_CONTACT_ROLE_METADATA_KEY];
    return isLayoutEditorContactRole(raw) ? raw : "primary";
}

export function contactRoleFieldRefs(role: LayoutEditorContactRole): LayoutEditorContactRoleFieldRefs {
    return CONTACT_ROLE_FIELD_REFS[role];
}

export function contactRoleBlockTitle(role: LayoutEditorContactRole): string {
    return LAYOUT_EDITOR_CONTACT_ROLE_BLOCK_TITLES[role];
}

export function contactRoleEditorDescription(role: LayoutEditorContactRole): string {
    return `This card shows the ${LAYOUT_EDITOR_CONTACT_ROLE_LABELS[role]} Contact. Fields inside use ${LAYOUT_EDITOR_CONTACT_ROLE_LABELS[role]} Contact data.`;
}

export function contactRoleVisibilityPath(role: LayoutEditorContactRole): string | undefined {
    if (role === "primary") return undefined;
    return contactRoleFieldRefs(role).name;
}
