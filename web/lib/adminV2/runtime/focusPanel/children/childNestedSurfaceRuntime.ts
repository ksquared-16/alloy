/**
 * Child drill-in surface runtime — published `child_surface` config → focus/edit UI.
 */

import type { LayoutDoc } from "@/lib/layout/layoutV2";
import type { ChildrenEvidenceChild } from "@/lib/adminV2/runtime/focusPanel/children/buildChildrenCardEvidence";
import type { NestedSurfaceFieldMode, NestedSurfaceGroupDisplayOptions } from "@/lib/adminV2/settings/surfaces/nestedSurfaceDefinitionModel";
import type { NestedSurfaceConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { readNestedSurfaceConfigFromDoc } from "@/lib/adminV2/runtime/focusPanel/nestedSurfaceConfigReader";
import { CHILDREN_FOCUS_GROUP_KEYS } from "@/lib/adminV2/runtime/focusPanel/children/childrenNestedSurfaceConfig";

/** Config keys that cannot be persisted from the child focus panel (computed / header-only). */
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

export const CHILD_SURFACE_ID = "child_surface" as const;

/** Expanded evidence sections owned by domain modules — not configurable in composer V1. */
export const CHILD_DOMAIN_LOCKED_EVIDENCE_SECTIONS = [
    { key: "medical", label: "Medical" },
    { key: "documents", label: "Documents" },
    { key: "pickup_instructions", label: "Pickup instructions" },
] as const;

export type ChildDomainLockedSectionKey = (typeof CHILD_DOMAIN_LOCKED_EVIDENCE_SECTIONS)[number]["key"];

export type ChildFocusFieldKey =
    | "child.display_name"
    | "child.date_of_birth"
    | "child.age"
    | "inquiry_child.program"
    | "child.room"
    | "inquiry_child.schedule_type"
    | "child.start_date"
    | "child.readiness_summary";

export type ChildFocusFieldDef = {
    fieldKey: ChildFocusFieldKey;
    label: string;
    groupKey: "identity" | "placement" | "readiness";
    readValue: (child: ChildrenEvidenceChild) => string | null;
};

export const CHILD_FOCUS_FIELD_DEFS: Record<ChildFocusFieldKey, ChildFocusFieldDef> = {
    "child.display_name": {
        fieldKey: "child.display_name",
        label: "Name",
        groupKey: "identity",
        readValue: (c) => c.name,
    },
    "child.date_of_birth": {
        fieldKey: "child.date_of_birth",
        label: "Date of birth",
        groupKey: "identity",
        readValue: (c) => c.dobAge,
    },
    "child.age": {
        fieldKey: "child.age",
        label: "Age",
        groupKey: "identity",
        readValue: (c) => c.dobAge,
    },
    "inquiry_child.program": {
        fieldKey: "inquiry_child.program",
        label: "Program",
        groupKey: "placement",
        readValue: (c) => c.program,
    },
    "child.room": {
        fieldKey: "child.room",
        label: "Room",
        groupKey: "placement",
        readValue: (c) => c.room,
    },
    "inquiry_child.schedule_type": {
        fieldKey: "inquiry_child.schedule_type",
        label: "Schedule",
        groupKey: "placement",
        readValue: (c) => c.schedule,
    },
    "child.start_date": {
        fieldKey: "child.start_date",
        label: "Start date",
        groupKey: "placement",
        readValue: (c) => c.startDate,
    },
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
    return config?.groups.find((g) => g.key === "identity")?.displayOptions ?? {};
}

function fieldModesForConfig(config: NestedSurfaceConfig | null): Record<string, NestedSurfaceFieldMode> {
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

function orderedFieldKeys(config: NestedSurfaceConfig | null): ChildFocusFieldKey[] {
    if (!config) return DEFAULT_CHILD_FIELD_KEYS;
    const keys: ChildFocusFieldKey[] = [];
    for (const groupKey of CHILDREN_FOCUS_GROUP_KEYS) {
        const group = config.groups.find((g) => g.key === groupKey);
        for (const key of group?.selectedFieldKeys ?? []) {
            if (key in CHILD_FOCUS_FIELD_DEFS && !keys.includes(key as ChildFocusFieldKey)) {
                keys.push(key as ChildFocusFieldKey);
            }
        }
    }
    return keys.length > 0 ? keys : DEFAULT_CHILD_FIELD_KEYS;
}

/** All non-identity field keys for edit policy (includes readiness when configured). */
export function orderedChildEditFieldKeys(config: NestedSurfaceConfig | null): ChildFocusFieldKey[] {
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

/** Read published child drill-in config. */
export function readChildNestedConfigFromDoc(doc: LayoutDoc | null): NestedSurfaceConfig | null {
    return readNestedSurfaceConfigFromDoc(doc, CHILD_SURFACE_ID);
}

/** Map published child_surface config to runtime focus/edit field policy. */
export function childFocusViewFromConfig(config: NestedSurfaceConfig | null): ChildFocusView {
    const identityOpts = identityDisplayOptions(config);
    const modes = { ...defaultChildFieldModes(), ...fieldModesForConfig(config) };
    const focusFields = orderedFieldKeys(config)
        .map((fieldKey) => {
            const def = CHILD_FOCUS_FIELD_DEFS[fieldKey]!;
            const mode = modes[fieldKey];
            const displayed = mode?.displayed !== false;
            const editable =
                displayed && isChildFocusFieldSaveSupported(fieldKey) && mode?.editable === true;
            return { fieldKey, label: def.label, displayed, editable };
        })
        .filter((row) => row.displayed);

    return {
        headerShowDob: identityOpts.showDob === true,
        headerShowAge: identityOpts.showAge !== false,
        focusFields,
    };
}

/** Default field modes for child_surface authoring seed. */
export function defaultChildFieldModes(): Record<string, NestedSurfaceFieldMode> {
    const modes: Record<string, NestedSurfaceFieldMode> = {};
    for (const key of Object.keys(CHILD_FOCUS_FIELD_DEFS)) {
        modes[key] = { displayed: true, editable: false };
    }
    modes["inquiry_child.program"] = { displayed: true, editable: false };
    modes["child.room"] = { displayed: true, editable: false };
    modes["inquiry_child.schedule_type"] = { displayed: true, editable: false };
    modes["child.start_date"] = { displayed: true, editable: false };
    return modes;
}
