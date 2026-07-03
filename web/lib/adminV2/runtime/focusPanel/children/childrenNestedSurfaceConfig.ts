/**
 * Narrow adapter: PUBLISHED Children Surface config → runtime children detail fields.
 *
 * The Focus Panel Children card renders an ordered operational detail line (program ·
 * room · schedule · starts …). Which facts appear and in what order is authored in
 * `/settings/surfaces` (the Children nested surface) and persisted to
 * `metadata.nestedSurfaces["children_surface"]` on the Focus Panel summary doc.
 *
 * This adapter is the consumption seam: it reads that published config off the doc,
 * reconciles it against the registry defaults, and flattens the selected field keys
 * (in section + field order) into the ordered list `buildChildrenCardEvidence` uses.
 * Absent config → null → the card keeps its default field order (back-compat). No new
 * persistence, no new renderer — just consuming what the authoring model already saves.
 */

import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    CHILDREN_SURFACE_ID,
    reconcileNestedSurfaceConfig,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

/** Read + reconcile the published Children Surface config from a Focus Panel summary doc. */
export function readChildrenNestedConfigFromDoc(doc: LayoutDoc | null): NestedSurfaceConfig | null {
    if (!doc) return null;
    const metadata = (doc.metadata ?? {}) as {
        nestedSurfaces?: Record<string, NestedSurfaceConfig | undefined>;
    };
    const loaded = metadata.nestedSurfaces?.[CHILDREN_SURFACE_ID] ?? null;
    if (!loaded) return null;
    return reconcileNestedSurfaceConfig(CHILDREN_SURFACE_ID, loaded);
}

/**
 * Flatten a Children Surface config into the ordered field-key list the children
 * evidence builder consumes — section order first, field order within. Returns an
 * empty array for an empty config (caller treats empty as "no override").
 */
export function childrenDetailFieldKeysFromNestedConfig(
    config: NestedSurfaceConfig | null,
): string[] {
    if (!config) return [];
    return config.groups.flatMap((g) => g.selectedFieldKeys);
}
