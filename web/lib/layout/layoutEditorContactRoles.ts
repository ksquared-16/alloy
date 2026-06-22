/**
 * Layout editor — relationship-aware contact block roles.
 * Fields inherit refKeys from the selected role; operators never pick raw name fields.
 */

export const LAYOUT_EDITOR_CONTACT_ROLES = [
    "primary",
    "parents",
    "billing",
    "emergency",
    "secondary",
    "any",
] as const;

export type LayoutEditorContactRole = (typeof LAYOUT_EDITOR_CONTACT_ROLES)[number];

export type LayoutEditorContactResolutionRole = "primary" | "parents" | "billing" | "emergency" | "any";

export const LAYOUT_EDITOR_CONTACT_ROLE_METADATA_KEY = "layoutEditorContactRole" as const;

export type LayoutEditorContactRoleFieldRefs = {
    name: string;
    email: string;
    phone: string;
};

export const LAYOUT_EDITOR_CONTACT_ROLE_LABELS: Record<LayoutEditorContactRole, string> = {
    primary: "Primary Contact",
    parents: "Additional Parent/Guardian",
    billing: "Billing/Payer Contact",
    emergency: "Emergency Contact",
    secondary: "Additional Contact",
    any: "Any",
};

export const LAYOUT_EDITOR_CONTACT_ROLE_BLOCK_TITLES: Record<LayoutEditorContactRole, string> = {
    primary: "Primary Contact",
    parents: "Additional Parent/Guardian",
    billing: "Billing/Payer Contact",
    emergency: "Emergency Contact",
    secondary: "Additional Contact",
    any: "Contact Card",
};

const CONTACT_ROLE_FIELD_REFS: Record<LayoutEditorContactResolutionRole, LayoutEditorContactRoleFieldRefs> = {
    primary: {
        name: "person.primary_contact_name",
        email: "person.primary_email",
        phone: "person.primary_phone",
    },
    parents: {
        name: "person.secondary_contact_name",
        email: "person.secondary_email",
        phone: "person.secondary_phone",
    },
    billing: {
        name: "person.billing_contact_name",
        email: "person.billing_contact_email",
        phone: "person.billing_contact_phone",
    },
    emergency: {
        name: "person.emergency_contact_name",
        email: "person.emergency_contact_email",
        phone: "person.emergency_contact_phone",
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

/** Map legacy secondary role to relationship-based parents resolution. */
export function normalizeLayoutEditorContactRole(role: LayoutEditorContactRole): LayoutEditorContactResolutionRole {
    if (role === "secondary") return "parents";
    if (role === "parents") return "parents";
    if (role === "billing") return "billing";
    if (role === "emergency") return "emergency";
    if (role === "any") return "any";
    return "primary";
}

export function contactRoleFieldRefs(role: LayoutEditorContactRole): LayoutEditorContactRoleFieldRefs {
    return CONTACT_ROLE_FIELD_REFS[normalizeLayoutEditorContactRole(role)];
}

export function contactRoleBlockTitle(role: LayoutEditorContactRole): string {
    return LAYOUT_EDITOR_CONTACT_ROLE_BLOCK_TITLES[role];
}

export function contactRoleEditorDescription(role: LayoutEditorContactRole): string {
    const normalized = normalizeLayoutEditorContactRole(role);
    if (normalized === "primary") {
        return "Shows the household primary contact. Name, email, and phone come from the primary relationship.";
    }
    if (normalized === "parents") {
        return "Shows additional parent/guardian relationships. Excludes the primary contact and people already shown in earlier contact blocks.";
    }
    if (normalized === "billing") {
        return "Shows billing/payer relationships when present. Excludes the primary contact and already-rendered people.";
    }
    if (normalized === "emergency") {
        return "Shows emergency contacts when present. Excludes already-rendered people.";
    }
    return `This card shows the ${LAYOUT_EDITOR_CONTACT_ROLE_LABELS[role]} contact fields configured inside the block.`;
}

export function contactRoleVisibilityPath(role: LayoutEditorContactRole): string | undefined {
    if (normalizeLayoutEditorContactRole(role) === "primary") return undefined;
    return contactRoleFieldRefs(role).name;
}
