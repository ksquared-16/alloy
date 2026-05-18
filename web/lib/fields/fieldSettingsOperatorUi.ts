/**
 * Operator-facing field Settings helpers (display filtering + labels).
 * UI-only; does not change PATCH enforcement or policy maps.
 */

import type { FieldPolicyRequirementPreset } from "@/lib/fields/fieldPolicySettingsUi";
import { resolveDrawerFieldPolicy } from "@/lib/fields/drawerFieldPolicyAdapter";
import {
    entityTypeSupportsFieldPolicySettings,
    type FieldPolicySettingsView,
} from "@/lib/fields/fieldPolicySettingsUi";

const GLOBAL_HIDDEN_KEYS = new Set([
    "org_id",
    "created_at",
    "updated_at",
    "deleted_at",
    "created_by",
    "updated_by",
    "version",
    "sync_version",
]);

export const OPERATOR_REQUIREMENT_INLINE_OPTIONS: ReadonlyArray<{
    value: FieldPolicyRequirementPreset;
    label: string;
}> = [
    { value: "optional", label: "Optional" },
    { value: "required", label: "Required" },
    { value: "required_on_save", label: "Required when saving" },
];

export function operatorRequirementPresetLabel(preset: FieldPolicyRequirementPreset): string {
    return OPERATOR_REQUIREMENT_INLINE_OPTIONS.find((o) => o.value === preset)?.label ?? preset;
}

/** Keys that are always hidden from the default operator field list. */
export function isAlwaysHiddenFieldKey(fieldKey: string): boolean {
    const key = fieldKey.trim();
    if (!key) return true;
    if (GLOBAL_HIDDEN_KEYS.has(key)) return true;
    if (key === "id") return true;
    if (key.startsWith("_")) return true;
    if (/_id$/.test(key) || /_uuid$/.test(key)) return true;
    return false;
}

export type OperatorFieldRow = {
    field_key: string;
    is_system: boolean;
    label: string | null;
};

export function isOperatorHiddenField(entityType: string, row: OperatorFieldRow): boolean {
    if (isAlwaysHiddenFieldKey(row.field_key)) return true;
    if (!row.is_system) return false;

    if (entityTypeSupportsFieldPolicySettings(entityType)) {
        const resolved = resolveDrawerFieldPolicy(entityType, {
            field_key: row.field_key,
            is_system: row.is_system,
        });
        if (!resolved) return false;
        if (resolved.policyMode === "never_policy_controlled") return true;
        if (resolved.storage === "relationship" || resolved.storage === "pipeline" || resolved.storage === "action") {
            return true;
        }
        if (resolved.storage === "computed") return true;
        if (resolved.policyMode === "deferred") return true;
    }

    return false;
}

function humanizeFieldKey(fieldKey: string): string {
    return fieldKey
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

const OPERATOR_LABEL_OVERRIDES: Record<string, Record<string, string>> = {
    opportunity: {
        name: "Inquiry name",
        source: "Lead source",
        assigned_to: "Assigned to",
        lost_reason: "Lost reason",
        job_date: "Preferred service date",
        job_time_window: "Preferred time window",
        notes: "Notes",
    },
    job: {
        title: "Job title",
        description: "Description",
        service_key: "Service",
        job_type: "Job type",
        scheduled_at: "Scheduled at",
        completed_at: "Completed at",
        service_frequency_key: "Service frequency",
        is_recurring: "Recurring",
    },
    customer: {
        name: "Account name",
    },
    person: {
        first_name: "First name",
        last_name: "Last name",
        email: "Email",
        phone: "Phone",
    },
};

export function operatorFieldDisplayLabel(entityType: string, row: OperatorFieldRow): string {
    const key = row.field_key.trim();
    const stored = row.label?.trim();
    const override = OPERATOR_LABEL_OVERRIDES[entityType.trim().toLowerCase()]?.[key];
    if (override) return override;
    if (stored && stored.toLowerCase() !== key.toLowerCase() && !looksLikeRawKey(stored)) {
        return stored;
    }
    if (stored && !looksLikeRawKey(stored)) return stored;
    return humanizeFieldKey(key);
}

function looksLikeRawKey(label: string): boolean {
    return /^[a-z][a-z0-9_]*$/.test(label.trim());
}

function deferredFieldHint(entityType: string, fieldKey: string): string | null {
    const key = fieldKey.trim();
    if (/^status/.test(key) || key === "status_key") return "Changed on the record status control";
    if (/^tour_/.test(key) || key === "tour_date" || key === "tour_time") return "Set through tour scheduling";
    if (/quote|pricing|discount|tuition|fee_/.test(key)) return "Set through quote or pricing flows";
    if (key === "desired_start_date" || key === "program_type" || key === "schedule_type") {
        return "Set through enrollment or inquiry workflow";
    }
    if (entityType === "opportunity" && key === "assigned_to") return null;
    return "Updated outside drawer field save";
}

/** Why Required cannot be changed inline (empty when editable). */
export function operatorRequirementLockedReason(
    entityType: string,
    fieldKey: string,
    view: FieldPolicySettingsView | null
): string {
    if (!view) return "Not available for this record type";
    if (canOperatorEditRequirementInline(view)) return "";
    if (!view.policyEditable) {
        const deferred = deferredFieldHint(entityType, fieldKey);
        if (deferred) return deferred;
        if (view.writeMap.policyMode === "deferred") return "Updated outside drawer field save";
        return "Managed elsewhere — you can still edit the label and visibility";
    }
    if (view.requirementAdvanced || view.interactionAdvanced) {
        return "Managed elsewhere";
    }
    return "Cannot change here";
}

/** Short policy column label for the field list. */
export function operatorPolicyColumnLabel(
    entityType: string,
    fieldKey: string,
    view: FieldPolicySettingsView | null,
    isRequired: boolean
): string {
    if (!view) return isRequired ? "Required" : "Optional";
    if (!view.policyEditable) {
        const deferred = deferredFieldHint(entityType, fieldKey);
        if (deferred) return deferred;
        return "Managed elsewhere";
    }
    if (view.requirementAdvanced || view.interactionAdvanced) return "Managed elsewhere";
    switch (view.displayCategory) {
        case "required":
            return "Required";
        case "required_on_save":
            return "Required when saving";
        case "read_only":
            return "Read-only";
        case "optional":
        case "editable":
            return "Optional";
        default:
            return view.displayLabel;
    }
}

export function canOperatorEditRequirementInline(view: FieldPolicySettingsView | null): boolean {
    return Boolean(view?.policyEditable && !view.requirementAdvanced && !view.interactionAdvanced);
}

export function operatorPolicyCapabilityHint(
    entityType: string,
    fieldKey: string,
    view: FieldPolicySettingsView | null
): string {
    if (!view) return "";
    if (view.policyEditable) {
        return "Control whether staff must fill this in and whether they can edit it when saving the record drawer.";
    }
    const locked = operatorRequirementLockedReason(entityType, fieldKey, view);
    if (locked) return locked;
    return "You can still adjust the display label and where this field appears when supported.";
}
