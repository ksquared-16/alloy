/**
 * Generic nested-surface config reader — shared runtime consumption seam.
 *
 * Published nested-surface field selections live on the Focus Panel summary doc at
 * `metadata.nestedSurfaces[surfaceId]`. Card runtimes read through this adapter so
 * each surface does not fork persistence or reconciliation logic.
 *
 * @see childrenNestedSurfaceConfig.ts (Children — first consumer)
 * @see nestedSurfaceEditorModel.ts (authoring + reconcile)
 */

import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    reconcileNestedSurfaceConfig,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

/** Read + reconcile a published nested-surface config from a Focus Panel summary doc. */
export function readNestedSurfaceConfigFromDoc(
    doc: LayoutDoc | null,
    surfaceId: string,
): NestedSurfaceConfig | null {
    if (!doc) return null;
    const metadata = (doc.metadata ?? {}) as {
        nestedSurfaces?: Record<string, NestedSurfaceConfig | undefined>;
    };
    const loaded = metadata.nestedSurfaces?.[surfaceId] ?? null;
    if (!loaded) return null;
    return reconcileNestedSurfaceConfig(surfaceId, loaded);
}

/**
 * Flatten a nested-surface config into an ordered field-key list — section order first,
 * field order within. Returns an empty array for null/empty config (caller treats empty
 * as "no override").
 */
export function nestedSurfaceFieldKeysFromConfig(config: NestedSurfaceConfig | null): string[] {
    if (!config) return [];
    return config.groups.flatMap((g) => g.selectedFieldKeys);
}
