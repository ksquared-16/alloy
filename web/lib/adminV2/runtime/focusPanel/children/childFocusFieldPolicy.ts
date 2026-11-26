/**
 * Child focus edit field policy — maps published `children_surface` config to runtime
 * edit rows using canonical field metadata and mutation bindings.
 */

import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    fieldIsSaveable,
    fieldShouldRender,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";
import { resolveIdentityFieldPolicy } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompat";
import {
    CHILD_SURFACE_ID,
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
import { resolveCanonicalIdentityFieldLabel } from "@/lib/adminV2/runtime/focusPanel/identity/identityCanonicalFieldMetadata";
import {
    childFocusMutationValueKeyForRef,
    inputTypeForIdentityFieldRef,
} from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldMutationBinding";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import { assignmentOwnsProgramRoomField, isLocationIdentityFieldRef } from "@/lib/adminV2/runtime/focusPanel/identity/assignmentProgramRoomGating";

/** Editable child focus values sent through the inquiry-child save path. */
export type ChildFocusEditValues = {
    location_id: string;
    program_category_id: string;
    program_room_cohort_key: string;
    schedule_type: string;
    start_date: string;
    requested_days_per_week: string;
    /** Comma-separated weekday ints (0–6), e.g. "1,3,5". */
    weekdays: string;
    dob: string;
};

export type ChildFocusEditValueKey = keyof ChildFocusEditValues;

export type ChildFocusEditFieldRow = {
    configKey: string;
    valueKey?: ChildFocusEditValueKey;
    label: string;
    inputType: "text" | "date";
    displayed: boolean;
    editable: boolean;
    /** Shown when displayed but not save-supported (domain-locked / unsupported). */
    unsupported?: boolean;
};

function groupKeyForField(config: NestedSurfaceConfig, fieldKey: string): string | null {
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
export function resolveChildFocusEditPolicy(
    config: NestedSurfaceConfig | null,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
    opts?: { hasCommittedPrimaryAssignment?: boolean },
): ChildFocusEditFieldRow[] {
    config = canonicalChildConfig(config);
    if (!config) return [];
    return orderedChildEditFieldKeys(config).flatMap((fieldKey) => {
        const valueKey = childFocusMutationValueKeyForRef(fieldKey);
        const saveSupported = isChildFocusFieldSaveSupported(fieldKey);
        const groupKey = groupKeyForField(config, fieldKey);
        const visibility = resolveIdentityFieldPolicy({
            config,
            groupKey: groupKey ?? "child_edit",
            fieldRef: fieldKey,
            editGroupKey: "child_edit",
        });
        const displayed = fieldShouldRender(visibility);
        const blockedByAssignment =
            opts?.hasCommittedPrimaryAssignment === true && assignmentOwnsProgramRoomField(fieldKey);
        // Location is Editable (never Linked). Legacy Linked policies coerce so Save works.
        const effectiveVisibility =
            isLocationIdentityFieldRef(fieldKey)
            && visibility !== "read-only"
            && visibility !== "hidden"
                ? "editable"
                : visibility;
        const editable = displayed && saveSupported && fieldIsSaveable(effectiveVisibility) && !blockedByAssignment;
        const unsupported = displayed && (!saveSupported || blockedByAssignment);
        const inputType = inputTypeForIdentityFieldRef(fieldKey);
        return [
            {
                configKey: fieldKey,
                valueKey,
                label: resolveCanonicalIdentityFieldLabel(fieldKey, tenantFieldDefinitions),
                inputType:
                    inputType === "date" ? "date" : inputType === "number" ? "text" : "text",
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
