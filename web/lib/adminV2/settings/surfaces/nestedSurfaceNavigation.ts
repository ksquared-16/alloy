/**
 * Runtime navigation links between nested operational surfaces (Surface Composer V3.5).
 *
 * Each configurable section may declare which registered surface it opens on drill-in.
 * Semantic link targets survive relabeling — the platform owns the destination registry.
 */

import {
    CHILDREN_SURFACE_ID,
    HOUSEHOLD_SURFACE_ID,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";

export type SurfaceNavigationTarget = {
    /** Registered surface id (must exist in surface registry). */
    surfaceId: string;
    /** Optional depth hint for the composer/runtime handoff. */
    depth?: "child-focus" | "child-evidence" | "child-documents" | "child-timeline" | "surface";
    label: string;
};

/** Platform-default navigation targets per surface + section key. */
const DEFAULT_NAVIGATION: Record<string, Record<string, SurfaceNavigationTarget>> = {
    [HOUSEHOLD_SURFACE_ID]: {
        children: {
            surfaceId: CHILDREN_SURFACE_ID,
            depth: "surface",
            label: "Children roster",
        },
    },
    [CHILDREN_SURFACE_ID]: {
        roster: {
            surfaceId: CHILDREN_SURFACE_ID,
            depth: "child-focus",
            label: "Child detail",
        },
        identity: {
            surfaceId: CHILDREN_SURFACE_ID,
            depth: "child-focus",
            label: "Child detail",
        },
        placement: {
            surfaceId: CHILDREN_SURFACE_ID,
            depth: "child-focus",
            label: "Child detail",
        },
        medical: {
            surfaceId: CHILDREN_SURFACE_ID,
            depth: "child-evidence",
            label: "Medical evidence",
        },
        documents: {
            surfaceId: CHILDREN_SURFACE_ID,
            depth: "child-documents",
            label: "Documents",
        },
    },
};

export type NestedSurfaceNavigationConfig = {
    /** Per-section link override (groupKey → target surface id + depth). */
    links?: Record<string, { surfaceId: string; depth?: SurfaceNavigationTarget["depth"] }>;
};

export function defaultNavigationTarget(
    surfaceId: string,
    groupKey: string,
): SurfaceNavigationTarget | null {
    return DEFAULT_NAVIGATION[surfaceId]?.[groupKey] ?? null;
}

export function resolveNavigationTarget(
    surfaceId: string,
    groupKey: string,
    navConfig: NestedSurfaceNavigationConfig | undefined,
): SurfaceNavigationTarget | null {
    const override = navConfig?.links?.[groupKey];
    if (override) {
        const base = defaultNavigationTarget(surfaceId, groupKey);
        return {
            surfaceId: override.surfaceId,
            depth: override.depth ?? base?.depth,
            label: base?.label ?? groupKey,
        };
    }
    return defaultNavigationTarget(surfaceId, groupKey);
}

export function setSectionNavigationLink(
    navConfig: NestedSurfaceNavigationConfig | undefined,
    groupKey: string,
    target: { surfaceId: string; depth?: SurfaceNavigationTarget["depth"] },
): NestedSurfaceNavigationConfig {
    return {
        ...navConfig,
        links: { ...(navConfig?.links ?? {}), [groupKey]: target },
    };
}
