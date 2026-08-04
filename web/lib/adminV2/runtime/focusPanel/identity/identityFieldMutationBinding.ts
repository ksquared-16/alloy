/**
 * Identity field → canonical mutation value-key bindings.
 *
 * Maps persisted refKeys to established Focus Panel mutation payloads. This is not a
 * field catalog — it declares which canonical mutation path accepts a given refKey write.
 *
 * Enrollment projections (Location/Program/Room/Schedule) write through OCM
 * (`inquiry_child` / opportunity_customer_members), never customer_member.
 */

import { reconcileLegacyChildEnrollmentAlias } from "@/lib/fields/canonicalFieldProjection";

export type ContactMutationValueKey = "first_name" | "last_name" | "email" | "phone" | "address_line1" | "address_line2" | "city" | "state" | "postal_code";

export type ChildFocusMutationValueKey =
    | "location_id"
    | "program_category_id"
    | "program_room_cohort_key"
    | "schedule_type"
    | "start_date"
    | "requested_days_per_week"
    | "weekdays"
    | "dob";

const CONTACT_MUTATION_BY_REF: Readonly<Record<string, ContactMutationValueKey>> = {
    "contact.first_name": "first_name",
    "contact.last_name": "last_name",
    "contact.email": "email",
    "contact.phone": "phone",
    "contact.address_line1": "address_line1",
    "contact.address_line2": "address_line2",
    "contact.address_line": "address_line1",
    "contact.address": "address_line1",
    "person.first_name": "first_name",
    "person.last_name": "last_name",
    "person.email": "email",
    "person.phone": "phone",
    "person.address_line1": "address_line1",
    "person.address_line2": "address_line2",
    "person.address_line": "address_line1",
    "person.address": "address_line1",
    "person.city": "city",
    "person.state": "state",
    "person.postal_code": "postal_code",
    "person.postal": "postal_code",
    "person.zip": "postal_code",
    "contact.city": "city",
    "contact.state": "state",
    "contact.postal_code": "postal_code",
    "contact.postal": "postal_code",
    "contact.zip": "postal_code",
};

const CHILD_FOCUS_MUTATION_BY_REF: Readonly<Record<string, ChildFocusMutationValueKey>> = {
    "inquiry_child.location_id": "location_id",
    "inquiry_child.program": "program_category_id",
    "inquiry_child.program_category_id": "program_category_id",
    "inquiry_child.program_room_cohort_key": "program_room_cohort_key",
    "inquiry_child.schedule_type": "schedule_type",
    "inquiry_child.start_date": "start_date",
    "inquiry_child.requested_days_per_week": "requested_days_per_week",
    "inquiry_child.weekdays": "weekdays",
    "child.location": "location_id",
    "child.program": "program_category_id",
    "child.room": "program_room_cohort_key",
    "child.schedule": "schedule_type",
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
    "person.full_name",
]);

export function contactMutationValueKeyForRef(refKey: string): ContactMutationValueKey | undefined {
    return CONTACT_MUTATION_BY_REF[refKey.trim()];
}

export function childFocusMutationValueKeyForRef(refKey: string): ChildFocusMutationValueKey | undefined {
    const trimmed = refKey.trim();
    const direct = CHILD_FOCUS_MUTATION_BY_REF[trimmed];
    if (direct) return direct;
    const reconciled = reconcileLegacyChildEnrollmentAlias(trimmed);
    return CHILD_FOCUS_MUTATION_BY_REF[reconciled];
}

export function isIdentityFieldSaveSupported(refKey: string): boolean {
    const trimmed = refKey.trim();
    if (IDENTITY_UNSUPPORTED_SAVE_REFS.has(trimmed)) return false;
    return Boolean(CONTACT_MUTATION_BY_REF[trimmed] || childFocusMutationValueKeyForRef(trimmed));
}

/** True when the mutation target is Enrollment/OCM participation (not Child Profile). */
export function isEnrollmentOcmMutationValueKey(valueKey: ChildFocusMutationValueKey): boolean {
    return valueKey !== "dob";
}

export function inputTypeForIdentityFieldRef(refKey: string): "text" | "email" | "tel" | "date" | "number" {
    const trimmed = reconcileLegacyChildEnrollmentAlias(refKey.trim());
    if (trimmed === "contact.email") return "email";
    if (trimmed === "contact.phone") return "tel";
    if (trimmed === "inquiry_child.start_date" || trimmed === "child.date_of_birth") return "date";
    if (trimmed === "inquiry_child.requested_days_per_week") return "number";
    return "text";
}
