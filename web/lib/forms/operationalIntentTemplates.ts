/**
 * Operational intent templates (Forms MVP Card 1).
 * Lightweight presets over existing form + public link metadata — no schema migration.
 */

import { inferIntakeTypeFromLink, type IntakeTypeKey } from "@/lib/forms/inferIntakeType";
import { ENROLLMENT_LEAD_CAPTURE_DEMO_FORM_KEY } from "@/lib/forms/seeds/enrollmentLeadCaptureDemo";
import { parseIntakeAutoCreateFlags } from "@/lib/forms/intake/parseIntakeAutoCreateFlags";
import { linkRequiresLeadCapture } from "@/lib/public/forms/publicFormTypes";

export type OperationalIntentKey =
    | "enrollment_lead"
    | "existing_family"
    | "operational_document"
    | "waitlist"
    | "packet_step"
    | "custom";

export type OperationalIntentTemplate = {
    key: OperationalIntentKey;
    label: string;
    description: string;
    /** Operator-facing share guidance. */
    shareHint: string;
    /** Static after-submit preview when link outcome is not configured yet. */
    afterSubmitPreview: string[];
    /** Secondary / advanced option in picker UI. */
    advanced?: boolean;
};

export const OPERATIONAL_INTENT_CATALOG: OperationalIntentTemplate[] = [
    {
        key: "enrollment_lead",
        label: "Capture new enrollment lead",
        description: "Families submit interest — a new inquiry appears in your enrollment pipeline.",
        shareHint: "Share the public link on your website, email, or embed it on a landing page.",
        afterSubmitPreview: [
            "A new enrollment inquiry will be created.",
            "The response will appear in Intake Review.",
            "Staff can continue enrollment from the lead drawer.",
        ],
    },
    {
        key: "existing_family",
        label: "Send to existing family or opportunity",
        description: "Send this form to a family you already know — updates attach without creating a duplicate lead.",
        shareHint: "Send from an opportunity or family record so known fields can prefill.",
        afterSubmitPreview: [
            "The submission attaches to the existing family or opportunity.",
            "No duplicate lead is created.",
            "Activity appears on the opportunity timeline.",
        ],
    },
    {
        key: "operational_document",
        label: "Collect operational document",
        description: "Signed or operational evidence — review may be required before records update.",
        shareHint: "Share when you need a completed authorization, policy acknowledgment, or document.",
        afterSubmitPreview: [
            "The response is saved as operational evidence.",
            "Staff review may be required before enrollment continues.",
            "Approved submissions update the connected record.",
        ],
    },
    {
        key: "waitlist",
        label: "Waitlist intake",
        description: "Capture families interested in a waitlist — creates or attaches waitlist opportunities.",
        shareHint: "Share on your waitlist page or send directly to interested families.",
        afterSubmitPreview: [
            "A waitlist inquiry is captured.",
            "The response routes to your waitlist workflow.",
            "Staff can follow up from Intake Review.",
        ],
    },
    {
        key: "packet_step",
        label: "Packet step",
        description: "One step in a multi-form enrollment packet — completes as part of the packet session.",
        shareHint: "Usually sent as part of an enrollment packet from an opportunity.",
        afterSubmitPreview: [
            "The response attaches to the active packet session.",
            "Progress rolls up when the packet is complete.",
            "Staff review the packet from the opportunity drawer.",
        ],
    },
    {
        key: "custom",
        label: "Custom advanced setup",
        description: "Configure intake flags manually — for operators who need full control.",
        shareHint: "Configure outcome settings below, then share the public link.",
        afterSubmitPreview: [
            "Outcome depends on your advanced intake settings.",
            "Review the “What happens after submit” section before sharing.",
        ],
        advanced: true,
    },
];

const INTENT_BY_KEY = Object.fromEntries(
    OPERATIONAL_INTENT_CATALOG.map((t) => [t.key, t])
) as Record<OperationalIntentKey, OperationalIntentTemplate>;

function metaObject(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw as Record<string, unknown>;
}

export function operationalIntentTemplate(key: OperationalIntentKey): OperationalIntentTemplate {
    return INTENT_BY_KEY[key];
}

export function readStoredOperationalIntent(
    formMetadata: Record<string, unknown> | null | undefined
): OperationalIntentKey | null {
    const meta = metaObject(formMetadata);
    const raw = typeof meta.intake_intent === "string" ? meta.intake_intent.trim() : "";
    if (raw && raw in INTENT_BY_KEY) return raw as OperationalIntentKey;
    const legacyPurpose = typeof meta.intake_purpose === "string" ? meta.intake_purpose.trim() : "";
    if (legacyPurpose === "enrollment_lead") return "enrollment_lead";
    return null;
}

export function operationalIntentToIntakeType(intent: OperationalIntentKey): IntakeTypeKey {
    if (intent === "custom") return "general";
    return intent;
}

/** Infer intent from link metadata + form key when none is stored. */
export function inferOperationalIntentFromContext(params: {
    formMetadata: Record<string, unknown> | null | undefined;
    linkMetadata: Record<string, unknown> | null | undefined;
    formKey: string;
}): OperationalIntentKey | null {
    const stored = readStoredOperationalIntent(params.formMetadata);
    if (stored) return stored;

    const intakeType = inferIntakeTypeFromLink(params.linkMetadata, params.formKey);
    if (intakeType === "general") return null;
    return intakeType as OperationalIntentKey;
}

export function resolveEffectiveOperationalIntent(params: {
    formMetadata: Record<string, unknown> | null | undefined;
    linkMetadata: Record<string, unknown> | null | undefined;
    formKey: string;
}): OperationalIntentKey | null {
    return inferOperationalIntentFromContext(params);
}

export function isOutcomeConfiguredForIntent(
    linkMetadata: Record<string, unknown> | null | undefined,
    intent: OperationalIntentKey | null
): boolean {
    if (!intent || intent === "custom") return linkRequiresLeadCapture(linkMetadata);
    const meta = metaObject(linkMetadata);
    if (intent === "existing_family") {
        return meta.form_context_mode === "existing_record" && linkRequiresLeadCapture(meta);
    }
    if (intent === "packet_step") {
        return meta.mode === "packet" || meta.form_context_mode === "packet";
    }
    const flags = parseIntakeAutoCreateFlags(meta);
    if (intent === "enrollment_lead" || intent === "waitlist") {
        return flags.auto_create_opportunity && linkRequiresLeadCapture(meta);
    }
    if (intent === "operational_document") {
        return linkRequiresLeadCapture(meta);
    }
    return false;
}

/** Form-level metadata patch when an intent is selected. */
export function buildOperationalIntentFormMetadataPatch(
    intent: OperationalIntentKey,
    existingMetadata: Record<string, unknown> | null | undefined
): Record<string, unknown> {
    const existing = metaObject(existingMetadata);
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
        // Preserve operator overrides — intent marker only.
    } else {
        delete next.intake_purpose;
    }

    if (intent !== "custom") {
        next.intake_outcome = intakeOutcome;
    }

    return next;
}

/** Link metadata patch for a selected intent — merged server-side with existing keys. */
export function buildOperationalIntentLinkMetadataPatch(intent: OperationalIntentKey): Record<string, unknown> {
    if (intent === "custom") return {};

    const baseIntake = {
        lead_capture: true,
        intake: true,
        mode: "intake",
        intake_purpose: intent,
    };

    switch (intent) {
        case "enrollment_lead":
            return {
                ...baseIntake,
                auto_create_person: true,
                auto_create_customer: true,
                auto_create_customer_member: false,
                auto_create_opportunity: true,
                default_opportunity_status_key: "new_inquiry",
                review_mode: "confidence",
                auto_operationalize: true,
                embed_mode: true,
                intake_opportunity_source: "embed",
            };
        case "existing_family":
            return {
                ...baseIntake,
                form_context_mode: "existing_record",
                prefill_enabled: true,
                auto_create_person: false,
                auto_create_customer: false,
                auto_create_customer_member: false,
                auto_create_opportunity: false,
            };
        case "operational_document":
            return {
                ...baseIntake,
                auto_create_person: true,
                auto_create_customer: true,
                auto_create_customer_member: true,
                auto_create_opportunity: true,
                review_mode: "confidence",
                auto_operationalize: true,
                embed_mode: true,
                intake_opportunity_source: "embed",
            };
        case "waitlist":
            return {
                ...baseIntake,
                auto_create_person: true,
                auto_create_customer: true,
                auto_create_customer_member: false,
                auto_create_opportunity: true,
                default_opportunity_status_key: "waitlist",
                review_mode: "confidence",
                auto_operationalize: true,
                embed_mode: true,
                intake_opportunity_source: "embed",
            };
        case "packet_step":
            return {
                ...baseIntake,
                mode: "packet",
                form_context_mode: "packet",
            };
        default:
            return {};
    }
}

export function buildAfterSubmitPreviewLines(params: {
    intent: OperationalIntentKey | null;
    storyBullets?: { text: string }[] | null;
}): string[] {
    if (params.storyBullets && params.storyBullets.length > 0) {
        return params.storyBullets.map((b) => b.text);
    }
    if (params.intent) {
        return operationalIntentTemplate(params.intent).afterSubmitPreview;
    }
    return [
        "Choose what this form is used for to see the expected outcome.",
        "Configure intake before sharing with families.",
    ];
}

/** Demo enrollment lead form keeps proof path when intent is unset. */
export function shouldPreserveEnrollmentLeadInference(
    formKey: string,
    storedIntent: OperationalIntentKey | null
): boolean {
    return !storedIntent && formKey === ENROLLMENT_LEAD_CAPTURE_DEMO_FORM_KEY;
}
