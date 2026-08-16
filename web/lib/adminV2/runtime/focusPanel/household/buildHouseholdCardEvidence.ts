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
import { resolveOpportunitySecondaryContactPerson } from "@/lib/layout/runtime/resolveOpportunityRoleContactPerson";
import { formatPhoneUS } from "@/lib/adminFormatters";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import { resolveIdentityPhotoUrlFromRaw } from "@/lib/adminV2/runtime/focusPanel/resolveIdentityPhotoUrl";
import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    householdRelationshipSectionTitle,
    householdRelationshipSectionsFromConfig,
    resolveHouseholdContactSectionKey,
    shouldShowRelationshipSection,
} from "@/lib/adminV2/runtime/focusPanel/household/identityRelationshipSections";
import {
    householdEmergencySectionEnabled,
    householdDrillInGroups,
    householdGroupFieldKeys,
    HOUSEHOLD_FIXED_GROUP_KEYS,
} from "@/lib/adminV2/runtime/focusPanel/household/householdNestedSurfaceConfig";
import {
    isNestedGroupEnabled,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    formatFocusPanelDate,
    formatFocusPanelDobAgeLine,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelDateDisplay";
import { buildEmergencyContactsEvidence } from "@/lib/adminV2/runtime/focusPanel/emergencyContacts/buildEmergencyContactsEvidence";
import { buildPersonAddressIndexFromVm } from "@/lib/layout/runtime/resolvePersonAddressFieldValues";

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
    /** When present on drawer truth; else display falls back to splitting `name`. */
    firstName?: string | null;
    lastName?: string | null;
    roleLabel: string | null;
    isPrimary: boolean;
    phone: string | null;
    email: string | null;
    initials: string;
    /** Identity profile image (evidence model); null → initials fallback. */
    imageUrl?: string | null;
    /** Person-scoped address components when present on observed truth. */
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
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


function splitContactName(name: string): { firstName: string | null; lastName: string | null } {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { firstName: null, lastName: null };
    if (parts.length === 1) return { firstName: parts[0]!, lastName: null };
    return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") || null };
}

function toEvidenceContact(
    row: DrawerHouseholdContactRow,
    imageUrl?: string | null,
): HouseholdEvidenceContact {
    const explicitFirst = trimOrNull((row as { first_name?: string | null }).first_name);
    const explicitLast = trimOrNull((row as { last_name?: string | null }).last_name);
    const split = splitContactName(row.display_name);
    return {
        personId: row.person_id,
        name: row.display_name,
        firstName: explicitFirst ?? split.firstName,
        lastName: explicitLast ?? split.lastName,
        roleLabel: row.is_primary ? "Primary" : row.role_label,
        isPrimary: row.is_primary,
        phone: formatPhoneForDisplay(row.phone),
        email: row.email,
        initials: row.initials || initialsFor(row.display_name),
        imageUrl: imageUrl ?? null,
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
    /**
     * Line 2 is part of the address. It was the ONLY component this composition omitted, so a
     * value the operator had just saved — through the same editor, into the same canonical store
     * (`field_values` on entity_type `person`; there are no address columns on a persons table) —
     * was written and persisted and then simply never read back here. To the operator that is
     * indistinguishable from the save not sticking (R-016).
     */
    const line2 = pick("person.primary_address_line2", "person.address_line2");
    const city = pick("person.primary_address_city", "person.city");
    const state = pick("person.primary_address_state", "person.state");
    const postal = pick("person.primary_address_postal_code", "person.postal_code");

    const cityState = [city, state].filter(Boolean).join(", ");
    const tail = [cityState || null, postal].filter(Boolean).join(" ");
    const parts = [line1, line2, tail || null].filter(Boolean);
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

    // Prefer the resolved primary person's family-row name over stale scalar display fields
    // so flip-back (A→B→A) does not keep showing B's name after primary_person_id returns to A.
    const name =
        trimOrNull(familyPrimary?.name) ??
        trimOrNull(record["person.primary_contact_name"]) ??
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

    const imageUrl =
        resolveIdentityPhotoUrlFromRaw(
            (familyPrimary as unknown as Record<string, unknown> | null | undefined) ?? null,
        )
        ?? resolveIdentityPhotoUrlFromRaw({
            photo_url: record["person.primary_photo_url"],
            avatar_url: record["person.primary_avatar_url"],
            profile_photo_url: record["person.primary_profile_photo_url"],
            metadata: record["person.metadata"],
        });

    return {
        personId: primaryPersonId ?? "primary",
        name,
        roleLabel: "Primary",
        isPrimary: true,
        phone,
        email,
        initials: personDrawerHouseholdInitials(name),
        imageUrl,
    };
}

/** When family relationship rows omit a secondary parent, observe scalar + resolver truth. */
function appendSecondaryParentFromRecord(
    record: Record<string, unknown>,
    primaryPersonId: string | null,
    primaryContact: HouseholdEvidenceContact | null,
    otherParentGuardianRows: HouseholdEvidenceContact[],
): void {
    if (otherParentGuardianRows.length > 0) return;

    const secondary = resolveOpportunitySecondaryContactPerson(record);
    if (!secondary.hasPersonBinding || !secondary.displayName) return;
    if (primaryPersonId && secondary.personId === primaryPersonId) return;
    if (primaryContact?.name && secondary.displayName === primaryContact.name) return;

    const personId = secondary.personId ?? `secondary:${secondary.displayName}`;
    if (otherParentGuardianRows.some((row) => row.personId === personId)) return;
    otherParentGuardianRows.push({
        personId,
        name: secondary.displayName,
        roleLabel: "Parent",
        isPrimary: false,
        phone: formatPhoneForDisplay(secondary.phone),
        email: trimOrNull(secondary.email),
        initials: personDrawerHouseholdInitials(secondary.displayName),
        imageUrl: resolveIdentityPhotoUrlFromRaw({
            photo_url: (secondary as { photo_url?: string | null }).photo_url,
            avatar_url: (secondary as { avatar_url?: string | null }).avatar_url,
        }),
    });
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
    let primaryContact = buildPrimaryContact(record, primaryPersonId);

    // Read ALL family rows — do NOT use resolveOpportunityDrawerHouseholdContacts
    // which filters out role=parent when a primary is resolved.
    const familyRows = buildOpportunityFamilyContactRows(record);

    const otherParentGuardianRows: HouseholdEvidenceContact[] = [];
    const additionalRows: HouseholdEvidenceContact[] = [];
    const emergencyRows: HouseholdEvidenceContact[] = [];
    const pickupRows: HouseholdEvidenceContact[] = [];
    const billingRows: HouseholdEvidenceContact[] = [];

    const nestedConfig = options.nestedConfig ?? null;
    const assignedPersonIds = new Set<string>();
    if (primaryPersonId) assignedPersonIds.add(primaryPersonId);

    const assignContact = (evidence: HouseholdEvidenceContact, bucket: ContactBucket) => {
        if (assignedPersonIds.has(evidence.personId)) return;
        assignedPersonIds.add(evidence.personId);
        switch (bucket) {
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
    };

    for (const row of familyRows) {
        // Never duplicate the resolved primary person in any other group.
        if (primaryPersonId && row.person_id === primaryPersonId) continue;
        if (assignedPersonIds.has(row.person_id)) continue;

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
        const evidence = toEvidenceContact(
            drawerRow,
            resolveIdentityPhotoUrlFromRaw(row as unknown as Record<string, unknown>),
        );

        const sectionKey = nestedConfig
            ? resolveHouseholdContactSectionKey({
                  config: nestedConfig,
                  roleType: row.role_type,
                  isPrimary: false,
                  assignedPersonIds,
                  personId: row.person_id,
              })
            : "";
        let bucket: ContactBucket = sectionKey === "other_parent_guardian"
            ? "other_parent_guardian"
            : sectionKey === "emergency_contacts"
                ? "emergency"
                : sectionKey === "authorized_pickups"
                    ? "pickup"
                    : sectionKey === "billing_contact"
                        ? "billing"
                        : sectionKey === "household_members"
                            ? "additional"
                            : classifyContactBucket(row.role_type);
        // Stale Additional criteria (`member`) can claim create-lead secondaries.
        // Collapsed Household only renders Other Parent — reclassify parent-like roles.
        if (bucket === "additional" && classifyContactBucket(row.role_type) === "other_parent_guardian") {
            bucket = "other_parent_guardian";
        }
        if (nestedConfig && !sectionKey) continue;
        assignContact(evidence, bucket);
    }

    appendSecondaryParentFromRecord(record, primaryPersonId, primaryContact, otherParentGuardianRows);
    for (const contact of otherParentGuardianRows) assignedPersonIds.add(contact.personId);
    additionalRows.splice(
        0,
        additionalRows.length,
        ...additionalRows.filter((contact) => !assignedPersonIds.has(contact.personId)),
    );

    const canonicalEmergency = buildEmergencyContactsEvidence({ context });
    if (canonicalEmergency.count > 0) {
        emergencyRows.length = 0;
        const seenPerson = new Set<string>();
        for (const item of canonicalEmergency.items) {
            if (primaryPersonId && item.person_id === primaryPersonId) continue;
            if (seenPerson.has(item.person_id)) continue;
            seenPerson.add(item.person_id);
            emergencyRows.push({
                personId: item.person_id,
                name: item.person_display_name,
                roleLabel: item.operational_role_labels[0] ?? "Emergency Contact",
                isPrimary: false,
                phone: trimOrNull(item.person_fields.phone),
                email: trimOrNull(item.person_fields.email),
                initials: personDrawerHouseholdInitials(item.person_display_name),
                imageUrl: resolveIdentityPhotoUrlFromRaw(
                    item.person_fields as unknown as Record<string, unknown>,
                ),
            });
        }
    }

    // Children rows — belonging-first; optional operational facts only when configured.
    const childFieldKeys = nestedConfig ? householdGroupFieldKeys(nestedConfig, "children") : [];
    const includeChildOperationalFields = childFieldKeys.length > 0;
    const rawInquiryChildren = (record._inquiry_children as unknown[]) ?? [];
    const childRows = mapRawInquiryChildrenToDrawerRows(rawInquiryChildren).map<HouseholdEvidenceChild>(
        (row, index) => {
            const id = row.id || row.display_name || "child";
            const name = trimOrNull(row.display_name) ?? trimOrNull(row.first_name) ?? "Child";
            const imageUrl = resolveIdentityPhotoUrlFromRaw(
                (rawInquiryChildren[index] as Record<string, unknown> | undefined)
                    ?? (row as unknown as Record<string, unknown>),
            );
            if (!includeChildOperationalFields) {
                return { id, name, imageUrl };
            }
            return {
                id,
                name,
                imageUrl,
                dob: trimOrNull(row.dob)?.slice(0, 10) ?? null,
                dobAge: formatFocusPanelDobAgeLine(row.dob, row.age),
                age: trimOrNull(row.age),
                program: trimOrNull(row.desired_program_label),
                schedule: trimOrNull(row.desired_schedule_label),
                startDate: formatFocusPanelDate(row.start_date),
                status: trimOrNull(row.outcome_status_label) ?? trimOrNull(row.outcome_status_key),
            };
        },
    );

    const primaryPhone = primaryContact?.phone ?? formatPhoneForDisplay(record["person.primary_phone"]);
    const primaryEmail = primaryContact?.email ?? trimOrNull(record["person.primary_email"]);

    const preferredContactMethod =
        trimOrNull(record["person.preferred_contact_method"]) ??
        trimOrNull(record["person.contact_preference"]);

    const personAddressIndex = buildPersonAddressIndexFromVm(record);
    const attachPersonAddress = (contact: HouseholdEvidenceContact): HouseholdEvidenceContact => {
        const components = personAddressIndex.get(contact.personId);
        if (!components) return contact;
        const addressLine1 = components.address_line1 ?? null;
        const addressLine2 = components.address_line2 ?? null;
        const city = components.city ?? null;
        const state = components.state ?? null;
        const postalCode = components.postal_code ?? null;
        if (!addressLine1 && !addressLine2 && !city && !state && !postalCode) return contact;
        return { ...contact, addressLine1, addressLine2, city, state, postalCode };
    };
    if (primaryContact) primaryContact = attachPersonAddress(primaryContact);
    for (const contactList of [
        otherParentGuardianRows,
        additionalRows,
        emergencyRows,
        pickupRows,
        billingRows,
    ]) {
        for (let index = 0; index < contactList.length; index += 1) {
            contactList[index] = attachPersonAddress(contactList[index]!);
        }
    }

    const address = buildAddressLine(record);

    const published = Boolean(nestedConfig);
    const emergencyEnabled = published
        ? householdEmergencySectionEnabled(nestedConfig)
        : emergencyRows.length > 0;

    const sectionTitle = (key: string, fallback: string) =>
        householdRelationshipSectionTitle(nestedConfig, key, fallback);

    const builtByKey = new Map<string, HouseholdEvidenceGroup>();

    const stageGroup = (group: HouseholdEvidenceGroup) => {
        builtByKey.set(group.key, group);
    };

    stageGroup({
        key: "primary_contact",
        title: sectionTitle("primary_contact", "Primary contact"),
        contacts: primaryContact ? [primaryContact] : [],
        children: [],
        count: primaryContact ? 1 : 0,
    });
    stageGroup({
        key: "other_parent_guardian",
        title: sectionTitle("other_parent_guardian", "Other parent / guardian"),
        contacts: otherParentGuardianRows,
        children: [],
        count: otherParentGuardianRows.length,
    });
    stageGroup({
        key: "household_members",
        title: sectionTitle("household_members", "Additional contacts"),
        contacts: additionalRows,
        children: [],
        count: additionalRows.length,
    });
    stageGroup({
        key: "emergency_contacts",
        title: sectionTitle("emergency_contacts", "Emergency contacts"),
        contacts: emergencyRows,
        children: [],
        count: emergencyRows.length,
    });
    stageGroup({
        key: "authorized_pickups",
        title: sectionTitle("authorized_pickups", "Authorized pickups"),
        contacts: pickupRows,
        children: [],
        count: pickupRows.length,
    });
    stageGroup({
        key: "children",
        title: sectionTitle("children", "Children"),
        contacts: [],
        children: childRows,
        count: childRows.length,
    });
    if (address) {
        stageGroup({
            key: "address",
            title: sectionTitle("address", "Address"),
            contacts: [],
            children: [],
            count: 1,
            addressLine: address,
        });
    }
    stageGroup({
        key: "billing_contact",
        title: sectionTitle("billing_contact", "Billing contact"),
        contacts: billingRows,
        children: [],
        count: billingRows.length,
    });

    const groups: HouseholdEvidenceGroup[] = [];
    const pushGroup = (group: HouseholdEvidenceGroup) => {
        if (published) {
            if (group.key === "emergency_contacts" && !emergencyEnabled) return;
            if (
                !shouldShowRelationshipSection({
                    config: nestedConfig,
                    sectionKey: group.key,
                    count: group.count,
                    hasAddressLine: Boolean(group.addressLine),
                })
            ) {
                return;
            }
            if (
                group.key !== "primary_contact"
                && group.key !== "children"
                && group.key !== "address"
                && !isNestedGroupEnabled(nestedConfig!, group.key)
                && group.count === 0
            ) {
                return;
            }
        } else if (group.count === 0 && !group.addressLine) {
            if (group.key !== "primary_contact" && group.key !== "children") return;
        }
        groups.push(group);
    };

    const configuredOrder = nestedConfig
        ? householdRelationshipSectionsFromConfig(nestedConfig).map((section) => section.key)
        : [
            "primary_contact",
            "other_parent_guardian",
            "household_members",
            "emergency_contacts",
            "authorized_pickups",
            "children",
            "billing_contact",
        ];
    for (const key of configuredOrder) {
        const group = builtByKey.get(key);
        if (group) pushGroup(group);
    }
    const addressGroup = builtByKey.get("address");
    if (addressGroup) pushGroup(addressGroup);

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
        if (!updated) return null;
        const formatted = formatFocusPanelDate(updated);
        return formatted ? `Updated ${formatted}` : null;
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
