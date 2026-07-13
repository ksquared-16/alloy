/**
 * Household contact edit field policy. `household_surface.contact_edit` is
 * canonical; `household_contact_surface` is accepted only through the adapter.
 */

import type { PersonContactValues } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    adaptHouseholdContactSurfaceToHouseholdSurface,
    HOUSEHOLD_CONTACT_SURFACE_COMPAT_ID,
    resolveIdentityFieldPolicy,
} from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompat";
import { resolveCanonicalIdentityFieldLabel } from "@/lib/adminV2/runtime/focusPanel/identity/identityCanonicalFieldMetadata";
import {
    contactMutationValueKeyForRef,
    inputTypeForIdentityFieldRef,
    isIdentityFieldSaveSupported,
} from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldMutationBinding";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

export type ContactEditFieldRow = {
    configKey: string;
    /** When set, maps to a saveable PersonContactValues key. */
    valueKey?: keyof PersonContactValues;
    label: string;
    inputType: "text" | "email" | "tel";
    displayed: boolean;
    editable: boolean;
};

const DEFAULT_CONFIG_KEYS = [
    "contact.first_name",
    "contact.last_name",
    "contact.email",
    "contact.phone",
];

function canonicalConfig(contactConfig: NestedSurfaceConfig | null): NestedSurfaceConfig {
    if (contactConfig?.surfaceId === HOUSEHOLD_CONTACT_SURFACE_COMPAT_ID) {
        return adaptHouseholdContactSurfaceToHouseholdSurface(contactConfig, null);
    }
    return adaptHouseholdContactSurfaceToHouseholdSurface(null, contactConfig);
}

/** Resolve which contact edit rows render and whether each is editable. */
export function resolveContactEditFieldPolicy(
    contactConfig: NestedSurfaceConfig | null,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): ContactEditFieldRow[] {
    const config = canonicalConfig(contactConfig);
    const group = config.groups.find((row) => row.key === "contact_edit");
    const keys = group?.selectedFieldKeys.length ? [...group.selectedFieldKeys] : [...DEFAULT_CONFIG_KEYS];
    return keys.map((configKey) => {
        const policy = resolveIdentityFieldPolicy({
            config,
            groupKey: "contact_edit",
            fieldRef: configKey,
        });
        const valueKey = contactMutationValueKeyForRef(configKey);
        const displayed = policy !== "hidden";
        const editable =
            displayed
            && valueKey != null
            && isIdentityFieldSaveSupported(configKey)
            && policy === "editable";
        const inputType = inputTypeForIdentityFieldRef(configKey);
        const resolvedInputType: ContactEditFieldRow["inputType"] =
            inputType === "email" ? "email" : inputType === "tel" ? "tel" : "text";
        return {
            configKey,
            valueKey,
            label: resolveCanonicalIdentityFieldLabel(configKey, tenantFieldDefinitions),
            inputType: resolvedInputType,
            displayed,
            editable,
        };
    }).filter((row) => row.displayed);
}

/** Saveable value keys that remain editable under the published policy. */
export function editableContactValueKeys(policy: readonly ContactEditFieldRow[]): Set<keyof PersonContactValues> {
    const out = new Set<keyof PersonContactValues>();
    for (const row of policy) {
        if (row.valueKey && row.editable) out.add(row.valueKey);
    }
    return out;
}
