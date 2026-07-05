/**
 * Narrow adapter: PUBLISHED Children Surface config → runtime children detail fields.
 *
 * Delegates persistence read + flatten to the shared nested-surface reader.
 */

import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    CHILDREN_SURFACE_ID,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    nestedSurfaceFieldKeysFromConfig,
    readNestedSurfaceConfigFromDoc,
} from "@/lib/adminV2/runtime/focusPanel/nestedSurfaceConfigReader";

/** Read + reconcile the published Children Surface config from a Focus Panel summary doc. */
export function readChildrenNestedConfigFromDoc(doc: LayoutDoc | null): NestedSurfaceConfig | null {
    return readNestedSurfaceConfigFromDoc(doc, CHILDREN_SURFACE_ID);
}

/** Flatten a Children Surface config into the ordered field-key list the evidence builder uses. */
export function childrenDetailFieldKeysFromNestedConfig(config: NestedSurfaceConfig | null): string[] {
    return nestedSurfaceFieldKeysFromConfig(config);
}
