/**
 * Shared identity placement metadata stored on a nested-surface group.
 */

import type { NestedSurfaceFieldLayoutWidth } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldLayout";
import { chunkNestedSurfaceFieldsForHalfRowLayout } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldLayout";
import type { SurfaceFieldVisibility } from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";
import {
    normalizeIdentityStorageTier,
    type IdentityStorageTier,
} from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";
import type { IdentityFieldLinkTarget } from "@/lib/adminV2/runtime/focusPanel/identity/identityFieldLinkContract";
import { isCompactIconValueIdentityField } from "@/lib/adminV2/runtime/focusPanel/identity/resolveCompactIdentitySummaryLabelMode";

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
    /** When policy is Linked — destination card / open mode / subject. */
    linkTarget?: IdentityFieldLinkTarget;
    hideWhenEmpty?: boolean;
};

export type IdentityFieldLayoutPurpose = "summary" | "context_facts" | "details";

export type IdentityPlacementGroupLike = {
    fieldModes?: Record<string, { showLabel?: boolean }>;
    selectedFieldKeys: string[];
    contextFieldKeys?: string[];
    expandedFieldKeys?: string[];
    /** Legacy shared widths — treated as summary-tier fallback for older publishes. */
    fieldLayoutWidths?: Record<string, NestedSurfaceFieldLayoutWidth>;
    /** Per-disclosure-purpose row widths — Summary / Context Facts / Details are independent. */
    fieldLayoutWidthsByPurpose?: Partial<
        Record<IdentityFieldLayoutPurpose, Record<string, NestedSurfaceFieldLayoutWidth>>
    >;
    fieldPolicies?: Record<string, SurfaceFieldVisibility>;
    fieldPlacements?: IdentityFieldPlacement[];
};

function layoutPurposeForStorageTier(tier: "summary" | "context_fact" | "details"): IdentityFieldLayoutPurpose {
    return tier === "context_fact" ? "context_facts" : tier;
}

/** Resolve layout width for one field on one authoring purpose. */
export function identityFieldLayoutWidthForPurpose(
    group: IdentityPlacementGroupLike,
    fieldRef: string,
    purpose: IdentityFieldLayoutPurpose,
): NestedSurfaceFieldLayoutWidth {
    // Card Summary reachability lines (phone/email) always stack — half pairings
    // from an older beside-drag or polluted primary_contact publish must not win.
    // Context Facts / Details still honor authored half widths.
    if (purpose === "summary" && isCompactIconValueIdentityField(fieldRef)) {
        return "full";
    }
    return (
        group.fieldLayoutWidthsByPurpose?.[purpose]?.[fieldRef]
        ?? (purpose === "summary" ? group.fieldLayoutWidths?.[fieldRef] : undefined)
        ?? "full"
    );
}

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
    // Layout coordinates always come from current key-order + fieldLayoutWidths packing.
    // Preserving prior row/column when width is unchanged broke reorder/beside publish parity
    // (Gender↔Age Band swap kept stale columns). Policy/label/icon remain sticky.
    const seeded: IdentityFieldPlacement = {
        fieldRef: args.fieldRef,
        tier: normalizedTier,
        row: args.row,
        column: args.column,
        width: args.width,
        icon: args.existing?.icon,
        labelMode: args.existing?.labelMode,
        policy: args.existing?.policy ?? args.policy,
        linkTarget: args.existing?.linkTarget,
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
        const purpose = layoutPurposeForStorageTier(tier);
        const layoutFor = (fieldRef: string): NestedSurfaceFieldLayoutWidth =>
            identityFieldLayoutWidthForPurpose(group, fieldRef, purpose);
        // Same pairing rules as runtime IdentityFieldGrid / NestedSurfaceFieldLayoutSurface.
        // (Do not use a 3-unit half=2 packer — two halves must share one row.)
        const chunks = chunkNestedSurfaceFieldsForHalfRowLayout(fieldRefs, layoutFor);
        chunks.forEach((chunk, rowIndex) => {
            chunk.forEach((fieldRef, columnIndex) => {
                const width = layoutFor(fieldRef);
                const prior = existingByTierAndRef.get(`${tier}:${fieldRef}`);
                placements.push(
                    seedPlacement({
                        fieldRef,
                        tier,
                        row: rowIndex + 1,
                        column: (columnIndex + 1) as 1 | 2 | 3,
                        width,
                        policy: prior?.policy ?? group.fieldPolicies?.[fieldRef] ?? options?.defaultPolicy,
                        existing: prior,
                        fieldModes: group.fieldModes,
                    }),
                );
            });
        });
    };

    appendTier("summary", summaryKeys);
    appendTier("context_fact", contextFactKeys);
    appendTier("details", expandedKeys);
    return placements;
}
