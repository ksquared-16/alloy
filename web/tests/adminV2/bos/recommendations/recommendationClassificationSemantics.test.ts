import { describe, expect, it } from "vitest";

import { buildOperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations";
import {
    ESCALATION_CHIP_LABEL,
    queueTypeCueLabel,
    recommendationTypeLabel,
    resolveClassificationContextLine,
    resolveEscalationChipLabel,
} from "@/lib/adminV2/bos/recommendations/selectors/recommendationClassificationSemantics";
import {
    getRecommendationDrawerStrip,
    resolveQueueOperationalReadPreview,
} from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";
import { projectOperationalRecommendationQueuePreview } from "@/lib/adminV2/bos/recommendations/adapters/projectOperationalRecommendationQueuePreview";
import { buildTestOperationalRecommendationInput } from "@/tests/adminV2/bos/recommendations/buildOperationalRecommendationV1.test";

describe("recommendationClassificationSemantics / Card 2.5", () => {
    it("maps recommendation types to restrained operator labels", () => {
        expect(recommendationTypeLabel("communication")).toBe("Communication");
        expect(recommendationTypeLabel("escalation")).toBe("Escalation");
        expect(recommendationTypeLabel("operational")).toBe("Follow-up");
        expect(recommendationTypeLabel("conversion")).toBe("Conversion");
        expect(recommendationTypeLabel("workflow")).toBe("Workflow");
    });

    it("shows queue type cue only when scan meaning is added", () => {
        expect(queueTypeCueLabel("communication")).toBe("Communication");
        expect(queueTypeCueLabel("escalation")).toBe("Escalation");
        expect(queueTypeCueLabel("operational")).toBeNull();
        expect(queueTypeCueLabel("informational")).toBeNull();
    });

    it("uses policy-cited escalation context without alarm phrasing", () => {
        expect(resolveEscalationChipLabel("escalation")).toBe(ESCALATION_CHIP_LABEL);
        expect(resolveEscalationChipLabel("communication")).toBeNull();
        expect(ESCALATION_CHIP_LABEL).not.toMatch(/critical|emergency|danger|immediate action/i);

        const context = resolveClassificationContextLine({
            recommendationType: "escalation",
            escalationPolicyBasis: "Attention SLA tier breached for Lee Household",
        });
        expect(context).toContain("SLA tier breached");
        expect(context).not.toMatch(/AI|warning|alert/i);
    });

    it("surfaces communication timing as restrained context", () => {
        const context = resolveClassificationContextLine({
            recommendationType: "communication",
            communicationTimingHint: "within one business day",
        });
        expect(context).toBe("Follow-up timing · within one business day");
    });
});

describe("recommendationSurfaceSelectors classification / Card 2.5", () => {
    it("passes queue type cue from canonical preview metadata", () => {
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
                    attention_computed_at_iso: "2026-05-21T10:00:00.000Z",
                    activity_signal_key: "unanswered_inbound",
                },
            })
        );
        const preview = projectOperationalRecommendationQueuePreview(rec);
        const resolved = resolveQueueOperationalReadPreview({
            _operational_recommendation_preview: preview,
        });
        expect(resolved?.typeCue).toBe("Communication");
        expect(resolved?.urgencyChipLabel).toBeTruthy();
    });

    it("omits queue type cue for default follow-up operational reads", () => {
        const resolved = resolveQueueOperationalReadPreview({
            _operational_recommendation_preview: {
                next_label: "Complete the internal task",
                why_line: "Staff owe the next step on this record.",
                urgency_band: "p1_today",
                recommendation_type: "operational",
            },
        });
        expect(resolved?.typeCue).toBeNull();
        expect(resolved?.urgencyChipLabel).toBe("Today");
    });

    it("resolves drawer classification from canonical recommendation", () => {
        const rec = buildOperationalRecommendationV1(
            buildTestOperationalRecommendationInput({
                catalog_key: "sla_breach",
                primary_label: "Lee Household",
                template_values: {
                    primary_label: "Lee Household",
                    sla_tier: "breached",
                },
                raw_signals: [
                    {
                        code: "primary_attention_reason",
                        label: "Waiting on staff",
                        source_type: "attention_resolver",
                        provenance: "opportunity_attention_resolver.v2",
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
                    waiting_since_iso: "2026-05-21T10:00:00.000Z",
                    resolver_version: 2,
                    attention_computed_at_iso: "2026-05-21T10:00:00.000Z",
                    activity_signal_key: null,
                },
            })
        );
        const display = getRecommendationDrawerStrip({ _operational_recommendation: rec });
        expect(display?.typeCue).toBe("Escalation");
        expect(display?.escalationChipLabel).toBe(ESCALATION_CHIP_LABEL);
        expect(display?.classificationContextLine).toContain("SLA tier");
        expect(display?.classificationContextLine).not.toMatch(/critical|emergency/i);
    });
});
