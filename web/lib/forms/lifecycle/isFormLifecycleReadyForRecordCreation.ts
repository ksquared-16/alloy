/**
 * Card 4 — lifecycle coverage readiness for record-creating share links.
 * Publish remains allowed; this gates operational readiness only.
 */

import type { FormLifecycleCoveragePresentation } from "@/lib/forms/lifecycle/buildFormLifecycleCoveragePresentation";
import type { FormsLifecycleCoverageResult } from "@/lib/forms/lifecycle/formsLifecycleCoverageTypes";
import type { FormLifecycleCoveragePayload } from "@/lib/forms/lifecycle/loadFormLifecycleCoveragePayload";
import type { OperationalIntentKey } from "@/lib/forms/operationalIntentTemplates";

export type FormLifecycleRecordCreationReadiness =
    | "not_applicable"
    | "not_configured"
    | "unavailable"
    | "missing_required"
    | "ready_with_recommended_gaps"
    | "ready";

export type FormLifecycleRecordCreationGate = {
    applies: boolean;
    readiness: FormLifecycleRecordCreationReadiness;
    blocksRecordCreatingShare: boolean;
    setupHeadline: string;
    setupMessage: string;
    shareBlockMessage: string | null;
    shareBlockButtonLabel: string | null;
    recordLabel: string;
    coverageConfigured: boolean;
};

export function operationalIntentRequiresLifecycleRecordCoverage(
    intent: OperationalIntentKey | string | null | undefined
): boolean {
    return intent === "enrollment_lead" || intent === "waitlist";
}

export function recordCreationLabelForIntent(intent: OperationalIntentKey | string | null | undefined): string {
    if (intent === "waitlist") return "Waitlist inquiry";
    return "Lead";
}

export type FormLifecycleRecordCreationGateInput = {
    operationalIntent: OperationalIntentKey | string | null | undefined;
    coveragePayload: Pick<
        FormLifecycleCoveragePayload,
        "configured" | "coverage" | "presentation"
    > | null;
    coverageLoadFailed?: boolean;
};

const SHARE_BLOCK_COPY =
    "This form cannot create a Lead yet because it does not capture all required information for the selected business process stage.";

function missingRequiredBlockMessage(recordLabel: string): string {
    if (recordLabel === "Lead") return SHARE_BLOCK_COPY;
    return `This form cannot create a ${recordLabel} yet because it does not capture all required information for the selected business process stage.`;
}

export function buildFormLifecycleRecordCreationGate(
    input: FormLifecycleRecordCreationGateInput
): FormLifecycleRecordCreationGate {
    const intent = input.operationalIntent ?? null;
    const recordLabel = recordCreationLabelForIntent(intent);

    if (!operationalIntentRequiresLifecycleRecordCoverage(intent)) {
        return {
            applies: false,
            readiness: "not_applicable",
            blocksRecordCreatingShare: false,
            setupHeadline: "",
            setupMessage: "",
            shareBlockMessage: null,
            shareBlockButtonLabel: null,
            recordLabel,
            coverageConfigured: false,
        };
    }

    const coverageConfigured = Boolean(input.coveragePayload?.configured);

    if (!coverageConfigured) {
        return {
            applies: true,
            readiness: "not_configured",
            blocksRecordCreatingShare: false,
            setupHeadline: "Business process not configured",
            setupMessage:
                "Business process not configured. Select a business process and stage above to verify required fields before sharing record-creating links.",
            shareBlockMessage: null,
            shareBlockButtonLabel: null,
            recordLabel,
            coverageConfigured: false,
        };
    }

    if (input.coverageLoadFailed || !input.coveragePayload?.presentation) {
        return {
            applies: true,
            readiness: "unavailable",
            blocksRecordCreatingShare: true,
            setupHeadline: "Coverage unavailable",
            setupMessage:
                "Coverage unavailable. Review business process field requirements before creating record-creating share links.",
            shareBlockMessage:
                "Coverage unavailable. Add required fields and refresh coverage before creating share links that create records.",
            shareBlockButtonLabel: "Add required fields first",
            recordLabel,
            coverageConfigured: true,
        };
    }

    const { coverage, presentation } = input.coveragePayload;
    const ready = coverage?.ready === true;

    if (!ready || presentation.status === "missing_required") {
        return {
            applies: true,
            readiness: "missing_required",
            blocksRecordCreatingShare: true,
            setupHeadline: presentation.status_headline || "Missing required fields",
            setupMessage: presentation.status_message || missingRequiredBlockMessage(recordLabel),
            shareBlockMessage: missingRequiredBlockMessage(recordLabel),
            shareBlockButtonLabel: "Add required fields first",
            recordLabel,
            coverageConfigured: true,
        };
    }

    const hasRecommendedGaps = (coverage?.missingRecommended.length ?? 0) > 0;

    if (hasRecommendedGaps) {
        return {
            applies: true,
            readiness: "ready_with_recommended_gaps",
            blocksRecordCreatingShare: false,
            setupHeadline: "Ready. Recommended fields are missing.",
            setupMessage:
                presentation.status_message ||
                `Ready to create ${recordLabel}. Recommended fields are missing but sharing is allowed.`,
            shareBlockMessage: null,
            shareBlockButtonLabel: null,
            recordLabel,
            coverageConfigured: true,
        };
    }

    const readyHeadline =
        recordLabel === "Lead" ? "Ready to create Lead." : `Ready to create ${recordLabel}.`;

    return {
        applies: true,
        readiness: "ready",
        blocksRecordCreatingShare: false,
        setupHeadline: readyHeadline,
        setupMessage:
            presentation.status_message ||
            `This form captures the required information to create a ${recordLabel} for the selected business process stage.`,
        shareBlockMessage: null,
        shareBlockButtonLabel: null,
        recordLabel,
        coverageConfigured: true,
    };
}

/** Convenience wrapper for tests and callers that already have coverage + presentation. */
export function isFormLifecycleReadyForRecordCreation(
    input: FormLifecycleRecordCreationGateInput
): boolean {
    const gate = buildFormLifecycleRecordCreationGate(input);
    return gate.applies && (gate.readiness === "ready" || gate.readiness === "ready_with_recommended_gaps");
}

export function presentationSupportsRecordCreationReadiness(
    presentation: FormLifecycleCoveragePresentation,
    coverage: FormsLifecycleCoverageResult | null
): FormLifecycleRecordCreationReadiness {
    if (presentation.status === "empty") return "not_configured";
    if (presentation.status === "no_schema" || !coverage) return "unavailable";
    if (!coverage.ready) return "missing_required";
    if (coverage.missingRecommended.length > 0) return "ready_with_recommended_gaps";
    return "ready";
}
