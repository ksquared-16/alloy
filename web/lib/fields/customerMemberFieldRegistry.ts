/**
 * Customer member — durable child profile configurable field surface.
 *
 * Operator-facing entity_type: `customer_member` (singular, matches forms/documents).
 * Storage: `field_values` keyed by `customer_members.id`.
 *
 * Native profile columns (first_name, last_name, dob, …) are NOT field_definitions.
 */

export const CUSTOMER_MEMBER_ENTITY_TYPE = "customer_member" as const;

export type CustomerMemberEntityType = typeof CUSTOMER_MEMBER_ENTITY_TYPE;

/** Native customer_members columns — never custom field_definitions. */
export const CUSTOMER_MEMBER_NATIVE_COLUMN_KEYS = [
    "first_name",
    "last_name",
    "dob",
    "display_name",
    "relationship",
    "person_id",
    "customer_id",
    "is_active",
    "metadata",
] as const;

/** Configurable child profile keys seeded on entity_type = customer_member (FC-CM-1). */
export const CUSTOMER_MEMBER_CONFIG_FIELD_KEYS = [
    "preferred_name",
    "gender",
    "allergies",
    "medical_notes",
    "special_instructions",
    // READY NOW (Slice 5) — durable child-profile facts the Health & Safety contract cleared for
    // Enrollment to bind at child grain. Each is ONE manifest row now that every surface derives.
    // Deliberately NOT here: allergy, condition, medication, immunization — those are Health
    // foundation kinds (D-H5) and Enrollment must not create a competing destination for them.
    "special_diet",
    "eating_habits",
    "favorite_foods",
    "foods_refused",
    "toileting_routine",
    "nap_routine",
    "temperament",
] as const;

export type CustomerMemberConfigFieldKey = (typeof CUSTOMER_MEMBER_CONFIG_FIELD_KEYS)[number];

export type CustomerMemberConfigFieldManifestRow = {
    field_key: CustomerMemberConfigFieldKey;
    field_type: "text" | "select";
    label: string;
    section_key: string;
    sort_order: number;
    /**
     * Privacy classification. Health data is not "standard data with a medical label" — it carries
     * different access and retention expectations, and a field that never states its class cannot be
     * governed by one. Absent means `standard`.
     */
    sensitivity?: "standard" | "health";
    config?: Record<string, unknown>;
};

/** Layout picker refKeys for config fields (child.* namespace). */
export const CUSTOMER_MEMBER_CONFIG_LAYOUT_REF_KEYS = CUSTOMER_MEMBER_CONFIG_FIELD_KEYS.map(
    (k) => `child.${k}` as const,
);

export const CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST: CustomerMemberConfigFieldManifestRow[] = [
    {
        field_key: "preferred_name",
        field_type: "text",
        label: "Preferred name",
        section_key: "child_profile",
        sort_order: 30,
    },
    {
        field_key: "gender",
        field_type: "select",
        label: "Gender",
        section_key: "child_profile",
        sort_order: 60,
        config: { option_set_key: "person_gender" },
    },
    {
        field_key: "allergies",
        field_type: "text",
        label: "Allergies",
        section_key: "medical",
        sort_order: 70,
        sensitivity: "health",
    },
    {
        field_key: "medical_notes",
        field_type: "text",
        label: "Medical notes",
        section_key: "medical",
        sort_order: 80,
        sensitivity: "health",
    },
    {
        field_key: "special_instructions",
        field_type: "text",
        label: "Special instructions",
        section_key: "medical",
        sort_order: 90,
    },
    {
        field_key: "special_diet",
        field_type: "text",
        label: "Special diet",
        section_key: "medical",
        sort_order: 100,
        // A standing dietary restriction sits beside allergies as a safety fact, not a preference —
        // and it is a DIET, not an allergy, so it never stands in for one.
        sensitivity: "health",
    },
    {
        field_key: "eating_habits",
        field_type: "text",
        label: "Eating habits",
        section_key: "child_profile",
        sort_order: 110,
    },
    {
        field_key: "favorite_foods",
        field_type: "text",
        label: "Favourite foods",
        section_key: "child_profile",
        sort_order: 120,
    },
    {
        field_key: "foods_refused",
        field_type: "text",
        label: "Foods refused",
        section_key: "child_profile",
        sort_order: 130,
    },
    {
        field_key: "toileting_routine",
        field_type: "text",
        label: "Toileting routine",
        section_key: "child_profile",
        // The packet asks four questions about toileting — habits, how the child signals, reluctance,
        // specific needs. They describe one routine staff follow daily, so they are one fact.
        sort_order: 140,
    },
    {
        field_key: "nap_routine",
        field_type: "text",
        label: "Nap routine",
        section_key: "child_profile",
        // Two questions — whether the child naps, and what they need at naptime — about one routine.
        sort_order: 150,
    },
    {
        field_key: "temperament",
        field_type: "text",
        label: "Temperament",
        section_key: "child_profile",
        // The profile concept the packet's nine "getting to know your child" questions circle. One
        // durable fact a teacher uses all year; the remaining eight stay Director decisions.
        sort_order: 160,
    },
];

const NATIVE_KEY_SET = new Set<string>(CUSTOMER_MEMBER_NATIVE_COLUMN_KEYS);
const CONFIG_KEY_SET = new Set<string>(CUSTOMER_MEMBER_CONFIG_FIELD_KEYS);

export function isCustomerMemberNativeColumnKey(fieldKey: string): boolean {
    return NATIVE_KEY_SET.has(fieldKey.trim());
}

export function isCustomerMemberConfigFieldKey(fieldKey: string): fieldKey is CustomerMemberConfigFieldKey {
    return CONFIG_KEY_SET.has(fieldKey.trim());
}

/** Block custom field_definitions that collide with native columns or FC-CM-1 seeds. */
export function isReservedCustomerMemberFieldKey(fieldKey: string): boolean {
    const key = fieldKey.trim();
    return isCustomerMemberNativeColumnKey(key) || isCustomerMemberConfigFieldKey(key);
}

/**
 * FC-CM-1 write path — PATCH /api/admin/customer-members/:id upserts config fields to field_values.
 */
export const CUSTOMER_MEMBER_FIELD_VALUES_PATCH = {
    implemented: true,
    entityType: CUSTOMER_MEMBER_ENTITY_TYPE,
    entityIdSource: "customer_members.id",
    fieldValuesEntityType: CUSTOMER_MEMBER_ENTITY_TYPE,
    referenceImplementation: "web/app/api/admin/customer-members/[id]/route.ts",
} as const;
