/**
 * Role-scoped contact field capabilities — editability, save routing, and read-only reasons.
 *
 * Doctrine: editable === layout item editable AND capability.editable AND resolved person_id.
 */

import {
    contactRoleFieldRefs,
    LAYOUT_EDITOR_CONTACT_ROLES,
    normalizeLayoutEditorContactRole,
    type LayoutEditorContactResolutionRole,
    type LayoutEditorContactRole,
} from "@/lib/layout/layoutEditorContactRoles";
import { isPersonAddressLayoutRefKey } from "@/lib/layout/personDrawerAddressLayoutRefs";
import { primaryPersonIdFromOpportunityRecord } from "@/lib/admin/drawer/linkedRecordFieldEditing";
import {
    resolveOpportunityBillingContactPerson,
    resolveOpportunityEmergencyContactPerson,
} from "@/lib/layout/runtime/resolveOpportunityRoleContactPerson";
import { resolveOpportunityPrimaryContactPerson } from "@/lib/layout/runtime/resolveOpportunityPrimaryContactPerson";
import { resolveLayoutEditorContactBlockPerson } from "@/lib/layout/runtime/resolveLayoutEditorContactBlockRecord";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

export const LAYOUT_CONTACT_PERSON_IDS_KEY = "_layout_contact_person_ids" as const;
export const LAYOUT_CONTACT_REF_PERSON_ID_KEY = "_layout_contact_ref_person_id" as const;

export type LayoutRuntimeContactPersonFieldKey = "first_name" | "last_name" | "email" | "phone";

export type LayoutRuntimeContactRoleFieldCapability = {
    refKey: string;
    role: LayoutEditorContactResolutionRole;
    /** Native persons column or field_values key; null for display-only projections. */
    personField: LayoutRuntimeContactPersonFieldKey | "display_name" | null;
    editable: boolean;
    readOnlyReason: string | null;
};

const DISPLAY_NAME_READ_ONLY_REASON =
    "Contact name is derived from the linked person record. Edit first or last name on the person drawer.";

const ROLE_ADDRESS_READ_ONLY_REASON =
    "Contact role address fields are read-only on the opportunity drawer until role-scoped person address save is available.";

const NO_LINKED_PERSON_REASON = "No linked person is resolved for this contact role on this record.";

const ANY_CONTACT_READ_ONLY_REASON =
    "Any-contact fields are display-only until a dedicated any-contact save path exists.";

const AMBIGUOUS_CONTACT_CONTEXT_REASON =
    "Requires a contact block or specific contact role to identify which person to update.";

const CAPABILITY_BY_REF_KEY = new Map<string, LayoutRuntimeContactRoleFieldCapability>();

function registerCapability(entry: LayoutRuntimeContactRoleFieldCapability): void {
    CAPABILITY_BY_REF_KEY.set(entry.refKey, entry);
}

function registerRoleContactFields(role: LayoutEditorContactRole): void {
    const resolutionRole = normalizeLayoutEditorContactRole(role);
    const refs = contactRoleFieldRefs(role);
    const isAnyRole = resolutionRole === "any";

    registerCapability({
        refKey: refs.email,
        role: resolutionRole,
        personField: "email",
        editable: !isAnyRole,
        readOnlyReason: isAnyRole ? ANY_CONTACT_READ_ONLY_REASON : null,
    });
    registerCapability({
        refKey: refs.phone,
        role: resolutionRole,
        personField: "phone",
        editable: !isAnyRole,
        readOnlyReason: isAnyRole ? ANY_CONTACT_READ_ONLY_REASON : null,
    });
    registerCapability({
        refKey: refs.name,
        role: resolutionRole,
        personField: "display_name",
        editable: false,
        readOnlyReason: DISPLAY_NAME_READ_ONLY_REASON,
    });

    for (const addressRef of [refs.addressLine1, refs.addressLine2, refs.city, refs.state, refs.postalCode]) {
        registerCapability({
            refKey: addressRef,
            role: resolutionRole,
            personField: null,
            editable: false,
            readOnlyReason: ROLE_ADDRESS_READ_ONLY_REASON,
        });
    }
}

for (const role of LAYOUT_EDITOR_CONTACT_ROLES) {
    registerRoleContactFields(role);
}

/** Legacy person scalars on opportunity drawer — primary contact only. */
const PRIMARY_NATIVE_FIELD_REFS: Record<string, LayoutRuntimeContactPersonFieldKey> = {
    "person.first_name": "first_name",
    "person.last_name": "last_name",
    first_name: "first_name",
    last_name: "last_name",
    "person.primary_email": "email",
    "person.email": "email",
    email: "email",
    "person.primary_phone": "phone",
    "person.phone": "phone",
    phone: "phone",
};

for (const [refKey, personField] of Object.entries(PRIMARY_NATIVE_FIELD_REFS)) {
    if (CAPABILITY_BY_REF_KEY.has(refKey)) continue;
    registerCapability({
        refKey,
        role: "primary",
        personField,
        editable: true,
        readOnlyReason: null,
    });
}

export function resolveLayoutRuntimeContactRoleFieldCapability(
    refKey: string,
): LayoutRuntimeContactRoleFieldCapability | null {
    const trimmed = refKey.trim();
    if (!trimmed) return null;
    return CAPABILITY_BY_REF_KEY.get(trimmed) ?? null;
}

export function isLayoutRuntimeRoleContactFieldRefKey(refKey: string): boolean {
    return CAPABILITY_BY_REF_KEY.has(refKey.trim());
}

export function isLayoutRuntimeRoleContactEditableRefKey(refKey: string): boolean {
    return resolveLayoutRuntimeContactRoleFieldCapability(refKey)?.editable === true;
}

export function layoutRuntimeContactRoleFieldReadOnlyReason(refKey: string): string | null {
    const capability = resolveLayoutRuntimeContactRoleFieldCapability(refKey);
    if (capability?.readOnlyReason) return capability.readOnlyReason;
    if (capability && !capability.editable) return DISPLAY_NAME_READ_ONLY_REASON;
    return null;
}

export function layoutRuntimeContactRoleFieldInlineEditable(
    refKey: string,
    layoutContactRole?: LayoutEditorContactRole,
): boolean {
    if (isPersonAddressLayoutRefKey(refKey)) return true;
    if (isAnyContactRefKey(refKey)) return false;
    if (layoutRuntimeContactFieldRequiresRoleContext(refKey) && !layoutContactRole) return false;
    return isLayoutRuntimeRoleContactEditableRefKey(refKey);
}

export function isAnyContactRefKey(refKey: string): boolean {
    const capability = resolveLayoutRuntimeContactRoleFieldCapability(refKey.trim());
    return capability?.role === "any";
}

/** Secondary/additional-parent refs share one namespace — require block or item role context to save. */
export function layoutRuntimeContactFieldRequiresRoleContext(refKey: string): boolean {
    const capability = resolveLayoutRuntimeContactRoleFieldCapability(refKey.trim());
    return capability?.role === "parents" && capability.editable === true;
}

export function layoutRuntimeContactFieldBuilderReadOnlyReason(
    refKey: string,
    layoutContactRole?: LayoutEditorContactRole,
): string | null {
    const trimmed = refKey.trim();
    if (isAnyContactRefKey(trimmed)) return ANY_CONTACT_READ_ONLY_REASON;
    if (layoutRuntimeContactFieldRequiresRoleContext(trimmed) && !layoutContactRole) {
        return AMBIGUOUS_CONTACT_CONTEXT_REASON;
    }
    return layoutRuntimeContactRoleFieldReadOnlyReason(trimmed);
}

export function resolveAnyContactPersonId(record: Record<string, unknown>): string | null {
    const person = resolveLayoutEditorContactBlockPerson(record as ProofRuntimeRecord, "any");
    const personId = String(person?.personId ?? "").trim();
    return personId || null;
}

export type LayoutContactPersonIds = Partial<Record<LayoutEditorContactResolutionRole | "secondary", string | null>>;

export function buildLayoutContactPersonIds(input: {
    primaryPersonId?: string | null;
    secondaryPersonId?: string | null;
    billingPersonId?: string | null;
    emergencyPersonId?: string | null;
    anyPersonId?: string | null;
}): LayoutContactPersonIds {
    return {
        primary: input.primaryPersonId ?? null,
        parents: input.secondaryPersonId ?? null,
        secondary: input.secondaryPersonId ?? null,
        billing: input.billingPersonId ?? null,
        emergency: input.emergencyPersonId ?? null,
        any: input.anyPersonId ?? null,
    };
}

export function buildLayoutContactRefPersonIdMap(
    personIds: LayoutContactPersonIds,
): Record<string, string> {
    const out: Record<string, string> = {};
    for (const role of LAYOUT_EDITOR_CONTACT_ROLES) {
        const resolutionRole = normalizeLayoutEditorContactRole(role);
        const personId =
            resolutionRole === "primary" ? personIds.primary
            : resolutionRole === "parents" ? personIds.parents ?? personIds.secondary
            : resolutionRole === "billing" ? personIds.billing
            : resolutionRole === "emergency" ? personIds.emergency
            : resolutionRole === "any" ? personIds.any
            : null;
        if (!personId) continue;
        const refs = contactRoleFieldRefs(role);
        for (const refKey of [
            refs.name,
            refs.email,
            refs.phone,
            refs.addressLine1,
            refs.addressLine2,
            refs.city,
            refs.state,
            refs.postalCode,
        ]) {
            out[refKey] = personId;
        }
    }
    return out;
}

function personIdForRoleFromRecord(
    record: Record<string, unknown>,
    role: LayoutEditorContactResolutionRole,
): string | null {
    const ids = record[LAYOUT_CONTACT_PERSON_IDS_KEY] as LayoutContactPersonIds | undefined;
    if (role === "primary") {
        return (
            ids?.primary
            ?? primaryPersonIdFromOpportunityRecord(record)
            ?? resolveOpportunityPrimaryContactPerson(record).personId
        );
    }
    if (role === "parents") {
        return ids?.parents ?? ids?.secondary ?? null;
    }
    if (role === "billing") {
        return (
            ids?.billing
            ?? resolveOpportunityBillingContactPerson(record).personId
        );
    }
    if (role === "emergency") {
        return (
            ids?.emergency
            ?? resolveOpportunityEmergencyContactPerson(record).personId
        );
    }
    if (role === "any") {
        return ids?.any ?? resolveAnyContactPersonId(record);
    }
    return null;
}

function resolvePersonIdForContactRoleWithBlockContext(
    record: Record<string, unknown>,
    refKey: string,
    layoutContactRole?: LayoutEditorContactRole,
): string | null {
    if (!layoutContactRole) return null;
    const person = resolveLayoutEditorContactBlockPerson(record as ProofRuntimeRecord, layoutContactRole);
    const personId = String(person?.personId ?? "").trim();
    return personId || null;
}

/** True when save routing has an explicit, non-ambiguous person target. */
export function layoutRuntimeContactFieldHasSaveTarget(input: {
    record: Record<string, unknown>;
    refKey: string;
    overrides?: Record<string, string>;
    layoutContactRole?: LayoutEditorContactRole;
}): boolean {
    const trimmed = input.refKey.trim();
    const capability = resolveLayoutRuntimeContactRoleFieldCapability(trimmed);
    if (!capability?.editable) return false;

    const override = input.overrides?.[trimmed]?.trim();
    if (override) return true;

    if (layoutRuntimeContactFieldRequiresRoleContext(trimmed)) {
        return Boolean(resolvePersonIdForContactRoleWithBlockContext(
            input.record,
            trimmed,
            input.layoutContactRole,
        ));
    }

    const fromRecord = (
        input.record[LAYOUT_CONTACT_REF_PERSON_ID_KEY] as Record<string, string> | undefined
    )?.[trimmed]?.trim();
    if (fromRecord) return true;

    return Boolean(resolvePersonIdForContactRoleRef(
        input.record,
        trimmed,
        input.overrides,
        input.layoutContactRole,
    ));
}

/** Resolve authoritative person_id for a role-scoped contact field save. */
export function resolvePersonIdForContactRoleRef(
    record: Record<string, unknown>,
    refKey: string,
    overrides?: Record<string, string>,
    layoutContactRole?: LayoutEditorContactRole,
): string | null {
    const trimmed = refKey.trim();
    const override = overrides?.[trimmed];
    if (override?.trim() && !layoutRuntimeContactFieldRequiresRoleContext(trimmed)) {
        return override.trim();
    }

    const capability = resolveLayoutRuntimeContactRoleFieldCapability(trimmed);
    if (!capability) {
        if (trimmed === "person.id" || trimmed === "id") {
            return String(record["person.id"] ?? record.id ?? "").trim() || null;
        }
        return null;
    }

    if (capability.role === "any") {
        return null;
    }

    if (layoutRuntimeContactFieldRequiresRoleContext(trimmed)) {
        return resolvePersonIdForContactRoleWithBlockContext(
            record,
            trimmed,
            layoutContactRole,
        );
    }

    const fromRecord = (record[LAYOUT_CONTACT_REF_PERSON_ID_KEY] as Record<string, string> | undefined)?.[trimmed];
    if (fromRecord?.trim()) return fromRecord.trim();

    const rolePersonId = personIdForRoleFromRecord(record, capability.role);
    if (rolePersonId) return rolePersonId;

    return null;
}

export function contactRoleFieldCapabilityReadOnlyReasonForRecord(
    refKey: string,
    record: Record<string, unknown>,
    overrides?: Record<string, string>,
    layoutContactRole?: LayoutEditorContactRole,
): string | null {
    const capability = resolveLayoutRuntimeContactRoleFieldCapability(refKey);
    if (!capability) return null;
    if (!capability.editable) return capability.readOnlyReason;
    if (layoutRuntimeContactFieldRequiresRoleContext(refKey) && !layoutContactRole) {
        const hasOverride = Boolean(overrides?.[refKey.trim()]?.trim());
        if (!hasOverride) return AMBIGUOUS_CONTACT_CONTEXT_REASON;
    }
    const personId = resolvePersonIdForContactRoleRef(record, refKey, overrides, layoutContactRole);
    if (!personId) return NO_LINKED_PERSON_REASON;
    return null;
}

export const LAYOUT_RUNTIME_ROLE_CONTACT_EDITABLE_REF_KEYS = [
    ...CAPABILITY_BY_REF_KEY.values(),
]
    .filter((entry) => entry.editable)
    .map((entry) => entry.refKey);
