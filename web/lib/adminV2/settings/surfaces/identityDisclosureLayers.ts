/**
 * Canonical identity disclosure — runtime layers vs configuration purposes.
 *
 * Runtime layers (operator experience):
 *   Summary → Context → Details → Evidence
 *
 * Configuration purposes (administrator buckets):
 *   Summary Fields → Context Facts → Detail Fields → Evidence Collections
 *
 * Context runtime projection = Summary + Context Facts (not a duplicate field layer).
 *
 * @see docs/platform/operator/identity-surface-composition-v2.md
 */

export const IDENTITY_RUNTIME_LAYERS = ["summary", "context", "details", "evidence"] as const;

export type IdentityDisclosureLayer = (typeof IDENTITY_RUNTIME_LAYERS)[number];

/** Administrator configuration purposes — Context Facts are incremental only. */
export const IDENTITY_CONFIGURATION_PURPOSES = [
    "summary",
    "context_facts",
    "details",
    "evidence",
] as const;

export type IdentityConfigurationPurpose = (typeof IDENTITY_CONFIGURATION_PURPOSES)[number];

/** @deprecated Use IdentityConfigurationPurpose for authoring buckets. */
export type IdentityFieldDisclosureLayer = "summary" | "context" | "details";

export type IdentityLayerFieldKeys = {
    summary: string[];
    /** Incremental context facts — persisted as `contextFieldKeys`. */
    contextFacts: string[];
    details: string[];
};

/** Persisted evidence collection configuration for one identity section. */
export type IdentityEvidenceCollectionConfig = {
    key: string;
    label: string;
    sectionSemantic?: string;
    enabled?: boolean;
};

/**
 * Storage tier on `IdentityFieldPlacement`.
 * - `context` legacy alias → `context_fact`
 * - `expanded` legacy alias → `details`
 */
export type IdentityStorageTier = "summary" | "context_fact" | "details" | "context" | "expanded";

export type IdentityLayerFieldKeyGroupLike = {
    selectedFieldKeys: string[];
    /** Persisted key name — canonical language: Context Facts. */
    contextFieldKeys?: string[];
    expandedFieldKeys?: string[];
};

export function isIdentityDisclosureLayer(value: string): value is IdentityDisclosureLayer {
    return (IDENTITY_RUNTIME_LAYERS as readonly string[]).includes(value);
}

export function isIdentityConfigurationPurpose(value: string): value is IdentityConfigurationPurpose {
    return (IDENTITY_CONFIGURATION_PURPOSES as readonly string[]).includes(value);
}

/** Normalize persisted placement tiers to canonical storage tiers. */
export function normalizeIdentityStorageTier(tier: string): "summary" | "context_fact" | "details" {
    if (tier === "expanded") return "details";
    if (tier === "context") return "context_fact";
    if (tier === "context_fact" || tier === "details" || tier === "summary") return tier;
    return "summary";
}

export function storageTierMatchesPurpose(tier: string, purpose: Exclude<IdentityConfigurationPurpose, "evidence">): boolean {
    return normalizeIdentityStorageTier(tier) === configurationPurposeToStorageTier(purpose);
}

export function configurationPurposeToStorageTier(
    purpose: Exclude<IdentityConfigurationPurpose, "evidence">,
): "summary" | "context_fact" | "details" {
    switch (purpose) {
        case "summary":
            return "summary";
        case "context_facts":
            return "context_fact";
        case "details":
            return "details";
    }
}

/** Map builder/runtime API tier aliases to configuration purpose. */
export function configurationPurposeFromTierArg(tier: string): Exclude<IdentityConfigurationPurpose, "evidence"> {
    if (tier === "context" || tier === "context_fact" || tier === "context_facts") return "context_facts";
    if (tier === "details" || tier === "expanded") return "details";
    return "summary";
}

/** Resolve configured field keys for one configuration purpose. */
export function fieldKeysForConfigurationPurpose(
    group: IdentityLayerFieldKeyGroupLike,
    purpose: Exclude<IdentityConfigurationPurpose, "evidence">,
): string[] {
    switch (purpose) {
        case "summary":
            return [...group.selectedFieldKeys];
        case "context_facts":
            return sanitizeContextFactKeysFromGroup(group);
        case "details":
            return [...(group.expandedFieldKeys ?? [])];
    }
}

/** Context fact keys with summary duplicates removed. */
export function sanitizeContextFactKeysFromGroup(group: IdentityLayerFieldKeyGroupLike): string[] {
    const summary = new Set(group.selectedFieldKeys);
    return (group.contextFieldKeys ?? []).filter((fieldRef) => !summary.has(fieldRef));
}

/** Map persisted keys into configuration buckets. */
export function identityLayerFieldKeysFromGroup(group: IdentityLayerFieldKeyGroupLike): IdentityLayerFieldKeys {
    return {
        summary: fieldKeysForConfigurationPurpose(group, "summary"),
        contextFacts: fieldKeysForConfigurationPurpose(group, "context_facts"),
        details: fieldKeysForConfigurationPurpose(group, "details"),
    };
}

export type IdentityBuilderFrame =
    | { kind: "surface"; surfaceId: string; label?: string }
    | {
          kind: "purpose";
          surfaceId: string;
          groupKey: string;
          purpose: IdentityConfigurationPurpose;
          groupLabel?: string;
      }
    | {
          kind: "nested-purpose";
          surfaceId: string;
          groupKey: string;
          nestedGroupKey: string;
          purpose: Exclude<IdentityConfigurationPurpose, "evidence">;
          groupLabel?: string;
          nestedGroupLabel?: string;
      };

export type IdentityBuilderNavigationState = {
    stack: IdentityBuilderFrame[];
};

export function initialIdentityBuilderNavigation(surfaceId: string, label?: string): IdentityBuilderNavigationState {
    return { stack: [{ kind: "surface", surfaceId, label }] };
}

export function identityBuilderCurrentFrame(state: IdentityBuilderNavigationState): IdentityBuilderFrame | null {
    return state.stack[state.stack.length - 1] ?? null;
}

export function identityBuilderPushPurpose(
    state: IdentityBuilderNavigationState,
    frame: Exclude<IdentityBuilderFrame, { kind: "surface" }>,
): IdentityBuilderNavigationState {
    return { stack: [...state.stack, frame] };
}

export function identityBuilderPopFrame(state: IdentityBuilderNavigationState): IdentityBuilderNavigationState {
    if (state.stack.length <= 1) return state;
    return { stack: state.stack.slice(0, -1) };
}

/** Runtime preview layer derived from builder drill state. */
export function identityBuilderPreviewLayer(state: IdentityBuilderNavigationState): IdentityDisclosureLayer {
    const frame = identityBuilderCurrentFrame(state);
    if (!frame || frame.kind === "surface") return "summary";
    const purpose = frame.purpose;
    if (purpose === "context_facts") return "context";
    if (purpose === "evidence") return "evidence";
    return purpose;
}

export function identityBuilderFrameTitle(frame: IdentityBuilderFrame): string {
    switch (frame.kind) {
        case "surface":
            return frame.label ?? "Identity";
        case "purpose":
            return `${frame.groupLabel ?? frame.groupKey} · ${purposeLabel(frame.purpose)}`;
        case "nested-purpose":
            return `${frame.nestedGroupLabel ?? frame.nestedGroupKey} · ${purposeLabel(frame.purpose)}`;
    }
}

function purposeLabel(purpose: IdentityConfigurationPurpose): string {
    switch (purpose) {
        case "summary":
            return "Summary Fields";
        case "context_facts":
            return "Context Facts";
        case "details":
            return "Detail Fields";
        case "evidence":
            return "Evidence Collections";
    }
}

/** Normalize persisted placements — rewrite legacy tiers. */
export function normalizeIdentityFieldPlacements<T extends { tier: string }>(placements: T[]): T[] {
    return placements.map((placement) => ({
        ...placement,
        tier: normalizeIdentityStorageTier(placement.tier) as T["tier"],
    }));
}

/** @deprecated Use fieldKeysForConfigurationPurpose. */
export function fieldKeysForDisclosureLayer(
    group: IdentityLayerFieldKeyGroupLike,
    layer: IdentityFieldDisclosureLayer,
): string[] {
    if (layer === "context") return fieldKeysForConfigurationPurpose(group, "context_facts");
    return fieldKeysForConfigurationPurpose(group, layer);
}

/** @deprecated Use storageTierMatchesPurpose. */
export function tierMatchesLayer(tier: string, layer: IdentityFieldDisclosureLayer): boolean {
    if (layer === "context") return normalizeIdentityStorageTier(tier) === "context_fact";
    return normalizeIdentityStorageTier(tier) === layer;
}
