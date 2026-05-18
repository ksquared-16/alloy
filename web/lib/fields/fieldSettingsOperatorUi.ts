/**
 * Operator-facing field Settings helpers (display filtering + labels).
 * UI-only; does not change PATCH enforcement or policy maps.
 */

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

/**
 * Whether a field_definition row should be hidden from the default operator list.
 * Custom (non-system) fields are shown unless they match structural id patterns.
 */
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

/** Per-entity overrides when stored label is missing or too technical. */
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

/** Primary list/modal title for operators (label → override → humanized key). */
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

/** Short policy column label for the field list. */
export function operatorPolicyColumnLabel(view: FieldPolicySettingsView | null, isRequired: boolean): string {
    if (!view) return isRequired ? "Required" : "Optional";
    if (!view.policyEditable) {
        if (view.writeMap.policyMode === "deferred") return "Configured elsewhere";
        return "Managed by system";
    }
    if (view.requirementAdvanced || view.interactionAdvanced) return "Advanced rules";
    switch (view.displayCategory) {
        case "required":
            return "Required";
        case "required_on_save":
            return "Required on save";
        case "read_only":
            return "Read-only";
        case "optional":
        case "editable":
            return "Optional";
        default:
            return view.displayLabel;
    }
}

/** Whether operators can change required/optional inline in the field list. */
export function canOperatorEditRequirementInline(view: FieldPolicySettingsView | null): boolean {
    return Boolean(view?.policyEditable && !view.requirementAdvanced && !view.interactionAdvanced);
}

/** Subtitle under policy controls in the edit modal. */
export function operatorPolicyCapabilityHint(view: FieldPolicySettingsView | null): string {
    if (!view) return "";
    if (view.policyEditable) return "You can require this field and control whether staff can edit it when saving the record drawer.";
    if (view.writeMap.policyMode === "deferred") {
        return "This field is updated through another workflow (status, tour, quote, or pricing). Change it on the record or in that workflow.";
    }
    return "Alloy manages this field internally. You can still adjust its label and where it appears when supported.";
}
