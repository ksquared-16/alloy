/**
 * Card 2 — Settings UI helpers for field policy editing (opportunity + job).
 */

import {
    buildDrawerFieldPolicyResolvedMap,
    resolveDrawerFieldPolicy,
    type DrawerFieldPolicyResolved,
    type DrawerPolicyEntityType,
} from "@/lib/fields/drawerFieldPolicyAdapter";
import {
    parseFieldInteractionPolicy,
    resolveFieldInteractionPolicy,
    type FieldInteractionPolicyV1,
} from "@/lib/fields/fieldInteractionPolicy";
import {
    parseFieldRequirementPolicy,
    resolveFieldRequirementPolicy,
    requirementPolicyFromLegacyIsRequired,
    type FieldRequirementPolicyV1,
} from "@/lib/fields/fieldRequirementPolicy";

export const FIELD_POLICY_SETTINGS_ENTITY_TYPES = new Set<DrawerPolicyEntityType>(["opportunity", "job"]);

export type FieldPolicyRequirementPreset = "optional" | "required" | "required_on_save";

export type FieldPolicyInteractionPreset = "editable" | "read_only";

export type FieldPolicyDisplayCategory =
    | "optional"
    | "required"
    | "required_on_save"
    | "advanced_requirement"
    | "editable"
    | "read_only"
    | "advanced_interaction"
    | "not_enforceable";

export type FieldPolicySettingsRow = {
    field_key: string;
    is_system: boolean;
    is_required: boolean;
    requirement_policy: unknown | null;
    interaction_policy: unknown | null;
};

export type FieldPolicySettingsView = {
    entityType: DrawerPolicyEntityType;
    writeMap: DrawerFieldPolicyResolved;
    policyEditable: boolean;
    requirementPreset: FieldPolicyRequirementPreset | null;
    interactionPreset: FieldPolicyInteractionPreset | null;
    requirementAdvanced: boolean;
    interactionAdvanced: boolean;
    displayCategory: FieldPolicyDisplayCategory;
    displayLabel: string;
    policyHint: string;
};

const ADVANCED_REQUIREMENT_MODES = new Set([
    "required_before_status_change",
    "required_before_action",
    "conditionally_required",
]);

export function entityTypeSupportsFieldPolicySettings(entityType: string): entityType is DrawerPolicyEntityType {
    const t = entityType.trim().toLowerCase();
    return t === "opportunity" || t === "job";
}

export function isAdvancedRequirementPolicyForSettings(policy: FieldRequirementPolicyV1): boolean {
    if (ADVANCED_REQUIREMENT_MODES.has(policy.mode)) return true;
    if (policy.required_by_role?.length) return true;
    if (policy.required_by_status?.length) return true;
    if (policy.mode === "required" && policy.validation_scope && policy.validation_scope !== "save" && policy.validation_scope !== "all") {
        return true;
    }
    return false;
}

export function isAdvancedInteractionPolicy(policy: FieldInteractionPolicyV1): boolean {
    const mode = policy.editability_mode;
    if (mode !== "editable" && mode !== "read_only") return true;
    const ownership = policy.ownership;
    if (!ownership) return false;
    if (ownership.write_behavior !== "direct") return true;
    if (ownership.required_permissions?.length) return true;
    if (ownership.lock_reason && mode === "editable") return true;
    return false;
}

export function requirementPresetFromPolicy(policy: FieldRequirementPolicyV1): FieldPolicyRequirementPreset | null {
    if (isAdvancedRequirementPolicyForSettings(policy)) return null;
    if (policy.mode === "optional") return "optional";
    if (policy.mode === "required") return "required";
    if (policy.mode === "required_on_save") return "required_on_save";
    return null;
}

export function interactionPresetFromPolicy(policy: FieldInteractionPolicyV1): FieldPolicyInteractionPreset | null {
    if (isAdvancedInteractionPolicy(policy)) return null;
    if (policy.editability_mode === "editable") return "editable";
    if (policy.editability_mode === "read_only") return "read_only";
    return null;
}

export function buildSimpleRequirementPolicy(preset: FieldPolicyRequirementPreset): FieldRequirementPolicyV1 {
    if (preset === "optional") return requirementPolicyFromLegacyIsRequired(false);
    if (preset === "required") return requirementPolicyFromLegacyIsRequired(true);
    return {
        version: 1,
        mode: "required_on_save",
        validation_scope: "save",
        validation_message: null,
        required_by_role: null,
        required_by_status: null,
        status_keys: null,
        action_keys: null,
        condition: null,
    };
}

export function buildSimpleInteractionPolicy(
    preset: FieldPolicyInteractionPreset,
    entityType: string,
    fieldKey: string
): FieldInteractionPolicyV1 {
    if (preset === "read_only") {
        return {
            version: 1,
            editability_mode: "read_only",
            ownership: {
                source_entity: entityType,
                source_field: fieldKey,
                write_target_entity: entityType,
                write_target_field: fieldKey,
                write_behavior: "none",
                lock_reason: "read_only_policy",
                required_permissions: null,
            },
        };
    }
    return {
        version: 1,
        editability_mode: "editable",
        ownership: {
            source_entity: entityType,
            source_field: fieldKey,
            write_target_entity: entityType,
            write_target_field: fieldKey,
            write_behavior: "direct",
            lock_reason: null,
            required_permissions: null,
        },
    };
}

function displayLabelForCategory(cat: FieldPolicyDisplayCategory): string {
    switch (cat) {
        case "optional":
            return "Optional";
        case "required":
            return "Always required";
        case "required_on_save":
            return "Required on save";
        case "advanced_requirement":
            return "Advanced requirement";
        case "editable":
            return "Editable";
        case "read_only":
            return "Read-only";
        case "advanced_interaction":
            return "Advanced interaction";
        case "not_enforceable":
            return "Not enforceable";
        default:
            return "—";
    }
}

export function buildFieldPolicySettingsView(
    entityType: string,
    row: FieldPolicySettingsRow
): FieldPolicySettingsView | null {
    if (!entityTypeSupportsFieldPolicySettings(entityType)) return null;

    const writeMap = resolveDrawerFieldPolicy(entityType, row);
    if (!writeMap) return null;

    const reqPolicy = resolveFieldRequirementPolicy(row);
    const intPolicy = resolveFieldInteractionPolicy({
        field_key: row.field_key,
        entity_type: entityType,
        is_system: row.is_system,
        interaction_policy: row.interaction_policy,
    });

    const policyEditable = writeMap.policyMode === "enforceable";
    const requirementAdvanced = isAdvancedRequirementPolicyForSettings(reqPolicy);
    const interactionAdvanced = isAdvancedInteractionPolicy(intPolicy);
    const requirementPreset = requirementPresetFromPolicy(reqPolicy);
    const interactionPreset = interactionPresetFromPolicy(intPolicy);

    let displayCategory: FieldPolicyDisplayCategory = "not_enforceable";
    if (!policyEditable) {
        displayCategory = "not_enforceable";
    } else if (requirementAdvanced) {
        displayCategory = "advanced_requirement";
    } else if (interactionAdvanced && !requirementPreset) {
        displayCategory = "advanced_interaction";
    } else if (requirementPreset === "required_on_save") {
        displayCategory = "required_on_save";
    } else if (requirementPreset === "required") {
        displayCategory = "required";
    } else if (interactionPreset === "read_only") {
        displayCategory = "read_only";
    } else if (interactionPreset === "editable" && requirementPreset === "optional") {
        displayCategory = "optional";
    } else if (interactionPreset === "editable") {
        displayCategory = "editable";
    } else {
        displayCategory = "optional";
    }

    const policyHint = policyEditable
        ? "Policies on this field are enforced on drawer save (mapped write path)."
        : writeMap.reason;

    return {
        entityType,
        writeMap,
        policyEditable,
        requirementPreset,
        interactionPreset,
        requirementAdvanced,
        interactionAdvanced,
        displayCategory,
        displayLabel: displayLabelForCategory(displayCategory),
        policyHint,
    };
}

export function summarizeAdvancedRequirementPolicy(policy: FieldRequirementPolicyV1): string {
    const parts = [`mode=${policy.mode}`];
    if (policy.validation_scope) parts.push(`scope=${policy.validation_scope}`);
    if (policy.status_keys?.length) parts.push(`status_keys=${policy.status_keys.join(",")}`);
    if (policy.action_keys?.length) parts.push(`action_keys=${policy.action_keys.join(",")}`);
    if (policy.condition) parts.push(`condition on ${policy.condition.field_key}`);
    return parts.join(" · ");
}

export function summarizeAdvancedInteractionPolicy(policy: FieldInteractionPolicyV1): string {
    return `mode=${policy.editability_mode}${policy.ownership?.lock_reason ? ` · ${policy.ownership.lock_reason}` : ""}`;
}

export function buildFieldPolicySettingsViewsForList(
    entityType: string,
    rows: FieldPolicySettingsRow[]
): Map<string, FieldPolicySettingsView> {
    const out = new Map<string, FieldPolicySettingsView>();
    if (!entityTypeSupportsFieldPolicySettings(entityType)) return out;
    for (const row of rows) {
        const view = buildFieldPolicySettingsView(entityType, row);
        if (view) out.set(row.field_key, view);
    }
    return out;
}

export function buildWriteMapForEntity(entityType: string, rows: FieldPolicySettingsRow[]): Record<string, DrawerFieldPolicyResolved> {
    if (!entityTypeSupportsFieldPolicySettings(entityType)) return {};
    return buildDrawerFieldPolicyResolvedMap(entityType, rows);
}

/** Parse stored policies for edit modal (invalid JSON → legacy is_required only). */
export function parseStoredPoliciesForEdit(row: FieldPolicySettingsRow): {
    requirementPolicy: FieldRequirementPolicyV1;
    interactionPolicy: FieldInteractionPolicyV1;
    requirementParseError: boolean;
    interactionParseError: boolean;
} {
    let requirementParseError = false;
    let interactionParseError = false;
    let requirementPolicy: FieldRequirementPolicyV1;
    if (row.requirement_policy != null) {
        const parsed = parseFieldRequirementPolicy(row.requirement_policy);
        if (parsed.ok) requirementPolicy = parsed.value;
        else {
            requirementParseError = true;
            requirementPolicy = requirementPolicyFromLegacyIsRequired(row.is_required);
        }
    } else {
        requirementPolicy = resolveFieldRequirementPolicy(row);
    }

    let interactionPolicy: FieldInteractionPolicyV1;
    if (row.interaction_policy != null) {
        const parsed = parseFieldInteractionPolicy(row.interaction_policy);
        if (parsed.ok) interactionPolicy = parsed.value;
        else {
            interactionParseError = true;
            interactionPolicy = resolveFieldInteractionPolicy({
                field_key: row.field_key,
                entity_type: "opportunity",
                is_system: row.is_system,
            });
        }
    } else {
        interactionPolicy = resolveFieldInteractionPolicy({
            field_key: row.field_key,
            entity_type: "opportunity",
            is_system: row.is_system,
            interaction_policy: row.interaction_policy,
        });
    }

    return { requirementPolicy, interactionPolicy, requirementParseError, interactionParseError };
}
