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
    contactBlockResolutionMode,
    contactRoleFieldRefs,
    LAYOUT_CONTACT_BLOCK_VISIBILITY_PATHS,
    type LayoutEditorContactRole,
    type LayoutEditorContactResolutionMode,
} from "@/lib/layout/layoutEditorContactRoles";
import { resolveOpportunityPrimaryContactPerson } from "@/lib/layout/runtime/resolveOpportunityPrimaryContactPerson";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export type LayoutEditorContactBlockPerson = {
    personId: string;
    displayName: string;
    phone: string | null;
    email: string | null;
    relationshipRole?: string | null;
    isPrimary?: boolean;
};

export type LayoutEditorContactBlockResolution = {
    person: LayoutEditorContactBlockPerson | null;
    persons: LayoutEditorContactBlockPerson[];
    record: LayoutEditorContactBlockPerson | null;
    records: LayoutEditorContactBlockPerson[];
    resolvedCount: number;
    isPrimary: boolean;
    relationshipRole: LayoutEditorContactRole;
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

function rowMatchesRole(roleType: string | null | undefined, mode: LayoutEditorContactResolutionMode): boolean {
    const key = normRoleKey(roleType);
    if (!key) return false;
    if (mode === "billing") return BILLING_ROLE_KEYS.has(key) || key.includes("billing") || key.includes("payer");
    if (mode === "emergency") return EMERGENCY_ROLE_KEYS.has(key) || key.includes("emergency");
    if (mode === "parents") {
        return PARENT_ROLE_KEYS.has(key) || key.includes("parent") || key.includes("guardian");
    }
    return false;
}

function familyRows(record: ProofRuntimeRecord) {
    return buildOpportunityFamilyContactRows(record as Record<string, unknown>);
}

function rowToPerson(row: ReturnType<typeof buildOpportunityFamilyContactRows>[number], primaryId: string | null): LayoutEditorContactBlockPerson {
    const personId = String(row.person_id ?? "").trim();
    return {
        personId,
        displayName: pickDisplay(row.name) ?? "",
        phone: pickDisplay(row.phone),
        email: pickDisplay(row.email),
        relationshipRole: row.role_type ?? null,
        isPrimary: Boolean(primaryId && personId === primaryId),
    };
}

function isEligibleRow(
    row: ReturnType<typeof buildOpportunityFamilyContactRows>[number],
    primaryId: string | null,
    excluded: ReadonlySet<string>,
): boolean {
    const personId = String(row.person_id ?? "").trim();
    if (!personId) return false;
    if (primaryId && personId === primaryId) return false;
    if (excluded.has(personId)) return false;
    return true;
}

function resolvePrimaryPerson(record: ProofRuntimeRecord): LayoutEditorContactBlockPerson | null {
    const primary = resolveOpportunityPrimaryContactPerson(record as Record<string, unknown>);
    if (primary.hasPersonBinding) {
        const personId = primary.personId ?? resolveLeadSummaryPrimaryPersonId(record as Record<string, unknown>) ?? "";
        if (personId || primary.displayName) {
            return {
                personId: personId || primary.displayName || "",
                displayName: primary.displayName ?? "",
                phone: primary.phone,
                email: primary.email,
                isPrimary: true,
            };
        }
    }
    const primaryId = resolveLeadSummaryPrimaryPersonId(record as Record<string, unknown>);
    if (!primaryId) return null;
    const row = familyRows(record).find((candidate) => candidate.person_id === primaryId);
    if (!row) return null;
    return { ...rowToPerson(row, primaryId), isPrimary: true };
}

function resolveMatchingPersons(
    record: ProofRuntimeRecord,
    mode: LayoutEditorContactResolutionMode,
    options?: { excludedPersonIds?: ReadonlySet<string> },
): LayoutEditorContactBlockPerson[] {
    const excluded = options?.excludedPersonIds ?? new Set<string>();
    const primaryId = resolveLeadSummaryPrimaryPersonId(record as Record<string, unknown>);

    if (mode === "primary") {
        const person = resolvePrimaryPerson(record);
        return person ? [person] : [];
    }

    if (mode === "secondary") {
        return familyRows(record)
            .filter((row) => isEligibleRow(row, primaryId, excluded))
            .filter((row) => !isHouseholdPrimaryContactRole(row.role_type))
            .filter((row) => Boolean(pickDisplay(row.name)))
            .map((row) => rowToPerson(row, primaryId));
    }

    if (mode === "parents" || mode === "billing" || mode === "emergency") {
        return familyRows(record)
            .filter((row) => isEligibleRow(row, primaryId, excluded))
            .filter((row) => !isHouseholdPrimaryContactRole(row.role_type))
            .filter((row) => rowMatchesRole(row.role_type, mode))
            .filter((row) => Boolean(pickDisplay(row.name)))
            .map((row) => rowToPerson(row, primaryId));
    }

    if (mode === "any") {
        const row = familyRows(record).find(
            (candidate) => isEligibleRow(candidate, primaryId, excluded) && Boolean(pickDisplay(candidate.name)),
        );
        return row ? [rowToPerson(row, primaryId)] : [];
    }

    return [];
}

/** Resolve all matching persons for a contact_block role (plural semantics for count > 1). */
export function resolveLayoutEditorContactBlockPersons(
    record: ProofRuntimeRecord,
    roleInput: LayoutEditorContactRole,
    options?: { excludedPersonIds?: ReadonlySet<string> },
): LayoutEditorContactBlockPerson[] {
    return resolveMatchingPersons(record, contactBlockResolutionMode(roleInput), options);
}

/** Full contact_block resolution payload for runtime visibility and rendering. */
export function resolveLayoutEditorContactBlockResolution(
    record: ProofRuntimeRecord,
    roleInput: LayoutEditorContactRole,
    options?: { excludedPersonIds?: ReadonlySet<string> },
): LayoutEditorContactBlockResolution {
    const persons = resolveLayoutEditorContactBlockPersons(record, roleInput, options);
    const person = persons[0] ?? null;
    const mode = contactBlockResolutionMode(roleInput);
    return {
        person,
        persons,
        record: person,
        records: persons,
        resolvedCount: persons.length,
        isPrimary: mode === "primary",
        relationshipRole: roleInput,
    };
}

/** Resolve the person shown in a contact_block for the configured relationship role. */
export function resolveLayoutEditorContactBlockPerson(
    record: ProofRuntimeRecord,
    roleInput: LayoutEditorContactRole,
    options?: { excludedPersonIds?: ReadonlySet<string> },
): LayoutEditorContactBlockPerson | null {
    return resolveLayoutEditorContactBlockResolution(record, roleInput, options).person;
}

function writeContactBlockVisibilityPaths(
    mutable: ProofRuntimeRecord,
    resolution: LayoutEditorContactBlockResolution,
): void {
    const hasPerson = Boolean(resolution.person?.displayName?.trim() || resolution.person?.personId);
    mutable[LAYOUT_CONTACT_BLOCK_VISIBILITY_PATHS.resolved] = hasPerson ? "1" : "";
    mutable[LAYOUT_CONTACT_BLOCK_VISIBILITY_PATHS.resolvedCount] = String(resolution.resolvedCount);
    mutable[LAYOUT_CONTACT_BLOCK_VISIBILITY_PATHS.isPrimary] = resolution.isPrimary && hasPerson ? "1" : "";
    mutable[LAYOUT_CONTACT_BLOCK_VISIBILITY_PATHS.isNotPrimary] =
        hasPerson && !resolution.isPrimary ? "1" : "";
}

/** Overlay resolved contact person onto role-scoped person.* field refs for block rendering. */
export function overlayLayoutEditorContactBlockRecord(
    record: ProofRuntimeRecord,
    roleInput: LayoutEditorContactRole,
    resolution: LayoutEditorContactBlockResolution,
): ProofRuntimeRecord {
    const person = resolution.person;
    const refs =
        roleInput === "secondary" || roleInput === "parents" ? contactRoleFieldRefs("secondary")
        : roleInput === "billing" ? contactRoleFieldRefs("billing")
        : roleInput === "emergency" ? contactRoleFieldRefs("emergency")
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
    writeContactBlockVisibilityPaths(mutable, resolution);
    return mutable;
}

export function shouldHideEmptyLayoutEditorContactBlock(
    role: LayoutEditorContactRole,
    person: LayoutEditorContactBlockPerson | null,
): boolean {
    if (person?.displayName?.trim()) return false;
    return role !== "primary";
}
