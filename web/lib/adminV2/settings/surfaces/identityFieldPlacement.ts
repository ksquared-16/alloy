/**
 * Shared identity placement metadata stored on a nested-surface group.
 *
 * This file sits in the settings model so authoring and runtime can depend on
 * it without introducing a settings -> runtime -> settings import cycle.
 */

import type { NestedSurfaceFieldLayoutWidth } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldLayout";
import type { SurfaceFieldVisibility } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";

export type IdentityFieldTier = "summary" | "expanded";

export type IdentityFieldLabelMode = "visible" | "hidden" | "eyebrow";

export type IdentityFieldPlacement = {
    fieldRef: string;
    tier: IdentityFieldTier;
    row: number;
    column: 1 | 2;
    width: NestedSurfaceFieldLayoutWidth;
    icon?: string;
    labelMode?: IdentityFieldLabelMode;
    policy?: SurfaceFieldVisibility;
    hideWhenEmpty?: boolean;
};

export type IdentityPlacementGroupLike = {
    selectedFieldKeys: string[];
    expandedFieldKeys?: string[];
    fieldLayoutWidths?: Record<string, NestedSurfaceFieldLayoutWidth>;
    fieldPolicies?: Record<string, SurfaceFieldVisibility>;
    fieldPlacements?: IdentityFieldPlacement[];
};

function seedPlacement(args: {
    fieldRef: string;
    tier: IdentityFieldTier;
    row: number;
    column: 1 | 2;
    width: NestedSurfaceFieldLayoutWidth;
    policy?: SurfaceFieldVisibility;
    existing?: IdentityFieldPlacement;
}): IdentityFieldPlacement {
    return {
        fieldRef: args.fieldRef,
        tier: args.tier,
        row: args.existing?.row ?? args.row,
        column: args.existing?.column ?? args.column,
        width: args.width,
        icon: args.existing?.icon,
        labelMode: args.existing?.labelMode,
        policy: args.existing?.policy ?? args.policy,
        hideWhenEmpty: args.existing?.hideWhenEmpty,
    };
}

/**
 * Generate stable placements from legacy selectedFieldKeys + layout widths.
 * Explicit empty arrays remain empty.
 */
export function generateDefaultIdentityFieldPlacements(
    group: IdentityPlacementGroupLike,
    options?: {
        summaryKeys?: readonly string[];
        expandedKeys?: readonly string[];
        defaultPolicy?: SurfaceFieldVisibility;
    },
): IdentityFieldPlacement[] {
    const existing = group.fieldPlacements ?? [];
    const existingByTierAndRef = new Map(
        existing.map((placement) => [`${placement.tier}:${placement.fieldRef}`, placement]),
    );
    const summaryKeys = options?.summaryKeys ?? group.selectedFieldKeys;
    const expandedKeys = options?.expandedKeys ?? group.expandedFieldKeys ?? [];
    const placements: IdentityFieldPlacement[] = [];

    const appendTier = (tier: IdentityFieldTier, fieldRefs: readonly string[]) => {
        let row = 1;
        let column: 1 | 2 = 1;
        for (const fieldRef of fieldRefs) {
            const width = group.fieldLayoutWidths?.[fieldRef] ?? "full";
            const prior = existingByTierAndRef.get(`${tier}:${fieldRef}`);
            placements.push(
                seedPlacement({
                    fieldRef,
                    tier,
                    row: prior?.row ?? row,
                    column: prior?.column ?? column,
                    width,
                    policy: prior?.policy ?? group.fieldPolicies?.[fieldRef] ?? options?.defaultPolicy,
                    existing: prior,
                }),
            );
            if (width === "half" && column === 1) {
                column = 2;
            } else {
                row += 1;
                column = 1;
            }
        }
    };

    appendTier("summary", summaryKeys);
    appendTier("expanded", expandedKeys);
    return placements;
}
