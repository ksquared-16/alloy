/**
 * IC-5 — additive intake case lifecycle workflow events.
 * Emitted alongside existing form_* events; no persisted intake_cases table.
 */

import { emitEvent } from "@/lib/emitEvent";
import {
    parseIntakeCaseGroupKey,
    resolveIntakeCaseGroupKey,
    resolveSubmissionPacketSessionId,
    type IntakeCaseAnchorType,
} from "@/lib/forms/intakeCasePresentation";
import { parseIntakeReviewConfig } from "@/lib/forms/intake/resolveIntakeReviewDecision";
import type { FormSubmissionRowLike } from "@/lib/forms/workflow/formSubmissionEvents";

export const INTAKE_CASE_LIFECYCLE_EVENT_TYPES = [
    "intake_case_created",
    "intake_case_operationalized",
    "intake_case_review_required",
    "intake_case_linked",
] as const;

export type IntakeCaseLifecycleEventType = (typeof INTAKE_CASE_LIFECYCLE_EVENT_TYPES)[number];

export type IntakeCaseLifecycleEmitInput = {
    submission: FormSubmissionRowLike;
    payloadMeta: Record<string, unknown> | null | undefined;
    linkMetadata?: Record<string, unknown> | null;
    packetSessionId?: string | null;
};

function metaRecord(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return raw as Record<string, unknown>;
}

/** Intake lifecycle events emit only when lead-capture intake ran with an outcome path. */
export function intakeOutcomeEligibleForLifecycleEvents(meta: Record<string, unknown> | null | undefined): boolean {
    const path = typeof meta?.intake_resolution_path === "string" ? meta.intake_resolution_path.trim() : "";
    if (!path) return false;
    if (path.startsWith("skipped_")) return false;
    if (path === "existing_record_launch") return false;
    return true;
}

export function resolveIntakeCaseAnchorFromSubmission(input: IntakeCaseLifecycleEmitInput): {
    case_key: string;
    case_anchor_type: IntakeCaseAnchorType;
    case_anchor_id: string;
    opportunity_id: string | null;
    packet_session_id: string | null;
} {
    const row = {
        id: input.submission.id,
        status: "submitted",
        created_at: "",
        submitted_at: null,
        form_definition_id: input.submission.form_definition_id,
        opportunity_id: input.submission.opportunity_id,
        packet_session_id: input.packetSessionId ?? null,
        payload: { meta: input.payloadMeta ?? {} },
    };

    const case_key = resolveIntakeCaseGroupKey(row);
    const parsed = parseIntakeCaseGroupKey(case_key);
    const packet_session_id =
        resolveSubmissionPacketSessionId(row) ??
        (typeof input.packetSessionId === "string" ? input.packetSessionId.trim() || null : null);

    return {
        case_key,
        case_anchor_type: parsed?.anchor_type ?? "submission",
        case_anchor_id: parsed?.anchor_id ?? input.submission.id,
        opportunity_id: input.submission.opportunity_id,
        packet_session_id,
    };
}

function reviewReasonsFromMeta(meta: Record<string, unknown>): string[] {
    const decision = metaRecord(meta.intake_review_decision);
    const reasons = decision.reasons;
    if (Array.isArray(reasons)) {
        return reasons.filter((r): r is string => typeof r === "string" && r.trim().length > 0);
    }
    const single = typeof meta.intake_review_reason === "string" ? meta.intake_review_reason.trim() : "";
    return single ? [single] : [];
}

export function buildIntakeCaseLifecycleEventPayload(
    input: IntakeCaseLifecycleEmitInput
): Record<string, unknown> | null {
    const orgId = typeof input.submission.org_id === "string" ? input.submission.org_id.trim() : "";
    const formId = typeof input.submission.form_definition_id === "string" ? input.submission.form_definition_id.trim() : "";
    const submissionId = typeof input.submission.id === "string" ? input.submission.id.trim() : "";
    if (!orgId || !formId || !submissionId) return null;

    const meta = metaRecord(input.payloadMeta);
    if (!intakeOutcomeEligibleForLifecycleEvents(meta)) return null;

    const anchor = resolveIntakeCaseAnchorFromSubmission(input);
    const reviewConfig = parseIntakeReviewConfig(input.linkMetadata);
    const decision = metaRecord(meta.intake_review_decision);
    const reviewMode =
        typeof decision.review_mode === "string" && decision.review_mode.trim() ?
            decision.review_mode.trim()
        :   reviewConfig.reviewMode;

    return {
        org_id: orgId,
        form_id: formId,
        form_submission_id: submissionId,
        case_key: anchor.case_key,
        case_anchor_type: anchor.case_anchor_type,
        case_anchor_id: anchor.case_anchor_id,
        opportunity_id: anchor.opportunity_id,
        packet_session_id: anchor.packet_session_id,
        person_id: input.submission.person_id,
        customer_id: input.submission.customer_id,
        customer_member_id: input.submission.customer_member_id,
        review_mode: reviewMode,
        intake_needs_review: meta.intake_needs_review === true,
        intake_auto_operationalized: meta.intake_auto_operationalized === true,
        intake_confidence:
            typeof meta.intake_confidence === "string" ? meta.intake_confidence
            : typeof meta.intake_match_confidence === "string" ? meta.intake_match_confidence
            : null,
        intake_review_reasons: reviewReasonsFromMeta(meta),
        intake_opportunity_match:
            typeof meta.intake_opportunity_match === "string" ? meta.intake_opportunity_match : null,
        intake_resolution_path:
            typeof meta.intake_resolution_path === "string" ? meta.intake_resolution_path : null,
        source: "forms_intake",
    };
}

export function resolveIntakeCaseLifecycleEventTypes(
    payloadMeta: Record<string, unknown> | null | undefined
): IntakeCaseLifecycleEventType[] {
    const meta = metaRecord(payloadMeta);
    if (!intakeOutcomeEligibleForLifecycleEvents(meta)) return [];

    const events: IntakeCaseLifecycleEventType[] = ["intake_case_created"];
    const needsReview = meta.intake_needs_review === true;
    const autoOperationalized = meta.intake_auto_operationalized === true;
    const opportunityMatch =
        typeof meta.intake_opportunity_match === "string" ? meta.intake_opportunity_match.trim() : "";
    const matchStrategy =
        typeof meta.intake_match_strategy === "string" ? meta.intake_match_strategy.trim() : "";

    if (needsReview) {
        events.push("intake_case_review_required");
    } else if (autoOperationalized) {
        events.push("intake_case_operationalized");
    } else if (
        opportunityMatch === "attached_existing" &&
        (matchStrategy === "matched_email" || matchStrategy === "reuse_submission_person_id")
    ) {
        events.push("intake_case_linked");
    }

    return [...new Set(events)];
}

export async function emitIntakeCaseLifecycleEventsSafe(input: IntakeCaseLifecycleEmitInput): Promise<void> {
    try {
        const payload = buildIntakeCaseLifecycleEventPayload(input);
        if (!payload) return;

        const eventTypes = resolveIntakeCaseLifecycleEventTypes(input.payloadMeta);
        if (eventTypes.length === 0) return;

        for (const event_type of eventTypes) {
            await emitEvent({
                org_id: input.submission.org_id,
                event_type,
                entity_type: "form_submissions",
                entity_id: input.submission.id,
                payload: { ...payload, intake_lifecycle_event: event_type },
            });
        }
    } catch (e) {
        console.warn("[emitIntakeCaseLifecycleEventsSafe]", e instanceof Error ? e.message : e);
    }
}
