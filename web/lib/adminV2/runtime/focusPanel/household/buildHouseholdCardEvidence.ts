/**
 * Household Card — operational evidence assembly (Use Case 1).
 *
 * Operational question: "Who belongs to this household, and who can I contact?"
 * Archetype: Identity.
 *
 * ARCHITECTURE LAW: this card owns no truth and never fetches. It assembles an
 * operational answer by *observing* the `OperationalContext` (the forward-facing
 * card boundary) — specifically `context.truth`, the composed subject record. The
 * card never consumes drawer terminology. Contact rows are assembled from raw
 * `_opportunity_persons` / `_customer_persons` (via `buildOpportunityFamilyContactRows`)
 * so parent/guardian adults are never hidden by drawer projection filters.
 * Collapsed → Expanded → Focused Evidence is local UI perspective state only;
 * none of it triggers I/O.
 *
 * @see docs/platform/operator/operational-context-boundary.md
 * @see docs/platform/operator/household-reference-card.md
 */

import {
    buildOpportunityFamilyContactRows,
} from "@/lib/admin/drawer/opportunityFamilyContactsOrdering";
import {
    relationshipDataBagFromTruthRecord,
    resolvePrimaryContactAuthority,
} from "@/lib/fields/relationship/primaryContactAuthority";
import { mapRawInquiryChildrenToDrawerRows } from "@/lib/admin/drawer/inquiryChildrenDrawerRows";
import {
    formatDrawerHouseholdContactRoleLabel,
    type DrawerHouseholdContactRow,
} from "@/lib/layout/runtime/resolveDrawerHouseholdContacts";
import {
    PERSON_DRAWER_HOUSEHOLD_BILLING_ROLES,
    PERSON_DRAWER_HOUSEHOLD_EMERGENCY_ROLES,
    PERSON_DRAWER_HOUSEHOLD_PARENT_GUARDIAN_ROLES,
    PERSON_DRAWER_HOUSEHOLD_PICKUP_ROLES,
    normPersonDrawerHouseholdRole,
} from "@/lib/admin/person/personDrawerHouseholdRoles";
import { personDrawerHouseholdInitials } from "@/lib/admin/person/personDrawerHouseholdDisplay";
import { resolveLeadDrawerHeaderContext } from "@/lib/layout/runtime/resolveLeadDrawerHeaderContext";
import { formatPhoneUS } from "@/lib/adminFormatters";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    householdEmergencySectionEnabled,
    householdDrillInGroups,
    householdGroupFieldKeys,
    HOUSEHOLD_FIXED_GROUP_KEYS,
} from "@/lib/adminV2/runtime/focusPanel/household/householdNestedSurfaceConfig";
import {
    HOUSEHOLD_SURFACE_ID,
    isNestedGroupEnabled,
    reconcileNestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    formatFocusPanelDate,
    formatFocusPanelDobAgeLine,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelDateDisplay";

/** Display-format a phone for the card (e.g. "(541) 654-3217"); raw fallback if unparseable. */
function formatPhoneForDisplay(raw: unknown): string | null {
    if (raw == null) return null;
    const text = String(raw).trim();
    if (!text) return null;
    const formatted = formatPhoneUS(text);
    return formatted && formatted !== "—" ? formatted : text;
}

/** One contact row, normalized for card presentation (no person-level fetch). */
export type HouseholdEvidenceContact = {
    personId: string;
    name: string;
    roleLabel: string | null;
    isPrimary: boolean;
    phone: string | null;
    email: string | null;
    initials: string;
    /** Identity profile image (evidence model); null → initials fallback. */
    imageUrl?: string | null;
};

/**
 * One child row inside Household — BELONGING-ONLY. Name only (count is the group
 * count). Household never carries child operational truth (age, program, room,
 * schedule, enrollment status) — that belongs to the Children card.
 */
export type HouseholdEvidenceChild = {
    id: string;
    name: string;
    /** Identity profile image (evidence model); null → initials fallback. */
    imageUrl?: string | null;
    dob?: string | null;
    dobAge?: string | null;
    age?: string | null;
    program?: string | null;
    schedule?: string | null;
    startDate?: string | null;
    status?: string | null;
};

/** Stable focusable evidence-group identifiers. */
export type HouseholdEvidenceGroupKey =
    | "primary_contact"
    | "other_parent_guardian"
    | "household_members"
    | "emergency_contacts"
    | "authorized_pickups"
    | "children"
    | "address"
    | "billing_contact";

export type HouseholdEvidenceGroup = {
    key: HouseholdEvidenceGroupKey;
    title: string;
    /** Contact-shaped rows (adults). Empty for child/address groups. */
    contacts: HouseholdEvidenceContact[];
    /** Child-shaped rows. Empty for adult groups. */
    children: HouseholdEvidenceChild[];
    count: number;
    /** Address-only group: formatted line when key === "address". */
    addressLine?: string | null;
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
    /** Household location (reachability) — single line, only when real data is present (never faked). */
    address: string | null;
    childCount: number;
    otherParentGuardianCount: number;
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
        phone: formatPhoneForDisplay(row.phone),
        email: row.email,
        initials: row.initials || initialsFor(row.display_name),
    };
}

type ContactBucket = "other_parent_guardian" | "additional" | "emergency" | "pickup" | "billing";

/**
 * Classify a non-primary adult into an evidence bucket.
 * Parent/guardian roles surface in "Other Parent / Guardian" — never hidden because
 * a primary contact is already resolved (the drawer projection filter excludes
 * role=parent when primary exists; Household reads raw family rows instead).
 */
function classifyContactBucket(roleType: string | null): ContactBucket {
    const role = normPersonDrawerHouseholdRole(roleType);
    if (PERSON_DRAWER_HOUSEHOLD_EMERGENCY_ROLES.has(role)) return "emergency";
    if (PERSON_DRAWER_HOUSEHOLD_PICKUP_ROLES.has(role)) return "pickup";
    if (PERSON_DRAWER_HOUSEHOLD_BILLING_ROLES.has(role)) return "billing";
    if (PERSON_DRAWER_HOUSEHOLD_PARENT_GUARDIAN_ROLES.has(role)) {
        // primary_contact / primary roles on non-primary persons still land here
        // only when they aren't the resolved primary (excluded by person_id upstream).
        if (role === "primary_contact" || role === "primary") return "other_parent_guardian";
        return "other_parent_guardian";
    }
    return "additional";
}

/**
 * Household location line (reachability facet). Composed only from address fields
 * already present on the observed record — returns null when unavailable.
 */
function buildAddressLine(record: Record<string, unknown>): string | null {
    const pick = (...keys: string[]): string | null => {
        for (const key of keys) {
            const value = trimOrNull(record[key]);
            if (value) return value;
        }
        return null;
    };
    const line1 = pick("person.primary_address_line1", "person.address_line1");
    const city = pick("person.primary_address_city", "person.city");
    const state = pick("person.primary_address_state", "person.state");
    const postal = pick("person.primary_address_postal_code", "person.postal_code");

    const cityState = [city, state].filter(Boolean).join(", ");
    const tail = [cityState || null, postal].filter(Boolean).join(" ");
    const parts = [line1, tail || null].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : null;
}

function buildPrimaryContact(
    record: Record<string, unknown>,
    primaryPersonId: string | null,
): HouseholdEvidenceContact | null {
    const familyRows = buildOpportunityFamilyContactRows(record);
    const familyPrimary = primaryPersonId
        ? familyRows.find((r) => r.person_id === primaryPersonId)
        : null;

    const name =
        trimOrNull(record["person.primary_contact_name"]) ??
        trimOrNull(familyPrimary?.name) ??
        null;
    if (!name) return null;

    const phone = formatPhoneForDisplay(
        trimOrNull(record["person.primary_phone"]) ??
            trimOrNull(familyPrimary?.phone) ??
            trimOrNull(record["person.secondary_phone"]),
    );
    const email =
        trimOrNull(record["person.primary_email"]) ??
        trimOrNull(familyPrimary?.email) ??
        trimOrNull(record["person.secondary_email"]);

    return {
        personId: primaryPersonId ?? "primary",
        name,
        roleLabel: "Primary",
        isPrimary: true,
        phone,
        email,
        initials: personDrawerHouseholdInitials(name),
    };
}

/**
 * Options for household evidence assembly. When `nestedConfig` is published, fixed
 * drill-in groups honor enabled flags and field selections from the Household Surface.
 */
export type BuildHouseholdCardEvidenceOptions = {
    nestedConfig?: NestedSurfaceConfig | null;
};

/**
 * Assemble the Household operational answer by observing the Operational Context.
 * Pure projection over `context.truth` — safe inside render/useMemo; no I/O.
 */
export function buildHouseholdCardEvidence(
    context: OperationalContext,
    options: BuildHouseholdCardEvidenceOptions = {},
): HouseholdCardEvidence {
    const record = context.truth;
    const header = resolveLeadDrawerHeaderContext(record);
    const householdLabel =
        trimOrNull(header.householdLabel) ?? trimOrNull(context.subject.label) ?? "Household";

    const customerId = trimOrNull(record.customer_id) ?? trimOrNull((record._household_context as { customer_id?: string }[] | undefined)?.[0]?.customer_id);
    const primaryAuthority = resolvePrimaryContactAuthority({
        data: relationshipDataBagFromTruthRecord(record, customerId),
        customerId,
        preferOpportunityPointer: true,
    });
    const primaryPersonId = primaryAuthority.target_person_id;
    const primaryContact = buildPrimaryContact(record, primaryPersonId);

    // Read ALL family rows — do NOT use resolveOpportunityDrawerHouseholdContacts
    // which filters out role=parent when a primary is resolved.
    const familyRows = buildOpportunityFamilyContactRows(record);

    const otherParentGuardianRows: HouseholdEvidenceContact[] = [];
    const additionalRows: HouseholdEvidenceContact[] = [];
    const emergencyRows: HouseholdEvidenceContact[] = [];
    const pickupRows: HouseholdEvidenceContact[] = [];
    const billingRows: HouseholdEvidenceContact[] = [];

    for (const row of familyRows) {
        // Never duplicate the resolved primary person in any other group.
        if (primaryPersonId && row.person_id === primaryPersonId) continue;

        const drawerRow: DrawerHouseholdContactRow = {
            person_id: row.person_id,
            display_name: trimOrNull(row.name) ?? "Unnamed",
            role_type: row.role_type,
            role_label: formatDrawerHouseholdContactRoleLabel(row.role_type),
            is_primary: false,
            phone: trimOrNull(row.phone),
            email: trimOrNull(row.email),
            initials: personDrawerHouseholdInitials(trimOrNull(row.name) ?? "Unnamed"),
        };
        const evidence = toEvidenceContact(drawerRow);

        switch (classifyContactBucket(row.role_type)) {
            case "emergency":
                emergencyRows.push(evidence);
                break;
            case "pickup":
                pickupRows.push(evidence);
                break;
            case "billing":
                billingRows.push(evidence);
                break;
            case "other_parent_guardian":
                otherParentGuardianRows.push(evidence);
                break;
            default:
                additionalRows.push(evidence);
                break;
        }
    }

    const nestedConfig = options.nestedConfig
        ? reconcileNestedSurfaceConfig(HOUSEHOLD_SURFACE_ID, options.nestedConfig)
        : null;

    // Children rows — belonging-first; optional operational facts only when configured.
    const childFieldKeys = nestedConfig ? householdGroupFieldKeys(nestedConfig, "children") : [];
    const includeChildOperationalFields = childFieldKeys.length > 0;
    const childRows = mapRawInquiryChildrenToDrawerRows(
        (record._inquiry_children as unknown[]) ?? [],
    ).map<HouseholdEvidenceChild>((row) => {
        const id = row.id || row.display_name || "child";
        const name = trimOrNull(row.display_name) ?? trimOrNull(row.first_name) ?? "Child";
        if (!includeChildOperationalFields) {
            return { id, name };
        }
        return {
            id,
            name,
            dob: trimOrNull(row.dob)?.slice(0, 10) ?? null,
            dobAge: formatFocusPanelDobAgeLine(row.dob, row.age),
            age: trimOrNull(row.age),
            program: trimOrNull(row.desired_program_label),
            schedule: trimOrNull(row.desired_schedule_label),
            startDate: formatFocusPanelDate(row.start_date),
            status: trimOrNull(row.outcome_status_label) ?? trimOrNull(row.outcome_status_key),
        };
    });

    const primaryPhone = primaryContact?.phone ?? formatPhoneForDisplay(record["person.primary_phone"]);
    const primaryEmail = primaryContact?.email ?? trimOrNull(record["person.primary_email"]);

    const preferredContactMethod =
        trimOrNull(record["person.preferred_contact_method"]) ??
        trimOrNull(record["person.contact_preference"]);

    const address = buildAddressLine(record);

    const published = Boolean(nestedConfig);
    const emergencyEnabled = published
        ? householdEmergencySectionEnabled(nestedConfig)
        : emergencyRows.length > 0;

    const groups: HouseholdEvidenceGroup[] = [];
    const pushGroup = (group: HouseholdEvidenceGroup) => {
        if (published) {
            const fixed = (HOUSEHOLD_FIXED_GROUP_KEYS as readonly string[]).includes(group.key);
            if (fixed) {
                groups.push(group);
                return;
            }
            if (group.key === "other_parent_guardian" && group.count > 0) {
                groups.push(group);
                return;
            }
            if (group.key === "emergency_contacts") {
                if (emergencyEnabled) groups.push(group);
                return;
            }
            if (!isNestedGroupEnabled(nestedConfig!, group.key) && group.count === 0) return;
        }
        if (group.count > 0 || group.addressLine) groups.push(group);
    };

    if (primaryContact || (published && (HOUSEHOLD_FIXED_GROUP_KEYS as readonly string[]).includes("primary_contact"))) {
        pushGroup({
            key: "primary_contact",
            title: "Primary contact",
            contacts: primaryContact ? [primaryContact] : [],
            children: [],
            count: primaryContact ? 1 : 0,
        });
    }
    if (otherParentGuardianRows.length > 0) {
        pushGroup({
            key: "other_parent_guardian",
            title: "Other parent / guardian",
            contacts: otherParentGuardianRows,
            children: [],
            count: otherParentGuardianRows.length,
        });
    }
    pushGroup({
        key: "household_members",
        title: "Additional contacts",
        contacts: additionalRows,
        children: [],
        count: additionalRows.length,
    });
    if (emergencyEnabled) {
        pushGroup({
            key: "emergency_contacts",
            title: "Emergency contacts",
            contacts: emergencyRows,
            children: [],
            count: emergencyRows.length,
        });
    }
    if (pickupRows.length > 0) {
        pushGroup({
            key: "authorized_pickups",
            title: "Authorized pickups",
            contacts: pickupRows,
            children: [],
            count: pickupRows.length,
        });
    }
    pushGroup({
        key: "children",
        title: "Children",
        contacts: [],
        children: childRows,
        count: childRows.length,
    });
    if (address) {
        pushGroup({
            key: "address",
            title: "Address",
            contacts: [],
            children: [],
            count: 1,
            addressLine: address,
        });
    }
    if (billingRows.length > 0) {
        pushGroup({
            key: "billing_contact",
            title: "Billing contact",
            contacts: billingRows,
            children: [],
            count: billingRows.length,
        });
    }

    const childCount = childRows.length;
    const otherParentGuardianCount = otherParentGuardianRows.length;
    const additionalContactCount = additionalRows.length;
    const emergencyContactCount = emergencyRows.length;
    const authorizedPickupCount = pickupRows.length;

    const answerLine = buildAnswerLine({ primaryContact, childCount });

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
        address,
        childCount,
        otherParentGuardianCount,
        additionalContactCount,
        emergencyContactCount,
        authorizedPickupCount,
        groups: householdDrillInGroups(groups, nestedConfig),
        missingCriticalWarning,
        lastUpdatedLabel,
    };
}

function buildAnswerLine(input: {
    primaryContact: HouseholdEvidenceContact | null;
    childCount: number;
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
