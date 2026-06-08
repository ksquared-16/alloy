/**
 * Map child VM record → operator-safe layout runtime record.
 */

import { isOpaqueIdValue, type ProofRuntimeRecord } from "./proofRecordContext";

function pickDisplay(...values: unknown[]): string | null {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (!text || isOpaqueIdValue(text)) continue;
        return text;
    }
    return null;
}

export function buildChildLayoutRuntimeRecordFromVm(input: {
    vmRecord: Record<string, unknown>;
    childId: string;
}): ProofRuntimeRecord {
    const { vmRecord, childId } = input;
    const childName = pickDisplay(
        vmRecord.display_name,
        vmRecord._child_name,
        vmRecord["child.name"],
        [vmRecord.first_name, vmRecord.last_name].filter(Boolean).join(" "),
    );

    const record: ProofRuntimeRecord = {
        id: childId,
        display_name: childName ?? "—",
        "child.name": childName ?? "—",
        "child.date_of_birth": pickDisplay(vmRecord.date_of_birth, vmRecord["child.date_of_birth"]) ?? "",
        "child.age_band": pickDisplay(vmRecord.age_band, vmRecord["child.age_band"]) ?? "",
        "child.status": pickDisplay(vmRecord._status_display, vmRecord.status_key, vmRecord["child.status"]) ?? "",
        "inquiry_child.program": pickDisplay(vmRecord.program_label, vmRecord["inquiry_child.program"]) ?? "",
        "inquiry_child.desired_start_date": pickDisplay(vmRecord.desired_start_date, vmRecord["inquiry_child.desired_start_date"]) ?? "",
        "person.primary_contact_name": pickDisplay(vmRecord._primary_contact_name, vmRecord["person.primary_contact_name"]) ?? "",
        "person.primary_phone": pickDisplay(vmRecord._primary_contact_phone, vmRecord["person.primary_phone"]) ?? "",
        "person.primary_email": pickDisplay(vmRecord._primary_contact_email, vmRecord["person.primary_email"]) ?? "",
    };

    const householdName = pickDisplay(vmRecord._household_name, vmRecord.household_name);
    if (householdName) {
        record._relations = {
            household_customer: {
                handle: householdName,
                entityType: "customer",
                fields: { household_name: householdName },
            },
        };
    }

    return record;
}
