/**
 * Curated Alloy canonical fields for Processing Form Builder library.
 * Operator-facing labels only — bindings come from systemFieldRegistry.
 */

import {
    OPERATIONAL_FORM_SYSTEM_FIELDS,
    SYSTEM_FIELD_BY_ID,
    type SystemFieldRegistryEntry,
} from "@/lib/forms/systemFieldRegistry";

export type ProcessingBuilderLibraryGroup =
    | "child"
    | "parent"
    | "enrollment"
    | "medical"
    | "emergency_contacts"
    | "communication"
    | "household"
    | "system";

export type ProcessingBuilderCanonicalField = {
    /** Stable picker id (unique in library list). */
    id: string;
    registryId: string;
    pickerLabel: string;
    pickerMeta: string;
    group: ProcessingBuilderLibraryGroup;
};

export const PROCESSING_BUILDER_GROUP_LABELS: Record<ProcessingBuilderLibraryGroup, string> = {
    child: "Child",
    parent: "Parent / Guardian",
    enrollment: "Enrollment",
    medical: "Medical",
    emergency_contacts: "Emergency contacts",
    communication: "Communication",
    household: "Household",
    system: "System",
};

export const PROCESSING_BUILDER_GROUP_ORDER: readonly ProcessingBuilderLibraryGroup[] = [
    "child",
    "parent",
    "enrollment",
    "medical",
    "emergency_contacts",
    "household",
    "communication",
    "system",
] as const;

export const PROCESSING_BUILDER_CANONICAL_FIELDS: readonly ProcessingBuilderCanonicalField[] = [
    { id: "child_first_name", registryId: "child_first_name", pickerLabel: "Child first name", pickerMeta: "Short text · Child", group: "child" },
    { id: "child_last_name", registryId: "child_last_name", pickerLabel: "Child last name", pickerMeta: "Short text · Child", group: "child" },
    { id: "child_date_of_birth", registryId: "child_date_of_birth", pickerLabel: "Date of birth", pickerMeta: "Date · Child", group: "child" },
    { id: "guardian_first_name", registryId: "guardian_first_name", pickerLabel: "Parent / guardian first name", pickerMeta: "Short text · Parent", group: "parent" },
    { id: "guardian_last_name", registryId: "guardian_last_name", pickerLabel: "Parent / guardian last name", pickerMeta: "Short text · Parent", group: "parent" },
    { id: "start_date", registryId: "start_date", pickerLabel: "Desired start date", pickerMeta: "Date · Enrollment", group: "enrollment" },
    { id: "program_category_id", registryId: "program_category_id", pickerLabel: "Desired program", pickerMeta: "Select · Enrollment", group: "enrollment" },
    { id: "schedule_type", registryId: "schedule_type", pickerLabel: "Desired schedule", pickerMeta: "Select · Enrollment", group: "enrollment" },
    { id: "child_site", registryId: "child_site", pickerLabel: "Preferred school / site", pickerMeta: "Select · Enrollment", group: "enrollment" },
    // M1 — the picker offers the CHILD-grain allergy destination. The enrollment-grain rows remain in
    // the registry (deprecated, still resolving for forms already bound to them) but are not offered
    // for new bindings: nothing new should be created at the wrong grain.
    { id: "child_allergies", registryId: "child_allergies", pickerLabel: "Allergies", pickerMeta: "Long text · Medical · Child", group: "medical" },
    { id: "emergency_phone", registryId: "guardian_phone", pickerLabel: "Emergency phone", pickerMeta: "Phone · Emergency", group: "emergency_contacts" },
    { id: "emergency_email", registryId: "guardian_email", pickerLabel: "Emergency email", pickerMeta: "Email · Emergency", group: "emergency_contacts" },
    { id: "customer_account_name", registryId: "customer_account_name", pickerLabel: "Household name", pickerMeta: "Short text · Household", group: "household" },
    { id: "parent_phone", registryId: "guardian_phone", pickerLabel: "Parent phone", pickerMeta: "Phone · Communication", group: "communication" },
    { id: "parent_email", registryId: "guardian_email", pickerLabel: "Parent email", pickerMeta: "Email · Communication", group: "communication" },
    { id: "enrollment_signature", registryId: "enrollment_acknowledgement_signature", pickerLabel: "Enrollment signature", pickerMeta: "Signature · System", group: "system" },
] as const;

export function resolveProcessingBuilderRegistryEntry(
    canonical: ProcessingBuilderCanonicalField
): SystemFieldRegistryEntry | null {
    return SYSTEM_FIELD_BY_ID.get(canonical.registryId) ?? OPERATIONAL_FORM_SYSTEM_FIELDS.find((f) => f.id === canonical.registryId) ?? null;
}

export function processingBuilderCanonicalByRegistryId(registryId: string): ProcessingBuilderCanonicalField | null {
    return PROCESSING_BUILDER_CANONICAL_FIELDS.find((f) => f.id === registryId || f.registryId === registryId) ?? null;
}
