/**
 * Household Card — operational evidence assembly (Use Case 1).
 *
 * Operational question: "Who belongs to this household, and who can I contact?"
 * Archetype: Identity.
 *
 * ARCHITECTURE LAW: this card owns no truth and never fetches. It assembles an
 * operational answer by *observing* the already-loaded Opportunity Focus Panel
 * record (`OpportunityDrawerViewModel.above_fold.record`). Every projection here
 * is pure over `record` — `resolveOpportunityDrawerHouseholdContacts`,
 * `mapRawInquiryChildrenToDrawerRows`, and the flattened `person.*` paint fields.
 * Collapsed → Expanded → Focused Evidence is local UI perspective state only;
 * none of it triggers I/O.
 *
 * @see docs/platform/operator/operational-grammar.md
 * @see docs/platform/operator/card-language.md
 * @see docs/platform/operator/card-archetypes.md
 * @see docs/platform/operator/card-interaction-expansion-doctrine.md (System 5B — Expand)
 */

import { mapRawInquiryChildrenToDrawerRows } from "@/lib/admin/drawer/inquiryChildrenDrawerRows";
import {
    formatDrawerHouseholdContactRoleLabel,
    resolveOpportunityDrawerHouseholdContacts,
    type DrawerHouseholdContactRow,
} from "@/lib/layout/runtime/resolveDrawerHouseholdContacts";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import {
    PERSON_DRAWER_HOUSEHOLD_BILLING_ROLES,
    PERSON_DRAWER_HOUSEHOLD_EMERGENCY_ROLES,
    PERSON_DRAWER_HOUSEHOLD_PICKUP_ROLES,
    normPersonDrawerHouseholdRole,
} from "@/lib/admin/person/personDrawerHouseholdRoles";
import { resolveLeadDrawerHeaderContext } from "@/lib/layout/runtime/resolveLeadDrawerHeaderContext";

/** One contact row, normalized for card presentation (no person-level fetch). */
export type HouseholdEvidenceContact = {
    personId: string;
    name: string;
    roleLabel: string | null;
    isPrimary: boolean;
    phone: string | null;
    email: string | null;
    initials: string;
};

/** One child row, projected from `_inquiry_children` (already loaded). */
export type HouseholdEvidenceChild = {
    id: string;
    name: string;
    detail: string | null;
    status: string | null;
};

/** Stable focusable evidence-group identifiers. */
export type HouseholdEvidenceGroupKey =
    | "primary_contact"
    | "children"
    | "household_members"
    | "emergency_contacts"
    | "authorized_pickups"
    | "billing_contact";

export type HouseholdEvidenceGroup = {
    key: HouseholdEvidenceGroupKey;
    title: string;
    /** Contact-shaped rows (adults). Empty for child groups. */
    contacts: HouseholdEvidenceContact[];
    /** Child-shaped rows. Empty for adult groups. */
    children: HouseholdEvidenceChild[];
    count: number;
};

export type HouseholdCardEvidence = {
    householdLabel: string;
    /** One-line answer for collapsed scan (card insight). */
    answerLine: string;
    primaryContact: HouseholdEvidenceContact | null;
    /** Best-known primary contact channel for collapsed read. */
    primaryPhone: string | null;
    primaryEmail: string | null;
    /** Preferred contact method, only when present in the loaded record (else null → documented gap). */
    preferredContactMethod: string | null;
    childCount: number;
    additionalContactCount: number;
    emergencyContactCount: number;
    authorizedPickupCount: number;
    /** Ordered, non-empty evidence groups for the expanded/focused perspectives. */
    groups: HouseholdEvidenceGroup[];
    /** Amber operator warning when a critical relationship/contact is missing. */
    missingCriticalWarning: string | null;
    /** Last-updated/source metadata, only when already present on the record. */
    lastUpdatedLabel: string | null;
};

function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

function initialsFor(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
    return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

function toEvidenceContact(row: DrawerHouseholdContactRow): HouseholdEvidenceContact {
    return {
        personId: row.person_id,
        name: row.display_name,
        roleLabel: row.is_primary ? "Primary" : row.role_label,
        isPrimary: row.is_primary,
        phone: row.phone,
        email: row.email,
        initials: row.initials || initialsFor(row.display_name),
    };
}

function classifyRole(roleType: string | null): "emergency" | "pickup" | "billing" | "guardian" {
    const role = normPersonDrawerHouseholdRole(roleType);
    if (PERSON_DRAWER_HOUSEHOLD_EMERGENCY_ROLES.has(role)) return "emergency";
    if (PERSON_DRAWER_HOUSEHOLD_PICKUP_ROLES.has(role)) return "pickup";
    if (PERSON_DRAWER_HOUSEHOLD_BILLING_ROLES.has(role)) return "billing";
    return "guardian";
}

function childDetail(row: ReturnType<typeof mapRawInquiryChildrenToDrawerRows>[number]): string | null {
    const parts: string[] = [];
    const age = trimOrNull(row.age);
    if (age) parts.push(/\D/.test(age) ? age : `Age ${age}`);
    const program = trimOrNull(row.desired_program_label) ?? trimOrNull(row.desired_program_type);
    if (program) parts.push(program);
    return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Assemble the Household operational answer from the loaded opportunity record.
 * Pure projection — safe to call inside render/useMemo; performs no I/O.
 */
export function buildHouseholdCardEvidence(
    record: Record<string, unknown>,
    fallbackTitle?: string,
): HouseholdCardEvidence {
    const header = resolveLeadDrawerHeaderContext(record);
    const householdLabel =
        trimOrNull(header.householdLabel) ?? trimOrNull(fallbackTitle) ?? "Household";

    // Observe the already-loaded household projection (no fetch). Pull the full
    // list so counts/groups are complete; presentation slices happen in the card.
    const projection = resolveOpportunityDrawerHouseholdContacts(record as ProofRuntimeRecord, {
        maxVisible: Number.MAX_SAFE_INTEGER,
    });
    const contacts = projection.contacts;

    const primaryRow = contacts.find((c) => c.is_primary) ?? null;
    const primaryContact = primaryRow ? toEvidenceContact(primaryRow) : null;

    const nonPrimary = contacts.filter((c) => !c.is_primary);
    const emergencyRows: HouseholdEvidenceContact[] = [];
    const pickupRows: HouseholdEvidenceContact[] = [];
    const billingRows: HouseholdEvidenceContact[] = [];
    const guardianRows: HouseholdEvidenceContact[] = [];
    for (const row of nonPrimary) {
        const evidence = toEvidenceContact(row);
        switch (classifyRole(row.role_type)) {
            case "emergency":
                emergencyRows.push(evidence);
                break;
            case "pickup":
                pickupRows.push(evidence);
                break;
            case "billing":
                billingRows.push(evidence);
                break;
            default:
                guardianRows.push(evidence);
                break;
        }
    }

    const childRows = mapRawInquiryChildrenToDrawerRows(
        (record._inquiry_children as unknown[]) ?? [],
    ).map<HouseholdEvidenceChild>((row) => ({
        id: row.id || row.display_name || "child",
        name: trimOrNull(row.display_name) ?? trimOrNull(row.first_name) ?? "Child",
        detail: childDetail(row),
        status: trimOrNull(row.outcome_status_label) ?? trimOrNull(row.outcome_status_key),
    }));

    const primaryPhone =
        primaryContact?.phone ??
        trimOrNull(record["person.primary_phone"]) ??
        trimOrNull(record["person.secondary_phone"]);
    const primaryEmail =
        primaryContact?.email ??
        trimOrNull(record["person.primary_email"]) ??
        trimOrNull(record["person.secondary_email"]);

    // Preferred contact method: only surfaced when the loaded record already
    // carries it. There is no canonical preference field on the opportunity VM
    // today (documented gap) — never invent one.
    const preferredContactMethod =
        trimOrNull(record["person.preferred_contact_method"]) ??
        trimOrNull(record["person.contact_preference"]);

    const groups: HouseholdEvidenceGroup[] = [];
    if (primaryContact) {
        groups.push({
            key: "primary_contact",
            title: "Primary contact",
            contacts: [primaryContact],
            children: [],
            count: 1,
        });
    }
    if (childRows.length > 0) {
        groups.push({
            key: "children",
            title: "Children",
            contacts: [],
            children: childRows,
            count: childRows.length,
        });
    }
    if (guardianRows.length > 0) {
        groups.push({
            key: "household_members",
            title: "Additional contacts",
            contacts: guardianRows,
            children: [],
            count: guardianRows.length,
        });
    }
    if (emergencyRows.length > 0) {
        groups.push({
            key: "emergency_contacts",
            title: "Emergency contacts",
            contacts: emergencyRows,
            children: [],
            count: emergencyRows.length,
        });
    }
    if (pickupRows.length > 0) {
        groups.push({
            key: "authorized_pickups",
            title: "Authorized pickups",
            contacts: pickupRows,
            children: [],
            count: pickupRows.length,
        });
    }
    if (billingRows.length > 0) {
        groups.push({
            key: "billing_contact",
            title: "Billing contact",
            contacts: billingRows,
            children: [],
            count: billingRows.length,
        });
    }

    const childCount = childRows.length;
    const additionalContactCount = guardianRows.length;
    const emergencyContactCount = emergencyRows.length;
    const authorizedPickupCount = pickupRows.length;

    const answerLine = buildAnswerLine({
        primaryContact,
        childCount,
        additionalContactCount,
        householdLabel,
    });

    const missingCriticalWarning =
        !primaryContact ? "No primary contact on file"
        : emergencyContactCount === 0 ? "No emergency contact on file"
        : null;

    const lastUpdatedLabel = (() => {
        const updated = trimOrNull(record.updated_at);
        return updated ? `Updated ${updated.slice(0, 10)}` : null;
    })();

    return {
        householdLabel,
        answerLine,
        primaryContact,
        primaryPhone,
        primaryEmail,
        preferredContactMethod,
        childCount,
        additionalContactCount,
        emergencyContactCount,
        authorizedPickupCount,
        groups,
        missingCriticalWarning,
        lastUpdatedLabel,
    };
}

function buildAnswerLine(input: {
    primaryContact: HouseholdEvidenceContact | null;
    childCount: number;
    additionalContactCount: number;
    householdLabel: string;
}): string {
    const { primaryContact, childCount } = input;
    if (!primaryContact) {
        return childCount > 0
            ? `${childCount} ${childCount === 1 ? "child" : "children"} · primary contact needed`
            : "Primary contact needed";
    }
    const childClause =
        childCount > 0 ? `${childCount} ${childCount === 1 ? "child" : "children"}` : "no children yet";
    return `${primaryContact.name} is the primary contact · ${childClause}`;
}

export function formatHouseholdRoleLabel(
    roleType: string | null,
    roleLabel?: string | null,
): string | null {
    return formatDrawerHouseholdContactRoleLabel(roleType, roleLabel);
}
