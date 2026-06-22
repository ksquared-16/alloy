/**
 * Relationship-based contact block resolution for layout runtime.
 *
 * Resolves household/person relationships instead of hardcoded secondary-contact scalars.
 */

import {
    buildOpportunityFamilyContactRows,
    resolveLeadSummaryPrimaryPersonId,
} from "@/lib/admin/drawer/opportunityFamilyContactsOrdering";
import {
    contactRoleFieldRefs,
    normalizeLayoutEditorContactRole,
    type LayoutEditorContactRole,
    type LayoutEditorContactResolutionRole,
} from "@/lib/layout/layoutEditorContactRoles";
import { resolveOpportunityPrimaryContactPerson } from "@/lib/layout/runtime/resolveOpportunityPrimaryContactPerson";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export type LayoutEditorContactBlockPerson = {
    personId: string;
    displayName: string;
    phone: string | null;
    email: string | null;
};

const BILLING_ROLE_KEYS = new Set(["billing_contact", "billing", "payer", "financial_contact"]);
const EMERGENCY_ROLE_KEYS = new Set(["emergency_contact", "emergency"]);
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

function normRoleKey(raw: string | null | undefined): string {
    return String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}

function pickDisplay(...values: unknown[]): string | null {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (text) return text;
    }
    return null;
}

function isHouseholdPrimaryContactRole(roleType: string | null | undefined): boolean {
    const key = normRoleKey(roleType);
    return key === "primary_contact" || key === "primary";
}

function rowMatchesRole(roleType: string | null | undefined, role: LayoutEditorContactResolutionRole): boolean {
    const key = normRoleKey(roleType);
    if (!key) return false;
    if (role === "billing") return BILLING_ROLE_KEYS.has(key) || key.includes("billing") || key.includes("payer");
    if (role === "emergency") return EMERGENCY_ROLE_KEYS.has(key) || key.includes("emergency");
    if (role === "parents") {
        return PARENT_ROLE_KEYS.has(key) || key.includes("parent") || key.includes("guardian");
    }
    return false;
}

function familyRows(record: ProofRuntimeRecord) {
    return buildOpportunityFamilyContactRows(record as Record<string, unknown>);
}

/** Resolve the person shown in a contact_block for the configured relationship role. */
export function resolveLayoutEditorContactBlockPerson(
    record: ProofRuntimeRecord,
    roleInput: LayoutEditorContactRole,
    options?: { excludedPersonIds?: ReadonlySet<string> },
): LayoutEditorContactBlockPerson | null {
    const role = normalizeLayoutEditorContactRole(roleInput);
    const excluded = options?.excludedPersonIds ?? new Set<string>();
    const primaryId = resolveLeadSummaryPrimaryPersonId(record as Record<string, unknown>);

    if (role === "primary") {
        const primary = resolveOpportunityPrimaryContactPerson(record as Record<string, unknown>);
        if (primary.hasPersonBinding) {
            const personId = primary.personId ?? resolveLeadSummaryPrimaryPersonId(record as Record<string, unknown>) ?? "";
            if (personId || primary.displayName) {
                return {
                    personId: personId || primary.displayName || "",
                    displayName: primary.displayName ?? "",
                    phone: primary.phone,
                    email: primary.email,
                };
            }
        }
        const primaryId = resolveLeadSummaryPrimaryPersonId(record as Record<string, unknown>);
        if (!primaryId) return null;
        const row = familyRows(record).find((candidate) => candidate.person_id === primaryId);
        if (!row) return null;
        return {
            personId: primaryId,
            displayName: pickDisplay(row.name) ?? "",
            phone: pickDisplay(row.phone),
            email: pickDisplay(row.email),
        };
    }

    const candidates = familyRows(record).filter((row) => {
        const personId = String(row.person_id ?? "").trim();
        if (!personId) return false;
        if (primaryId && personId === primaryId) return false;
        if (excluded.has(personId)) return false;
        if (role !== "parents" && isHouseholdPrimaryContactRole(row.role_type)) return false;
        return rowMatchesRole(row.role_type, role);
    });

    const match =
        candidates[0]
        ?? (role === "parents" ?
            familyRows(record).find((row) => {
                const personId = String(row.person_id ?? "").trim();
                if (!personId) return false;
                if (primaryId && personId === primaryId) return false;
                if (excluded.has(personId)) return false;
                if (isHouseholdPrimaryContactRole(row.role_type)) return false;
                return Boolean(pickDisplay(row.name));
            })
        :   undefined);
    if (!match) return null;

    return {
        personId: match.person_id,
        displayName: pickDisplay(match.name) ?? "",
        phone: pickDisplay(match.phone),
        email: pickDisplay(match.email),
    };
}

/** Overlay resolved contact person onto role-scoped person.* field refs for block rendering. */
export function overlayLayoutEditorContactBlockRecord(
    record: ProofRuntimeRecord,
    roleInput: LayoutEditorContactRole,
    person: LayoutEditorContactBlockPerson | null,
): ProofRuntimeRecord {
    const role = normalizeLayoutEditorContactRole(roleInput);
    const refs =
        role === "parents" ? contactRoleFieldRefs("secondary")
        : role === "billing" ? contactRoleFieldRefs("billing")
        : role === "emergency" ? contactRoleFieldRefs("emergency")
        : contactRoleFieldRefs("primary");

    const mutable: ProofRuntimeRecord = { ...record };
    const empty = { name: "", email: "", phone: "" };
    const values =
        person ?
            { name: person.displayName, email: person.email ?? "", phone: person.phone ?? "" }
        :   empty;

    mutable[refs.name] = values.name;
    mutable[refs.email] = values.email;
    mutable[refs.phone] = values.phone;
    return mutable;
}

export function shouldHideEmptyLayoutEditorContactBlock(
    role: LayoutEditorContactRole,
    person: LayoutEditorContactBlockPerson | null,
): boolean {
    if (person?.displayName?.trim()) return false;
    return role !== "primary";
}
