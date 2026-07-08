/**
 * Narrow adapter: PUBLISHED Children Surface config → runtime children detail fields.
 *
 * Delegates persistence read + flatten to the shared nested-surface reader.
 */

import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    CHILDREN_SURFACE_ID,
    enabledEvidenceSections,
    fieldPresentationLabel,
    fieldVisibilityForNestedGroup,
    groupDefsFor,
    nestedGroupLabel,
    selectedFieldKeys,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { fieldShouldRender } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";
import {
    CHILD_FOCUS_FIELD_DEFS,
    isChildFocusFieldSaveSupported,
    type ChildFocusFieldKey,
} from "@/lib/adminV2/runtime/focusPanel/children/childNestedSurfaceRuntime";
import {
    nestedSurfaceFieldKeysFromConfig,
    readNestedSurfaceConfigFromDoc,
} from "@/lib/adminV2/runtime/focusPanel/nestedSurfaceConfigReader";

/** Configurable groups that render on the operational child Focus surface (not archive). */
export const CHILDREN_FOCUS_GROUP_KEYS = ["identity", "placement", "readiness"] as const;

export type ChildrenFocusFieldRow = {
    fieldKey: string;
    label: string;
    groupKey: (typeof CHILDREN_FOCUS_GROUP_KEYS)[number];
    displayed: boolean;
    editable: boolean;
};

export type ChildrenEvidenceSectionView = {
    key: string;
    label: string;
    fieldKeys: string[];
};

/** Read + reconcile the published Children Surface config from a Focus Panel summary doc. */
export function readChildrenNestedConfigFromDoc(doc: LayoutDoc | null): NestedSurfaceConfig | null {
    return readNestedSurfaceConfigFromDoc(doc, CHILDREN_SURFACE_ID);
}

function catalogLabelForGroupField(
    config: NestedSurfaceConfig,
    groupKey: string,
    fieldKey: string,
): string {
    const def = CHILD_FOCUS_FIELD_DEFS[fieldKey as ChildFocusFieldKey];
    return fieldPresentationLabel(
        config,
        groupKey,
        fieldKey,
        def?.label
            ?? fieldKey.replace(/^[a-z_]+\./, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    );
}

/** Focus-tier field rows — identity + placement + readiness on the child operational surface. */
export function childrenFocusRowsFromNestedConfig(config: NestedSurfaceConfig | null): ChildrenFocusFieldRow[] {
    if (!config) return [];
    const rows: ChildrenFocusFieldRow[] = [];
    const seen = new Set<string>();

    for (const groupKey of CHILDREN_FOCUS_GROUP_KEYS) {
        const group = config.groups.find((g) => g.key === groupKey);
        for (const fieldKey of selectedFieldKeys(config, groupKey)) {
            if (seen.has(fieldKey)) continue;
            if (!fieldShouldRender(fieldVisibilityForNestedGroup(config, groupKey, fieldKey))) continue;
            seen.add(fieldKey);
            const mode = group?.fieldModes?.[fieldKey];
            const displayed = mode?.displayed !== false;
            const editable =
                displayed
                && isChildFocusFieldSaveSupported(fieldKey as ChildFocusFieldKey)
                && mode?.editable === true;
            rows.push({
                fieldKey,
                label: catalogLabelForGroupField(config, groupKey, fieldKey),
                groupKey,
                displayed,
                editable,
            });
        }
    }

    return rows.filter((row) => row.displayed);
}

/** Evidence-tier sections — archive groups behind View all evidence. */
export function childrenEvidenceSectionsFromNestedConfig(
    config: NestedSurfaceConfig | null,
): ChildrenEvidenceSectionView[] {
    if (!config) return [];
    return enabledEvidenceSections(config).map((group) => ({
        key: group.key,
        label:
            nestedGroupLabel(config, group.key)
            ?? groupDefsFor(CHILDREN_SURFACE_ID).find((g) => g.key === group.key)?.label
            ?? group.key,
        fieldKeys: group.selectedFieldKeys.filter((fieldKey) =>
            fieldShouldRender(fieldVisibilityForNestedGroup(config, group.key, fieldKey)),
        ),
    }));
}

/** Flatten placement + identity groups for child detail line ordering. */
export function childrenDetailFieldKeysFromNestedConfig(config: NestedSurfaceConfig | null): string[] {
    if (!config) return [];
    return [
        ...selectedFieldKeys(config, "identity"),
        ...selectedFieldKeys(config, "placement"),
    ];
}

/** Keys always shown on the primary roster row — never in collapsed details. */
const ROSTER_PRIMARY_ROW_FIELD_KEYS = new Set(["child.name", "child.status"]);

/** Roster collapsed-detail field order (omits hidden + primary-row keys). */
export function childrenRosterCollapsedFieldKeysFromNestedConfig(config: NestedSurfaceConfig | null): string[] {
    if (!config) return [];
    return selectedFieldKeys(config, "roster").filter(
        (fieldKey) =>
            !ROSTER_PRIMARY_ROW_FIELD_KEYS.has(fieldKey)
            && fieldShouldRender(fieldVisibilityForNestedGroup(config, "roster", fieldKey)),
    );
}

/** Roster row field order from the published config (omits hidden fields). @deprecated Use collapsed keys for detail region. */
export function childrenRosterFieldKeysFromNestedConfig(config: NestedSurfaceConfig | null): string[] {
    return childrenRosterCollapsedFieldKeysFromNestedConfig(config);
}

/** All configured field keys (legacy flatten). */
export function childrenAllFieldKeysFromNestedConfig(config: NestedSurfaceConfig | null): string[] {
    return nestedSurfaceFieldKeysFromConfig(config);
}
