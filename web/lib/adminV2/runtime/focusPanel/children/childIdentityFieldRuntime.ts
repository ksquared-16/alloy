/**
 * Canonical children identity field capability model.
 *
 * Presentation reads `children_surface`; child-specific save support remains an
 * adapter around the shared identity VM.
 */

import type { ChildrenEvidenceChild } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import type { NestedSurfaceGroupDisplayOptions } from "@/lib/adminV2/settings/surfaces/nestedSurfaceDefinitionModel";
import {
    CHILDREN_SURFACE_ID,
    defaultNestedSurfaceConfig,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { fieldIsSaveable, fieldShouldRender } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";
import {
    adaptChildSurfaceToChildrenSurface,
    resolveIdentityFieldPolicy,
} from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompat";

export const CHILD_SURFACE_ID = "child_surface" as const;

function canonicalChildrenSurfaceConfig(config: NestedSurfaceConfig | null): NestedSurfaceConfig | null {
    if (!config) return null;
    if (config.surfaceId === CHILD_SURFACE_ID) {
        return adaptChildSurfaceToChildrenSurface(config, defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID));
    }
    return config;
}

export type ChildFocusFieldKey =
    | "child.display_name"
    | "child.date_of_birth"
    | "child.age"
    | "inquiry_child.program"
    | "child.room"
    | "inquiry_child.schedule_type"
    | "child.start_date"
    | "child.readiness_summary";

export const CHILD_UNSUPPORTED_SAVE_FIELD_KEYS = new Set<ChildFocusFieldKey>([
    "child.readiness_summary",
    "child.age",
    "child.display_name",
]);

const CHILD_SAVE_FIELD_KEYS = new Set<ChildFocusFieldKey>([
    "inquiry_child.program",
    "child.room",
    "inquiry_child.schedule_type",
    "child.start_date",
    "child.date_of_birth",
]);

export function isChildFocusFieldSaveSupported(fieldKey: ChildFocusFieldKey): boolean {
    return !CHILD_UNSUPPORTED_SAVE_FIELD_KEYS.has(fieldKey) && CHILD_SAVE_FIELD_KEYS.has(fieldKey);
}

export type ChildFocusFieldDef = {
    fieldKey: ChildFocusFieldKey;
    label: string;
    groupKey: "identity" | "placement" | "readiness";
    readValue: (child: ChildrenEvidenceChild) => string | null;
};

export const CHILD_FOCUS_FIELD_DEFS: Record<ChildFocusFieldKey, ChildFocusFieldDef> = {
    "child.display_name": { fieldKey: "child.display_name", label: "Name", groupKey: "identity", readValue: (c) => c.name },
    "child.date_of_birth": { fieldKey: "child.date_of_birth", label: "Date of birth", groupKey: "identity", readValue: (c) => c.dobAge },
    "child.age": { fieldKey: "child.age", label: "Age", groupKey: "identity", readValue: (c) => c.dobAge },
    "inquiry_child.program": { fieldKey: "inquiry_child.program", label: "Program", groupKey: "placement", readValue: (c) => c.program },
    "child.room": { fieldKey: "child.room", label: "Room", groupKey: "placement", readValue: (c) => c.room },
    "inquiry_child.schedule_type": { fieldKey: "inquiry_child.schedule_type", label: "Schedule", groupKey: "placement", readValue: (c) => c.schedule },
    "child.start_date": { fieldKey: "child.start_date", label: "Start date", groupKey: "placement", readValue: (c) => c.startDate },
    "child.readiness_summary": {
        fieldKey: "child.readiness_summary",
        label: "Readiness",
        groupKey: "readiness",
        readValue: (c) => (c.needsAttention ? c.missingLine : "Ready"),
    },
};

const DEFAULT_CHILD_FIELD_KEYS: ChildFocusFieldKey[] = [
    "inquiry_child.program",
    "child.room",
    "inquiry_child.schedule_type",
    "child.start_date",
];

export type ChildFocusFieldRow = {
    fieldKey: ChildFocusFieldKey;
    label: string;
    displayed: boolean;
    editable: boolean;
};

export type ChildFocusView = {
    headerShowDob: boolean;
    headerShowAge: boolean;
    focusFields: ChildFocusFieldRow[];
};

function identityDisplayOptions(config: NestedSurfaceConfig | null): NestedSurfaceGroupDisplayOptions {
    return config?.groups.find((group) => group.key === "identity")?.displayOptions ?? {};
}

function groupKeyForField(config: NestedSurfaceConfig, fieldKey: ChildFocusFieldKey): string | null {
    const childEdit = config.groups.find((group) => group.key === "child_edit");
    if (childEdit?.selectedFieldKeys.includes(fieldKey)) return "child_edit";
    return config.groups.find((group) => group.selectedFieldKeys.includes(fieldKey))?.key ?? null;
}

function orderedFieldKeys(config: NestedSurfaceConfig | null): ChildFocusFieldKey[] {
    if (!config) return DEFAULT_CHILD_FIELD_KEYS;
    const keys: ChildFocusFieldKey[] = [];
    for (const groupKey of ["identity", "placement", "readiness"] as const) {
        const group = config.groups.find((row) => row.key === groupKey);
        for (const key of group?.selectedFieldKeys ?? []) {
            if (key in CHILD_FOCUS_FIELD_DEFS && !keys.includes(key as ChildFocusFieldKey)) {
                keys.push(key as ChildFocusFieldKey);
            }
        }
    }
    return keys.length > 0 ? keys : DEFAULT_CHILD_FIELD_KEYS;
}

export function orderedChildEditFieldKeys(config: NestedSurfaceConfig | null): ChildFocusFieldKey[] {
    config = canonicalChildrenSurfaceConfig(config);
    if (!config) return DEFAULT_CHILD_FIELD_KEYS;
    const keys: ChildFocusFieldKey[] = [];
    for (const group of config.groups) {
        if (group.key === "identity") continue;
        for (const key of group.selectedFieldKeys) {
            if (key in CHILD_FOCUS_FIELD_DEFS && !keys.includes(key as ChildFocusFieldKey)) {
                keys.push(key as ChildFocusFieldKey);
            }
        }
    }
    return keys.length > 0 ? keys : DEFAULT_CHILD_FIELD_KEYS;
}

export function childFocusViewFromConfig(config: NestedSurfaceConfig | null): ChildFocusView {
    config = canonicalChildrenSurfaceConfig(config);
    const identityOptions = identityDisplayOptions(config);
    const focusFields = orderedFieldKeys(config)
        .map((fieldKey) => {
            const def = CHILD_FOCUS_FIELD_DEFS[fieldKey];
            const groupKey = config ? groupKeyForField(config, fieldKey) : null;
            const visibility = config
                ? resolveIdentityFieldPolicy({
                      config,
                      groupKey: groupKey ?? "child_edit",
                      fieldRef: fieldKey,
                      editGroupKey: "child_edit",
                  })
                : "read-only";
            const displayed = fieldShouldRender(visibility);
            return {
                fieldKey,
                label: def.label,
                displayed,
                editable:
                    displayed
                    && isChildFocusFieldSaveSupported(fieldKey)
                    && fieldIsSaveable(visibility),
            };
        })
        .filter((row) => row.displayed);

    return {
        headerShowDob: identityOptions.showDob === true,
        headerShowAge: identityOptions.showAge !== false,
        focusFields,
    };
}
