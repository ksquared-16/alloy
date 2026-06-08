/**
 * IC-1c — editable operational outcome config (public link metadata).
 * Pure helpers — no runtime submit side effects.
 */

import { parseIntakeAutoCreateFlags } from "@/lib/forms/intake/parseIntakeAutoCreateFlags";
import { parseIntakeLinkDefaults } from "@/lib/forms/intake/parseIntakeLinkDefaults";
import { linkRequiresLeadCapture } from "@/lib/public/forms/publicFormTypes";

export type OutcomeReviewModeEdit = "always" | "confidence" | "never" | "";

export type OutcomeConfigEditForm = {
    leadCaptureEnabled: boolean;
    autoCreateOpportunity: boolean;
    autoOperationalize: boolean;
    reviewMode: OutcomeReviewModeEdit;
    reviewRequired: boolean;
    locationId: string;
    workUnitId: string;
    departmentId: string;
    verticalId: string;
    statusKey: string;
    source: "embed" | "public_form" | "";
};

export type OutcomeConfigEditValidation = {
    errors: string[];
    warnings: string[];
};

const OUTCOME_METADATA_KEYS = new Set([
    "lead_capture",
    "intake",
    "mode",
    "auto_create_person",
    "auto_create_customer",
    "auto_create_customer_member",
    "auto_create_opportunity",
    "review_mode",
    "review_required",
    "auto_operationalize",
    "default_vertical_id",
    "default_location_id",
    "default_work_unit_id",
    "default_department_id",
    "default_opportunity_status_key",
    "intake_opportunity_source",
    "embed_mode",
]);

function metaObject(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw as Record<string, unknown>;
}

function readReviewModeEdit(m: Record<string, unknown>): OutcomeReviewModeEdit {
    const raw = typeof m.review_mode === "string" ? m.review_mode.trim() : "";
    if (raw === "always" || raw === "never") return raw;
    if (raw === "confidence" || raw === "exception_only") return "confidence";
    return "";
}

/** Parse editable form state from link metadata (optionally merged with form defaults). */
export function parseOutcomeConfigEditForm(
    linkMetadata: Record<string, unknown> | null | undefined,
    formDefaults?: Record<string, unknown> | null | undefined
): OutcomeConfigEditForm {
    const link = metaObject(linkMetadata);
    const form = metaObject(formDefaults?.intake_outcome ?? formDefaults);
    const merged = { ...form, ...link };

    const flags = parseIntakeAutoCreateFlags(merged);
    const routing = parseIntakeLinkDefaults(merged);
    const leadCapture = linkRequiresLeadCapture(merged);

    const explicitSource =
        typeof merged.intake_opportunity_source === "string" ? merged.intake_opportunity_source.trim() : "";
    let source: OutcomeConfigEditForm["source"] = "";
    if (explicitSource === "embed" || explicitSource === "public_form") source = explicitSource;
    else if (merged.embed_mode === true) source = "embed";

    return {
        leadCaptureEnabled: leadCapture,
        autoCreateOpportunity: flags.auto_create_opportunity,
        autoOperationalize: merged.auto_operationalize === true,
        reviewMode: readReviewModeEdit(merged),
        reviewRequired: merged.review_required === true,
        locationId: routing.default_location_id ?? "",
        workUnitId: routing.default_work_unit_id ?? "",
        departmentId: routing.default_department_id ?? "",
        verticalId: routing.default_vertical_id ?? "",
        statusKey: routing.default_opportunity_status_key ?? "",
        source,
    };
}

function setOrDelete(meta: Record<string, unknown>, key: string, value: string | boolean | null | undefined): void {
    if (value === null || value === undefined || value === "") {
        delete meta[key];
        return;
    }
    meta[key] = value;
}

/** Merge editable fields into existing link metadata — preserves unknown keys. */
export function mergeOutcomeConfigIntoLinkMetadata(
    existingMetadata: Record<string, unknown> | null | undefined,
    form: OutcomeConfigEditForm
): Record<string, unknown> {
    const merged = { ...metaObject(existingMetadata) };

    if (form.leadCaptureEnabled) {
        merged.lead_capture = true;
        merged.intake = true;
        if (typeof merged.mode !== "string" || !merged.mode.trim()) merged.mode = "intake";
    } else {
        merged.lead_capture = false;
        merged.intake = false;
    }

    const intakeEnabled = form.leadCaptureEnabled;
    const createOpp = intakeEnabled && form.autoCreateOpportunity;

    setOrDelete(merged, "auto_create_opportunity", createOpp ? true : false);
    setOrDelete(merged, "auto_create_person", createOpp ? true : false);
    setOrDelete(merged, "auto_create_customer", createOpp ? true : false);
    setOrDelete(merged, "auto_create_customer_member", createOpp ? true : false);

    if (!intakeEnabled) {
        setOrDelete(merged, "auto_operationalize", false);
        setOrDelete(merged, "review_mode", null);
        setOrDelete(merged, "review_required", false);
    } else {
        const reviewRequired = form.reviewRequired;
        let reviewMode = form.reviewMode;
        let autoOp = form.autoOperationalize;

        if (reviewRequired) {
            autoOp = false;
        }
        if (autoOp && reviewMode !== "confidence" && reviewMode !== "never") {
            reviewMode = "confidence";
        }

        setOrDelete(merged, "review_required", reviewRequired ? true : false);
        setOrDelete(merged, "auto_operationalize", autoOp ? true : false);
        if (reviewMode) {
            merged.review_mode = reviewMode === "confidence" ? "confidence" : reviewMode;
        } else {
            delete merged.review_mode;
        }
    }

    setOrDelete(merged, "default_location_id", intakeEnabled ? form.locationId : form.locationId || null);
    setOrDelete(merged, "default_work_unit_id", intakeEnabled ? form.workUnitId : form.workUnitId || null);
    setOrDelete(merged, "default_department_id", intakeEnabled ? form.departmentId : form.departmentId || null);
    setOrDelete(merged, "default_vertical_id", intakeEnabled ? form.verticalId : form.verticalId || null);
    setOrDelete(merged, "default_opportunity_status_key", intakeEnabled ? form.statusKey : form.statusKey || null);

    if (intakeEnabled && form.source === "embed") {
        merged.embed_mode = true;
        merged.intake_opportunity_source = "embed";
    } else if (intakeEnabled && form.source === "public_form") {
        merged.intake_opportunity_source = "public_form";
        delete merged.embed_mode;
    } else if (!intakeEnabled) {
        // preserve source keys unless explicitly cleared — do not delete unknown routing context
    }

    return merged;
}

export function validateOutcomeConfigEditForm(form: OutcomeConfigEditForm): OutcomeConfigEditValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (form.reviewRequired && form.autoOperationalize) {
        warnings.push("Review required overrides auto-operationalize.");
    }

    if (form.autoOperationalize && form.reviewMode === "always") {
        warnings.push("Auto-operationalize works best with exception-based review.");
    }

    if (form.autoOperationalize && form.leadCaptureEnabled) {
        if (!form.verticalId || !form.locationId || !form.workUnitId) {
            warnings.push("Missing routing — auto-operationalization may still require review until location, work unit, and vertical are set.");
        }
    }

    if (form.leadCaptureEnabled && form.autoCreateOpportunity && !form.verticalId) {
        warnings.push("Vertical is required for intake to create inquiries.");
    }

    return { errors, warnings };
}

/** Keys owned by outcome editor — for tests/docs only. */
export function outcomeConfigOwnedMetadataKeys(): string[] {
    return [...OUTCOME_METADATA_KEYS];
}
