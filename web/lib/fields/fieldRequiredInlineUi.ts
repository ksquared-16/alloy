/**
 * Pass 3 — inline Required column behavior (testable, UI-only).
 */

import type { FieldPolicyRequirementPreset } from "@/lib/fields/fieldPolicySettingsUi";
import {
    entityTypeSupportsFieldPolicySettings,
    type FieldPolicySettingsView,
} from "@/lib/fields/fieldPolicySettingsUi";
import {
    canOperatorEditRequirementInline,
    fieldBehaviorConfiguredOnRecordLayouts,
} from "@/lib/fields/fieldSettingsOperatorUi";

export type InlineRequirementCellMode = "editable" | "locked" | "legacy_checkbox";

export type InlineRequirementRow = {
    field_key: string;
    is_required: boolean;
};

/** Whether the Required column should render an interactive select. */
export function inlineRequirementCellMode(
    entityType: string,
    canMutate: boolean,
    view: FieldPolicySettingsView | null
): InlineRequirementCellMode {
    if (fieldBehaviorConfiguredOnRecordLayouts(entityType)) {
        return "locked";
    }
    const policySupported = entityTypeSupportsFieldPolicySettings(entityType);
    if (!policySupported) {
        return canMutate ? "legacy_checkbox" : "locked";
    }
    if (!view) return "locked";
    if (canMutate && canOperatorEditRequirementInline(view)) return "editable";
    return "locked";
}

/** Resolved preset for select value (always a valid option when editable). */
export function resolveInlineRequirementPreset(
    row: InlineRequirementRow,
    view: FieldPolicySettingsView | null,
    override?: FieldPolicyRequirementPreset | null
): FieldPolicyRequirementPreset {
    if (override) return override;
    if (view?.requirementPreset) return view.requirementPreset;
    if (row.is_required) return "required";
    return "optional";
}
