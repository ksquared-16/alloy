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

export type ContactEditFieldRow = {
    configKey: string;
    /** When set, maps to a saveable PersonContactValues key. */
    valueKey?: keyof PersonContactValues;
    label: string;
    inputType: "text" | "email" | "tel";
    displayed: boolean;
    editable: boolean;
};

const FIELD_DEFS: {
    configKey: string;
    valueKey?: keyof PersonContactValues;
    label: string;
    inputType: ContactEditFieldRow["inputType"];
}[] = [
    { configKey: "contact.first_name", valueKey: "first_name", label: "First name", inputType: "text" },
    { configKey: "contact.last_name", valueKey: "last_name", label: "Last name", inputType: "text" },
    { configKey: "contact.email", valueKey: "email", label: "Email", inputType: "email" },
    { configKey: "contact.phone", valueKey: "phone", label: "Phone", inputType: "tel" },
];

const DEFAULT_CONFIG_KEYS = FIELD_DEFS.map((d) => d.configKey);

function canonicalConfig(contactConfig: NestedSurfaceConfig | null): NestedSurfaceConfig {
    if (contactConfig?.surfaceId === HOUSEHOLD_CONTACT_SURFACE_COMPAT_ID) {
        return adaptHouseholdContactSurfaceToHouseholdSurface(contactConfig, null);
    }
    return adaptHouseholdContactSurfaceToHouseholdSurface(null, contactConfig);
}

/** Resolve which contact edit rows render and whether each is editable. */
export function resolveContactEditFieldPolicy(contactConfig: NestedSurfaceConfig | null): ContactEditFieldRow[] {
    const config = canonicalConfig(contactConfig);
    const group = config.groups.find((row) => row.key === "contact_edit");
    const keys = group?.selectedFieldKeys.length ? group.selectedFieldKeys : DEFAULT_CONFIG_KEYS;
    const keySet = new Set(keys);
    return FIELD_DEFS.filter((def) => keySet.has(def.configKey)).map((def) => {
        const policy = resolveIdentityFieldPolicy({
            config,
            groupKey: "contact_edit",
            fieldRef: def.configKey,
        });
        const displayed = policy !== "hidden";
        const editable = displayed && def.valueKey != null && policy === "editable";
        return {
            configKey: def.configKey,
            valueKey: def.valueKey,
            label: def.label,
            inputType: def.inputType,
            displayed,
            editable,
        };
    });
}

/** Saveable value keys that remain editable under the published policy. */
export function editableContactValueKeys(policy: readonly ContactEditFieldRow[]): Set<keyof PersonContactValues> {
    const out = new Set<keyof PersonContactValues>();
    for (const row of policy) {
        if (row.valueKey && row.editable) out.add(row.valueKey);
    }
    return out;
}
