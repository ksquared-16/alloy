/**
 * Shared drawer household contact projection — Lead, Person, and future queue surfaces.
 *
 * Opportunity records: `_opportunity_persons` + `_customer_persons` (+ optional `_household_adult_links`).
 * Person records: `resolvePersonDrawerHouseholdModel` via person overview helpers.
 */

import {
    buildOpportunityFamilyContactRows,
    isPrimaryContactRoleType,
    resolveLeadSummaryPrimaryPersonId,
    sortOpportunityFamilyContactRows,
} from "@/lib/admin/drawer/opportunityFamilyContactsOrdering";
import { personDrawerHouseholdInitials } from "@/lib/admin/person/personDrawerHouseholdDisplay";
import {
    PERSON_DRAWER_HOUSEHOLD_EMERGENCY_ROLES,
    PERSON_DRAWER_HOUSEHOLD_PARENT_GUARDIAN_ROLES,
    PERSON_DRAWER_HOUSEHOLD_PICKUP_ROLES,
    normPersonDrawerHouseholdRole,
} from "@/lib/admin/person/personDrawerHouseholdRoles";
import type { PersonHouseholdAdultLinkRow } from "@/lib/admin/person/personDrawerVisibilityTypes";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import {
    resolvePersonOverviewRelatedPeopleGroups,
    type PersonOverviewRelatedPeopleGroup,
} from "@/lib/layout/runtime/resolvePersonOverviewRelatedPeopleGroups";

export const DRAWER_HOUSEHOLD_CONTACTS_MAX_VISIBLE = 4;

export type DrawerHouseholdContactRow = {
    person_id: string;
    display_name: string;
    role_label: string | null;
    role_type: string | null;
    is_primary: boolean;
    phone: string | null;
    email: string | null;
    initials: string;
};

export type DrawerHouseholdContactsProjection = {
    contacts: DrawerHouseholdContactRow[];
    visible: DrawerHouseholdContactRow[];
    overflowCount: number;
    primaryPersonId: string | null;
};

function trimOrNull(value: unknown): string | null {
    const text = String(value ?? "").trim();
    return text || null;
}

function pickDisplay(...values: unknown[]): string | null {
    for (const value of values) {
        const text = trimOrNull(value);
        if (text) return text;
    }
    return null;
}

/** Humanize stored role keys (e.g. emergency_contact → Emergency contact). */
export function formatDrawerHouseholdContactRoleLabel(
    roleType: string | null | undefined,
    roleLabel?: string | null,
): string | null {
    const explicit = trimOrNull(roleLabel);
    if (explicit) return explicit;
    const key = trimOrNull(roleType);
    if (!key || key === "—") return null;
    if (/\s/.test(key)) {
        return key
            .split(/\s+/)
            .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word))
            .join(" ");
    }
    const words = key.split(/[_.-]+/).filter(Boolean);
    if (words.length === 0) return key;
    return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
}

function guardianRank(roleType: string | null | undefined): number {
    const role = normPersonDrawerHouseholdRole(roleType);
    if (isPrimaryContactRoleType(roleType)) return 0;
    if (PERSON_DRAWER_HOUSEHOLD_PARENT_GUARDIAN_ROLES.has(role)) return 1;
    if (PERSON_DRAWER_HOUSEHOLD_EMERGENCY_ROLES.has(role)) return 2;
    if (PERSON_DRAWER_HOUSEHOLD_PICKUP_ROLES.has(role)) return 3;
    return 4;
}

function sortDrawerHouseholdContacts(rows: DrawerHouseholdContactRow[]): DrawerHouseholdContactRow[] {
    return [...rows].sort((a, b) => {
        if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
        const rankDelta = guardianRank(a.role_type) - guardianRank(b.role_type);
        if (rankDelta !== 0) return rankDelta;
        return a.display_name.localeCompare(b.display_name);
    });
}

function dedupeContacts(rows: DrawerHouseholdContactRow[]): DrawerHouseholdContactRow[] {
    const seen = new Set<string>();
    const out: DrawerHouseholdContactRow[] = [];
    for (const row of rows) {
        const key = row.person_id || row.display_name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(row);
    }
    return out;
}

function toDrawerContactRow(input: {
    person_id: string;
    display_name: string;
    role_type?: string | null;
    role_label?: string | null;
    is_primary?: boolean;
    phone?: string | null;
    email?: string | null;
}): DrawerHouseholdContactRow {
    const display_name = input.display_name.trim() || "Unnamed";
    return {
        person_id: input.person_id,
        display_name,
        role_type: trimOrNull(input.role_type),
        role_label: formatDrawerHouseholdContactRoleLabel(input.role_type, input.role_label),
        is_primary: Boolean(input.is_primary),
        phone: trimOrNull(input.phone),
        email: trimOrNull(input.email),
        initials: personDrawerHouseholdInitials(display_name),
    };
}

function lookupHouseholdContactDetails(
    record: Record<string, unknown>,
    personId: string,
): { email: string | null; phone: string | null; display_name: string | null } {
    for (const raw of (record._customer_persons as {
        person_id?: string;
        email?: string | null;
        phone?: string | null;
        _person_name?: string | null;
        name?: string | null;
    }[]) ?? []) {
        if (String(raw.person_id ?? "").trim() !== personId) continue;
        return {
            email: trimOrNull(raw.email),
            phone: trimOrNull(raw.phone),
            display_name: pickDisplay(raw._person_name, raw.name),
        };
    }
    for (const raw of (record._opportunity_persons as {
        person_id?: string;
        email?: string | null;
        phone?: string | null;
        name?: string | null;
    }[]) ?? []) {
        if (String(raw.person_id ?? "").trim() !== personId) continue;
        return {
            email: trimOrNull(raw.email),
            phone: trimOrNull(raw.phone),
            display_name: pickDisplay(raw.name),
        };
    }
    return { email: null, phone: null, display_name: null };
}

function mergeAdultLinksIntoContacts(
    record: Record<string, unknown>,
    contacts: DrawerHouseholdContactRow[],
    excludePersonId?: string | null,
): DrawerHouseholdContactRow[] {
    const byPersonId = new Map(contacts.map((row) => [row.person_id, row]));
    for (const raw of (record._household_adult_links as PersonHouseholdAdultLinkRow[] | undefined) ?? []) {
        const personId = trimOrNull(raw.person_id);
        if (!personId || personId === excludePersonId || byPersonId.has(personId)) continue;
        const displayName = pickDisplay(raw.display_name) ?? "Unnamed";
        const details = lookupHouseholdContactDetails(record, personId);
        byPersonId.set(
            personId,
            toDrawerContactRow({
                person_id: personId,
                display_name: pickDisplay(displayName, details.display_name) ?? "Unnamed",
                role_type: raw.role_type,
                role_label: raw.role_label,
                is_primary: raw.is_household_primary_contact === true || raw.is_primary === true,
                email: details.email,
                phone: details.phone,
            }),
        );
    }
    return sortDrawerHouseholdContacts([...byPersonId.values()]);
}

function projectVisible(
    contacts: DrawerHouseholdContactRow[],
    maxVisible: number,
): Pick<DrawerHouseholdContactsProjection, "visible" | "overflowCount"> {
    const visible = contacts.slice(0, maxVisible);
    return {
        visible,
        overflowCount: Math.max(0, contacts.length - visible.length),
    };
}

/** Lead / opportunity drawer — primary + guardian/contact adults from existing VM fields. */
export function resolveOpportunityDrawerHouseholdContacts(
    record: ProofRuntimeRecord,
    options?: { maxVisible?: number },
): DrawerHouseholdContactsProjection {
    const maxVisible = options?.maxVisible ?? DRAWER_HOUSEHOLD_CONTACTS_MAX_VISIBLE;
    const primaryPersonId = resolveLeadSummaryPrimaryPersonId(record);

    const primaryName = pickDisplay(
        record["person.primary_contact_name"],
        record._person_name,
        buildOpportunityFamilyContactRows(record).find((row) => row.person_id === primaryPersonId)?.name,
    );
    const primaryPhone = pickDisplay(record["person.primary_phone"], record["person.phone"]);
    const primaryEmail = pickDisplay(record["person.primary_email"], record["person.email"]);

    const contacts: DrawerHouseholdContactRow[] = [];

    if (primaryPersonId && primaryName) {
        contacts.push(
            toDrawerContactRow({
                person_id: primaryPersonId,
                display_name: primaryName,
                role_type: "primary_contact",
                role_label: "Primary contact",
                is_primary: true,
                phone: primaryPhone,
                email: primaryEmail,
            }),
        );
    }

    const additional = sortOpportunityFamilyContactRows(
        buildOpportunityFamilyContactRows(record),
        primaryPersonId,
    ).map((row) =>
        toDrawerContactRow({
            person_id: row.person_id,
            display_name: row.name ?? "Unnamed",
            role_type: row.role_type,
            phone: row.phone ?? null,
            email: row.email ?? null,
        }),
    );

    contacts.push(...additional);

    const merged = mergeAdultLinksIntoContacts(record, dedupeContacts(contacts));
    const { visible, overflowCount } = projectVisible(merged, maxVisible);

    return {
        contacts: merged,
        visible,
        overflowCount,
        primaryPersonId,
    };
}

function flattenPersonGroups(groups: PersonOverviewRelatedPeopleGroup[]): DrawerHouseholdContactRow[] {
    return groups.flatMap((group) =>
        group.members.map((member) =>
            toDrawerContactRow({
                person_id: member.person_id ?? member.display_name,
                display_name: member.display_name,
                role_type: member.role_type,
                role_label: member.role_label ?? group.title,
                is_primary: member.is_primary,
            }),
        ),
    );
}

/** Person drawer — related adults excluding the viewing person (viewing person shown via section fields). */
export function resolvePersonDrawerHouseholdContacts(
    record: ProofRuntimeRecord,
    options?: { maxVisible?: number },
): DrawerHouseholdContactsProjection {
    const maxVisible = options?.maxVisible ?? DRAWER_HOUSEHOLD_CONTACTS_MAX_VISIBLE;
    const viewingPersonId = trimOrNull(record.id ?? record["person.id"]);
    const groups = resolvePersonOverviewRelatedPeopleGroups(record);
    const contacts = sortDrawerHouseholdContacts(flattenPersonGroups(groups));
    const merged = mergeAdultLinksIntoContacts(
        record,
        contacts.filter((row) => !viewingPersonId || row.person_id !== viewingPersonId),
        viewingPersonId,
    );
    const { visible, overflowCount } = projectVisible(merged, maxVisible);
    return {
        contacts: merged,
        visible,
        overflowCount,
        primaryPersonId: viewingPersonId,
    };
}

/** Queue future-proofing: same resolver entry point keyed by record shape. */
export function resolveDrawerHouseholdContacts(
    record: ProofRuntimeRecord,
    options?: { maxVisible?: number; entityType?: "opportunity" | "person" | "child" },
): DrawerHouseholdContactsProjection {
    const entityType = options?.entityType;
    if (entityType === "person") {
        return resolvePersonDrawerHouseholdContacts(record, options);
    }
    if (entityType === "opportunity" || record["opportunity.primary_person_id"] != null || record._opportunity_persons) {
        return resolveOpportunityDrawerHouseholdContacts(record, options);
    }
    return resolvePersonDrawerHouseholdContacts(record, options);
}

export function opportunityDrawerHouseholdContactsHasContent(record: ProofRuntimeRecord): boolean {
    return resolveOpportunityDrawerHouseholdContacts(record).contacts.length > 0;
}

export function personDrawerHouseholdContactsHasContent(record: ProofRuntimeRecord): boolean {
    return resolvePersonDrawerHouseholdContacts(record).contacts.length > 0;
}
