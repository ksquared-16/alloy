/**
 * Tier-specific identity field policy resolution and mutation.
 *
 * Policy identity: surface + group + field + tier.
 * Legacy `fieldPolicies[fieldRef]` applies only when no tier-specific placement policy exists.
 */

import type { IdentityStorageTier } from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";
import {
    normalizeIdentityStorageTier,
    storageTierMatchesPurpose,
    type IdentityConfigurationPurpose,
} from "@/lib/adminV2/settings/surfaces/identityDisclosureLayers";
import type { IdentityFieldPlacement } from "@/lib/adminV2/settings/surfaces/identityFieldPlacement";
import { generateDefaultIdentityFieldPlacements } from "@/lib/adminV2/settings/surfaces/identityFieldPlacement";
import type { NestedSurfaceConfig, NestedSurfaceGroupConfig } from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import {
    normalizeFieldVisibility,
    type SurfaceFieldVisibility,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceFieldPolicy";

export type IdentityFieldPolicyTier = IdentityStorageTier | IdentityConfigurationPurpose;

function normalizePolicyTier(tier: IdentityFieldPolicyTier): IdentityStorageTier {
    if (tier === "context_facts") return "context_fact";
    if (tier === "summary" || tier === "details") return tier;
    return normalizeIdentityStorageTier(tier);
}

function tierMatchesPurpose(
    placementTier: IdentityStorageTier,
    purpose: IdentityFieldPolicyTier,
): boolean {
    const normalized = normalizePolicyTier(purpose);
    if (purpose === "context_facts" || purpose === "summary" || purpose === "details") {
        return storageTierMatchesPurpose(placementTier, purpose);
    }
    return normalizeIdentityStorageTier(placementTier) === normalized;
}

function findTierPlacement(
    group: NestedSurfaceGroupConfig | undefined,
    fieldRef: string,
    tier: IdentityFieldPolicyTier,
): IdentityFieldPlacement | undefined {
    if (!group) return undefined;
    const placements = group.fieldPlacements ?? generateDefaultIdentityFieldPlacements(group);
    return placements.find(
        (placement) => placement.fieldRef === fieldRef && tierMatchesPurpose(placement.tier, tier),
    );
}

function upsertTierPlacementPolicy(
    group: NestedSurfaceGroupConfig,
    fieldRef: string,
    tier: IdentityFieldPolicyTier,
    policy: SurfaceFieldVisibility,
): NestedSurfaceGroupConfig {
    const normalizedTier = normalizePolicyTier(tier);
    const existing = group.fieldPlacements ?? generateDefaultIdentityFieldPlacements(group);
    let found = false;
    const fieldPlacements = existing.map((placement) => {
        if (placement.fieldRef !== fieldRef || !tierMatchesPurpose(placement.tier, tier)) {
            return placement;
        }
        found = true;
        return { ...placement, policy: normalizeFieldVisibility(policy) };
    });
    if (!found) {
        fieldPlacements.push({
            fieldRef,
            tier: normalizedTier,
            row: 1,
            column: 1,
            width: group.fieldLayoutWidths?.[fieldRef] ?? "full",
            policy: normalizeFieldVisibility(policy),
        });
    }
    return { ...group, fieldPlacements };
}

/** Resolve effective policy for one field at a disclosure tier. */
export function resolveIdentityFieldPolicyForTier(args: {
    config: NestedSurfaceConfig;
    groupKey: string;
    fieldRef: string;
    tier: IdentityFieldPolicyTier;
    editGroupKey?: string;
    resolveLegacy?: (args: {
        config: NestedSurfaceConfig;
        groupKey: string;
        fieldRef: string;
        editGroupKey?: string;
        skipGlobalPolicy?: boolean;
        skipPlacementPolicy?: boolean;
    }) => SurfaceFieldVisibility;
}): SurfaceFieldVisibility {
    const group = args.config.groups.find((g) => g.key === args.groupKey);
    const tierPlacement = findTierPlacement(group, args.fieldRef, args.tier);
    if (tierPlacement?.policy) return normalizeFieldVisibility(tierPlacement.policy);

    if (args.resolveLegacy) {
        return args.resolveLegacy({
            config: args.config,
            groupKey: args.groupKey,
            fieldRef: args.fieldRef,
            editGroupKey: args.editGroupKey,
            skipGlobalPolicy: true,
            skipPlacementPolicy: true,
        });
    }

    const legacyGlobal = group?.fieldPolicies?.[args.fieldRef];
    if (legacyGlobal) return normalizeFieldVisibility(legacyGlobal);
    return "read-only";
}

/** Persist tier-specific visibility without overwriting other tiers. */
export function setFieldVisibilityForIdentityTier(
    config: NestedSurfaceConfig,
    groupKey: string,
    fieldRef: string,
    tier: IdentityFieldPolicyTier,
    visibility: SurfaceFieldVisibility,
): NestedSurfaceConfig {
    return {
        ...config,
        groups: config.groups.map((group) =>
            group.key === groupKey
                ? upsertTierPlacementPolicy(group, fieldRef, tier, visibility)
                : group,
        ),
    };
}

/** Read tier-specific visibility for Builder controls. */
export function fieldVisibilityForIdentityTier(
    config: NestedSurfaceConfig,
    groupKey: string,
    fieldRef: string,
    tier: IdentityFieldPolicyTier,
    fallback?: () => SurfaceFieldVisibility,
): SurfaceFieldVisibility {
    const group = config.groups.find((g) => g.key === groupKey);
    const tierPlacement = findTierPlacement(group, fieldRef, tier);
    if (tierPlacement?.policy) return normalizeFieldVisibility(tierPlacement.policy);
    const legacyGlobal = group?.fieldPolicies?.[fieldRef];
    if (legacyGlobal) return normalizeFieldVisibility(legacyGlobal);
    return fallback?.() ?? "read-only";
}
