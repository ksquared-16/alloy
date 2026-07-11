/**
 * Shared identity placement metadata stored on a nested-surface group.
 */

import type { NestedSurfaceFieldLayoutWidth } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldLayout";
import type { SurfaceFieldVisibility } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";
import {
    normalizeIdentityStorageTier,
    type IdentityStorageTier,
} from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";

/** @deprecated Prefer storage tier helpers; legacy tier aliases accepted on read. */
export type IdentityFieldTier = IdentityStorageTier;

export type IdentityFieldLabelMode = "visible" | "hidden" | "eyebrow";

export type IdentityFieldPlacement = {
    fieldRef: string;
    tier: IdentityStorageTier;
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
    contextFieldKeys?: string[];
    expandedFieldKeys?: string[];
    fieldLayoutWidths?: Record<string, NestedSurfaceFieldLayoutWidth>;
    fieldPolicies?: Record<string, SurfaceFieldVisibility>;
    fieldPlacements?: IdentityFieldPlacement[];
};

function seedPlacement(args: {
    fieldRef: string;
    tier: IdentityStorageTier;
    row: number;
    column: 1 | 2;
    width: NestedSurfaceFieldLayoutWidth;
    policy?: SurfaceFieldVisibility;
    existing?: IdentityFieldPlacement;
}): IdentityFieldPlacement {
    const normalizedTier = normalizeIdentityStorageTier(args.tier);
    return {
        fieldRef: args.fieldRef,
        tier: normalizedTier,
        row: args.existing?.row ?? args.row,
        column: args.existing?.column ?? args.column,
        width: args.width,
        icon: args.existing?.icon,
        labelMode: args.existing?.labelMode,
        policy: args.existing?.policy ?? args.policy,
        hideWhenEmpty: args.existing?.hideWhenEmpty,
    };
}

/** Generate stable placements from summary, context facts, and detail field keys. */
export function generateDefaultIdentityFieldPlacements(
    group: IdentityPlacementGroupLike,
    options?: {
        summaryKeys?: readonly string[];
        contextFactKeys?: readonly string[];
        expandedKeys?: readonly string[];
        defaultPolicy?: SurfaceFieldVisibility;
    },
): IdentityFieldPlacement[] {
    const existing = (group.fieldPlacements ?? []).map((placement) => ({
        ...placement,
        tier: normalizeIdentityStorageTier(placement.tier),
    }));
    const existingByTierAndRef = new Map(
        existing.map((placement) => [`${normalizeIdentityStorageTier(placement.tier)}:${placement.fieldRef}`, placement]),
    );
    const summaryKeys = options?.summaryKeys ?? group.selectedFieldKeys;
    const summarySet = new Set(summaryKeys);
    const contextFactKeys = (options?.contextFactKeys ?? group.contextFieldKeys ?? []).filter(
        (fieldRef) => !summarySet.has(fieldRef),
    );
    const expandedKeys = options?.expandedKeys ?? group.expandedFieldKeys ?? [];
    const placements: IdentityFieldPlacement[] = [];

    const appendTier = (tier: "summary" | "context_fact" | "details", fieldRefs: readonly string[]) => {
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
    appendTier("context_fact", contextFactKeys);
    appendTier("details", expandedKeys);
    return placements;
}
