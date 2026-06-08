/**
 * Person / Child drawer VM record → layout runtime record adapters.
 *
 * Maps the person/child drawer VM record (displayVm.record) to the refKeys the
 * person/child drawer LayoutDocs read (see buildPersonDrawerDefaultDoc /
 * buildChildDrawerDefaultDoc). VALUES only — structure/zones come from the doc.
 * Missing values are emitted blank so fields render even when data is absent.
 */

import { isOpaqueIdValue, type ProofRuntimeRecord } from "./proofRecordContext";

type Rec = Record<string, unknown>;

function pick(record: Rec, ...keys: string[]): string {
    for (const key of keys) {
        const value = record[key];
        if (value == null) continue;
        const text = String(value).trim();
        if (!text || isOpaqueIdValue(text)) continue;
        return text;
    }
    return "";
}

function fullName(record: Rec): string {
    const display = pick(record, "display_name", "person.primary_contact_name", "name");
    if (display) return display;
    const first = pick(record, "first_name");
    const last = pick(record, "last_name");
    return [first, last].filter(Boolean).join(" ");
}

function mapChildRows(raw: unknown): ProofRuntimeRecord[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((entry, index) => {
        const row = (entry ?? {}) as Rec;
        return {
            id: pick(row, "id", "person_id", "child.id") || `child-${index}`,
            "child.id": pick(row, "person_id", "id", "child.id"),
            "child.name": pick(row, "child.name", "display_name", "name") || fullName(row) || "—",
            "child.status": pick(row, "child.status", "status_label", "status_key"),
            "child.age_band": pick(row, "child.age_band", "age_band"),
        };
    });
}

function mapParentRows(raw: unknown): ProofRuntimeRecord[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((entry, index) => {
        const row = (entry ?? {}) as Rec;
        return {
            id: pick(row, "id", "person_id") || `parent-${index}`,
            "person.id": pick(row, "person_id", "id"),
            "person.primary_contact_name": pick(row, "person.primary_contact_name", "display_name", "name") || fullName(row) || "—",
            "person.primary_phone": pick(row, "person.primary_phone", "phone", "primary_phone"),
            "person.primary_email": pick(row, "person.primary_email", "email", "primary_email"),
            "person.household_role": pick(row, "person.household_role", "household_role", "relationship"),
        };
    });
}

/** Build the person drawer layout runtime record from the person VM record. */
export function buildPersonLayoutRuntimeRecordFromVm(vmRecord: Rec, personId: string): ProofRuntimeRecord {
    const name = fullName(vmRecord) || "Person";
    const phone = pick(vmRecord, "person.primary_phone", "phone", "primary_phone");
    const email = pick(vmRecord, "person.primary_email", "email", "primary_email");

    return {
        ...vmRecord,
        id: personId,
        "person.primary_contact_name": name,
        relationship: pick(vmRecord, "relationship", "household_role", "person.household_role"),
        "household.name": pick(vmRecord, "household.name", "household_name", "customer.household_name"),
        "person.primary_phone": phone,
        "person.phone": phone,
        "person.primary_email": email,
        "person.email": email,
        children: mapChildRows(vmRecord.children ?? vmRecord._children),
    };
}

/** Build the child drawer layout runtime record from the child VM record. */
export function buildChildLayoutRuntimeRecordFromVm(vmRecord: Rec, personId: string): ProofRuntimeRecord {
    const name = pick(vmRecord, "child.name", "display_name", "name") || fullName(vmRecord) || "Child";
    const contactName = pick(vmRecord, "person.primary_contact_name", "primary_contact_name");
    const contactPhone = pick(vmRecord, "person.primary_phone", "primary_phone", "phone");
    const contactEmail = pick(vmRecord, "person.primary_email", "primary_email", "email");

    return {
        ...vmRecord,
        id: personId,
        "child.name": name,
        "child.date_of_birth": pick(vmRecord, "child.date_of_birth", "date_of_birth", "dob"),
        "child.age_band": pick(vmRecord, "child.age_band", "age_band"),
        "child.status": pick(vmRecord, "child.status", "status_label", "status_key"),
        "inquiry_child.program": pick(vmRecord, "inquiry_child.program", "inquiry_child.desired_program_type", "program_label", "desired_program_label"),
        "inquiry_child.desired_start_date": pick(vmRecord, "inquiry_child.desired_start_date", "desired_start_date"),
        "inquiry_child.schedule": pick(vmRecord, "inquiry_child.schedule", "inquiry_child.desired_schedule_type", "schedule_label"),
        "person.primary_contact_name": contactName,
        "person.primary_phone": contactPhone,
        "person.primary_email": contactEmail,
        parents: mapParentRows(vmRecord.parents ?? vmRecord._parents),
    };
}
