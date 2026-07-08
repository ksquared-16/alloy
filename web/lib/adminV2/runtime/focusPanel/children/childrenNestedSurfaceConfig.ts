/**
 * Narrow adapter: PUBLISHED Children Surface config → runtime children detail fields.
 *
 * Delegates persistence read + flatten to the shared nested-surface reader.
 */

import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    CHILDREN_SURFACE_ID,
    fieldVisibilityForNestedGroup,
    selectedFieldKeys,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { fieldShouldRender } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";
import {
    nestedSurfaceFieldKeysFromConfig,
    readNestedSurfaceConfigFromDoc,
} from "@/lib/adminV2/runtime/focusPanel/nestedSurfaceConfigReader";

/** Read + reconcile the published Children Surface config from a Focus Panel summary doc. */
export function readChildrenNestedConfigFromDoc(doc: LayoutDoc | null): NestedSurfaceConfig | null {
    return readNestedSurfaceConfigFromDoc(doc, CHILDREN_SURFACE_ID);
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
