/**
 * Deterministic recommendation fingerprints (Phase 1 / Card 1.3).
 */

import { createHash } from "node:crypto";

import type { OperationalRecommendationCatalogKey } from "@/lib/adminV2/bos/recommendations/catalog/recommendationCatalogTypes";
import { normalizedSignalCodesForFingerprint } from "@/lib/adminV2/bos/recommendations/signals/normalizeGroundingSignals";
import type { OperationalRecommendationStaleInputsV1 } from "@/lib/adminV2/bos/recommendations/signals/operationalRecommendationSignals";
import type {
    CommunicationReferenceV1,
    EscalationReferenceV1,
    FingerprintInputsV1,
    GroundingSignalV1,
    UrgencyBandV1,
    WorkflowReferenceV1,
} from "@/lib/adminV2/bos/recommendations/types";
import { OPERATIONAL_RECOMMENDATION_VERSION } from "@/lib/adminV2/bos/recommendations/types";

export const FINGERPRINT_ALGORITHM_VERSION = 1 as const;

export type RecommendationSemanticFingerprintPayloadV1 = {
    contract_version: typeof OPERATIONAL_RECOMMENDATION_VERSION;
    fingerprint_version: typeof FINGERPRINT_ALGORITHM_VERSION;
    catalog_key: OperationalRecommendationCatalogKey;
    org_id: string;
    entity_id: string;
    status_key: string | null;
    signal_codes_sorted: string[];
    urgency_band: UrgencyBandV1;
    recommended_action_key: string;
    recommended_action_family: string;
    primary_reason_code: string | null;
    waiting_bucket: string;
    waiting_since_iso: string | null;
    resolver_version: number;
    activity_signal_key: string | null;
    workflow_ref: string | null;
    communication_ref: string | null;
    escalation_ref: string | null;
};

function stableStringify(value: unknown): string {
    if (value === null) return "null";
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
    if (Array.isArray(value)) {
        return `[${value.map((v) => stableStringify(v)).join(",")}]`;
    }
    if (typeof value === "object") {
        const obj = value as Record<string, unknown>;
        const keys = Object.keys(obj).sort();
        return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
    }
    return JSON.stringify(String(value));
}

export function hashFingerprintPayload(payload: RecommendationSemanticFingerprintPayloadV1): string {
    return createHash("sha256").update(stableStringify(payload), "utf8").digest("hex").slice(0, 32);
}

export function buildStaleFingerprintInputs(args: {
    entity_id: string;
    stale: OperationalRecommendationStaleInputsV1;
}): FingerprintInputsV1 {
    return {
        entity_id: args.entity_id.trim(),
        status_key: args.stale.status_key,
        primary_reason_code: args.stale.primary_reason_code,
        reason_codes_sorted: args.stale.reason_codes_sorted.slice().sort((a, b) => a.localeCompare(b)),
        waiting_bucket: args.stale.waiting_bucket,
        waiting_since_iso: args.stale.waiting_since_iso,
        resolver_version: args.stale.resolver_version,
        attention_computed_at_iso: args.stale.attention_computed_at_iso,
        activity_signal_key: args.stale.activity_signal_key,
    };
}

export function buildSemanticFingerprintPayload(args: {
    catalog_key: OperationalRecommendationCatalogKey;
    org_id: string;
    entity_id: string;
    stale: OperationalRecommendationStaleInputsV1;
    normalized_signals: GroundingSignalV1[];
    urgency_band: UrgencyBandV1;
    recommended_action_key: string;
    recommended_action_family: string;
    workflow_reference: WorkflowReferenceV1 | null;
    communication_reference: CommunicationReferenceV1 | null;
    escalation_reference: EscalationReferenceV1 | null;
}): RecommendationSemanticFingerprintPayloadV1 {
    const workflow_ref = args.workflow_reference
        ? [args.workflow_reference.workflow_id, args.workflow_reference.event_type].filter(Boolean).join("|") || null
        : null;
    const communication_ref = args.communication_reference
        ? [args.communication_reference.channel_hint, args.communication_reference.timing_hint].filter(Boolean).join("|") ||
          null
        : null;
    const escalation_ref = args.escalation_reference
        ? [args.escalation_reference.reason_code, args.escalation_reference.sla_tier].join("|")
        : null;

    return {
        contract_version: OPERATIONAL_RECOMMENDATION_VERSION,
        fingerprint_version: FINGERPRINT_ALGORITHM_VERSION,
        catalog_key: args.catalog_key,
        org_id: args.org_id.trim(),
        entity_id: args.entity_id.trim(),
        status_key: args.stale.status_key,
        signal_codes_sorted: normalizedSignalCodesForFingerprint(args.normalized_signals),
        urgency_band: args.urgency_band,
        recommended_action_key: args.recommended_action_key,
        recommended_action_family: args.recommended_action_family,
        primary_reason_code: args.stale.primary_reason_code,
        waiting_bucket: args.stale.waiting_bucket,
        waiting_since_iso: args.stale.waiting_since_iso,
        resolver_version: args.stale.resolver_version,
        activity_signal_key: args.stale.activity_signal_key,
        workflow_ref,
        communication_ref,
        escalation_ref,
    };
}

/**
 * Semantic fingerprint for recommendation identity (excludes `generated_at_iso`).
 */
export function computeSemanticInputsFingerprint(
    payload: RecommendationSemanticFingerprintPayloadV1
): string {
    return hashFingerprintPayload(payload);
}

/**
 * Stale-state fingerprint uses resolver stale inputs (execution pack §5.2).
 */
export function computeStaleInputsFingerprint(fingerprintInputs: FingerprintInputsV1): string {
    const sortedReasons = fingerprintInputs.reason_codes_sorted.slice().sort((a, b) => a.localeCompare(b));
    const payload = {
        fingerprint_version: FINGERPRINT_ALGORITHM_VERSION,
        entity_id: fingerprintInputs.entity_id,
        status_key: fingerprintInputs.status_key,
        primary_reason_code: fingerprintInputs.primary_reason_code,
        reason_codes_sorted: sortedReasons,
        waiting_bucket: fingerprintInputs.waiting_bucket,
        waiting_since_iso: fingerprintInputs.waiting_since_iso,
        resolver_version: fingerprintInputs.resolver_version,
        attention_computed_at_iso: fingerprintInputs.attention_computed_at_iso,
        activity_signal_key: fingerprintInputs.activity_signal_key,
    };
    return createHash("sha256").update(stableStringify(payload), "utf8").digest("hex").slice(0, 32);
}

export function hashNormalizedSignalCodes(signals: GroundingSignalV1[]): string {
    const codes = normalizedSignalCodesForFingerprint(signals);
    return createHash("sha256").update(codes.join("|"), "utf8").digest("hex").slice(0, 16);
}

export function buildRecommendationId(args: {
    entity_id: string;
    catalog_key: OperationalRecommendationCatalogKey;
    primary_reason_code: string | null;
    generated_at_iso: string;
}): string {
    const anchor = Date.parse(args.generated_at_iso);
    const dayBucket = Number.isFinite(anchor)
        ? new Date(anchor).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
    const raw = [
        args.entity_id.trim(),
        args.catalog_key,
        args.primary_reason_code ?? "none",
        String(OPERATIONAL_RECOMMENDATION_VERSION),
        dayBucket,
    ].join("|");
    return createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 48);
}
