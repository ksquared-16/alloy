/**
 * Effective field requirement + interaction for layout surfaces (Card 0).
 * Resolution: placement → definition default → system preset (adapter caps).
 */

import {
    defaultInteractionPolicyForField,
    resolveFieldInteractionPolicy,
    type FieldDefinitionInteractionSource,
    type FieldInteractionPolicyV1,
} from "@/lib/fields/fieldInteractionPolicy";
import {
    getDrawerOverviewPlacementBehavior,
    parseFieldPlacementsFromLayoutConfig,
    FIELD_BEHAVIOR_SURFACE_DRAWER_OVERVIEW,
    type FieldBehaviorSurfaceV1,
    type FieldPlacementSurfaceBehaviorV1,
} from "@/lib/fields/fieldPlacementV1";
import {
    legacyIsRequiredFromPolicy,
    requirementPolicyFromLegacyIsRequired,
    resolveFieldRequirementPolicy,
    type FieldDefinitionRequirementSource,
    type FieldRequirementPolicyV1,
} from "@/lib/fields/fieldRequirementPolicy";
import {
    resolveDrawerFieldPolicy,
    type DrawerPolicyEntityType,
} from "@/lib/fields/drawerFieldPolicyAdapter";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";

export type EffectiveFieldBehaviorSource = "placement" | "definition" | "preset";

export type EffectiveFieldBehavior = {
    requirement: FieldRequirementPolicyV1;
    interaction: FieldInteractionPolicyV1;
    requirement_source: EffectiveFieldBehaviorSource;
    interaction_source: EffectiveFieldBehaviorSource;
    surface: FieldBehaviorSurfaceV1;
};

export type FieldDefinitionBehaviorSource = FieldDefinitionRequirementSource &
    FieldDefinitionInteractionSource;

export type ResolveEffectiveFieldBehaviorInput = {
    entityType: DrawerPolicyEntityType | string;
    fieldDef: FieldDefinitionBehaviorSource;
    layoutConfig?: RecordLayoutConfigJson | null;
    surface?: FieldBehaviorSurfaceV1;
};

function normalizePolicyEntityType(entityType: string): DrawerPolicyEntityType | null {
    const t = entityType.trim().toLowerCase();
    if (t === "opportunity" || t === "opportunities") return "opportunity";
    if (t === "job" || t === "jobs") return "job";
    return null;
}

function resolveDefinitionRequirement(fieldDef: FieldDefinitionRequirementSource): FieldRequirementPolicyV1 {
    return resolveFieldRequirementPolicy(fieldDef);
}

function resolveDefinitionInteraction(fieldDef: FieldDefinitionInteractionSource): FieldInteractionPolicyV1 {
    return resolveFieldInteractionPolicy(fieldDef);
}

function applyPlacementLayer(
    placement: FieldPlacementSurfaceBehaviorV1 | null,
    definitionReq: FieldRequirementPolicyV1,
    definitionInt: FieldInteractionPolicyV1
): Pick<EffectiveFieldBehavior, "requirement" | "interaction" | "requirement_source" | "interaction_source"> {
    let requirement = definitionReq;
    let requirement_source: EffectiveFieldBehaviorSource = "definition";
    let interaction = definitionInt;
    let interaction_source: EffectiveFieldBehaviorSource = "definition";

    if (placement?.requirement) {
        requirement = placement.requirement;
        requirement_source = "placement";
    }
    if (placement?.interaction) {
        interaction = placement.interaction;
        interaction_source = "placement";
    }

    return { requirement, interaction, requirement_source, interaction_source };
}

function applyPresetCaps(
    entityType: DrawerPolicyEntityType,
    fieldDef: FieldDefinitionBehaviorSource,
    layer: Pick<
        EffectiveFieldBehavior,
        "requirement" | "interaction" | "requirement_source" | "interaction_source"
    >
): Pick<EffectiveFieldBehavior, "requirement" | "interaction" | "requirement_source" | "interaction_source"> {
    const adapter = resolveDrawerFieldPolicy(entityType, {
        field_key: fieldDef.field_key,
        is_system: Boolean(fieldDef.is_system),
    });

    let { requirement, interaction, requirement_source, interaction_source } = layer;

    if (adapter && !adapter.requirementSupported) {
        requirement = requirementPolicyFromLegacyIsRequired(false);
        requirement_source = "preset";
    }

    if (adapter && !adapter.interactionSupported) {
        interaction = defaultInteractionPolicyForField(fieldDef);
        interaction_source = "preset";
    }

    return { requirement, interaction, requirement_source, interaction_source };
}

/**
 * Resolve effective requirement + interaction for a field on a layout surface.
 * Never throws; malformed placement data falls back to definition/preset.
 */
export function resolveEffectiveFieldBehavior(
    input: ResolveEffectiveFieldBehaviorInput
): EffectiveFieldBehavior | null {
    const canon = normalizePolicyEntityType(input.entityType);
    if (!canon) return null;

    const surface = input.surface ?? FIELD_BEHAVIOR_SURFACE_DRAWER_OVERVIEW;
    if (surface !== FIELD_BEHAVIOR_SURFACE_DRAWER_OVERVIEW) {
        return null;
    }

    const fieldDef = input.fieldDef;
    const placements = parseFieldPlacementsFromLayoutConfig(input.layoutConfig ?? null);
    const placement = getDrawerOverviewPlacementBehavior(placements, fieldDef.field_key);

    const definitionReq = resolveDefinitionRequirement(fieldDef);
    const definitionInt = resolveDefinitionInteraction(fieldDef);

    const layered = applyPlacementLayer(placement, definitionReq, definitionInt);
    const capped = applyPresetCaps(canon, fieldDef, layered);

    return {
        ...capped,
        surface,
    };
}

/**
 * Compatibility helper for consumers that still read `is_required` boolean (G3: no sync).
 * Derives boolean from effective requirement policy only.
 */
export function legacyIsRequiredFromEffective(behavior: EffectiveFieldBehavior): boolean {
    return legacyIsRequiredFromPolicy(behavior.requirement);
}
