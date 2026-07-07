/**
 * Household contact edit field policy — maps published `household_contact_surface`
 * config to runtime edit rows (displayed / editable / saveable).
 */

import type { PersonContactValues } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import type { NestedSurfaceFieldMode } from "@/lib/adminV2/settings/surfaces/nestedSurfaceDefinitionModel";
import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { defaultContactFieldModes } from "@/lib/adminV2/runtime/focusPanel/household/householdNestedSurfaceRuntime";

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
    { configKey: "person.first_name", valueKey: "first_name", label: "First name", inputType: "text" },
    { configKey: "person.last_name", valueKey: "last_name", label: "Last name", inputType: "text" },
    { configKey: "person.email", valueKey: "email", label: "Email", inputType: "email" },
    { configKey: "person.phone", valueKey: "phone", label: "Phone", inputType: "tel" },
    { configKey: "person.date_of_birth", label: "Date of birth", inputType: "text" },
    { configKey: "person.address", label: "Address", inputType: "text" },
];

const DEFAULT_CONFIG_KEYS = FIELD_DEFS.map((d) => d.configKey);

function fieldModesFromConfig(
    contactConfig: NestedSurfaceConfig | null,
): { keys: string[]; modes: Record<string, NestedSurfaceFieldMode> } {
    const group = contactConfig?.groups.find((g) => g.key === "contact_fields");
    const keys = group?.selectedFieldKeys.length ? group.selectedFieldKeys : DEFAULT_CONFIG_KEYS;
    const modes = { ...defaultContactFieldModes(), ...(group?.fieldModes ?? {}) };
    return { keys, modes };
}

/** Resolve which contact edit rows render and whether each is editable. */
export function resolveContactEditFieldPolicy(contactConfig: NestedSurfaceConfig | null): ContactEditFieldRow[] {
    const { keys, modes } = fieldModesFromConfig(contactConfig);
    const keySet = new Set(keys);
    return FIELD_DEFS.filter((def) => keySet.has(def.configKey)).map((def) => {
        const mode = modes[def.configKey];
        const displayed = mode?.displayed !== false;
        const editable = displayed && def.valueKey != null && mode?.editable !== false;
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
