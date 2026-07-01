/**
 * Form definition metadata — lifecycle usage selection (Card 3).
 */

import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import { LIFECYCLE_STAGE_ORDER } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";
import type { OperationalIntentKey } from "@/lib/forms/operationalIntentTemplates";

export const FORM_LIFECYCLE_USAGE_METADATA_KEY = "lifecycle_usage_v1" as const;

export type FormsLifecycleUsageV1 = {
    version: 1;
    department_id: string;
    stage_key: LifecycleOperatorStage;
    intake_intent: OperationalIntentKey | string;
    process_id?: string | null;
};

function metaObject(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw as Record<string, unknown>;
}

function isStageKey(s: string): s is LifecycleOperatorStage {
    return (LIFECYCLE_STAGE_ORDER as readonly string[]).includes(s);
}

function isOperationalIntentKey(s: string): s is OperationalIntentKey {
    return (
        s === "enrollment_lead" ||
        s === "existing_family" ||
        s === "operational_document" ||
        s === "waitlist" ||
        s === "packet_step" ||
        s === "custom"
    );
}

export function readFormLifecycleUsage(
    formMetadata: Record<string, unknown> | null | undefined
): FormsLifecycleUsageV1 | null {
    const meta = metaObject(formMetadata);
    const raw = meta[FORM_LIFECYCLE_USAGE_METADATA_KEY];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

    const department_id =
        typeof (raw as { department_id?: unknown }).department_id === "string"
            ? (raw as { department_id: string }).department_id.trim()
            : "";
    const stage_keyRaw =
        typeof (raw as { stage_key?: unknown }).stage_key === "string"
            ? (raw as { stage_key: string }).stage_key.trim()
            : "";
    const intake_intentRaw =
        typeof (raw as { intake_intent?: unknown }).intake_intent === "string"
            ? (raw as { intake_intent: string }).intake_intent.trim()
            : "";

    if (!department_id || !isStageKey(stage_keyRaw) || !intake_intentRaw) return null;

    const process_id =
        typeof (raw as { process_id?: unknown }).process_id === "string"
            ? (raw as { process_id: string }).process_id.trim() || null
            : null;

    return {
        version: 1,
        department_id,
        stage_key: stage_keyRaw,
        intake_intent: isOperationalIntentKey(intake_intentRaw) ? intake_intentRaw : intake_intentRaw,
        ...(process_id ? { process_id } : {}),
    };
}

export function isFormLifecycleUsageConfigured(
    formMetadata: Record<string, unknown> | null | undefined
): boolean {
    return readFormLifecycleUsage(formMetadata) != null;
}

export type BuildLifecycleUsageMetadataPatchInput = {
    department_id: string;
    stage_key: string;
    intake_intent: string;
    process_id?: string | null;
};

/** Merge lifecycle usage onto form metadata and keep intake_intent in sync. */
export function buildLifecycleUsageMetadataPatch(
    input: BuildLifecycleUsageMetadataPatchInput,
    existingMetadata: Record<string, unknown> | null | undefined
): Record<string, unknown> {
    const stage = input.stage_key.trim();
    if (!isStageKey(stage)) {
        throw new Error("Invalid lifecycle stage");
    }

    const intent = input.intake_intent.trim();
    if (!intent) {
        throw new Error("Intent is required");
    }

    const department_id = input.department_id.trim();
    if (!department_id) {
        throw new Error("Lifecycle department is required");
    }

    const usage: FormsLifecycleUsageV1 = {
        version: 1,
        department_id,
        stage_key: stage,
        intake_intent: isOperationalIntentKey(intent) ? intent : intent,
        ...(input.process_id?.trim() ? { process_id: input.process_id.trim() } : {}),
    };

    const intentPatch = applyOperationalIntentFieldsToMetadata(intent, existingMetadata);

    return {
        ...intentPatch,
        [FORM_LIFECYCLE_USAGE_METADATA_KEY]: usage,
    };
}

function applyOperationalIntentFieldsToMetadata(
    intent: string,
    existingMetadata: Record<string, unknown> | null | undefined
): Record<string, unknown> {
    const existing = metaObject(existingMetadata);
    if (!isOperationalIntentKey(intent)) {
        return existing;
    }

    const next: Record<string, unknown> = { ...existing, intake_intent: intent };
    const intakeOutcome: Record<string, unknown> = {
        ...metaObject(existing.intake_outcome),
    };

    if (intent === "enrollment_lead") {
        intakeOutcome.auto_create_opportunity = true;
        intakeOutcome.default_opportunity_status_key = "new_inquiry";
        next.intake_purpose = "enrollment_lead";
    } else if (intent === "waitlist") {
        intakeOutcome.auto_create_opportunity = true;
        intakeOutcome.default_opportunity_status_key = "waitlist";
        delete next.intake_purpose;
    } else if (intent === "custom") {
        /* preserve operator overrides */
    } else {
        delete next.intake_purpose;
    }

    if (intent !== "custom") {
        next.intake_outcome = intakeOutcome;
    }

    return next;
}

/** When operational intent changes elsewhere, mirror into lifecycle_usage_v1 when present. */
export function syncLifecycleUsageIntentInMetadata(
    metadata: Record<string, unknown>,
    intent: OperationalIntentKey
): Record<string, unknown> {
    const usage = readFormLifecycleUsage(metadata);
    if (!usage) return metadata;
    return {
        ...metadata,
        [FORM_LIFECYCLE_USAGE_METADATA_KEY]: {
            ...usage,
            intake_intent: intent,
        },
    };
}

/** Default intent for lifecycle panel when usage not saved yet. */
export function defaultLifecycleUsageIntent(
    formMetadata: Record<string, unknown> | null | undefined
): OperationalIntentKey | "general" {
    const meta = metaObject(formMetadata);
    const raw = typeof meta.intake_intent === "string" ? meta.intake_intent.trim() : "";
    if (isOperationalIntentKey(raw)) return raw;
    const legacyPurpose = typeof meta.intake_purpose === "string" ? meta.intake_purpose.trim() : "";
    if (legacyPurpose === "enrollment_lead") return "enrollment_lead";
    return "enrollment_lead";
}
