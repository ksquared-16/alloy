/**
 * Canonical children identity field capability model.
 *
 * Presentation reads `children_surface`; child-specific save support delegates to
 * canonical mutation bindings — no parallel field label catalog.
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
import { resolveCanonicalIdentityFieldLabel } from "@/lib/adminV2/runtime/focusPanel/identity/identityCanonicalFieldMetadata";
import {
    isIdentityFieldSaveSupported,
} from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldMutationBinding";
import { isIdentityFieldInlineSaveSupported } from "@/lib/adminV2/runtime/focusPanel/identity/identityInlineChildSave";
import { resolveIdentityFieldValue } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompose";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";

export const CHILD_SURFACE_ID = "child_surface" as const;

export type ChildFocusFieldKey = string;

function canonicalChildrenSurfaceConfig(config: NestedSurfaceConfig | null): NestedSurfaceConfig | null {
    if (!config) return null;
    if (config.surfaceId === CHILD_SURFACE_ID) {
        return adaptChildSurfaceToChildrenSurface(config, defaultNestedSurfaceConfig(CHILDREN_SURFACE_ID));
    }
    return config;
}

export function isChildFocusFieldSaveSupported(fieldKey: string): boolean {
    return isIdentityFieldSaveSupported(fieldKey);
}

/** Inline identity-card save support (scalar profile — not enrollment link fields). */
export function isChildIdentityFieldInlineSaveSupported(fieldKey: string): boolean {
    return isIdentityFieldInlineSaveSupported(fieldKey);
}

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

function groupKeyForField(config: NestedSurfaceConfig, fieldKey: string): string | null {
    const childEdit = config.groups.find((group) => group.key === "child_edit");
    if (childEdit?.selectedFieldKeys.includes(fieldKey)) return "child_edit";
    return config.groups.find((group) => group.selectedFieldKeys.includes(fieldKey))?.key ?? null;
}

const DEFAULT_CHILD_FIELD_KEYS = [
    "inquiry_child.program",
    "child.room",
    "inquiry_child.schedule_type",
    "child.start_date",
];

function orderedFieldKeys(config: NestedSurfaceConfig | null): string[] {
    if (!config) return DEFAULT_CHILD_FIELD_KEYS;
    const keys: string[] = [];
    for (const groupKey of ["identity", "placement", "readiness"] as const) {
        const group = config.groups.find((row) => row.key === groupKey);
        for (const key of group?.selectedFieldKeys ?? []) {
            if (!keys.includes(key)) keys.push(key);
        }
    }
    return keys;
}

export function orderedChildEditFieldKeys(config: NestedSurfaceConfig | null): string[] {
    config = canonicalChildrenSurfaceConfig(config);
    if (!config) return DEFAULT_CHILD_FIELD_KEYS;
    const keys: string[] = [];
    for (const group of config.groups) {
        if (group.key === "identity") continue;
        for (const key of group.selectedFieldKeys) {
            if (!keys.includes(key)) keys.push(key);
        }
    }
    return keys;
}

export function childFocusViewFromConfig(
    config: NestedSurfaceConfig | null,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): ChildFocusView {
    config = canonicalChildrenSurfaceConfig(config);
    const identityOptions = identityDisplayOptions(config);
    const focusFields = orderedFieldKeys(config)
        .map((fieldKey) => {
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
                label: resolveCanonicalIdentityFieldLabel(fieldKey, tenantFieldDefinitions),
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

/** @deprecated Use resolveIdentityFieldValue — kept for legacy imports. */
export function readChildFocusFieldValue(fieldKey: string, child: ChildrenEvidenceChild): string | null {
    return resolveIdentityFieldValue({ kind: "child", value: child }, fieldKey);
}
