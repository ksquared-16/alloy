/**
 * Child focus edit field policy — maps published `child_surface` config to runtime
 * edit rows (displayed / editable / saveable).
 */

import type { NestedSurfaceFieldMode } from "@/lib/adminV2/settings/surfaces/nestedSurfaceDefinitionModel";
import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    CHILD_FOCUS_FIELD_DEFS,
    CHILD_UNSUPPORTED_SAVE_FIELD_KEYS,
    type ChildFocusFieldKey,
    childFocusViewFromConfig,
    defaultChildFieldModes,
    isChildFocusFieldSaveSupported,
    orderedChildEditFieldKeys,
    type ChildFocusView,
} from "@/lib/adminV2/runtime/focusPanel/children/childNestedSurfaceRuntime";

export { CHILD_UNSUPPORTED_SAVE_FIELD_KEYS };

/** Editable child focus values sent through the inquiry-child save path. */
export type ChildFocusEditValues = {
    program_category_id: string;
    program_room_cohort_key: string;
    schedule_type: string;
    start_date: string;
    dob: string;
};

export type ChildFocusEditValueKey = keyof ChildFocusEditValues;

const SAVE_FIELD_MAP: Partial<Record<ChildFocusFieldKey, ChildFocusEditValueKey>> = {
    "inquiry_child.program": "program_category_id",
    "child.room": "program_room_cohort_key",
    "inquiry_child.schedule_type": "schedule_type",
    "child.start_date": "start_date",
    "child.date_of_birth": "dob",
};

export type ChildFocusEditFieldRow = {
    configKey: ChildFocusFieldKey;
    valueKey?: ChildFocusEditValueKey;
    label: string;
    inputType: "text" | "date";
    displayed: boolean;
    editable: boolean;
    /** Shown when displayed but not save-supported (domain-locked / unsupported). */
    unsupported?: boolean;
};

function fieldModesFromConfig(config: NestedSurfaceConfig | null): Record<string, NestedSurfaceFieldMode> {
    const modes: Record<string, NestedSurfaceFieldMode> = { ...defaultChildFieldModes() };
    for (const group of config?.groups ?? []) {
        for (const key of group.selectedFieldKeys) {
            const mode = group.fieldModes?.[key];
            if (mode) {
                modes[key] = { ...modes[key], ...mode };
            }
        }
    }
    return modes;
}

/** Resolve child edit rows from published child_surface config. */
export function resolveChildFocusEditPolicy(config: NestedSurfaceConfig | null): ChildFocusEditFieldRow[] {
    const modes = fieldModesFromConfig(config);
    return orderedChildEditFieldKeys(config).flatMap((fieldKey) => {
        const def = CHILD_FOCUS_FIELD_DEFS[fieldKey];
        const valueKey = SAVE_FIELD_MAP[fieldKey];
        const saveSupported = isChildFocusFieldSaveSupported(fieldKey);
        const mode = modes[fieldKey] ?? defaultChildFieldModes()[fieldKey];
        const displayed = mode?.displayed !== false;
        const editable = displayed && saveSupported && mode?.editable === true;
        const unsupported = displayed && !saveSupported;
        return [
            {
                configKey: fieldKey,
                valueKey,
                label: def?.label ?? fieldKey,
                inputType:
                    valueKey === "start_date" || valueKey === "dob" ? ("date" as const) : ("text" as const),
                displayed,
                editable,
                unsupported,
            },
        ];
    });
}

/** Saveable value keys that remain editable under the published policy. */
export function editableChildFocusValueKeys(
    policy: readonly ChildFocusEditFieldRow[],
): Set<ChildFocusEditValueKey> {
    const out = new Set<ChildFocusEditValueKey>();
    for (const row of policy) {
        if (row.valueKey && row.editable) out.add(row.valueKey);
    }
    return out;
}

/** Whether the published config exposes any editable, save-supported child fields. */
export function childFocusHasEditableFields(_view: ChildFocusView, config: NestedSurfaceConfig | null): boolean {
    return resolveChildFocusEditPolicy(config).some((row) => row.editable);
}
