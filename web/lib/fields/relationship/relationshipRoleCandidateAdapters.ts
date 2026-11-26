/**
 * Role-specific candidate collection from canonical relationship data bags.
 * Pure — no I/O. Adapters register under the canonical resolver contract.
 */

import {
    customerPersonRowIsHouseholdPrimaryContact,
    resolveHouseholdPrimaryContactPersonIdFromRows,
} from "@/lib/admin/person/householdPrimaryContact";
import type { FormsRelationshipRoleKey } from "@/lib/fields/canonicalFormsRelationshipProviderDerivation";
import type { RelationshipResolutionDataBag } from "@/lib/fields/relationship/canonicalRelationshipContext";

function trim(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

function normRole(raw: unknown): string {
    return String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}

const SECONDARY_ROLE_KEYS = new Set([
    "secondary_contact",
    "secondary",
    "spouse",
    "partner",
]);
const PARENT_ROLE_KEYS = new Set([
    "parent",
    "guardian",
    "co_parent",
    "coparent",
    "spouse",
    "partner",
    "secondary_contact",
    "secondary",
]);
const EMERGENCY_ROLE_KEYS = new Set(["emergency_contact", "emergency"]);
const BILLING_ROLE_KEYS = new Set([
    "billing_contact",
    "billing",
    "payer",
    "financial_contact",
    "billing_responsible",
]);

function isPrimaryRole(roleType: string): boolean {
    const key = normRole(roleType);
    return key === "primary_contact" || key === "primary";
}

function personIdFromCustomerPersonRow(row: Record<string, unknown>): string | null {
    return trim(row.person_id);
}

function personIdsFromCustomerPersonRows(
    rows: ReadonlyArray<Record<string, unknown>> | undefined,
    customerId: string | null,
    roleFilter: (roleKey: string) => boolean,
    excludePersonIds: ReadonlySet<string>,
): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const row of rows ?? []) {
        if (customerId && trim(row.customer_id) !== customerId) continue;
        const personId = personIdFromCustomerPersonRow(row);
        if (!personId || excludePersonIds.has(personId) || seen.has(personId)) continue;
        const roleKey = normRole(row.role_type);
        if (!roleKey || isPrimaryRole(roleKey)) continue;
        if (!roleFilter(roleKey)) continue;
        seen.add(personId);
        out.push(personId);
    }
    return out;
}

function personIdsFromOpportunityPersonRows(
    rows: ReadonlyArray<Record<string, unknown>> | undefined,
    roleFilter: (roleKey: string) => boolean,
    excludePersonIds: ReadonlySet<string>,
): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const row of rows ?? []) {
        const personId = personIdFromCustomerPersonRow(row);
        if (!personId || excludePersonIds.has(personId) || seen.has(personId)) continue;
        const roleKey = normRole(row.role_type);
        if (!roleKey || isPrimaryRole(roleKey)) continue;
        if (!roleFilter(roleKey)) continue;
        seen.add(personId);
        out.push(personId);
    }
    return out;
}

function personIdsFromMemberContactLinks(
    links: ReadonlyArray<Record<string, unknown>> | undefined,
    memberId: string | null,
    roleFilter: (roleKey: string) => boolean,
): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const link of links ?? []) {
        if (memberId && trim(link.customer_member_id) !== memberId) continue;
        if (link.is_active === false) continue;
        const roleKey = normRole(link.role_key);
        if (!roleFilter(roleKey)) continue;
        const contact = link.contact as Record<string, unknown> | undefined;
        const personId = trim(contact?.person_id);
        if (!personId || seen.has(personId)) continue;
        seen.add(personId);
        out.push(personId);
    }
    return out;
}

export function collectPrimaryContactPersonCandidates(args: {
    customerId: string | null;
    data: RelationshipResolutionDataBag;
}): { personIds: string[]; conflictingSignals: boolean } {
    const { customerId, data } = args;
    const signals = new Set<string>();

    const contactPersonId = trim(data.contactRow?.person_id);
    if (contactPersonId) signals.add(contactPersonId);

    if (customerId) {
        const fromRows = resolveHouseholdPrimaryContactPersonIdFromRows(
            (data.customerPersonRows ?? []) as Parameters<typeof resolveHouseholdPrimaryContactPersonIdFromRows>[0],
            customerId,
        );
        if (fromRows) signals.add(fromRows);
    }

    for (const row of data.customerPersonRows ?? []) {
        if (customerId && trim(row.customer_id) !== customerId) continue;
        if (!customerPersonRowIsHouseholdPrimaryContact(row)) continue;
        const personId = personIdFromCustomerPersonRow(row);
        if (personId) signals.add(personId);
    }

    const primaryPersonId = trim(data.customerRow?.primary_contact_id
        ? data.contactRow?.person_id
        : null);
    void primaryPersonId;

    return {
        personIds: [...signals],
        conflictingSignals: signals.size > 1,
    };
}

export function collectRolePersonCandidates(
    role: FormsRelationshipRoleKey,
    args: {
        customerId: string | null;
        customerMemberId: string | null;
        data: RelationshipResolutionDataBag;
        excludePrimaryPersonId: string | null;
    },
): string[] {
    const exclude = new Set<string>();
    if (args.excludePrimaryPersonId) exclude.add(args.excludePrimaryPersonId);

    if (role === "primary") {
        return collectPrimaryContactPersonCandidates({
            customerId: args.customerId,
            data: args.data,
        }).personIds;
    }

    if (role === "secondary") {
        const fromCustomer = personIdsFromCustomerPersonRows(
            args.data.customerPersonRows,
            args.customerId,
            (key) => SECONDARY_ROLE_KEYS.has(key),
            exclude,
        );
        const fromOpp = personIdsFromOpportunityPersonRows(
            args.data.opportunityPersonRows,
            (key) => SECONDARY_ROLE_KEYS.has(key),
            exclude,
        );
        return [...new Set([...fromCustomer, ...fromOpp])];
    }

    if (role === "parents") {
        const fromCustomer = personIdsFromCustomerPersonRows(
            args.data.customerPersonRows,
            args.customerId,
            (key) => PARENT_ROLE_KEYS.has(key) || key.includes("parent") || key.includes("guardian"),
            exclude,
        );
        const fromOpp = personIdsFromOpportunityPersonRows(
            args.data.opportunityPersonRows,
            (key) => PARENT_ROLE_KEYS.has(key) || key.includes("parent") || key.includes("guardian"),
            exclude,
        );
        return [...new Set([...fromCustomer, ...fromOpp])];
    }

    if (role === "emergency") {
        const fromMember = personIdsFromMemberContactLinks(
            args.data.customerMemberContactLinks,
            args.customerMemberId,
            (key) => EMERGENCY_ROLE_KEYS.has(key) || key.includes("emergency"),
        );
        if (fromMember.length > 0) return fromMember;
        return personIdsFromCustomerPersonRows(
            args.data.customerPersonRows,
            args.customerId,
            (key) => EMERGENCY_ROLE_KEYS.has(key) || key.includes("emergency"),
            exclude,
        );
    }

    if (role === "billing") {
        const fromMember = personIdsFromMemberContactLinks(
            args.data.customerMemberContactLinks,
            args.customerMemberId,
            (key) => BILLING_ROLE_KEYS.has(key) || key.includes("billing") || key.includes("payer"),
        );
        const fromCustomer = personIdsFromCustomerPersonRows(
            args.data.customerPersonRows,
            args.customerId,
            (key) => BILLING_ROLE_KEYS.has(key) || key.includes("billing") || key.includes("payer"),
            exclude,
        );
        const fromOpp = personIdsFromOpportunityPersonRows(
            args.data.opportunityPersonRows,
            (key) => BILLING_ROLE_KEYS.has(key) || key.includes("billing") || key.includes("payer"),
            exclude,
        );
        return [...new Set([...fromMember, ...fromCustomer, ...fromOpp])];
    }

    return [];
}

/** Parent/guardian role keys per Person — one row per Person in P4; roles aggregated on the item. */
export function collectParentRoleRefsByPersonId(args: {
    customerId: string | null;
    data: RelationshipResolutionDataBag;
    excludePrimaryPersonId: string | null;
}): Map<string, string[]> {
    const map = new Map<string, string[]>();
    const exclude = new Set<string>();
    if (args.excludePrimaryPersonId) exclude.add(args.excludePrimaryPersonId);

    const addRole = (personId: string, roleKey: string) => {
        const roles = map.get(personId) ?? [];
        if (!roles.includes(roleKey)) roles.push(roleKey);
        map.set(personId, roles);
    };

    const parentRoleFilter = (key: string) =>
        PARENT_ROLE_KEYS.has(key) || key.includes("parent") || key.includes("guardian");

    for (const row of args.data.customerPersonRows ?? []) {
        if (args.customerId && trim(row.customer_id) !== args.customerId) continue;
        const personId = personIdFromCustomerPersonRow(row);
        if (!personId || exclude.has(personId)) continue;
        const roleKey = normRole(row.role_type);
        if (!roleKey || isPrimaryRole(roleKey) || !parentRoleFilter(roleKey)) continue;
        addRole(personId, roleKey);
    }

    for (const row of args.data.opportunityPersonRows ?? []) {
        const personId = personIdFromCustomerPersonRow(row);
        if (!personId || exclude.has(personId)) continue;
        const roleKey = normRole(row.role_type);
        if (!roleKey || isPrimaryRole(roleKey) || !parentRoleFilter(roleKey)) continue;
        addRole(personId, roleKey);
    }

    return map;
}
