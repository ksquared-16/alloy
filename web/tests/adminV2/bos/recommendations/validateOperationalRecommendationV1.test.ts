import { describe, expect, it } from "vitest";

import type { OperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations/types";
import {
    OperationalRecommendationValidationError,
    validateOperationalRecommendationV1,
} from "@/lib/adminV2/bos/recommendations/validation/validateOperationalRecommendationV1";

const ENTITY_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";

function minimalGroundingSignal(overrides: Partial<OperationalRecommendationV1["source_signal"][0]> = {}) {
    return {
        code: "primary_attention_reason",
        label: "Follow-up date passed",
        source_type: "attention_resolver" as const,
        provenance: "opportunity_attention_resolver.v2",
        priority: 0,
        reason_code: "follow_up_date_passed",
        ...overrides,
    };
}

/** Valid minimal deterministic recommendation for Phase 1 validator tests. */
export function minimalOperationalRecommendationV1Fixture(
    overrides: Partial<OperationalRecommendationV1> = {}
): OperationalRecommendationV1 {
    const generated_at_iso = "2026-05-21T12:00:00.000Z";
    const base: OperationalRecommendationV1 = {
        version: 1,
        recommendation_id: "rec_phase1_test_001",
        generated_at_iso,

        recommendation_type: "operational",
        trust_boundary: "insight_only",
        deterministic_vs_ai_assisted: "deterministic",

        operational_context: {
            entity_type: "opportunities",
            entity_id: ENTITY_ID,
            org_id: ORG_ID,
            status_key: "contacted",
            status_label: "Contacted",
            work_unit_id: null,
            primary_display_name: "Lee Household",
            source_surface: "entity_get",
        },

        source_signal: [minimalGroundingSignal()],
        grounding_signals: [minimalGroundingSignal()],

        title: "Complete follow-up",
        current_state_summary: "Follow-up date passed · waiting since yesterday",
        why_it_matters: "Commitment date is past due; staff should close the loop with the family.",
        recommended_action: {
            key: "complete_follow_up",
            label: "Complete follow-up",
            action_family: "follow_up",
        },
        action_rationale: "Closing the loop restores momentum on this inquiry.",
        likely_outcome: "Family receives a clear next step.",
        likely_risk: null,

        urgency: "p1_today",
        urgency_reason: "Past due vs goal",
        confidence_level: "high",
        confidence_reason: "Timing based on explicit enrollment operational dates",

        secondary_factors: [],

        stale_state_check: {
            fingerprint_version: 1,
            inputs_fingerprint: "abc123fingerprint0000000000000001",
            fingerprint_inputs: {
                entity_id: ENTITY_ID,
                status_key: "contacted",
                primary_reason_code: "follow_up_date_passed",
                reason_codes_sorted: ["follow_up_date_passed"],
                waiting_bucket: "none",
                waiting_since_iso: null,
                resolver_version: 2,
                attention_computed_at_iso: generated_at_iso,
                activity_signal_key: null,
            },
            evaluated_at_iso: generated_at_iso,
            is_stale: false,
            stale_reason: null,
        },

        available_actions: [],
        workflow_reference: null,
        communication_reference: null,
        escalation_reference: null,

        render: {
            queue: {
                next_label: "Complete follow-up",
                why_line: "Commitment date is past due; staff should close the loop with the family.",
                urgency_band: "p1_today",
                recommendation_type: "operational",
                is_stale: false,
            },
            drawer_strip: {
                title: "Complete follow-up",
                why_line: "Commitment date is past due; staff should close the loop with the family.",
                urgency_label: "Today",
                urgency_reason: "Past due vs goal",
                outcome_line: "Family receives a clear next step.",
                confidence_label: null,
                next_action_label: "Complete follow-up",
                signal_labels: ["Follow-up date passed"],
                is_stale: false,
                stale_banner: null,
            },
            handoff: {
                eyebrow: "Recommended next step",
                primary_recommendation: "Complete follow-up",
                operational_reason: "Commitment date is past due; staff should close the loop with the family.",
                context_line: "Active record · Lee Household",
                cta_label: "Review next step",
            },
            detail: null,
        },
    };

    return { ...base, ...overrides };
}

describe("validateOperationalRecommendationV1", () => {
    it("accepts valid minimal deterministic recommendation and returns typed DTO", () => {
        const raw = minimalOperationalRecommendationV1Fixture();
        const validated = validateOperationalRecommendationV1(raw);
        expect(validated.version).toBe(1);
        expect(validated.deterministic_vs_ai_assisted).toBe("deterministic");
        expect(validated.recommendation_id).toBe("rec_phase1_test_001");
        expect(validated.operational_context.entity_id).toBe(ENTITY_ID);
        expect(validated.source_signal[0]?.code).toBe("primary_attention_reason");
    });

    it("rejects invalid recommendation_type enum", () => {
        const raw = minimalOperationalRecommendationV1Fixture();
        const broken = { ...raw, recommendation_type: "autonomous" };
        expect(() => validateOperationalRecommendationV1(broken)).toThrow(OperationalRecommendationValidationError);
        try {
            validateOperationalRecommendationV1(broken);
        } catch (e) {
            expect(e).toBeInstanceOf(OperationalRecommendationValidationError);
            expect((e as OperationalRecommendationValidationError).path).toBe("recommendation_type");
        }
    });

    it("rejects missing required title", () => {
        const raw = minimalOperationalRecommendationV1Fixture();
        const { title: _t, ...withoutTitle } = raw;
        expect(() => validateOperationalRecommendationV1(withoutTitle)).toThrow(OperationalRecommendationValidationError);
    });

    it("rejects invalid grounding signal source_type", () => {
        const raw = minimalOperationalRecommendationV1Fixture({
            source_signal: [
                minimalGroundingSignal({
                    source_type: "llm_guess" as never,
                }),
            ],
            grounding_signals: [
                minimalGroundingSignal({
                    source_type: "llm_guess" as never,
                }),
            ],
        });
        expect(() => validateOperationalRecommendationV1(raw)).toThrow(OperationalRecommendationValidationError);
    });

    it("rejects invalid fingerprint_version", () => {
        const raw = minimalOperationalRecommendationV1Fixture({
            stale_state_check: {
                ...minimalOperationalRecommendationV1Fixture().stale_state_check,
                fingerprint_version: 2 as 1,
            },
        });
        expect(() => validateOperationalRecommendationV1(raw)).toThrow(OperationalRecommendationValidationError);
    });

    it("rejects ai_refined deterministic_vs_ai_assisted marker in Phase 1", () => {
        const raw = minimalOperationalRecommendationV1Fixture({
            deterministic_vs_ai_assisted: "ai_refined",
        });
        expect(() => validateOperationalRecommendationV1(raw)).toThrow(OperationalRecommendationValidationError);
        try {
            validateOperationalRecommendationV1(raw);
        } catch (e) {
            expect((e as OperationalRecommendationValidationError).message).toContain(
                "deterministic_vs_ai_assisted"
            );
        }
    });

    it("rejects hybrid deterministic_vs_ai_assisted marker in Phase 1", () => {
        const raw = minimalOperationalRecommendationV1Fixture({
            deterministic_vs_ai_assisted: "hybrid",
        });
        expect(() => validateOperationalRecommendationV1(raw)).toThrow(OperationalRecommendationValidationError);
    });

    it("requires escalation_reference when recommendation_type is escalation", () => {
        const raw = minimalOperationalRecommendationV1Fixture({
            recommendation_type: "escalation",
            escalation_reference: null,
        });
        expect(() => validateOperationalRecommendationV1(raw)).toThrow(OperationalRecommendationValidationError);
    });

    it("requires communication_reference with timing_hint for communication type", () => {
        const raw = minimalOperationalRecommendationV1Fixture({
            recommendation_type: "communication",
            communication_reference: null,
        });
        expect(() => validateOperationalRecommendationV1(raw)).toThrow(OperationalRecommendationValidationError);
    });

    it("rejects non-object root", () => {
        expect(() => validateOperationalRecommendationV1(null)).toThrow(OperationalRecommendationValidationError);
        expect(() => validateOperationalRecommendationV1("string")).toThrow(OperationalRecommendationValidationError);
    });
});
