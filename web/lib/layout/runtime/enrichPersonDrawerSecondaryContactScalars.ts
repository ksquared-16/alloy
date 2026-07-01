/**
 * Project household relationship contacts onto person drawer secondary-contact scalars.
 */

import { resolvePersonDrawerHouseholdContacts } from "@/lib/layout/runtime/resolveDrawerHouseholdContacts";
import {
    buildSecondaryContactPersonRelation,
    type OpportunityRoleContactPerson,
} from "@/lib/layout/runtime/resolveOpportunityRoleContactPerson";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

function pickDisplay(...values: unknown[]): string | null {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (!text) continue;
        return text;
    }
    return null;
}

function resolveSecondaryFromHousehold(record: ProofRuntimeRecord): OpportunityRoleContactPerson | null {
    const projection = resolvePersonDrawerHouseholdContacts(record, { maxVisible: Number.MAX_SAFE_INTEGER });
    const contact = projection.contacts[0];
    if (!contact) return null;
    return {
        personId: contact.person_id || null,
        displayName: contact.display_name,
        phone: contact.phone,
        email: contact.email,
        hasPersonBinding: Boolean(contact.person_id || contact.display_name || contact.phone || contact.email),
    };
}

/** Fill person.secondary_* scalars from canonical household resolver when VM scalars are empty. */
export function enrichPersonDrawerSecondaryContactScalars(record: ProofRuntimeRecord): ProofRuntimeRecord {
    const hasSecondaryName = Boolean(pickDisplay(record["person.secondary_contact_name"]));
    const hasSecondaryEmail = Boolean(pickDisplay(record["person.secondary_email"]));
    const hasSecondaryPhone = Boolean(pickDisplay(record["person.secondary_phone"]));
    if (hasSecondaryName && hasSecondaryEmail && hasSecondaryPhone) return record;

    const secondary = resolveSecondaryFromHousehold(record);
    if (!secondary?.hasPersonBinding) return record;

    const updates: Record<string, string> = {};
    if (!hasSecondaryName && secondary.displayName) {
        updates["person.secondary_contact_name"] = secondary.displayName;
    }
    if (!hasSecondaryEmail && secondary.email) {
        updates["person.secondary_email"] = secondary.email;
    }
    if (!hasSecondaryPhone && secondary.phone) {
        updates["person.secondary_phone"] = secondary.phone;
    }
    if (Object.keys(updates).length === 0) return record;

    const relation = buildSecondaryContactPersonRelation(secondary);
    return {
        ...record,
        ...updates,
        _relations: {
            ...(record._relations ?? {}),
            ...(relation ? { secondary_contact: relation } : {}),
        },
    };
}
