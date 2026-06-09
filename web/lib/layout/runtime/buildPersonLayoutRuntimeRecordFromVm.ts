/**
 * Map person VM record → operator-safe layout runtime record.
 */

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

function mapChildRows(raw: unknown): ProofRuntimeRecord[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((row, index) => {
        const child = row as Record<string, unknown>;
        const childPersonId = pickEntityId(child.person_id, child.id) ?? "";
        const memberId = pickEntityId(child.customer_member_id) ?? "";
        const display = pickDisplay(child.display_name, child.name, child._child_name) ?? "—";
        return {
            id: pickEntityId(child.id, child.person_id, child.customer_member_id, child.ocm_id) ?? `child-${index}`,
            person_id: childPersonId,
            customer_member_id: memberId,
            "child.id": childPersonId,
            "child.customer_member_id": memberId,
            "child.name": display,
            "child.display_name": display,
            "child.date_of_birth": pickDisplay(child.dob, child.date_of_birth) ?? "",
            "child.age_band": pickDisplay(child.age_band, child.age) ?? "",
            "child.status": pickDisplay(child.status_label, child.status_key, child.status) ?? "",
        };
    });
}

export function buildPersonLayoutRuntimeRecordFromVm(input: {
    vmRecord: Record<string, unknown>;
    personId: string;
}): ProofRuntimeRecord {
    const { vmRecord, personId } = input;
    const fullName = pickDisplay(
        vmRecord["person.primary_contact_name"],
        vmRecord._person_name,
        vmRecord.full_name,
        [vmRecord.first_name, vmRecord.last_name].filter(Boolean).join(" "),
    );
    const householdName = pickDisplay(vmRecord._household_name, vmRecord.household_name, vmRecord["customer.name"]);
    const phone = pickDisplay(vmRecord.phone, vmRecord["person.primary_phone"], vmRecord._primary_phone) ?? "";
    const email = pickDisplay(vmRecord.email, vmRecord["person.primary_email"], vmRecord._primary_email) ?? "";
    const relationship = pickDisplay(vmRecord.relationship_type, vmRecord.role_type, vmRecord["person.relationship"]) ?? "";
    const address = pickDisplay(vmRecord._household_address, vmRecord.household_address) ?? "";

    const childRows = mapChildRows(vmRecord._children ?? vmRecord.children ?? vmRecord._household_children);

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
        "person.id": personId,
        first_name: pickDisplay(vmRecord.first_name) ?? "",
        last_name: pickDisplay(vmRecord.last_name) ?? "",
        "person.first_name": pickDisplay(vmRecord.first_name) ?? "",
        "person.last_name": pickDisplay(vmRecord.last_name) ?? "",
        "person.primary_contact_name": fullName ?? "—",
        "person.primary_phone": phone,
        "person.primary_email": email,
        "person.phone": phone,
        "person.email": email,
        "person.relationship": relationship,
        "customer.household_name": householdName ?? "",
        "customer.name": householdName ?? "",
        _household_name: householdName ?? "",
        household_name: householdName ?? "",
        "location.household_address": address,
        _overview_data: overviewData,
        ...(vmRecord._inquiry_summary_tasks ? { _inquiry_summary_tasks: vmRecord._inquiry_summary_tasks } : {}),
    };

    if (childRows.length > 0) {
        record.household_children = childRows;
        record.children = childRows;
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
