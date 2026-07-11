/**
 * Child focus edit field policy — maps published `children_surface` config to runtime
 * edit rows (displayed / editable / saveable).
 */

import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    fieldIsSaveable,
    fieldShouldRender,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";
import { resolveIdentityFieldPolicy } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompat";
import {
    CHILD_FOCUS_FIELD_DEFS,
    CHILD_SURFACE_ID,
    CHILD_UNSUPPORTED_SAVE_FIELD_KEYS,
    type ChildFocusFieldKey,
    childFocusViewFromConfig,
    isChildFocusFieldSaveSupported,
    orderedChildEditFieldKeys,
    type ChildFocusView,
} from "@/lib/adminV2/runtime/focusPanel/children/childIdentityFieldRuntime";
import {
    adaptChildSurfaceToChildrenSurface,
    CHILDREN_SURFACE_CANONICAL_ID,
} from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompat";
import { defaultNestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

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

function groupKeyForField(config: NestedSurfaceConfig, fieldKey: ChildFocusFieldKey): string | null {
    const childEdit = config.groups.find((g) => g.key === "child_edit");
    if (childEdit?.selectedFieldKeys.includes(fieldKey)) return "child_edit";
    for (const group of config.groups) {
        if (group.key === "identity") continue;
        if (group.selectedFieldKeys.includes(fieldKey)) return group.key;
    }
    return null;
}

function canonicalChildConfig(config: NestedSurfaceConfig | null): NestedSurfaceConfig | null {
    if (!config) return null;
    if (config.surfaceId === CHILD_SURFACE_ID) {
        return adaptChildSurfaceToChildrenSurface(config, defaultNestedSurfaceConfig(CHILDREN_SURFACE_CANONICAL_ID));
    }
    return config;
}

/** Resolve child edit rows from published children_surface config (fieldPolicies parity). */
export function resolveChildFocusEditPolicy(config: NestedSurfaceConfig | null): ChildFocusEditFieldRow[] {
    config = canonicalChildConfig(config);
    if (!config) return [];
    return orderedChildEditFieldKeys(config).flatMap((fieldKey) => {
        const def = CHILD_FOCUS_FIELD_DEFS[fieldKey];
        const valueKey = SAVE_FIELD_MAP[fieldKey];
        const saveSupported = isChildFocusFieldSaveSupported(fieldKey);
        const groupKey = groupKeyForField(config, fieldKey);
        const visibility = resolveIdentityFieldPolicy({
            config,
            groupKey: groupKey ?? "child_edit",
            fieldRef: fieldKey,
            editGroupKey: "child_edit",
        });
        const displayed = fieldShouldRender(visibility);
        const editable = displayed && saveSupported && fieldIsSaveable(visibility);
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
