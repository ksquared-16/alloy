/**
 * Layout editor — relationship-aware contact block roles.
 * Fields inherit refKeys from the selected role; operators never pick raw name fields.
 */

import { contactRoleAddressLayoutRefKey, type PersonAddressValueKey } from "@/lib/layout/personDrawerAddressLayoutRefs";

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

/** Resolution strategy — keeps secondary distinct from parent/guardian filtering. */
export type LayoutEditorContactResolutionMode =
    | "primary"
    | "secondary"
    | "parents"
    | "billing"
    | "emergency"
    | "any";

/** Synthetic record paths overlaid during contact_block runtime for visibility rules. */
export const LAYOUT_CONTACT_BLOCK_VISIBILITY_PATHS = {
    resolved: "_layout_contact_block.resolved",
    resolvedCount: "_layout_contact_block.resolved_count",
    isPrimary: "_layout_contact_block.is_primary",
    isNotPrimary: "_layout_contact_block.is_not_primary",
} as const;

export const LAYOUT_EDITOR_CONTACT_ROLE_METADATA_KEY = "layoutEditorContactRole" as const;

export type LayoutEditorContactRoleFieldRefs = {
    name: string;
    email: string;
    phone: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    postalCode: string;
};

function addressRefsForRole(role: LayoutEditorContactResolutionRole): Pick<
    LayoutEditorContactRoleFieldRefs,
    "addressLine1" | "addressLine2" | "city" | "state" | "postalCode"
> {
    const keys: PersonAddressValueKey[] = [
        "address_line1",
        "address_line2",
        "city",
        "state",
        "postal_code",
    ];
    return {
        addressLine1: contactRoleAddressLayoutRefKey(role, keys[0]!),
        addressLine2: contactRoleAddressLayoutRefKey(role, keys[1]!),
        city: contactRoleAddressLayoutRefKey(role, keys[2]!),
        state: contactRoleAddressLayoutRefKey(role, keys[3]!),
        postalCode: contactRoleAddressLayoutRefKey(role, keys[4]!),
    };
}

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
        ...addressRefsForRole("primary"),
    },
    parents: {
        name: "person.secondary_contact_name",
        email: "person.secondary_email",
        phone: "person.secondary_phone",
        ...addressRefsForRole("parents"),
    },
    billing: {
        name: "person.billing_contact_name",
        email: "person.billing_contact_email",
        phone: "person.billing_contact_phone",
        ...addressRefsForRole("billing"),
    },
    emergency: {
        name: "person.emergency_contact_name",
        email: "person.emergency_contact_email",
        phone: "person.emergency_contact_phone",
        ...addressRefsForRole("emergency"),
    },
    any: {
        name: "person.contact_name",
        email: "person.contact_email",
        phone: "person.contact_phone",
        ...addressRefsForRole("any"),
    },
};

export function isLayoutEditorContactRole(v: unknown): v is LayoutEditorContactRole {
    return typeof v === "string" && (LAYOUT_EDITOR_CONTACT_ROLES as readonly string[]).includes(v);
}

export function readLayoutEditorContactRole(metadata: Record<string, unknown> | undefined): LayoutEditorContactRole {
    const raw = metadata?.[LAYOUT_EDITOR_CONTACT_ROLE_METADATA_KEY];
    return isLayoutEditorContactRole(raw) ? raw : "primary";
}

/** Map contact role to scalar field ref keys (secondary → secondary_* person fields). */
export function normalizeLayoutEditorContactRole(role: LayoutEditorContactRole): LayoutEditorContactResolutionRole {
    if (role === "secondary") return "parents";
    if (role === "parents") return "parents";
    if (role === "billing") return "billing";
    if (role === "emergency") return "emergency";
    if (role === "any") return "any";
    return "primary";
}

/** Relationship query mode for contact_block resolution — secondary is not merged into parents. */
export function contactBlockResolutionMode(role: LayoutEditorContactRole): LayoutEditorContactResolutionMode {
    if (role === "secondary") return "secondary";
    if (role === "parents") return "parents";
    if (role === "billing") return "billing";
    if (role === "emergency") return "emergency";
    if (role === "any") return "any";
    return "primary";
}

export function contactRoleFieldRefs(role: LayoutEditorContactRole): LayoutEditorContactRoleFieldRefs {
    return CONTACT_ROLE_FIELD_REFS[normalizeLayoutEditorContactRole(role)];
}

/** Scalar refKeys shown in contact-role context picker groups. */
export function contactRolePickerRefKeys(role: LayoutEditorContactRole): string[] {
    const refs = contactRoleFieldRefs(role);
    return [
        refs.name,
        refs.email,
        refs.phone,
        refs.addressLine1,
        refs.addressLine2,
        refs.city,
        refs.state,
        refs.postalCode,
    ];
}

export function contactRoleBlockTitle(role: LayoutEditorContactRole): string {
    return LAYOUT_EDITOR_CONTACT_ROLE_BLOCK_TITLES[role];
}

export function contactRoleEditorDescription(role: LayoutEditorContactRole): string {
    const normalized = normalizeLayoutEditorContactRole(role);
    if (normalized === "primary") {
        return "Shows the household primary contact. Name, email, phone, and address come from the primary relationship.";
    }
    if (role === "secondary") {
        return "Shows the first additional associated person (non-primary). Excludes the primary contact and people already shown in earlier contact blocks.";
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
