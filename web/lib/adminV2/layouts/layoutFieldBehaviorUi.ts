/**
 * Card 5 — Layout Settings field behavior controls (opportunity workflow v1 drawer).
 * Effective behavior: placement → field_definitions → system preset.
 */

import { resolveDrawerFieldPolicy } from "@/lib/fields/drawerFieldPolicyAdapter";
import { resolveFieldInteractionPolicy } from "@/lib/fields/fieldInteractionPolicy";
import {
    isAdvancedInteractionPolicy,
    isAdvancedRequirementPolicyForSettings,
    interactionPresetFromPolicy,
    requirementPresetFromPolicy,
    type FieldPolicyInteractionPreset,
    type FieldPolicyRequirementPreset,
} from "@/lib/fields/fieldPolicySettingsUi";
import {
    resolveEffectiveFieldBehavior,
    type EffectiveFieldBehaviorSource,
} from "@/lib/fields/resolveEffectiveFieldBehavior";
import { OPERATOR_REQUIREMENT_INLINE_OPTIONS } from "@/lib/fields/fieldSettingsOperatorUi";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";

export const LAYOUT_REQUIREMENT_CONTROL_LABEL = "Required on this layout";
export const LAYOUT_INTERACTION_CONTROL_LABEL = "Editability here";

export {
    LAYOUT_FIELD_BEHAVIOR_HELPER,
    LAYOUT_REQUIREMENT_PRESET_OPTIONS,
    layoutRequirementPresetLabel,
} from "@/lib/adminV2/layouts/layoutSectionOperatorUi";

export const LAYOUT_INTERACTION_INLINE_OPTIONS: ReadonlyArray<{
    value: FieldPolicyInteractionPreset;
    label: string;
}> = [
    { value: "editable", label: "Editable" },
    { value: "read_only", label: "Read-only" },
];

export type LayoutFieldBehaviorInput = {
    field_key: string;
    is_system?: boolean;
    is_required?: boolean;
    requirement_policy?: unknown | null;
    interaction_policy?: unknown | null;
};

export type LayoutFieldBehaviorEditable = {
    kind: "editable";
    requirementPreset: FieldPolicyRequirementPreset;
    interactionPreset: FieldPolicyInteractionPreset;
    requirementEditable: boolean;
    interactionEditable: boolean;
    requirementSource: EffectiveFieldBehaviorSource;
    interactionSource: EffectiveFieldBehaviorSource;
    requirementHint: string | null;
    interactionHint: string | null;
};

export type LayoutFieldBehaviorLocked = {
    kind: "locked";
    lockReason: string;
    requirementSummary: string | null;
    interactionSummary: string | null;
};

export type LayoutFieldBehaviorView = LayoutFieldBehaviorEditable | LayoutFieldBehaviorLocked;

export function layoutFieldBehaviorControlsEnabled(args: {
    entityType: string;
    workflowV1Configured: boolean;
    canMutate: boolean;
    isReadOnly: boolean;
    canConfigureFieldBehavior: boolean;
}): boolean {
    return (
        args.entityType === "opportunity" &&
        args.workflowV1Configured &&
        args.canMutate &&
        !args.isReadOnly &&
        args.canConfigureFieldBehavior
    );
}

function sourceHint(source: EffectiveFieldBehaviorSource): string | null {
    if (source === "placement") return null;
    if (source === "definition") return "Using field default until you change it here.";
    return "Using system default until you change it here.";
}

function requirementSummaryLabel(preset: FieldPolicyRequirementPreset | null): string | null {
    if (!preset) return null;
    return OPERATOR_REQUIREMENT_INLINE_OPTIONS.find((o) => o.value === preset)?.label ?? preset;
}

function interactionSummaryLabel(preset: FieldPolicyInteractionPreset | null): string | null {
    if (!preset) return null;
    return LAYOUT_INTERACTION_INLINE_OPTIONS.find((o) => o.value === preset)?.label ?? preset;
}

function lockedReasonForField(
    fieldKey: string,
    policyMode: string | undefined,
    reason: string | undefined,
    requirementAdvanced: boolean,
    interactionAdvanced: boolean
): string {
    if (policyMode === "deferred") {
        if (/^status/.test(fieldKey) || fieldKey === "status_key") {
            return "Status is changed on the record status control, not on this layout.";
        }
        if (/^tour_/.test(fieldKey) || fieldKey === "tour_date") {
            return "Tour fields are set through scheduling flows, not layout behavior.";
        }
        if (/quote|pricing|discount|tuition|fee_/.test(fieldKey)) {
            return "Pricing and quote fields use dedicated flows, not layout behavior.";
        }
        return "This field is updated outside drawer field save.";
    }
    if (policyMode === "never_policy_controlled") {
        return "System or display-only field — not configurable on this layout.";
    }
    if (requirementAdvanced && interactionAdvanced) {
        return "Advanced field rules — edit on Fields, not this layout.";
    }
    if (requirementAdvanced) {
        return "Advanced requirement rules — edit on Fields, not this layout.";
    }
    if (interactionAdvanced) {
        return "Advanced editability rules — edit on Fields, not this layout.";
    }
    return reason?.trim() || "Not configurable on this layout.";
}

/**
 * Resolve layout behavior control state for one opportunity drawer field.
 * Never throws; malformed placement config falls back via `resolveEffectiveFieldBehavior`.
 */
export function buildLayoutFieldBehaviorView(
    row: LayoutFieldBehaviorInput,
    layoutConfig: RecordLayoutConfigJson | null
): LayoutFieldBehaviorView {
    const fieldDef = {
        field_key: row.field_key,
        entity_type: "opportunity" as const,
        is_system: row.is_system === true,
        is_required: row.is_required,
        requirement_policy: row.requirement_policy,
        interaction_policy: row.interaction_policy,
    };

    const adapter = resolveDrawerFieldPolicy("opportunity", fieldDef);
    if (!adapter || adapter.policyMode !== "enforceable") {
        return {
            kind: "locked",
            lockReason: lockedReasonForField(row.field_key, adapter?.policyMode, adapter?.reason, false, false),
            requirementSummary: null,
            interactionSummary: null,
        };
    }

    const effective = resolveEffectiveFieldBehavior({
        entityType: "opportunity",
        fieldDef,
        layoutConfig,
    });

    const requirement = effective?.requirement ?? null;
    const interaction =
        effective?.interaction ??
        resolveFieldInteractionPolicy({
            field_key: row.field_key,
            entity_type: "opportunity",
            is_system: row.is_system === true,
            interaction_policy: row.interaction_policy,
        });

    const requirementAdvanced = requirement ? isAdvancedRequirementPolicyForSettings(requirement) : true;
    const requirementPreset = requirement ? requirementPresetFromPolicy(requirement) : null;
    const interactionPreset = interactionPresetFromPolicy(interaction);
    const interactionAdvanced = isAdvancedInteractionPolicy(interaction);

    const requirementEditable =
        adapter.requirementSupported && requirementPreset !== null && !requirementAdvanced;
    const interactionEditable =
        adapter.interactionSupported && interactionPreset !== null && !interactionAdvanced;

    if (!requirementEditable && !interactionEditable) {
        return {
            kind: "locked",
            lockReason: lockedReasonForField(
                row.field_key,
                adapter.policyMode,
                adapter.reason,
                requirementAdvanced,
                interactionAdvanced
            ),
            requirementSummary: requirementSummaryLabel(requirementPreset),
            interactionSummary: interactionSummaryLabel(interactionPreset),
        };
    }

    return {
        kind: "editable",
        requirementPreset: requirementPreset ?? "optional",
        interactionPreset: interactionPreset ?? "editable",
        requirementEditable,
        interactionEditable,
        requirementSource: effective?.requirement_source ?? "definition",
        interactionSource: effective?.interaction_source ?? "definition",
        requirementHint: requirementEditable
            ? sourceHint(effective?.requirement_source ?? "definition")
            : "Requirement is not configurable on this layout.",
        interactionHint: interactionEditable
            ? sourceHint(effective?.interaction_source ?? "definition")
            : "Editability is fixed for this field.",
    };
}
