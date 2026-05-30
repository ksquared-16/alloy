import { personDisplayName } from "@/lib/adminFormatters";
import {
    personDrawerHouseholdAgeLabel,
    personDrawerHouseholdInitials,
} from "@/lib/admin/person/personDrawerHouseholdDisplay";
import {
    guardianRolePrecedence,
    normPersonDrawerHouseholdRole,
    PERSON_DRAWER_HOUSEHOLD_EMERGENCY_ROLES,
    PERSON_DRAWER_HOUSEHOLD_PARENT_GUARDIAN_ROLES,
    PERSON_DRAWER_HOUSEHOLD_PICKUP_ROLES,
} from "@/lib/admin/person/personDrawerHouseholdRoles";
import { customerPersonRowIsHouseholdPrimaryContact } from "@/lib/admin/person/householdPrimaryContact";
import { resolvePersonDrawerParentRelationshipRoles } from "@/lib/admin/person/personDrawerParentRelationshipRoles";
import type {
    PersonEnrollmentMirrorRow,
    PersonHouseholdAdultLinkRow,
    PersonHouseholdChildLinkRow,
    PersonHouseholdContextRow,
    PersonSiblingLinkRow,
} from "@/lib/admin/person/personDrawerVisibilityTypes";

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

export type PersonDrawerHouseholdLinkState = "openable" | "unlinked";

export type PersonDrawerHouseholdMember = {
    person_id: string | null;
    customer_member_id?: string | null;
    display_name: string;
    role_label: string | null;
    role_type: string | null;
    is_primary: boolean;
    role_chips: string[];
    initials: string;
    photo_url: string | null;
};

export type PersonDrawerHouseholdChildMember = {
    person_id: string | null;
    customer_member_id: string | null;
    display_name: string;
    role_label: string | null;
    age_label: string | null;
    status_label: string | null;
    program_label: string | null;
    location_label: string | null;
    room_label: string | null;
    link_state: PersonDrawerHouseholdLinkState;
    initials: string;
    photo_url: string | null;
};

export function resolvePersonDrawerHouseholdChildLinkState(
    personId: string | null | undefined
): PersonDrawerHouseholdLinkState {
    return trimOrNull(personId) ? "openable" : "unlinked";
}

function linkIsHouseholdPrimaryContact(link: PersonHouseholdAdultLinkRow): boolean {
    if (link.is_household_primary_contact === true) return true;
    return customerPersonRowIsHouseholdPrimaryContact(link);
}

function guardianRoleChips(link: PersonHouseholdAdultLinkRow): string[] {
    if (linkIsHouseholdPrimaryContact(link)) {
        return ["Primary"];
    }
    return [];
}

function roleChipsForAdult(link: PersonHouseholdAdultLinkRow): string[] {
    const role = normPersonDrawerHouseholdRole(link.role_type);
    if (PERSON_DRAWER_HOUSEHOLD_PARENT_GUARDIAN_ROLES.has(role)) {
        return guardianRoleChips(link);
    }
    const label = trimOrNull(link.role_label);
    return label ? [label] : [];
}

export type PersonDrawerHouseholdGroup = {
    customer_id: string;
    household_label: string | null;
    guardians: PersonDrawerHouseholdMember[];
    children: PersonDrawerHouseholdChildMember[];
    emergency_contacts: PersonDrawerHouseholdMember[];
    authorized_pickups: PersonDrawerHouseholdMember[];
};

export type PersonDrawerHouseholdModel = {
    groups: PersonDrawerHouseholdGroup[];
};

export type PersonDrawerHouseholdResolveOptions = {
    /** Excludes this person from the children column (child drawer subject). */
    viewing_person_id?: string | null;
};

function enrollmentContextForChild(
    customerMemberId: string | null,
    mirror: PersonEnrollmentMirrorRow[]
): {
    status_label: string | null;
    program_label: string | null;
    location_label: string | null;
    room_label: string | null;
} {
    const rows = customerMemberId
        ? mirror.filter((row) => row.customer_member_id === customerMemberId)
        : [];
    if (rows.length === 0) {
        return { status_label: null, program_label: null, location_label: null, room_label: null };
    }
    const row =
        rows.find((r) => trimOrNull(r.program_label) || trimOrNull(r.location_label)) ?? rows[0]!;
    return {
        status_label:
            trimOrNull(row.outcome_status_label) || trimOrNull(row.opportunity_status_label) || null,
        program_label: trimOrNull(row.program_label) || null,
        location_label: trimOrNull(row.location_label) || null,
        room_label: trimOrNull(row.room_label) || null,
    };
}

function childMemberFromLink(
    link: PersonHouseholdChildLinkRow,
    mirror: PersonEnrollmentMirrorRow[]
): PersonDrawerHouseholdChildMember {
    const display_name = trimOrNull(link.display_name) || "Unnamed child";
    const ctx = enrollmentContextForChild(link.customer_member_id, mirror);
    const person_id = trimOrNull(link.person_id);
    const age_label =
        trimOrNull(link.age_label) ?? personDrawerHouseholdAgeLabel(link.date_of_birth);
    const status_label = trimOrNull(link.status_label) ?? ctx.status_label;
    return {
        person_id,
        customer_member_id: link.customer_member_id,
        display_name,
        role_label: null,
        age_label,
        status_label,
        program_label: ctx.program_label,
        location_label: ctx.location_label,
        room_label: ctx.room_label,
        link_state: resolvePersonDrawerHouseholdChildLinkState(person_id),
        initials: personDrawerHouseholdInitials(display_name),
        photo_url: trimOrNull(link.photo_url),
    };
}

function childMemberFromSibling(
    link: PersonSiblingLinkRow,
    mirror: PersonEnrollmentMirrorRow[]
): PersonDrawerHouseholdChildMember {
    const display_name = trimOrNull(link.display_name) || "Unnamed child";
    const person_id = trimOrNull(link.person_id);
    const ctx = enrollmentContextForChild(link.customer_member_id, mirror);
    return {
        person_id,
        customer_member_id: link.customer_member_id,
        display_name,
        role_label: "Sibling",
        age_label: null,
        status_label: ctx.status_label,
        program_label: ctx.program_label,
        location_label: ctx.location_label,
        room_label: ctx.room_label,
        link_state: resolvePersonDrawerHouseholdChildLinkState(person_id),
        initials: personDrawerHouseholdInitials(display_name),
        photo_url: null,
    };
}

function adultMemberFromLink(link: PersonHouseholdAdultLinkRow): PersonDrawerHouseholdMember | null {
    const name = trimOrNull(link.display_name);
    if (!name && !link.person_id) return null;
    const role = normPersonDrawerHouseholdRole(link.role_type);
    const role_label =
        trimOrNull(link.role_label) ||
        trimOrNull(link.role_type) ||
        (PERSON_DRAWER_HOUSEHOLD_PARENT_GUARDIAN_ROLES.has(role) ? "Guardian" : null);
    const display_name = name || "Unnamed";
    return {
        person_id: link.person_id ?? null,
        display_name,
        role_label,
        role_type: trimOrNull(link.role_type),
        is_primary: linkIsHouseholdPrimaryContact(link),
        role_chips: roleChipsForAdult(link),
        initials: personDrawerHouseholdInitials(display_name),
        photo_url: null,
    };
}

function sortGuardians(rows: PersonDrawerHouseholdMember[]): PersonDrawerHouseholdMember[] {
    return [...rows].sort((a, b) => {
        if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
        return (
            guardianRolePrecedence(a.role_type) - guardianRolePrecedence(b.role_type) ||
            a.display_name.localeCompare(b.display_name)
        );
    });
}

function dedupeMembers<T extends { person_id: string | null; display_name: string }>(rows: T[]): T[] {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const row of rows) {
        const key = row.person_id ?? row.display_name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(row);
    }
    return out;
}

function dedupeChildren(rows: PersonDrawerHouseholdChildMember[]): PersonDrawerHouseholdChildMember[] {
    const seen = new Set<string>();
    const out: PersonDrawerHouseholdChildMember[] = [];
    for (const row of rows) {
        const key = row.person_id ?? row.customer_member_id ?? row.display_name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(row);
    }
    return out;
}

function guardiansForCustomer(
    adultLinks: PersonHouseholdAdultLinkRow[],
    customer_id: string,
    viewingPersonId: string | null
): PersonDrawerHouseholdMember[] {
    const rows = adultLinks
        .filter((link) => link.customer_id === customer_id)
        .filter((link) =>
            PERSON_DRAWER_HOUSEHOLD_PARENT_GUARDIAN_ROLES.has(normPersonDrawerHouseholdRole(link.role_type))
        )
        .filter((link) => !viewingPersonId || trimOrNull(link.person_id) !== viewingPersonId)
        .map(adultMemberFromLink)
        .filter((row): row is PersonDrawerHouseholdMember => row != null);
    return dedupeMembers(sortGuardians(rows));
}

function partitionNonGuardianAdults(
    adultLinks: PersonHouseholdAdultLinkRow[],
    customer_id: string
): {
    emergency_contacts: PersonDrawerHouseholdMember[];
    authorized_pickups: PersonDrawerHouseholdMember[];
} {
    const emergency_contacts: PersonDrawerHouseholdMember[] = [];
    const authorized_pickups: PersonDrawerHouseholdMember[] = [];
    const seen = new Set<string>();

    for (const link of adultLinks.filter((l) => l.customer_id === customer_id)) {
        const role = normPersonDrawerHouseholdRole(link.role_type);
        if (PERSON_DRAWER_HOUSEHOLD_PARENT_GUARDIAN_ROLES.has(role)) continue;
        const person = adultMemberFromLink(link);
        if (!person) continue;
        const key = person.person_id ?? person.display_name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        if (PERSON_DRAWER_HOUSEHOLD_EMERGENCY_ROLES.has(role)) {
            emergency_contacts.push(person);
        } else if (PERSON_DRAWER_HOUSEHOLD_PICKUP_ROLES.has(role)) {
            authorized_pickups.push(person);
        }
    }

    return { emergency_contacts, authorized_pickups };
}

function childrenForCustomer(
    childLinks: PersonHouseholdChildLinkRow[],
    siblingLinks: PersonSiblingLinkRow[],
    customer_id: string,
    mirror: PersonEnrollmentMirrorRow[],
    viewingPersonId: string | null
): PersonDrawerHouseholdChildMember[] {
    const rows: PersonDrawerHouseholdChildMember[] = [];
    for (const link of childLinks.filter((l) => l.customer_id === customer_id)) {
        const child = childMemberFromLink(link, mirror);
        if (viewingPersonId && child.person_id === viewingPersonId) continue;
        rows.push(child);
    }
    for (const link of siblingLinks.filter((l) => l.customer_id === customer_id)) {
        const child = childMemberFromSibling(link, mirror);
        if (viewingPersonId && child.person_id === viewingPersonId) continue;
        rows.push(child);
    }
    return dedupeChildren(rows);
}

function groupHasContent(group: PersonDrawerHouseholdGroup): boolean {
    return (
        Boolean(group.household_label) ||
        group.guardians.length > 0 ||
        group.children.length > 0 ||
        group.emergency_contacts.length > 0 ||
        group.authorized_pickups.length > 0
    );
}

/**
 * Shared household projection for parent and child person drawers.
 * Guardians + children render as paired columns; emergency and pickups below.
 */
export function resolvePersonDrawerHouseholdModel(
    record: Record<string, unknown>,
    options?: PersonDrawerHouseholdResolveOptions
): PersonDrawerHouseholdModel {
    const viewingPersonId = trimOrNull(options?.viewing_person_id ?? record.id);
    const contexts = ((record._household_context as PersonHouseholdContextRow[] | undefined) ?? []).filter(
        (row) => trimOrNull(row.customer_id)
    );
    const childLinks = ((record._household_child_links as PersonHouseholdChildLinkRow[] | undefined) ?? []).filter(
        (row) => trimOrNull(row.customer_id)
    );
    const adultLinks = ((record._household_adult_links as PersonHouseholdAdultLinkRow[] | undefined) ?? []) ?? [];
    const siblingLinks = ((record._sibling_links as PersonSiblingLinkRow[] | undefined) ?? []) ?? [];
    const mirror = (record._enrollment_mirror as PersonEnrollmentMirrorRow[]) ?? [];
    const rolesByCustomer = resolvePersonDrawerParentRelationshipRoles(record);

    const customerIds = [
        ...new Set([
            ...contexts.map((c) => String(c.customer_id)),
            ...childLinks.map((c) => String(c.customer_id)),
            ...rolesByCustomer.map((r) => r.customer_id),
            ...adultLinks.map((a) => String(a.customer_id)),
            ...siblingLinks.map((s) => String(s.customer_id)),
        ]),
    ];

    const groups: PersonDrawerHouseholdGroup[] = customerIds.map((customer_id) => {
        const roleRow = rolesByCustomer.find((r) => r.customer_id === customer_id);
        const household_label =
            trimOrNull(contexts.find((c) => c.customer_id === customer_id)?.customer_name) ||
            trimOrNull(roleRow?.customer_name) ||
            null;
        const guardians = guardiansForCustomer(adultLinks, customer_id, viewingPersonId);
        const adults = partitionNonGuardianAdults(adultLinks, customer_id);
        const children = childrenForCustomer(
            childLinks,
            siblingLinks,
            customer_id,
            mirror,
            viewingPersonId
        );

        return {
            customer_id,
            household_label,
            guardians,
            children,
            emergency_contacts: adults.emergency_contacts,
            authorized_pickups: adults.authorized_pickups,
        };
    });

    return { groups: groups.filter(groupHasContent) };
}

/** Stamp primary household/child labels on parent record for header first paint. */
export function stampPersonDrawerHouseholdHeaderContext(
    record: Record<string, unknown>
): Record<string, unknown> {
    const model = resolvePersonDrawerHouseholdModel(record, {
        viewing_person_id:
            typeof record.id === "string" || typeof record.id === "number" ? String(record.id) : null,
    });
    const primary = model.groups[0];
    if (!primary) return record;

    const next = { ...record };
    if (primary.household_label) {
        next._parent_primary_household_label = primary.household_label;
    }
    const firstChild = primary.children[0];
    if (firstChild?.display_name) {
        next._parent_primary_child_label = firstChild.display_name;
    }
    const primaryGuardian =
        primary.guardians.find((g) => g.is_primary) ?? primary.guardians[0] ?? null;
    if (primaryGuardian?.display_name) {
        next._parent_primary_guardian_label = primaryGuardian.display_name;
    }
    return next;
}

export function viewingPersonHouseholdDisplayName(record: Record<string, unknown>): string {
    return (
        personDisplayName({
            first_name: record.first_name as string | null | undefined,
            last_name: record.last_name as string | null | undefined,
            full_name: record.full_name as string | null | undefined,
        }) ||
        trimOrNull(record._person_name) ||
        "Unnamed"
    );
}

/** Viewing person as guardian for a household — includes self (excluded from guardians column). */
export function resolveViewingPersonGuardianForCustomer(
    record: Record<string, unknown>,
    customer_id: string,
    viewingPersonId: string | null
): PersonDrawerHouseholdMember | null {
    const pid = trimOrNull(viewingPersonId);
    if (!pid) return null;

    const adultLinks = ((record._household_adult_links as PersonHouseholdAdultLinkRow[] | undefined) ?? []).filter(
        (link) => link.customer_id === customer_id && trimOrNull(link.person_id) === pid
    );

    for (const link of adultLinks) {
        const role = normPersonDrawerHouseholdRole(link.role_type);
        if (!PERSON_DRAWER_HOUSEHOLD_PARENT_GUARDIAN_ROLES.has(role)) continue;
        return adultMemberFromLink(link);
    }

    return null;
}
