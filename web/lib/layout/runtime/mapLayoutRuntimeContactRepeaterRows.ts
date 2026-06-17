/**
 * Map opportunity drawer household contacts → layout repeater rows (Phase 5.14B).
 */

import type { LayoutItem } from "@/lib/layout/layoutV2";
import {
    resolveOpportunityDrawerHouseholdContacts,
    type DrawerHouseholdContactRow,
} from "@/lib/layout/runtime/resolveDrawerHouseholdContacts";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export const CONTACT_REPEATER_REF_KEYS = new Set(["contacts", "household_members"]);

export function isLayoutRuntimeContactRepeater(item: Pick<LayoutItem, "kind" | "refKey" | "source">): boolean {
    if (item.kind !== "related_list") return false;
    const key = String(item.refKey ?? item.source ?? "").trim();
    return CONTACT_REPEATER_REF_KEYS.has(key);
}

function contactRowToRepeaterRecord(contact: DrawerHouseholdContactRow): ProofRuntimeRecord {
    const roleLabel = contact.role_label ?? "";
    return {
        id: contact.person_id || contact.display_name,
        person_id: contact.person_id,
        "person.id": contact.person_id,
        "person.primary_contact_name": contact.display_name,
        "person.display_name": contact.display_name,
        "person.name": contact.display_name,
        "person.primary_email": contact.email ?? "",
        "person.email": contact.email ?? "",
        "person.primary_phone": contact.phone ?? "",
        "person.phone": contact.phone ?? "",
        "person.role": roleLabel,
        "person.contact_role": roleLabel,
        "person.relationship": roleLabel,
        "person.is_primary_contact": contact.is_primary ? "Yes" : "",
        "person.is_primary": contact.is_primary ? "Primary" : "",
        "person.is_payer": roleLabel.toLowerCase().includes("payer") ? "Payer" : "",
    };
}

function filterHouseholdMembers(contacts: DrawerHouseholdContactRow[]): DrawerHouseholdContactRow[] {
    return contacts.filter((contact) => {
        const role = (contact.role_type ?? contact.role_label ?? "").toLowerCase();
        if (!role) return true;
        if (role.includes("child")) return false;
        return true;
    });
}

/** Resolve contact / household-member related_list rows for opportunity drawer runtime. */
export function readLayoutRuntimeContactRepeaterRows(
    record: ProofRuntimeRecord,
    item: LayoutItem,
): ProofRuntimeRecord[] {
    const refKey = String(item.refKey ?? item.source ?? "").trim();
    if (!CONTACT_REPEATER_REF_KEYS.has(refKey)) return [];

    const projection = resolveOpportunityDrawerHouseholdContacts(record, { maxVisible: Number.MAX_SAFE_INTEGER });
    const source = refKey === "household_members" ? filterHouseholdMembers(projection.contacts) : projection.contacts;
    return source.map(contactRowToRepeaterRecord);
}
