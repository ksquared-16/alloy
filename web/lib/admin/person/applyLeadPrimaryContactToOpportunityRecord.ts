import {
    buildOpportunityFamilyContactRows,
    isPrimaryContactRoleType,
} from "@/lib/admin/drawer/opportunityFamilyContactsOrdering";
import { applyHouseholdPrimaryContactToRecord } from "@/lib/admin/person/applyHouseholdPrimaryContactToRecord";
import { HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE } from "@/lib/admin/person/householdPrimaryContact";
import {
    buildPrimaryContactPersonRelation,
    resolveOpportunityPrimaryContactPerson,
} from "@/lib/layout/runtime/resolveOpportunityPrimaryContactPerson";

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

function resolveContactPersonFields(
    record: Record<string, unknown>,
    personId: string
): { name: string | null; phone: string | null; email: string | null } {
    for (const row of buildOpportunityFamilyContactRows(record)) {
        if (row.person_id === personId) {
            return {
                name: trimOrNull(row.name),
                phone: trimOrNull(row.phone),
                email: trimOrNull(row.email),
            };
        }
    }

    // Secondaries often live only on household adult links — include them so flip-back
    // does not leave stale person.primary_contact_name from the prior primary.
    for (const link of (record._household_adult_links as Record<string, unknown>[] | undefined) ?? []) {
        if (trimOrNull(link.person_id) !== personId) continue;
        return {
            name: trimOrNull(link.display_name) ?? trimOrNull(link.name),
            phone: trimOrNull(link.phone),
            email: trimOrNull(link.email),
        };
    }

    return { name: null, phone: null, email: null };
}

/** Optimistic opportunity drawer + queue VM update after household primary contact reassignment. */
export function applyLeadPrimaryContactToOpportunityRecord(
    record: Record<string, unknown>,
    customerId: string,
    personId: string
): Record<string, unknown> {
    const cid = trimOrNull(customerId);
    const pid = trimOrNull(personId);
    if (!cid || !pid) return record;

    const next = applyHouseholdPrimaryContactToRecord(record, cid, pid);
    const contact = resolveContactPersonFields(record, pid);

    next.primary_person_id = pid;
    next._primary_person_id = pid;
    next["opportunity.primary_person_id"] = pid;

    if (contact.name) {
        next["person.primary_contact_name"] = contact.name;
        next._primary_contact_name = contact.name;
        next._primary_person_name = contact.name;
    }
    if (contact.phone) {
        next["person.primary_phone"] = contact.phone;
        next["person.phone"] = contact.phone;
        next._primary_contact_phone = contact.phone;
        next._primary_person_phone = contact.phone;
    }
    if (contact.email) {
        next["person.primary_email"] = contact.email;
        next["person.email"] = contact.email;
        next._primary_contact_email = contact.email;
        next._primary_person_email = contact.email;
    }

    const oppPersons = (next._opportunity_persons as Record<string, unknown>[] | undefined) ?? [];
    if (oppPersons.length > 0) {
        next._opportunity_persons = oppPersons.map((row) => {
            const rowPid = trimOrNull(row.person_id);
            if (!rowPid) return row;
            if (rowPid === pid) {
                return { ...row, role_type: HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE };
            }
            if (isPrimaryContactRoleType(String(row.role_type ?? ""))) {
                return { ...row, role_type: "guardian" };
            }
            return row;
        });
    }

    const primaryContact = resolveOpportunityPrimaryContactPerson(next);
    const relation = buildPrimaryContactPersonRelation(primaryContact);
    if (relation) {
        const relations =
            next._relations && typeof next._relations === "object" && !Array.isArray(next._relations)
                ? { ...(next._relations as Record<string, unknown>) }
                : {};
        relations.primary_contact = relation;
        next._relations = relations;
    }

    return next;
}
