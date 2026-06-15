/**
 * Map child VM record → operator-safe layout runtime record.
 */

import type {
    PersonEnrollmentMirrorRow,
    PersonHouseholdAdultLinkRow,
    PersonHouseholdContextRow,
    PersonHouseholdCustomerAddressRow,
} from "@/lib/admin/person/personDrawerVisibilityTypes";
import { isOpaqueIdValue, pickEntityId, type ProofRuntimeRecord } from "./proofRecordContext";

function pickDisplay(...values: unknown[]): string | null {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (!text || isOpaqueIdValue(text)) continue;
        return text;
    }
    return null;
}

function resolveHouseholdName(vmRecord: Record<string, unknown>): string | null {
    return pickDisplay(
        vmRecord._household_name,
        vmRecord.household_name,
        vmRecord["customer.household_name"],
        (vmRecord._household_context as PersonHouseholdContextRow[] | undefined)?.map((row) => row.customer_name),
    );
}

function resolveHouseholdAddress(vmRecord: Record<string, unknown>): string | null {
    const formatted = pickDisplay(vmRecord._household_address, vmRecord.household_address);
    if (formatted) return formatted;
    const row = (vmRecord._household_customer_addresses as PersonHouseholdCustomerAddressRow[] | undefined)?.[0];
    if (!row) return null;
    const line1 = pickDisplay(row.address_line1);
    const cityState = [pickDisplay(row.city), pickDisplay(row.state)].filter(Boolean).join(", ");
    const tail = [cityState, pickDisplay(row.postal_code)].filter(Boolean).join(" ");
    const parts = [line1, pickDisplay(row.address_line2), tail].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : null;
}

function resolvePrimaryEnrollmentMirror(vmRecord: Record<string, unknown>): PersonEnrollmentMirrorRow | null {
    const mirror = vmRecord._enrollment_mirror as PersonEnrollmentMirrorRow[] | undefined;
    if (!Array.isArray(mirror) || mirror.length === 0) return null;
    return mirror[0] ?? null;
}

function mapFamilyAdultRow(link: PersonHouseholdAdultLinkRow, index: number): ProofRuntimeRecord {
    const personId = pickEntityId(link.person_id) ?? "";
    const display = pickDisplay(link.display_name) ?? "—";
    const role = pickDisplay(link.role_label, link.role_type) ?? "";
    return {
        id: pickEntityId(link.person_id) ?? `family-adult-${index}`,
        person_id: personId,
        "person.id": personId,
        "person.primary_contact_name": display,
        "person.household_role": role,
        "person.primary_phone": "",
        "person.primary_email": "",
    };
}

function resolveFamilyAdultRows(vmRecord: Record<string, unknown>): ProofRuntimeRecord[] {
    const links = (vmRecord._household_adult_links as PersonHouseholdAdultLinkRow[] | undefined) ?? [];
    if (links.length > 0) {
        return links.map((link, index) => mapFamilyAdultRow(link, index));
    }

    const primaryName = pickDisplay(vmRecord._primary_contact_name, vmRecord["person.primary_contact_name"]);
    if (primaryName) {
        return [
            {
                id: "primary-contact-fallback",
                "person.primary_contact_name": primaryName,
                "person.primary_phone": pickDisplay(vmRecord._primary_contact_phone, vmRecord["person.primary_phone"]) ?? "",
                "person.primary_email": pickDisplay(vmRecord._primary_contact_email, vmRecord["person.primary_email"]) ?? "",
                "person.household_role": "Primary contact",
            },
        ];
    }
    return [];
}

export function buildChildLayoutRuntimeRecordFromVm(input: {
    vmRecord: Record<string, unknown>;
    personId: string;
}): ProofRuntimeRecord {
    const { vmRecord, personId } = input;
    const mirror = resolvePrimaryEnrollmentMirror(vmRecord);
    const childName = pickDisplay(
        vmRecord.display_name,
        vmRecord._child_name,
        vmRecord._person_name,
        vmRecord["child.name"],
        [vmRecord.first_name, vmRecord.last_name].filter(Boolean).join(" "),
    );
    const householdName = resolveHouseholdName(vmRecord) ?? "";
    const address = resolveHouseholdAddress(vmRecord) ?? "";
    const familyRows = resolveFamilyAdultRows(vmRecord);

    const overviewData: Record<string, unknown> = {
        ...vmRecord,
        notes: vmRecord.notes,
        recent_communication: vmRecord.recent_communication,
        follow_up_notes: vmRecord.follow_up_notes,
        last_activity_summary: vmRecord.last_activity_summary,
        last_activity_at: vmRecord.last_activity_at,
        documents: vmRecord.documents ?? vmRecord._documents_preview,
    };

    const record: ProofRuntimeRecord = {
        ...vmRecord,
        id: personId,
        display_name: childName ?? "—",
        "child.id": personId,
        "child.name": childName ?? "—",
        "child.date_of_birth": pickDisplay(vmRecord.date_of_birth, vmRecord["child.date_of_birth"]) ?? "",
        "child.age_band": pickDisplay(vmRecord.age_band, vmRecord.age, vmRecord["child.age_band"]) ?? "",
        "child.status": pickDisplay(vmRecord._status_display, vmRecord.status_key, vmRecord["child.status"]) ?? "",
        "inquiry_child.desired_program_type": pickDisplay(
            vmRecord.desired_program_type,
            vmRecord.program_type,
            mirror?.program_label,
            vmRecord["inquiry_child.desired_program_type"],
        ) ?? "",
        "inquiry_child.desired_schedule_type": pickDisplay(
            vmRecord.desired_schedule_type,
            vmRecord.schedule_type,
            vmRecord["inquiry_child.desired_schedule_type"],
        ) ?? "",
        "child.program": pickDisplay(mirror?.program_label, vmRecord.program_label, vmRecord["child.program"], vmRecord["inquiry_child.program"]) ?? "",
        "inquiry_child.program": pickDisplay(mirror?.program_label, vmRecord.program_label, vmRecord["inquiry_child.program"], vmRecord["child.program"]) ?? "",
        "inquiry_child.desired_start_date": pickDisplay(
            vmRecord.desired_start_date,
            vmRecord["inquiry_child.desired_start_date"],
        ) ?? "",
        "inquiry_child.location_id": pickDisplay(mirror?.location_label, vmRecord.location_label, vmRecord["inquiry_child.location_id"]) ?? "",
        "inquiry_child.program_room_cohort_key": pickDisplay(
            mirror?.room_label,
            vmRecord.program_room_cohort_label,
            vmRecord["inquiry_child.program_room_cohort_key"],
        ) ?? "",
        "inquiry_child.outcome_status_key": pickDisplay(
            mirror?.outcome_status_label,
            mirror?.outcome_status_key,
            vmRecord.outcome_status_key,
            vmRecord.outcome_status_label,
            vmRecord["inquiry_child.outcome_status_key"],
        ) ?? "",
        "person.primary_contact_name": pickDisplay(vmRecord._primary_contact_name, vmRecord["person.primary_contact_name"]) ?? "",
        "person.primary_phone": pickDisplay(vmRecord._primary_contact_phone, vmRecord["person.primary_phone"]) ?? "",
        "person.primary_email": pickDisplay(vmRecord._primary_contact_email, vmRecord["person.primary_email"]) ?? "",
        "customer.household_name": householdName,
        _household_name: householdName,
        household_name: householdName,
        "location.household_address": address,
        _overview_data: overviewData,
    };

    if (familyRows.length > 0) {
        record.family_adults = familyRows;
    }

    if (householdName || address) {
        record._relations = {
            ...(householdName ?
                {
                    household_customer: {
                        handle: householdName,
                        entityType: "customer",
                        fields: { household_name: householdName },
                    },
                }
            :   {}),
            ...(address ?
                {
                    household_address: {
                        handle: address,
                        entityType: "location",
                        fields: { formatted_address: address },
                    },
                }
            :   {}),
        };
    }

    return record;
}
