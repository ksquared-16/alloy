import { dedupePersonRelationshipLinks } from "@/lib/admin/person/dedupePersonRelationshipLinks";
import type {
    PersonDrawerRelationshipGroups,
    PersonHouseholdAdultLinkRow,
    PersonHouseholdChildLinkRow,
    PersonRelationshipLink,
    PersonSiblingLinkRow,
} from "@/lib/admin/person/personDrawerVisibilityTypes";

export type PersonRelationshipGroupsInput = {
    person_id: string;
    customer_persons?: Array<{
        person_id: string;
        role_type?: string | null;
        _role_label?: string | null;
    }> | null;
    person_relationships?: Array<{
        from_person_id: string;
        to_person_id: string;
        relationship_type?: string | null;
        _other_person_id?: string;
        _other_person_name?: string | null;
        _relationship_type_label?: string | null;
    }> | null;
    compatibility_members?: Array<{
        id: string;
        person_id?: string | null;
        display_name?: string | null;
        relationship?: string | null;
    }> | null;
    sibling_links?: PersonSiblingLinkRow[] | null;
    /** Household adults on shared customer accounts (child-facing family links). */
    household_adult_links?: PersonHouseholdAdultLinkRow[] | null;
    /** Household child members on shared customer accounts (parent-facing links). */
    household_child_links?: PersonHouseholdChildLinkRow[] | null;
};

const PARENT_KEYS = new Set(["parent", "primary_contact", "primary"]);
const GUARDIAN_KEYS = new Set(["guardian"]);
const EMERGENCY_KEYS = new Set(["emergency_contact", "emergency"]);

function norm(raw: string | null | undefined): string {
    return String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}

function pushPersonLink(
    bucket: PersonRelationshipLink[],
    personId: string | null | undefined,
    displayName: string | null | undefined,
    relationshipLabel: string | null | undefined,
    customerMemberId?: string | null
): void {
    const pid = personId ? String(personId).trim() : "";
    const name = (displayName ?? "").trim() || null;
    if (!pid && !name && !customerMemberId) return;
    bucket.push({
        person_id: pid || null,
        customer_member_id: customerMemberId ?? null,
        display_name: name,
        relationship_label: (relationshipLabel ?? "").trim() || null,
    });
}

/**
 * Group family relationship links for read-only person drawer overview.
 * Uses customer_persons, person_relationships, customer_members, and derived siblings.
 */
export function buildPersonDrawerRelationshipGroups(
    input: PersonRelationshipGroupsInput
): PersonDrawerRelationshipGroups {
    const pid = String(input.person_id ?? "").trim();
    const parents: PersonRelationshipLink[] = [];
    const guardians: PersonRelationshipLink[] = [];
    const emergency: PersonRelationshipLink[] = [];
    const children: PersonRelationshipLink[] = [];
    const siblings: PersonRelationshipLink[] = [];

    for (const rel of input.person_relationships ?? []) {
        const type = norm(rel.relationship_type);
        const otherId = rel._other_person_id ?? (rel.from_person_id === pid ? rel.to_person_id : rel.from_person_id);
        const otherName = rel._other_person_name;
        const label = rel._relationship_type_label ?? rel.relationship_type ?? null;
        const isFrom = rel.from_person_id === pid;
        const isTo = rel.to_person_id === pid;

        if (isTo && (type === "parent" || PARENT_KEYS.has(type))) {
            pushPersonLink(parents, otherId, otherName, label);
        } else if (isFrom && (type === "parent" || PARENT_KEYS.has(type))) {
            pushPersonLink(children, otherId, otherName, label);
        } else if (isTo && (type === "guardian" || GUARDIAN_KEYS.has(type))) {
            pushPersonLink(guardians, otherId, otherName, label);
        } else if (isFrom && (type === "guardian" || GUARDIAN_KEYS.has(type))) {
            pushPersonLink(children, otherId, otherName, label);
        } else if (EMERGENCY_KEYS.has(type)) {
            pushPersonLink(emergency, otherId, otherName, label);
        } else if (type === "sibling" || type === "sibling_child") {
            pushPersonLink(siblings, otherId, otherName, label);
        } else if (isFrom && type === "child") {
            pushPersonLink(children, otherId, otherName, label);
        } else if (isTo && type === "child") {
            pushPersonLink(parents, otherId, otherName, label);
        }
    }

    for (const row of input.sibling_links ?? []) {
        pushPersonLink(siblings, row.person_id, row.display_name, "Sibling", row.customer_member_id);
    }

    for (const adult of input.household_adult_links ?? []) {
        const role = norm(adult.role_type);
        const label = adult.role_label ?? adult.role_type ?? null;
        if (PARENT_KEYS.has(role) || role === "parent") {
            pushPersonLink(parents, adult.person_id, adult.display_name, label);
        } else if (GUARDIAN_KEYS.has(role) || role === "guardian") {
            pushPersonLink(guardians, adult.person_id, adult.display_name, label);
        } else if (EMERGENCY_KEYS.has(role)) {
            pushPersonLink(emergency, adult.person_id, adult.display_name, label);
        } else {
            pushPersonLink(parents, adult.person_id, adult.display_name, label);
        }
    }

    for (const child of input.household_child_links ?? []) {
        pushPersonLink(
            children,
            child.person_id,
            child.display_name,
            "Child",
            child.customer_member_id
        );
    }

    return {
        parents: dedupePersonRelationshipLinks(parents),
        guardians: dedupePersonRelationshipLinks(guardians),
        emergency_contacts: dedupePersonRelationshipLinks(emergency),
        children: dedupePersonRelationshipLinks(children),
        siblings: dedupePersonRelationshipLinks(siblings),
    };
}
