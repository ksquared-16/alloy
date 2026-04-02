/** Allowed field_definitions.field_type values (admin create + API validation). */
export const ADMIN_FIELD_TYPES = [
    "text",
    "email",
    "phone",
    "number",
    "date",
    "datetime",
    "boolean",
    "select",
    "multiselect",
] as const;

export type AdminFieldType = (typeof ADMIN_FIELD_TYPES)[number];
