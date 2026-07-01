/**
 * Resolve opportunity drawer role-scoped contacts (secondary, emergency, billing).
 *
 * Doctrine: each role maps to distinct person.* refKeys — never reuse primary contact scalars.
 */

import { buildOpportunityFamilyContactRows, resolveLeadSummaryPrimaryPersonId } from "@/lib/admin/drawer/opportunityFamilyContactsOrdering";
import { isOpaqueIdValue, pickEntityId } from "./proofRecordContext";
import type { OpportunityPrimaryContactPerson } from "./resolveOpportunityPrimaryContactPerson";

export type OpportunityRoleContactPerson = OpportunityPrimaryContactPerson;

function pickDisplay(...values: unknown[]): string | null {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (!text || isOpaqueIdValue(text)) continue;
        return text;
    }
    return null;
}

function normRoleKey(raw: string | null | undefined): string {
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
    "co_parent",
    "coparent",
    "parent",
    "guardian",
]);
const EMERGENCY_ROLE_KEYS = new Set(["emergency_contact", "emergency"]);
const BILLING_ROLE_KEYS = new Set(["billing_contact", "billing", "payer", "financial_contact"]);

type RoleKind = "secondary" | "emergency" | "billing";

function roleKeysFor(kind: RoleKind): Set<string> {
    if (kind === "secondary") return SECONDARY_ROLE_KEYS;
    if (kind === "emergency") return EMERGENCY_ROLE_KEYS;
    return BILLING_ROLE_KEYS;
}

function vmKeysFor(kind: RoleKind): {
    name: string[];
    email: string[];
    phone: string[];
    personId: string[];
} {
    const prefix =
        kind === "secondary" ? "secondary"
        : kind === "emergency" ? "emergency"
        : "billing";
    return {
        name: [`person.${prefix}_contact_name`, `_${prefix}_contact_name`],
        email: [`person.${prefix}_email`, `person.${prefix}_contact_email`, `_${prefix}_contact_email`],
        phone: [`person.${prefix}_phone`, `person.${prefix}_contact_phone`, `_${prefix}_contact_phone`],
        personId: [`_${prefix}_person_id`, `person.${prefix}_person_id`, `${prefix}_person_id`],
    };
}

function resolveFromFamilyRows(
    vmRecord: Record<string, unknown>,
    kind: RoleKind,
): { personId: string | null; displayName: string | null; phone: string | null; email: string | null } | null {
    const primaryId = resolveLeadSummaryPrimaryPersonId(vmRecord);
    const roleKeys = roleKeysFor(kind);
    const rows = buildOpportunityFamilyContactRows(vmRecord);
    const match =
        rows.find((row) => {
            const personId = String(row.person_id ?? "").trim();
            if (!personId) return false;
            if (primaryId && personId === primaryId) return false;
            const roleKey = normRoleKey(row.role_type);
            if (roleKey === "primary_contact" || roleKey === "primary") return false;
            return roleKeys.has(roleKey) || (kind === "secondary" && (roleKey.includes("parent") || roleKey.includes("guardian")));
        })
        ?? (kind === "secondary" ?
            rows.find((row) => {
                const personId = String(row.person_id ?? "").trim();
                if (!personId) return false;
                if (primaryId && personId === primaryId) return false;
                const roleKey = normRoleKey(row.role_type);
                if (roleKey === "primary_contact" || roleKey === "primary") return false;
                return Boolean(pickDisplay(row.name));
            })
        :   undefined);
    if (!match) return null;
    const personId = String(match.person_id ?? "").trim() || null;
    if (primaryId && personId === primaryId) return null;
    return {
        personId,
        displayName: pickDisplay(match.name),
        phone: pickDisplay(match.phone),
        email: pickDisplay(match.email),
    };
}

function resolveOpportunityRoleContactPerson(
    vmRecord: Record<string, unknown>,
    kind: RoleKind,
): OpportunityRoleContactPerson {
    const keys = vmKeysFor(kind);
    const fromRows = resolveFromFamilyRows(vmRecord, kind);

    const personId =
        pickEntityId(...keys.personId.map((k) => vmRecord[k]))
        ?? fromRows?.personId
        ?? null;

    const displayName =
        pickDisplay(...keys.name.map((k) => vmRecord[k]))
        ?? fromRows?.displayName
        ?? null;

    const phone =
        pickDisplay(...keys.phone.map((k) => vmRecord[k]))
        ?? fromRows?.phone
        ?? null;

    const email =
        pickDisplay(...keys.email.map((k) => vmRecord[k]))
        ?? fromRows?.email
        ?? null;

    return {
        personId,
        displayName,
        phone,
        email,
        hasPersonBinding: Boolean(personId || displayName || phone || email),
    };
}

export function resolveOpportunitySecondaryContactPerson(vmRecord: Record<string, unknown>): OpportunityRoleContactPerson {
    return resolveOpportunityRoleContactPerson(vmRecord, "secondary");
}

export function resolveOpportunityEmergencyContactPerson(vmRecord: Record<string, unknown>): OpportunityRoleContactPerson {
    return resolveOpportunityRoleContactPerson(vmRecord, "emergency");
}

export function resolveOpportunityBillingContactPerson(vmRecord: Record<string, unknown>): OpportunityRoleContactPerson {
    return resolveOpportunityRoleContactPerson(vmRecord, "billing");
}

export function buildSecondaryContactPersonRelation(contact: OpportunityRoleContactPerson) {
    if (!contact.hasPersonBinding) return null;
    return {
        handle: contact.displayName ?? "—",
        entityType: "person" as const,
        ...(contact.personId ? { entityId: contact.personId } : {}),
        fields: {
            secondary_contact_name: contact.displayName ?? "",
            display_name: contact.displayName ?? "",
            phone: contact.phone ?? "",
            email: contact.email ?? "",
        },
    };
}

export function buildEmergencyContactPersonRelation(contact: OpportunityRoleContactPerson) {
    if (!contact.hasPersonBinding) return null;
    return {
        handle: contact.displayName ?? "—",
        entityType: "person" as const,
        ...(contact.personId ? { entityId: contact.personId } : {}),
        fields: {
            emergency_contact_name: contact.displayName ?? "",
            display_name: contact.displayName ?? "",
            phone: contact.phone ?? "",
            email: contact.email ?? "",
        },
    };
}

export function buildBillingContactPersonRelation(contact: OpportunityRoleContactPerson) {
    if (!contact.hasPersonBinding) return null;
    return {
        handle: contact.displayName ?? "—",
        entityType: "person" as const,
        ...(contact.personId ? { entityId: contact.personId } : {}),
        fields: {
            billing_contact_name: contact.displayName ?? "",
            display_name: contact.displayName ?? "",
            phone: contact.phone ?? "",
            email: contact.email ?? "",
        },
    };
}
