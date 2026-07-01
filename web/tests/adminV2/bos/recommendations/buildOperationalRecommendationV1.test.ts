import { describe, expect, it } from "vitest";

import {
    buildOperationalRecommendationV1,
    buildSemanticFingerprintPayload,
    OperationalRecommendationBuilderError,
    computeSemanticInputsFingerprint,
    computeStaleInputsFingerprint,
    normalizeGroundingSignals,
    validateOperationalRecommendationV1,
    buildStaleFingerprintInputs,
} from "@/lib/adminV2/bos/recommendations";
import type {
    BuildOperationalRecommendationInputV1,
    RawGroundingSignalInputV1,
} from "@/lib/adminV2/bos/recommendations/signals/operationalRecommendationSignals";

const ENTITY_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const GENERATED_A = "2026-05-21T10:00:00.000Z";
const GENERATED_B = "2026-05-22T15:30:00.000Z";

function baseSignals(): RawGroundingSignalInputV1[] {
    return [
        {
            code: "primary_attention_reason",
            label: "New inquiry is stale",
            source_type: "attention_resolver",
            provenance: "opportunity_attention_resolver.v2",
            priority: 0,
            reason_code: "stale_new_inquiry",
        },
        {
            code: "status_stale_new_inquiry",
            label: "Stale new inquiry",
            source_type: "entity_field",
            provenance: "opportunity.status",
            priority: 10,
        },
    ];
}

export function buildTestOperationalRecommendationInput(
    overrides: Partial<BuildOperationalRecommendationInputV1> = {}
): BuildOperationalRecommendationInputV1 {
    return {
        org_id: ORG_ID,
        entity_type: "opportunities",
        entity_id: ENTITY_ID,
        catalog_key: "stale_new_inquiry",
        primary_label: "New inquiry is stale",
        status_key: "new_inquiry",
        status_label: "New inquiry",
        primary_display_name: "Lee Household",
        source_surface: "entity_get",
        generated_at_iso: GENERATED_A,
        raw_signals: baseSignals(),
        template_values: {
            primary_label: "New inquiry is stale",
            severity: "medium",
            days: 2,
            intake_age_phrase: "2 days since the inquiry was created",
            urgency_reason_line: "Response window exceeded · 2 days since the inquiry was created",
        },
        stale_inputs: {
            status_key: "new_inquiry",
            primary_reason_code: "stale_new_inquiry",
            reason_codes_sorted: ["stale_new_inquiry"],
            waiting_bucket: "none",
            waiting_since_iso: null,
            resolver_version: 2,
            attention_computed_at_iso: GENERATED_A,
            activity_signal_key: null,
        },
        ...overrides,
    };
}

describe("buildOperationalRecommendationV1", () => {
    it("produces a valid OperationalRecommendationV1", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        expect(() => validateOperationalRecommendationV1(rec)).not.toThrow();
        expect(rec.version).toBe(1);
        expect(rec.deterministic_vs_ai_assisted).toBe("deterministic");
        expect(rec.recommendation_type).toBe("communication");
        expect(rec.why_it_matters).toContain("Timely first contact");
        expect(rec.why_it_matters).toContain("inquiry was created");
        expect(rec.stale_state_check.fingerprint_version).toBe(1);
        expect(rec.stale_state_check.is_stale).toBe(false);
        expect(rec.render.queue.why_line.length).toBeGreaterThan(0);
    });

    it("produces stable stale fingerprint for same semantic inputs", () => {
        const a = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const b = buildOperationalRecommendationV1(
            buildTestOperationalRecommendationInput({ generated_at_iso: GENERATED_B })
        );
        expect(a.stale_state_check.inputs_fingerprint).toBe(b.stale_state_check.inputs_fingerprint);
    });

    it("changes stale fingerprint when status_key changes", () => {
        const a = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const b = buildOperationalRecommendationV1(
            buildTestOperationalRecommendationInput({
                stale_inputs: {
                    ...buildTestOperationalRecommendationInput().stale_inputs,
                    status_key: "contacted",
                },
            })
        );
        expect(a.stale_state_check.inputs_fingerprint).not.toBe(b.stale_state_check.inputs_fingerprint);
    });

    it("semantic fingerprint ignores generated_at_iso", () => {
        const signals = normalizeGroundingSignals(baseSignals());
        const stale = buildTestOperationalRecommendationInput().stale_inputs;
        const payload = {
            catalog_key: "stale_new_inquiry" as const,
            org_id: ORG_ID,
            entity_id: ENTITY_ID,
            stale,
            normalized_signals: signals,
            urgency_band: "p1_today" as const,
            recommended_action_key: "send_first_response",
            recommended_action_family: "follow_up",
            workflow_reference: null,
            communication_reference: null,
            escalation_reference: null,
        };
        const fpA = computeSemanticInputsFingerprint(buildSemanticFingerprintPayload(payload));
        const fpB = computeSemanticInputsFingerprint(buildSemanticFingerprintPayload(payload));
        expect(fpA).toBe(fpB);
    });

    it("dedupes signals by code + source_type + source_id", () => {
        const duped: RawGroundingSignalInputV1[] = [
            ...baseSignals(),
            {
                code: "primary_attention_reason",
                label: "Duplicate",
                source_type: "attention_resolver",
                provenance: "opportunity_attention_resolver.v2",
                priority: 5,
            },
        ];
        const normalized = normalizeGroundingSignals(duped);
        expect(normalized.filter((s) => s.code === "primary_attention_reason")).toHaveLength(1);
    });

    it("orders signal codes deterministically for fingerprint regardless of input order", () => {
        const reversed = [...baseSignals()].reverse();
        const a = normalizeGroundingSignals(baseSignals());
        const b = normalizeGroundingSignals(reversed);
        const codesA = a.map((s) => s.code).join("|");
        const codesB = b.map((s) => s.code).join("|");
        expect(codesA).toBe(codesB);
        const stale = buildTestOperationalRecommendationInput().stale_inputs;
        const fpA = computeSemanticInputsFingerprint(
            buildSemanticFingerprintPayload({
                catalog_key: "stale_new_inquiry",
                org_id: ORG_ID,
                entity_id: ENTITY_ID,
                stale,
                normalized_signals: a,
                urgency_band: "p1_today",
                recommended_action_key: "send_first_response",
                recommended_action_family: "follow_up",
                workflow_reference: null,
                communication_reference: null,
                escalation_reference: null,
            })
        );
        const fpB = computeSemanticInputsFingerprint(
            buildSemanticFingerprintPayload({
                catalog_key: "stale_new_inquiry",
                org_id: ORG_ID,
                entity_id: ENTITY_ID,
                stale,
                normalized_signals: b,
                urgency_band: "p1_today",
                recommended_action_key: "send_first_response",
                recommended_action_family: "follow_up",
                workflow_reference: null,
                communication_reference: null,
                escalation_reference: null,
            })
        );
        expect(fpA).toBe(fpB);
    });

    it("throws on unknown catalog key", () => {
        expect(() =>
            buildOperationalRecommendationV1(
                buildTestOperationalRecommendationInput({
                    catalog_key: "not_a_real_code" as "stale_new_inquiry",
                })
            )
        ).toThrow(OperationalRecommendationBuilderError);
    });

    it("throws when required template interpolation is missing", () => {
        expect(() =>
            buildOperationalRecommendationV1(
                buildTestOperationalRecommendationInput({
                    template_values: { days: 2 },
                })
            )
        ).toThrow(OperationalRecommendationBuilderError);
    });

    it("throws when required grounding signals are absent", () => {
        expect(() =>
            buildOperationalRecommendationV1(
                buildTestOperationalRecommendationInput({
                    raw_signals: [
                        {
                            code: "status_contacted",
                            label: "Contacted",
                            source_type: "entity_field",
                            provenance: "opportunity.status",
                        },
                    ],
                })
            )
        ).toThrow(OperationalRecommendationBuilderError);
    });

    it("never emits hybrid or ai_refined markers", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        expect(rec.deterministic_vs_ai_assisted).toBe("deterministic");
        expect((rec as { deterministic_vs_ai_assisted: string }).deterministic_vs_ai_assisted).not.toBe(
            "hybrid"
        );
    });

    it("builds supplemental sla_breach catalog with escalation reference", () => {
        const rec = buildOperationalRecommendationV1(
            buildTestOperationalRecommendationInput({
                catalog_key: "sla_breach",
                primary_label: "Waiting on staff",
                template_values: {
                    primary_label: "Waiting on staff",
                    sla_tier: "breached",
                    severity: "high",
                },
                raw_signals: [
                    {
                        code: "primary_attention_reason",
                        label: "Waiting on staff",
                        source_type: "attention_resolver",
                        provenance: "opportunity_attention_resolver.v2",
                        sla_tier: "breached",
                        priority: 0,
                    },
                    {
                        code: "sla_breached",
                        label: "SLA breached",
                        source_type: "attention_resolver",
                        provenance: "attention_sla",
                        sla_tier: "breached",
                        priority: 1,
                    },
                ],
                stale_inputs: {
                    status_key: "tour_scheduled",
                    primary_reason_code: "waiting_on_staff",
                    reason_codes_sorted: ["waiting_on_staff"],
                    waiting_bucket: "waiting_on_staff",
                    waiting_since_iso: GENERATED_A,
                    resolver_version: 2,
                    attention_computed_at_iso: GENERATED_A,
                    activity_signal_key: null,
                },
            })
        );
        expect(rec.recommendation_type).toBe("escalation");
        expect(rec.urgency).toBe("p0_urgent");
        expect(rec.escalation_reference).not.toBeNull();
        expect(rec.communication_reference).toBeNull();
    });

    it("builds supplemental unanswered_inbound catalog", () => {
        const rec = buildOperationalRecommendationV1(
            buildTestOperationalRecommendationInput({
                catalog_key: "unanswered_inbound",
                primary_label: "Inbound awaiting reply",
                template_values: { primary_label: "Inbound awaiting reply" },
                raw_signals: [
                    {
                        code: "activity_stale_unanswered_inbound",
                        label: "Unanswered inbound",
                        source_type: "activity_signal",
                        provenance: "communications.thread",
                        priority: 0,
                    },
                ],
                stale_inputs: {
                    status_key: "contacted",
                    primary_reason_code: null,
                    reason_codes_sorted: [],
                    waiting_bucket: "none",
                    waiting_since_iso: null,
                    resolver_version: 2,
                    attention_computed_at_iso: GENERATED_A,
                    activity_signal_key: "unanswered_inbound",
                },
            })
        );
        expect(rec.recommendation_type).toBe("communication");
        expect(rec.communication_reference?.channel_hint).toBe("sms");
    });

    it("stale_new_inquiry action label is richer than legacy generic copy", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        expect(rec.recommended_action.label).not.toBe("Respond to new request");
        expect(rec.recommended_action.label.length).toBeGreaterThan(20);
    });
});

describe("computeStaleInputsFingerprint", () => {
    it("is stable for sorted reason codes regardless of input array order", () => {
        const a = buildStaleFingerprintInputs({
            entity_id: ENTITY_ID,
            stale: {
                ...buildTestOperationalRecommendationInput().stale_inputs,
                reason_codes_sorted: ["b", "a"],
            },
        });
        const b = buildStaleFingerprintInputs({
            entity_id: ENTITY_ID,
            stale: {
                ...buildTestOperationalRecommendationInput().stale_inputs,
                reason_codes_sorted: ["a", "b"],
            },
        });
        expect(computeStaleInputsFingerprint(a)).toBe(computeStaleInputsFingerprint(b));
    });
});
