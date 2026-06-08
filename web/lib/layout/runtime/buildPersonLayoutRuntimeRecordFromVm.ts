/**
 * Map person VM record → operator-safe layout runtime record.
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

    const record: ProofRuntimeRecord = {
        id: personId,
        first_name: pickDisplay(vmRecord.first_name) ?? "",
        last_name: pickDisplay(vmRecord.last_name) ?? "",
        "person.first_name": pickDisplay(vmRecord.first_name) ?? "",
        "person.last_name": pickDisplay(vmRecord.last_name) ?? "",
        "person.primary_contact_name": fullName ?? "—",
        "person.primary_phone": pickDisplay(vmRecord.phone, vmRecord["person.primary_phone"], vmRecord._primary_phone) ?? "",
        "person.primary_email": pickDisplay(vmRecord.email, vmRecord["person.primary_email"], vmRecord._primary_email) ?? "",
        "person.relationship": pickDisplay(vmRecord.relationship_type, vmRecord.role_type, vmRecord["person.relationship"]) ?? "",
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

    const children = vmRecord._children ?? vmRecord.children;
    if (Array.isArray(children)) {
        record.household_children = children.map((row, index) => {
            const child = row as Record<string, unknown>;
            return {
                id: pickDisplay(child.id) ?? `child-${index}`,
                "child.name": pickDisplay(child.display_name, child.name, child._child_name) ?? "—",
                "child.status": pickDisplay(child.status_label, child.status_key) ?? "",
            };
        });
    }

    return record;
}
