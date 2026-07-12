/**
 * Canonical published identity surface resolution.
 *
 * Builder live preview, Composer session reads, and /work-unit runtime must all
 * project through this path so published layout semantics match everywhere.
 */

import type { LayoutDoc } from "@/lib/layout/layoutV2";
import {
    CHILDREN_SURFACE_CANONICAL_ID,
    HOUSEHOLD_SURFACE_CANONICAL_ID,
    reconcileIdentityNestedConfig,
    reconcileIdentityNestedConfigFromDocMetadata,
    type IdentityNestedLegacyConfigs,
} from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceCompat";
import {
    reconcileNestedSurfaceConfig,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

const IDENTITY_CANONICAL_SURFACE_KEYS = new Set([
    HOUSEHOLD_SURFACE_CANONICAL_ID,
    CHILDREN_SURFACE_CANONICAL_ID,
]);

const LEGACY_IDENTITY_SURFACE_KEYS = new Set([
    "child_surface",
    "household_contact_surface",
]);

export function resolvePublishedIdentitySurfaceConfig(args: {
    surfaceKey: string;
    metadata: { nestedSurfaces?: Record<string, NestedSurfaceConfig | undefined> } | null | undefined;
}): NestedSurfaceConfig | null {
    return reconcileIdentityNestedConfigFromDocMetadata(args.surfaceKey, args.metadata);
}

export function resolvePublishedIdentitySurfaceConfigFromDoc(
    surfaceKey: string,
    doc: LayoutDoc | null,
): NestedSurfaceConfig | null {
    if (!doc) return null;
    return resolvePublishedIdentitySurfaceConfig({
        surfaceKey,
        metadata: doc.metadata as {
            nestedSurfaces?: Record<string, NestedSurfaceConfig | undefined>;
        },
    });
}

/** Serialize nested surfaces for publish — canonical identity config wins; legacy keys omitted. */
export function serializeIdentityNestedSurfacesForPublish(
    configs: Record<string, NestedSurfaceConfig>,
): Record<string, NestedSurfaceConfig> {
    const out: Record<string, NestedSurfaceConfig> = {};

    for (const [surfaceId, config] of Object.entries(configs)) {
        if (LEGACY_IDENTITY_SURFACE_KEYS.has(surfaceId)) continue;
        if (surfaceId === HOUSEHOLD_SURFACE_CANONICAL_ID || surfaceId === CHILDREN_SURFACE_CANONICAL_ID) {
            out[surfaceId] = reconcileIdentityNestedConfig({
                surfaceKey: surfaceId,
                currentConfig: config,
                legacyConfigs: {} satisfies IdentityNestedLegacyConfigs,
            });
            continue;
        }
        out[surfaceId] = reconcileNestedSurfaceConfig(surfaceId, config);
    }

    return out;
}
