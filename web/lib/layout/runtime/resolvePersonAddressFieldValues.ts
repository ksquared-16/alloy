/**
 * Person-scoped address field values for layout runtime records.
 *
 * Storage: field_definitions / field_values on entity_type `person` (not persons columns).
 */

import {
    PERSON_ADDRESS_LAYOUT_REF_KEYS,
    PERSON_ADDRESS_VALUE_KEYS,
    contactRoleAddressLayoutRefKey,
    type PersonAddressValueKey,
} from "@/lib/layout/personDrawerAddressLayoutRefs";
import type { LayoutEditorContactResolutionRole } from "@/lib/layout/layoutEditorContactRoles";
import { isOpaqueIdValue, pickEntityId } from "./proofRecordContext";

export { PERSON_ADDRESS_LAYOUT_REF_KEYS };

export type PersonAddressFieldValues = Partial<Record<(typeof PERSON_ADDRESS_LAYOUT_REF_KEYS)[number], string>>;

function pickDisplay(...values: unknown[]): string | null {
    for (const value of values) {
        if (value == null) continue;
        const text = String(value).trim();
        if (!text || isOpaqueIdValue(text)) continue;
        return text;
    }
    return null;
}

function bareAddressValues(source: Record<string, unknown>): Partial<Record<PersonAddressValueKey, string>> {
    const out: Partial<Record<PersonAddressValueKey, string>> = {};
    for (const key of PERSON_ADDRESS_VALUE_KEYS) {
        const value = pickDisplay(source[`person.${key}`], source[key]);
        if (value) out[key] = value;
    }
    return out;
}

/** Resolve person.address_* refKeys from VM / person record scalars. */
export function resolvePersonAddressFieldValues(vmRecord: Record<string, unknown>): PersonAddressFieldValues {
    const bare = bareAddressValues(vmRecord);
    const out: PersonAddressFieldValues = {};
    for (const key of PERSON_ADDRESS_VALUE_KEYS) {
        const value = bare[key];
        if (value) out[`person.${key}` as keyof PersonAddressFieldValues] = value;
    }
    return out;
}

export type ContactRolePersonAddressFieldValues = Record<string, string>;

/** Map one person's address components onto role-scoped layout refKeys. */
export function overlayContactRolePersonAddressFields(
    role: LayoutEditorContactResolutionRole,
    address: Partial<Record<PersonAddressValueKey, string>>,
): ContactRolePersonAddressFieldValues {
    const out: ContactRolePersonAddressFieldValues = {};
    for (const key of PERSON_ADDRESS_VALUE_KEYS) {
        const value = address[key];
        if (!value) continue;
        out[contactRoleAddressLayoutRefKey(role, key)] = value;
    }
    return out;
}

function personAddressFromRow(row: Record<string, unknown>): Partial<Record<PersonAddressValueKey, string>> {
    return bareAddressValues(row);
}

/** Index person_id → address components from opportunity VM snapshots and family rows. */
export function buildPersonAddressIndexFromVm(vmRecord: Record<string, unknown>): Map<string, Partial<Record<PersonAddressValueKey, string>>> {
    const map = new Map<string, Partial<Record<PersonAddressValueKey, string>>>();

    const snapshots = vmRecord._person_address_by_id;
    if (snapshots && typeof snapshots === "object" && !Array.isArray(snapshots)) {
        for (const [personId, values] of Object.entries(snapshots as Record<string, Record<string, unknown>>)) {
            const pid = String(personId).trim();
            if (!pid) continue;
            const parsed = personAddressFromRow(values);
            if (Object.keys(parsed).length > 0) map.set(pid, parsed);
        }
    }

    for (const row of (vmRecord._opportunity_persons as Record<string, unknown>[] | undefined) ?? []) {
        const personId = String(row.person_id ?? "").trim();
        if (!personId || map.has(personId)) continue;
        const parsed = personAddressFromRow(row);
        if (Object.keys(parsed).length > 0) map.set(personId, parsed);
    }

    const primaryPersonId = pickEntityId(
        vmRecord._primary_person_id,
        vmRecord.primary_person_id,
        vmRecord["opportunity.primary_person_id"],
        vmRecord["person.id"],
    );
    if (primaryPersonId && !map.has(primaryPersonId)) {
        const direct = bareAddressValues(vmRecord);
        if (Object.keys(direct).length > 0) map.set(primaryPersonId, direct);
    }

    return map;
}

/** Resolve all configured contact-role address projections for an opportunity VM. */
export function resolveContactRolePersonAddressFieldValues(input: {
    vmRecord: Record<string, unknown>;
    primaryPersonId: string | null;
    secondaryPersonId: string | null;
    emergencyPersonId: string | null;
    billingPersonId: string | null;
}): ContactRolePersonAddressFieldValues {
    const index = buildPersonAddressIndexFromVm(input.vmRecord);
    const out: ContactRolePersonAddressFieldValues = {};

    const roles: { role: LayoutEditorContactResolutionRole; personId: string | null }[] = [
        { role: "primary", personId: input.primaryPersonId },
        { role: "parents", personId: input.secondaryPersonId },
        { role: "emergency", personId: input.emergencyPersonId },
        { role: "billing", personId: input.billingPersonId },
    ];

    for (const { role, personId } of roles) {
        if (!personId) continue;
        const address = index.get(personId);
        if (!address) continue;
        Object.assign(out, overlayContactRolePersonAddressFields(role, address));
    }

    return out;
}
