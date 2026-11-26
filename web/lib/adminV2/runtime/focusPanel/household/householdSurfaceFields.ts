/**
 * Resolve configured household field keys to display values for contacts and children.
 */

import type {
    HouseholdEvidenceChild,
    HouseholdEvidenceContact,
} from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { fieldPresentationLabel } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    formatFocusPanelDate,
    formatFocusPanelDobAgeLine,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelDateDisplay";

export type HouseholdFieldRenderOptions = {
    config?: NestedSurfaceConfig | null;
    groupKey?: string;
};

export type HouseholdFieldRenderContext = {
    masked: boolean;
};

function contactFieldValue(
    contact: HouseholdEvidenceContact,
    fieldKey: string,
    ctx: HouseholdFieldRenderContext,
): string | null {
    if (ctx.masked && (fieldKey === "person.phone" || fieldKey === "person.email")) {
        return "Contact details restricted";
    }
    switch (fieldKey) {
        case "person.primary_contact_name":
            return contact.name;
        case "person.phone":
            return contact.phone;
        case "person.email":
            return contact.email;
        case "person.role_label":
            return contact.roleLabel;
        default:
            return null;
    }
}

function childFieldValue(child: HouseholdEvidenceChildExtended, fieldKey: string): string | null {
    switch (fieldKey) {
        case "child.name":
            return child.name;
        case "child.date_of_birth":
            return child.dobAge ?? formatFocusPanelDobAgeLine(child.dob, child.age);
        case "child.dob_age":
        case "child.age":
            return child.dobAge ?? child.age ?? null;
        case "inquiry_child.program":
            return child.program ?? null;
        case "inquiry_child.schedule_type":
            return child.schedule ?? null;
        case "child.start_date":
            return child.startDate ?? formatFocusPanelDate(child.startDate) ?? null;
        case "child.status":
            return child.status ?? null;
        default:
            return null;
    }
}

export type HouseholdRenderedField = {
    key: string;
    label: string;
    value: string;
    isName?: boolean;
};

export function renderContactFields(
    contact: HouseholdEvidenceContact,
    fieldKeys: readonly string[],
    ctx: HouseholdFieldRenderContext,
    options?: HouseholdFieldRenderOptions,
): HouseholdRenderedField[] {
    const out: HouseholdRenderedField[] = [];
    for (const key of fieldKeys) {
        const value = contactFieldValue(contact, key, ctx);
        if (!value) continue;
        const catalog = fieldLabel(key);
        out.push({
            key,
            label:
                options?.config && options.groupKey
                    ? fieldPresentationLabel(options.config, options.groupKey, key, catalog)
                    : catalog,
            value,
            isName: key === "person.primary_contact_name",
        });
    }
    return out;
}

export type HouseholdEvidenceChildExtended = HouseholdEvidenceChild & {
    dob?: string | null;
    dobAge?: string | null;
    age?: string | null;
    program?: string | null;
    schedule?: string | null;
    startDate?: string | null;
    status?: string | null;
};

export function renderChildFields(
    child: HouseholdEvidenceChildExtended,
    fieldKeys: readonly string[],
    options?: HouseholdFieldRenderOptions,
): HouseholdRenderedField[] {
    const out: HouseholdRenderedField[] = [];
    for (const key of fieldKeys) {
        const value = childFieldValue(child, key);
        if (!value) continue;
        const catalog = fieldLabel(key);
        out.push({
            key,
            label:
                options?.config && options.groupKey
                    ? fieldPresentationLabel(options.config, options.groupKey, key, catalog)
                    : catalog,
            value,
            isName: key === "child.name",
        });
    }
    return out;
}

function fieldLabel(key: string): string {
    const tail = key.includes(".") ? key.slice(key.indexOf(".") + 1) : key;
    return tail.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Map contact_edit surface keys to PersonContactValues keys. */
export const CONTACT_EDIT_FIELD_MAP: Record<string, keyof import("@/lib/adminV2/runtime/focusPanel/focusPanelMutation").PersonContactValues> = {
    "contact.first_name": "first_name",
    "contact.last_name": "last_name",
    "contact.email": "email",
    "contact.phone": "phone",
    // Builder may place person.* refs on the Parent/Guardian edit map — bind to the same values.
    "person.email": "email",
    "person.phone": "phone",
    "person.first_name": "first_name",
    "person.last_name": "last_name",
    "contact.address_line1": "address_line1",
    "contact.address_line2": "address_line2",
    "contact.address_line": "address_line1",
    "contact.address": "address_line1",
    "person.address_line1": "address_line1",
    "person.address_line2": "address_line2",
    "person.address_line": "address_line1",
    "person.address": "address_line1",
    "person.city": "city",
    "person.state": "state",
    "person.postal_code": "postal_code",
    "person.postal": "postal_code",
    "person.zip": "postal_code",
    "person.zip_code": "postal_code",
    "contact.city": "city",
    "contact.state": "state",
    "contact.postal_code": "postal_code",
    "contact.postal": "postal_code",
    "contact.zip": "postal_code",
};

export function personContactSaveKeyForIdentityFieldRef(
    fieldRef: string,
): keyof import("@/lib/adminV2/runtime/focusPanel/focusPanelMutation").PersonContactValues | null {
    const key = CONTACT_EDIT_FIELD_MAP[fieldRef];
    return key ?? null;
}
