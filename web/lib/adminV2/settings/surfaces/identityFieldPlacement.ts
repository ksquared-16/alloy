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

/** Resolve runtime label visibility from placement.labelMode or legacy fieldModes.showLabel. */
export function resolveIdentityPlacementLabelMode(
    placement: Pick<IdentityFieldPlacement, "labelMode" | "fieldRef">,
    fieldModes: Record<string, { showLabel?: boolean }> | undefined,
    fieldRef: string = placement.fieldRef,
): IdentityFieldLabelMode {
    if (placement.labelMode === "hidden" || placement.labelMode === "eyebrow" || placement.labelMode === "visible") {
        return placement.labelMode;
    }
    if (fieldModes?.[fieldRef]?.showLabel === false) return "hidden";
    return "visible";
}

export type IdentityFieldPlacement = {
    fieldRef: string;
    tier: IdentityStorageTier;
    row: number;
    column: 1 | 2 | 3;
    width: NestedSurfaceFieldLayoutWidth;
    icon?: string;
    labelMode?: IdentityFieldLabelMode;
    policy?: SurfaceFieldVisibility;
    hideWhenEmpty?: boolean;
};

export type IdentityPlacementGroupLike = {
    fieldModes?: Record<string, { showLabel?: boolean }>;
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
    column: 1 | 2 | 3;
    width: NestedSurfaceFieldLayoutWidth;
    policy?: SurfaceFieldVisibility;
    existing?: IdentityFieldPlacement;
    fieldModes?: Record<string, { showLabel?: boolean }>;
}): IdentityFieldPlacement {
    const normalizedTier = normalizeIdentityStorageTier(args.tier);
    const keepExistingLayout = args.existing?.width === args.width;
    const seeded: IdentityFieldPlacement = {
        fieldRef: args.fieldRef,
        tier: normalizedTier,
        row: keepExistingLayout ? (args.existing?.row ?? args.row) : args.row,
        column: keepExistingLayout ? (args.existing?.column ?? args.column) : args.column,
        width: args.width,
        icon: args.existing?.icon,
        labelMode: args.existing?.labelMode,
        policy: args.existing?.policy ?? args.policy,
        hideWhenEmpty: args.existing?.hideWhenEmpty,
    };
    const resolvedLabelMode = resolveIdentityPlacementLabelMode(seeded, args.fieldModes, args.fieldRef);
    return {
        ...seeded,
        labelMode:
            resolvedLabelMode === "visible"
                ? args.existing?.labelMode
                : resolvedLabelMode,
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
    const contextFactKeys = options?.contextFactKeys ?? group.contextFieldKeys ?? [];
    const expandedKeys = options?.expandedKeys ?? group.expandedFieldKeys ?? [];
    const placements: IdentityFieldPlacement[] = [];

    const appendTier = (tier: "summary" | "context_fact" | "details", fieldRefs: readonly string[]) => {
        let row = 1;
        let column: 1 | 2 | 3 = 1;
        let rowUnits = 0;
        for (const fieldRef of fieldRefs) {
            const width = group.fieldLayoutWidths?.[fieldRef] ?? "full";
            const prior = existingByTierAndRef.get(`${tier}:${fieldRef}`);
            const widthUnits = width === "third" ? 1 : width === "half" ? 2 : 3;
            if (rowUnits > 0 && rowUnits + widthUnits > 3) {
                row += 1;
                column = 1;
                rowUnits = 0;
            }
            placements.push(
                seedPlacement({
                    fieldRef,
                    tier,
                    row: prior?.row ?? row,
                    column: prior?.column ?? column,
                    width,
                    policy: prior?.policy ?? group.fieldPolicies?.[fieldRef] ?? options?.defaultPolicy,
                    existing: prior,
                    fieldModes: group.fieldModes,
                }),
            );
            if (width === "third" && column < 3) {
                column = (column + 1) as 1 | 2 | 3;
                rowUnits += 1;
            } else if (width === "half" && column === 1) {
                column = 2;
                rowUnits += 2;
            } else {
                row += 1;
                column = 1;
                rowUnits = 0;
            }
        }
    };

    appendTier("summary", summaryKeys);
    appendTier("context_fact", contextFactKeys);
    appendTier("details", expandedKeys);
    return placements;
}
