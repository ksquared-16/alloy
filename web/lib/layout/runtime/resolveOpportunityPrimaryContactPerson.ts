/**
 * Resolve primary contact as a Person record — not household name or untyped strings.
 *
 * Doctrine: "contact" means a Person. Prefer person.* namespaced VM fields and
 * person relation handles; never substitute customer/household display names.
 */

import { isOpaqueIdValue, pickEntityId } from "./proofRecordContext";

export type OpportunityPrimaryContactPerson = {
    personId: string | null;
    displayName: string | null;
    phone: string | null;
    email: string | null;
    /** True when at least one person-scoped field resolved. */
    hasPersonBinding: boolean;
};

function pickDisplay(...values: unknown[]): string | null {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (!text || isOpaqueIdValue(text)) continue;
        return text;
    }
    return null;
}

/** Extract primary contact person fields from opportunity VM / preview record. */
export function resolveOpportunityPrimaryContactPerson(
    vmRecord: Record<string, unknown>,
): OpportunityPrimaryContactPerson {
    const personId = pickEntityId(
        vmRecord._primary_person_id,
        vmRecord.primary_person_id,
        vmRecord["opportunity.primary_person_id"],
        vmRecord["person.id"],
    );

    const displayName = pickDisplay(
        vmRecord["person.primary_contact_name"],
        vmRecord._primary_contact_name,
        vmRecord._primary_person_name,
    );

    const phone = pickDisplay(
        vmRecord["person.primary_phone"],
        vmRecord["person.phone"],
        vmRecord._primary_contact_phone,
        vmRecord._primary_person_phone,
    );

    const email = pickDisplay(
        vmRecord["person.primary_email"],
        vmRecord["person.email"],
        vmRecord._primary_contact_email,
        vmRecord._primary_person_email,
    );

    return {
        personId,
        displayName,
        phone,
        email,
        hasPersonBinding: Boolean(personId || displayName || phone || email),
    };
}

/** Build `_relations.primary_contact` entry for layout runtime proof record. */
export function buildPrimaryContactPersonRelation(
    contact: OpportunityPrimaryContactPerson,
): {
    handle: string;
    entityType: "person";
    entityId?: string;
    fields: Record<string, string>;
} | null {
    if (!contact.hasPersonBinding) return null;
    return {
        handle: contact.displayName ?? "—",
        entityType: "person",
        ...(contact.personId ? { entityId: contact.personId } : {}),
        fields: {
            primary_contact_name: contact.displayName ?? "",
            primary_phone: contact.phone ?? "",
            primary_email: contact.email ?? "",
        },
    };
}
