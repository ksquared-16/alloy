/**
 * Runtime validation for {@link OperationalRecommendationV1} (Phase 1).
 * @see docs/sprints/05_2026/bos_operational_recommendation_phase1_execution.md §3.7
 */

import type { AttentionSuggestionActionFamily } from "@/lib/agent/needsAttentionSuggestion/types";
import {
    AVAILABLE_ACTION_KINDS_V1,
    COMMUNICATION_CHANNEL_HINTS_V1,
    CONFIDENCE_LEVELS_V1,
    GROUNDING_SIGNAL_SEVERITIES_V1,
    GROUNDING_SIGNAL_SLA_TIERS_V1,
    GROUNDING_SIGNAL_SOURCE_TYPES_V1,
    OPERATIONAL_CONTEXT_ENTITY_TYPES_V1,
    OPERATIONAL_CONTEXT_SOURCE_SURFACES_V1,
    OPERATIONAL_RECOMMENDATION_MAX_LENGTHS,
    OPERATIONAL_RECOMMENDATION_PHASE1_DETERMINISTIC_MODES,
    OPERATIONAL_RECOMMENDATION_VERSION,
    RECOMMENDATION_TYPES_V1,
    STALE_REASONS_V1,
    TRUST_BOUNDARIES_V1,
    URGENCY_BANDS_V1,
    type OperationalRecommendationV1,
} from "@/lib/adminV2/bos/recommendations/types";

const ATTENTION_SUGGESTION_ACTION_FAMILIES: readonly AttentionSuggestionActionFamily[] = [
    "follow_up",
    "review",
    "update_record",
    "send_message",
    "schedule",
    "workflow",
    "none",
];

export class OperationalRecommendationValidationError extends Error {
    readonly path: string;
    readonly issues: string[];

    constructor(path: string, message: string, issues: string[] = [message]) {
        super(`operational_recommendation_v1:${path}: ${message}`);
        this.name = "OperationalRecommendationValidationError";
        this.path = path;
        this.issues = issues;
    }
}

function fail(path: string, message: string): never {
    throw new OperationalRecommendationValidationError(path, message);
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function reqString(path: string, v: unknown, maxLen?: number): string {
    if (typeof v !== "string") fail(path, "expected string");
    const s = v.trim();
    if (!s) fail(path, "required non-empty string");
    if (maxLen != null && s.length > maxLen) fail(path, `exceeds max length ${maxLen}`);
    return v as string;
}

function optString(path: string, v: unknown, maxLen?: number): string | null {
    if (v == null) return null;
    if (typeof v !== "string") fail(path, "expected string or null");
    const s = v.trim();
    if (!s) return null;
    if (maxLen != null && s.length > maxLen) fail(path, `exceeds max length ${maxLen}`);
    return v as string;
}

function reqEnum<T extends string>(path: string, v: unknown, allowed: readonly T[]): T {
    if (typeof v !== "string" || !allowed.includes(v as T)) {
        fail(path, `expected one of: ${allowed.join(", ")}`);
    }
    return v as T;
}

function reqNumber(path: string, v: unknown): number {
    if (typeof v !== "number" || !Number.isFinite(v)) fail(path, "expected finite number");
    return v;
}

function reqBoolean(path: string, v: unknown): boolean {
    if (typeof v !== "boolean") fail(path, "expected boolean");
    return v;
}

function reqIso(path: string, v: unknown): string {
    const s = reqString(path, v);
    if (Number.isNaN(Date.parse(s))) fail(path, "expected ISO-8601 date string");
    return s;
}

function reqStringArray(path: string, v: unknown): string[] {
    if (!Array.isArray(v)) fail(path, "expected string array");
    return v.map((item, i) => reqString(`${path}[${i}]`, item));
}

function validateGroundingSignal(path: string, v: unknown): OperationalRecommendationV1["source_signal"][number] {
    if (!isRecord(v)) fail(path, "expected object");
    const code = reqString(`${path}.code`, v.code);
    if (!/^[a-z][a-z0-9_]*$/.test(code)) fail(`${path}.code`, "expected snake_case code");
    return {
        code,
        label: reqString(`${path}.label`, v.label, 120),
        source_type: reqEnum(`${path}.source_type`, v.source_type, GROUNDING_SIGNAL_SOURCE_TYPES_V1),
        provenance: reqString(`${path}.provenance`, v.provenance, 120),
        ...(v.severity != null
            ? { severity: reqEnum(`${path}.severity`, v.severity, GROUNDING_SIGNAL_SEVERITIES_V1) }
            : {}),
        ...(v.sla_tier != null
            ? { sla_tier: reqEnum(`${path}.sla_tier`, v.sla_tier, GROUNDING_SIGNAL_SLA_TIERS_V1) }
            : {}),
        ...(v.value_hint != null ? { value_hint: reqString(`${path}.value_hint`, v.value_hint, 80) } : {}),
        priority: reqNumber(`${path}.priority`, v.priority),
        ...(v.reason_code != null ? { reason_code: reqString(`${path}.reason_code`, v.reason_code, 64) } : {}),
    };
}

function validateFingerprintInputs(path: string, v: unknown): OperationalRecommendationV1["stale_state_check"]["fingerprint_inputs"] {
    if (!isRecord(v)) fail(path, "expected object");
    return {
        entity_id: reqString(`${path}.entity_id`, v.entity_id, 64),
        status_key: v.status_key == null ? null : reqString(`${path}.status_key`, v.status_key, 64),
        primary_reason_code:
            v.primary_reason_code == null ? null : reqString(`${path}.primary_reason_code`, v.primary_reason_code, 64),
        reason_codes_sorted: reqStringArray(`${path}.reason_codes_sorted`, v.reason_codes_sorted),
        waiting_bucket: reqString(`${path}.waiting_bucket`, v.waiting_bucket, 64),
        waiting_since_iso: v.waiting_since_iso == null ? null : reqIso(`${path}.waiting_since_iso`, v.waiting_since_iso),
        resolver_version: reqNumber(`${path}.resolver_version`, v.resolver_version),
        attention_computed_at_iso: reqIso(`${path}.attention_computed_at_iso`, v.attention_computed_at_iso),
        activity_signal_key:
            v.activity_signal_key == null ? null : reqString(`${path}.activity_signal_key`, v.activity_signal_key, 64),
    };
}

function validateStaleStateCheck(path: string, v: unknown): OperationalRecommendationV1["stale_state_check"] {
    if (!isRecord(v)) fail(path, "expected object");
    if (v.fingerprint_version !== 1) fail(`${path}.fingerprint_version`, "expected 1");
    const staleReason =
        v.stale_reason == null ? null : reqEnum(`${path}.stale_reason`, v.stale_reason, STALE_REASONS_V1);
    return {
        fingerprint_version: 1,
        inputs_fingerprint: reqString(
            `${path}.inputs_fingerprint`,
            v.inputs_fingerprint,
            OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.inputs_fingerprint
        ),
        fingerprint_inputs: validateFingerprintInputs(`${path}.fingerprint_inputs`, v.fingerprint_inputs),
        evaluated_at_iso: reqIso(`${path}.evaluated_at_iso`, v.evaluated_at_iso),
        is_stale: reqBoolean(`${path}.is_stale`, v.is_stale),
        stale_reason: staleReason,
    };
}

function validateOperationalContext(path: string, v: unknown): OperationalRecommendationV1["operational_context"] {
    if (!isRecord(v)) fail(path, "expected object");
    return {
        entity_type: reqEnum(`${path}.entity_type`, v.entity_type, OPERATIONAL_CONTEXT_ENTITY_TYPES_V1),
        entity_id: reqString(`${path}.entity_id`, v.entity_id, 64),
        org_id: reqString(`${path}.org_id`, v.org_id, 64),
        status_key: v.status_key == null ? null : reqString(`${path}.status_key`, v.status_key, 64),
        status_label: v.status_label == null ? null : reqString(`${path}.status_label`, v.status_label, 120),
        work_unit_id: v.work_unit_id == null ? null : reqString(`${path}.work_unit_id`, v.work_unit_id, 64),
        primary_display_name:
            v.primary_display_name == null ? null : reqString(`${path}.primary_display_name`, v.primary_display_name, 200),
        source_surface: reqEnum(`${path}.source_surface`, v.source_surface, OPERATIONAL_CONTEXT_SOURCE_SURFACES_V1),
    };
}

function validateRecommendedAction(path: string, v: unknown): OperationalRecommendationV1["recommended_action"] {
    if (!isRecord(v)) fail(path, "expected object");
    return {
        key: reqString(`${path}.key`, v.key, 64),
        label: reqString(`${path}.label`, v.label, 120),
        action_family: reqEnum(`${path}.action_family`, v.action_family, ATTENTION_SUGGESTION_ACTION_FAMILIES),
    };
}

function validateFactor(path: string, v: unknown): OperationalRecommendationV1["secondary_factors"][number] {
    if (!isRecord(v)) fail(path, "expected object");
    return {
        code: reqString(`${path}.code`, v.code, 64),
        label: reqString(`${path}.label`, v.label, 120),
        severity: reqString(`${path}.severity`, v.severity, 32),
        sla_tier: reqString(`${path}.sla_tier`, v.sla_tier, 32),
    };
}

function validateAvailableAction(path: string, v: unknown): OperationalRecommendationV1["available_actions"][number] {
    if (!isRecord(v)) fail(path, "expected object");
    const out: OperationalRecommendationV1["available_actions"][number] = {
        key: reqString(`${path}.key`, v.key, 64),
        label: reqString(`${path}.label`, v.label, 120),
        kind: reqEnum(`${path}.kind`, v.kind, AVAILABLE_ACTION_KINDS_V1),
    };
    if (v.intent != null) out.intent = reqString(`${path}.intent`, v.intent, 64);
    if (v.action_definition_id != null) {
        out.action_definition_id = reqString(`${path}.action_definition_id`, v.action_definition_id, 64);
    }
    return out;
}

function validateWorkflowReference(path: string, v: unknown): OperationalRecommendationV1["workflow_reference"] {
    if (!isRecord(v)) fail(path, "expected object");
    return {
        ...(v.workflow_id != null ? { workflow_id: reqString(`${path}.workflow_id`, v.workflow_id, 64) } : {}),
        ...(v.event_type != null ? { event_type: reqString(`${path}.event_type`, v.event_type, 64) } : {}),
        ...(v.explain_href != null ? { explain_href: reqString(`${path}.explain_href`, v.explain_href, 256) } : {}),
    };
}

function validateCommunicationReference(path: string, v: unknown): OperationalRecommendationV1["communication_reference"] {
    if (!isRecord(v)) fail(path, "expected object");
    const channel =
        v.channel_hint == null
            ? null
            : reqEnum(`${path}.channel_hint`, v.channel_hint, COMMUNICATION_CHANNEL_HINTS_V1);
    return {
        channel_hint: channel,
        timing_hint: v.timing_hint == null ? null : reqString(`${path}.timing_hint`, v.timing_hint, 120),
        template_key: v.template_key == null ? null : reqString(`${path}.template_key`, v.template_key, 64),
        prefill_instruction:
            v.prefill_instruction == null ? null : reqString(`${path}.prefill_instruction`, v.prefill_instruction, 400),
    };
}

function validateEscalationReference(path: string, v: unknown): OperationalRecommendationV1["escalation_reference"] {
    if (!isRecord(v)) fail(path, "expected object");
    return {
        policy_basis: reqString(`${path}.policy_basis`, v.policy_basis, 200),
        sla_tier: reqString(`${path}.sla_tier`, v.sla_tier, 32),
        reason_code: reqString(`${path}.reason_code`, v.reason_code, 64),
    };
}

function validateQueuePreview(path: string, v: unknown): OperationalRecommendationV1["render"]["queue"] {
    if (!isRecord(v)) fail(path, "expected object");
    return {
        next_label: reqString(`${path}.next_label`, v.next_label, 80),
        why_line: reqString(`${path}.why_line`, v.why_line, OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.queue_why_line),
        urgency_band: reqEnum(`${path}.urgency_band`, v.urgency_band, URGENCY_BANDS_V1),
        recommendation_type: reqEnum(`${path}.recommendation_type`, v.recommendation_type, RECOMMENDATION_TYPES_V1),
        is_stale: reqBoolean(`${path}.is_stale`, v.is_stale),
    };
}

function validateDrawerStrip(path: string, v: unknown): OperationalRecommendationV1["render"]["drawer_strip"] {
    if (!isRecord(v)) fail(path, "expected object");
    const signal_labels = reqStringArray(`${path}.signal_labels`, v.signal_labels);
    if (signal_labels.length > 2) fail(`${path}.signal_labels`, "max 2 labels at L1");
    return {
        title: reqString(`${path}.title`, v.title, OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.title),
        why_line: reqString(`${path}.why_line`, v.why_line, OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.drawer_why_line),
        urgency_label: reqString(`${path}.urgency_label`, v.urgency_label, 32),
        urgency_reason: reqString(
            `${path}.urgency_reason`,
            v.urgency_reason,
            OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.urgency_reason
        ),
        outcome_line: optString(`${path}.outcome_line`, v.outcome_line, OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.likely_outcome),
        confidence_label: optString(`${path}.confidence_label`, v.confidence_label, 32),
        next_action_label: reqString(`${path}.next_action_label`, v.next_action_label, 120),
        signal_labels,
        is_stale: reqBoolean(`${path}.is_stale`, v.is_stale),
        stale_banner: optString(`${path}.stale_banner`, v.stale_banner, 160),
    };
}

function validateHandoff(path: string, v: unknown): OperationalRecommendationV1["render"]["handoff"] {
    if (!isRecord(v)) fail(path, "expected object");
    return {
        eyebrow: reqString(`${path}.eyebrow`, v.eyebrow, 80),
        primary_recommendation: reqString(`${path}.primary_recommendation`, v.primary_recommendation, 120),
        operational_reason: reqString(
            `${path}.operational_reason`,
            v.operational_reason,
            OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.handoff_operational_reason
        ),
        context_line: reqString(`${path}.context_line`, v.context_line, 200),
        cta_label: reqString(`${path}.cta_label`, v.cta_label, 80),
    };
}

function validateDetail(path: string, v: unknown): OperationalRecommendationV1["render"]["detail"] {
    if (!isRecord(v)) fail(path, "expected object");
    const signal_labels = reqStringArray(`${path}.signal_labels`, v.signal_labels);
    if (signal_labels.length > 6) fail(`${path}.signal_labels`, "max 6 labels at L2");
    const factors = Array.isArray(v.factors) ? v.factors : fail(`${path}.factors`, "expected array");
    if (factors.length > 4) fail(`${path}.factors`, "max 4 secondary factors");
    return {
        factors: factors.map((f, i) => validateFactor(`${path}.factors[${i}]`, f)),
        signal_labels,
        action_rationale: reqString(
            `${path}.action_rationale`,
            v.action_rationale,
            OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.action_rationale
        ),
        likely_outcome: optString(`${path}.likely_outcome`, v.likely_outcome, OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.likely_outcome),
        likely_risk: optString(`${path}.likely_risk`, v.likely_risk, OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.likely_risk),
    };
}

function validateRender(path: string, v: unknown): OperationalRecommendationV1["render"] {
    if (!isRecord(v)) fail(path, "expected object");
    return {
        queue: validateQueuePreview(`${path}.queue`, v.queue),
        drawer_strip: validateDrawerStrip(`${path}.drawer_strip`, v.drawer_strip),
        handoff: validateHandoff(`${path}.handoff`, v.handoff),
        detail: v.detail == null ? null : validateDetail(`${path}.detail`, v.detail),
    };
}

/**
 * Validates unknown input and returns a typed {@link OperationalRecommendationV1}.
 * Phase 1: rejects `deterministic_vs_ai_assisted` other than `"deterministic"`.
 *
 * @throws {OperationalRecommendationValidationError}
 */
export function validateOperationalRecommendationV1(input: unknown): OperationalRecommendationV1 {
    if (!isRecord(input)) fail("root", "expected object");

    if (input.version !== OPERATIONAL_RECOMMENDATION_VERSION) {
        fail("version", `expected ${OPERATIONAL_RECOMMENDATION_VERSION}`);
    }

    const deterministicMode = reqEnum(
        "deterministic_vs_ai_assisted",
        input.deterministic_vs_ai_assisted,
        OPERATIONAL_RECOMMENDATION_PHASE1_DETERMINISTIC_MODES
    );
    if (deterministicMode !== "deterministic") {
        fail("deterministic_vs_ai_assisted", "Phase 1 allows deterministic only");
    }

    const source_signal = Array.isArray(input.source_signal)
        ? input.source_signal.map((s, i) => validateGroundingSignal(`source_signal[${i}]`, s))
        : fail("source_signal", "expected array");

    const grounding_signals = Array.isArray(input.grounding_signals)
        ? input.grounding_signals.map((s, i) => validateGroundingSignal(`grounding_signals[${i}]`, s))
        : fail("grounding_signals", "expected array");

    const secondary_factors = Array.isArray(input.secondary_factors)
        ? input.secondary_factors.map((f, i) => validateFactor(`secondary_factors[${i}]`, f))
        : fail("secondary_factors", "expected array");
    if (secondary_factors.length > 4) fail("secondary_factors", "max 4 factors");

    const available_actions = Array.isArray(input.available_actions)
        ? input.available_actions.map((a, i) => validateAvailableAction(`available_actions[${i}]`, a))
        : fail("available_actions", "expected array");

    const recommendation_type = reqEnum("recommendation_type", input.recommendation_type, RECOMMENDATION_TYPES_V1);

    const workflow_reference =
        input.workflow_reference == null
            ? null
            : validateWorkflowReference("workflow_reference", input.workflow_reference);

    const communication_reference =
        input.communication_reference == null
            ? null
            : validateCommunicationReference("communication_reference", input.communication_reference);

    const escalation_reference =
        input.escalation_reference == null
            ? null
            : validateEscalationReference("escalation_reference", input.escalation_reference);

    if (recommendation_type === "escalation" && escalation_reference == null) {
        fail("escalation_reference", "required when recommendation_type is escalation");
    }

    if (recommendation_type === "communication" && communication_reference == null) {
        fail("communication_reference", "required when recommendation_type is communication");
    }
    if (
        recommendation_type === "communication" &&
        communication_reference != null &&
        (communication_reference.timing_hint == null || !communication_reference.timing_hint.trim())
    ) {
        fail("communication_reference.timing_hint", "required for communication recommendations");
    }

    const value: OperationalRecommendationV1 = {
        version: OPERATIONAL_RECOMMENDATION_VERSION,
        recommendation_id: reqString(
            "recommendation_id",
            input.recommendation_id,
            OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.recommendation_id
        ),
        generated_at_iso: reqIso("generated_at_iso", input.generated_at_iso),

        recommendation_type,
        trust_boundary: reqEnum("trust_boundary", input.trust_boundary, TRUST_BOUNDARIES_V1),
        deterministic_vs_ai_assisted: deterministicMode,

        operational_context: validateOperationalContext("operational_context", input.operational_context),

        source_signal,
        grounding_signals,

        title: reqString("title", input.title, OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.title),
        current_state_summary: reqString(
            "current_state_summary",
            input.current_state_summary,
            OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.current_state_summary
        ),
        why_it_matters: reqString(
            "why_it_matters",
            input.why_it_matters,
            OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.why_it_matters
        ),
        recommended_action: validateRecommendedAction("recommended_action", input.recommended_action),
        action_rationale: reqString(
            "action_rationale",
            input.action_rationale,
            OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.action_rationale
        ),
        likely_outcome: optString(
            "likely_outcome",
            input.likely_outcome,
            OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.likely_outcome
        ),
        likely_risk: optString("likely_risk", input.likely_risk, OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.likely_risk),

        urgency: reqEnum("urgency", input.urgency, URGENCY_BANDS_V1),
        urgency_reason: reqString(
            "urgency_reason",
            input.urgency_reason,
            OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.urgency_reason
        ),
        confidence_level: reqEnum("confidence_level", input.confidence_level, CONFIDENCE_LEVELS_V1),
        confidence_reason: reqString(
            "confidence_reason",
            input.confidence_reason,
            OPERATIONAL_RECOMMENDATION_MAX_LENGTHS.confidence_reason
        ),

        secondary_factors,

        stale_state_check: validateStaleStateCheck("stale_state_check", input.stale_state_check),

        available_actions,
        workflow_reference,
        communication_reference,
        escalation_reference,

        render: validateRender("render", input.render),
    };

    return value;
}
