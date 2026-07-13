/**
 * Identity field → canonical mutation value-key bindings.
 *
 * Maps persisted refKeys to established Focus Panel mutation payloads. This is not a
 * field catalog — it declares which canonical mutation path accepts a given refKey write.
 */

export type ContactMutationValueKey = "first_name" | "last_name" | "email" | "phone";

export type ChildFocusMutationValueKey =
    | "program_category_id"
    | "program_room_cohort_key"
    | "schedule_type"
    | "start_date"
    | "dob";

const CONTACT_MUTATION_BY_REF: Readonly<Record<string, ContactMutationValueKey>> = {
    "contact.first_name": "first_name",
    "contact.last_name": "last_name",
    "contact.email": "email",
    "contact.phone": "phone",
};

const CHILD_FOCUS_MUTATION_BY_REF: Readonly<Record<string, ChildFocusMutationValueKey>> = {
    "inquiry_child.program": "program_category_id",
    "child.room": "program_room_cohort_key",
    "inquiry_child.schedule_type": "schedule_type",
    "child.start_date": "start_date",
    "child.date_of_birth": "dob",
};

/** Fields that render but cannot be saved through identity mutation paths. */
export const IDENTITY_UNSUPPORTED_SAVE_REFS = new Set<string>([
    "child.readiness_summary",
    "child.age",
    "child.display_name",
    "child.name",
    "child.dob_age",
]);

export function contactMutationValueKeyForRef(refKey: string): ContactMutationValueKey | undefined {
    return CONTACT_MUTATION_BY_REF[refKey.trim()];
}

export function childFocusMutationValueKeyForRef(refKey: string): ChildFocusMutationValueKey | undefined {
    return CHILD_FOCUS_MUTATION_BY_REF[refKey.trim()];
}

export function isIdentityFieldSaveSupported(refKey: string): boolean {
    const trimmed = refKey.trim();
    if (IDENTITY_UNSUPPORTED_SAVE_REFS.has(trimmed)) return false;
    return Boolean(CONTACT_MUTATION_BY_REF[trimmed] || CHILD_FOCUS_MUTATION_BY_REF[trimmed]);
}

export function inputTypeForIdentityFieldRef(refKey: string): "text" | "email" | "tel" | "date" {
    const trimmed = refKey.trim();
    if (trimmed === "contact.email") return "email";
    if (trimmed === "contact.phone") return "tel";
    if (trimmed === "child.start_date" || trimmed === "child.date_of_birth") return "date";
    return "text";
}
