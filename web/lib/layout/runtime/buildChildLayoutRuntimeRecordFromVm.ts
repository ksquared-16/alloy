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
import { stampLayoutRuntimeActiveRecordContext } from "./layoutRuntimeRelatedListActiveRecord";
import { resolveHouseholdAddressFieldValues } from "./resolveHouseholdAddressFieldValues";
import {
    resolveLayoutRuntimeScopedRelationshipContacts,
    scopedRelationshipContactsToRepeaterRows,
} from "./layoutRuntimeScopedRelationshipContacts";

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

function resolveFamilyAdultRows(vmRecord: Record<string, unknown>, personId: string): ProofRuntimeRecord[] {
    const stamped = stampLayoutRuntimeActiveRecordContext(
        { ...vmRecord, id: personId },
        { anchorEntity: "child", entityId: personId },
    );
    const scoped = resolveLayoutRuntimeScopedRelationshipContacts(stamped, "guardians_for_child");
    if (scoped.length > 0) {
        return scopedRelationshipContactsToRepeaterRows(scoped);
    }

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
    const addressFields = resolveHouseholdAddressFieldValues(vmRecord);
    const address = addressFields["location.household_address"] ?? "";
    const familyRows = resolveFamilyAdultRows(vmRecord, personId);

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
        person_id: personId,
        display_name: childName ?? "—",
        "child.id": personId,
        "child.name": childName ?? "—",
        "child.first_name": pickDisplay(vmRecord.first_name, vmRecord["child.first_name"]) ?? "",
        "child.last_name": pickDisplay(vmRecord.last_name, vmRecord["child.last_name"]) ?? "",
        "child.date_of_birth": pickDisplay(vmRecord.date_of_birth, vmRecord["child.date_of_birth"]) ?? "",
        "child.age_band": pickDisplay(vmRecord.age_band, vmRecord.age, vmRecord["child.age_band"]) ?? "",
        "child.status": pickDisplay(vmRecord._status_display, vmRecord.status_key, vmRecord["child.status"]) ?? "",
        customer_member_id: pickEntityId(mirror?.customer_member_id, vmRecord.customer_member_id) ?? "",
        "child.customer_member_id": pickEntityId(mirror?.customer_member_id, vmRecord.customer_member_id) ?? "",
        ocm_id: pickEntityId(mirror?.id, vmRecord.ocm_id) ?? "",
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
        ...addressFields,
        _overview_data: overviewData,
    };

    if (familyRows.length > 0) {
        record.family_adults = familyRows;
    }

    if (Array.isArray(vmRecord._child_scoped_contact_links)) {
        record._child_scoped_contact_links = vmRecord._child_scoped_contact_links;
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

    return stampLayoutRuntimeActiveRecordContext(record, {
        anchorEntity: "child",
        entityId: personId,
    });
}
