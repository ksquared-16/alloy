import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import OperationalAttentionHeaderStrip from "@/components/admin/drawer/OperationalAttentionHeaderStrip";
import OperationalReviewAssistBand from "@/components/admin/drawer/OperationalReviewAssistBand";
import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import { buildOperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations";
import {
    getRecommendationDetailSummary,
    getRecommendationDrawerStrip,
    resolveDrawerReadinessChromeForOverview,
} from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import { suggestedContentForReason } from "@/lib/agent/needsAttentionSuggestion/suggestedContentTemplates";
import { buildTestOperationalRecommendationInput } from "@/tests/adminV2/bos/recommendations/buildOperationalRecommendationV1.test";

const minimalAttention = (): OpportunityAttentionResult => ({
    needs_attention: true,
    reasons: [
        {
            code: "stale_new_inquiry",
            label: "New inquiry is stale",
            severity: "medium",
            sla_tier: "breached",
            sla_clock_confidence: "low",
        },
    ],
    primary_reason: {
        code: "stale_new_inquiry",
        label: "New inquiry is stale",
        severity: "medium",
        sla_tier: "breached",
        sla_clock_confidence: "low",
    },
    waiting: { bucket: "none", since_iso: null, active: false },
    priority_score: 1,
    priority_breakdown: [],
    auxiliary: {
        activity_stale: { key: "x", label: "Idle signal", severity: "medium", threshold_minutes: 60 },
    },
    resolver_version: 2,
    computed_at_iso: "2026-05-13T12:00:00.000Z",
});

const legacySuggestion = (): AttentionSuggestionV1 => ({
    version: 1,
    agent_key: "needs_attention_suggestion",
    suggestion_id: "a".repeat(48),
    target: { entity_type: "opportunities", entity_id: "opp-1" },
    source: {
        resolver: "opportunity_attention",
        resolver_version: 2,
        primary_reason_code: "stale_new_inquiry",
        reason_codes: ["stale_new_inquiry"],
        activity_signal_key: "idle",
    },
    next_action: {
        key: "respond_to_new_request",
        label: "Respond to new request",
        action_family: "follow_up",
        confidence: "deterministic",
    },
    reasoning: {
        summary: "Operational attention: New inquiry is stale.",
        factors: [{ code: "stale_new_inquiry", label: "New inquiry is stale", severity: "medium", sla_tier: "breached" }],
    },
    generated_at_iso: "2026-05-13T12:00:00.000Z",
});

describe("OperationalReviewAssistBand / Card 2.1", () => {
    it("renders cognition-ordered rows from canonical projection", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const display = getRecommendationDrawerStrip({ _operational_recommendation: rec });
        expect(display).not.toBeNull();

        const supportingDetail = getRecommendationDetailSummary({ _operational_recommendation: rec });
        const html = renderToStaticMarkup(
            <OperationalReviewAssistBand
                display={display!}
                supportingDetail={supportingDetail}
                variant="chrome"
            />,
        );

        expect(html).toContain("Review assist");
        expect(html).toContain("Send a warm first response");
        expect(html).not.toContain('data-review-assist-row="likely_outcome"');
        expect(html).toContain('data-review-assist-compact="true"');
        expect(html).toContain('data-review-assist-compact-body="true"');
        expect(html).toContain('data-review-assist-row="operational_read"');
        expect(html).toContain('data-review-assist-row="do_next"');
        expect(html).toContain('data-testid="review-assist-compact-expand"');
        expect(html).not.toMatch(/<p[^>]*data-review-assist-row="why_now"[^>]*>[^<]{80,}/);
        expect(html).not.toContain('data-testid="review-assist-urgency-chip"');
        expect(html).not.toContain("Needs attention:");
        expect(html).not.toContain("Alloy suggestion");
        expect(html).not.toContain("AI recommendation");
        expect(html).not.toContain("Next ·");
        expect(html).not.toContain("Why ·");
        expect(html).not.toContain("What BOS has to say");
    });

    it("hides likely outcome row when absent", () => {
        const rec = buildOperationalRecommendationV1(
            buildTestOperationalRecommendationInput({
                template_values: {
                    primary_label: "New inquiry is stale",
                    severity: "medium",
                    days: 2,
                    intake_age_phrase: "2 days since the inquiry was created",
                    urgency_reason_line: "2 days since the inquiry was created",
                },
            }),
        );
        const display = getRecommendationDrawerStrip({ _operational_recommendation: rec });
        const supportingDetail = getRecommendationDetailSummary({ _operational_recommendation: rec });
        const html = renderToStaticMarkup(
            <OperationalReviewAssistBand
                display={display!}
                supportingDetail={supportingDetail}
                variant="chrome"
            />,
        );
        if (rec.likely_outcome?.trim()) {
            expect(html).not.toContain('data-review-assist-row="likely_outcome"');
        } else {
            expect(html).not.toContain('data-review-assist-row="likely_outcome"');
        }
    });

    it("shows calm readiness trust lines when stale or approximate", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        rec.render.drawer_strip.is_stale = true;
        rec.render.drawer_strip.stale_banner = "Record changed — refresh for updated guidance.";
        rec.render.drawer_strip.confidence_label = "Approximate timing";

        const display = getRecommendationDrawerStrip({ _operational_recommendation: rec });
        const supportingDetail = getRecommendationDetailSummary({ _operational_recommendation: rec });
        const readinessChrome = resolveDrawerReadinessChromeForOverview(
            { _operational_recommendation: rec },
            { hasSupportingDetail: Boolean(supportingDetail), hasActivitySignal: true }
        );
        const html = renderToStaticMarkup(
            <OperationalReviewAssistBand
                display={display!}
                supportingDetail={supportingDetail}
                readinessChrome={readinessChrome}
                variant="chrome"
            />,
        );
        expect(html).toContain('data-testid="review-assist-trust-notes"');
        expect(html).toContain("Needs refresh");
        expect(html).toContain("Approximate timing");
        expect(html).toContain("Based on available activity");
        expect(html).toContain("Supporting detail available");
        expect(html).toContain('data-testid="review-assist-compact-expand"');
        expect(html).not.toContain("Record changed");
        expect(html).not.toMatch(/AI confidence|model believes|critical warning/i);
    });

    it("keeps trust chrome quiet when guidance is current", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const display = getRecommendationDrawerStrip({ _operational_recommendation: rec });
        const readinessChrome = resolveDrawerReadinessChromeForOverview({ _operational_recommendation: rec });
        const html = renderToStaticMarkup(
            <OperationalReviewAssistBand
                display={display!}
                readinessChrome={readinessChrome}
                variant="chrome"
            />,
        );
        expect(html).not.toContain('data-testid="review-assist-trust-notes"');
    });

    it("offers collapsed supporting detail affordance for signals", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const display = getRecommendationDrawerStrip({ _operational_recommendation: rec });
        const supportingDetail = getRecommendationDetailSummary({ _operational_recommendation: rec });
        const html = renderToStaticMarkup(
            <OperationalReviewAssistBand
                display={display!}
                supportingDetail={supportingDetail}
                variant="chrome"
            />,
        );
        expect(html).toContain('data-testid="review-assist-supporting-detail"');
        expect(html).toContain("More detail ·");
        expect(html).not.toMatch(/\bopen\b/);
    });
});

describe("OperationalReviewAssistBand / Card 2.4 supporting detail", () => {
    function renderBand(overviewData: Record<string, unknown>) {
        const display = getRecommendationDrawerStrip(overviewData);
        const supportingDetail = getRecommendationDetailSummary(overviewData);
        return renderToStaticMarkup(
            <OperationalReviewAssistBand
                display={display!}
                supportingDetail={supportingDetail}
                variant="chrome"
            />,
        );
    }

    it("hides supporting detail when no signals or factors exist", () => {
        const html = renderToStaticMarkup(
            <OperationalReviewAssistBand
                display={{
                    operationalRead: "Read",
                    whyNow: "Why",
                    doNext: "Next",
                    source: "legacy_attention_suggestion",
                }}
                supportingDetail={null}
                variant="chrome"
            />,
        );
        expect(html).not.toContain('data-testid="review-assist-supporting-detail"');
        expect(html).not.toContain("Supporting detail");
    });

    it("is collapsed by default and shows Based on N signals summary", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const html = renderBand({ _operational_recommendation: rec });
        expect(html).toContain("<details");
        expect(html).not.toContain("<details open");
        expect(html).toMatch(/More detail · \d+ signal/);
    });

    it("expands to show signal labels and limits displayed signals to three", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        rec.render.drawer_strip.signal_labels = ["Alpha", "Beta", "Gamma", "Delta"];
        if (rec.render.detail) {
            rec.render.detail.signal_labels = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"];
        }
        const detail = getRecommendationDetailSummary({ _operational_recommendation: rec });
        expect(detail?.signalCount).toBeGreaterThanOrEqual(4);
        expect(detail?.displaySignalLabels).toHaveLength(3);

        const html = renderToStaticMarkup(
            <OperationalReviewAssistBand
                display={getRecommendationDrawerStrip({ _operational_recommendation: rec })!}
                supportingDetail={detail}
                variant="chrome"
            />,
        );
        expect(html).toContain("<li>Alpha</li>");
        expect(html).toContain("<li>Beta</li>");
        expect(html).toContain("<li>Gamma</li>");
        expect(html).not.toContain("<li>Delta</li>");
        expect(html).not.toContain("<li>Epsilon</li>");
    });

    it("does not expose fingerprints, raw codes, or resolver internals", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const html = renderBand({
            _operational_recommendation: rec,
            fingerprint: "abc123deadbeef",
            resolver_version: 99,
        });
        expect(html).not.toContain("inputs_fingerprint");
        expect(html).not.toContain("fingerprint_version");
        expect(html).not.toContain("stale_new_inquiry");
        expect(html).not.toContain("opportunity_attention_resolver");
        expect(html).not.toContain("abc123deadbeef");
        expect(html).not.toContain("resolver_version");
    });

    it("works with legacy suggestion factors", () => {
        const display = getRecommendationDrawerStrip({
            _attention_suggestion: legacySuggestion(),
        });
        const supportingDetail = getRecommendationDetailSummary({
            _attention_suggestion: legacySuggestion(),
        });
        const html = renderToStaticMarkup(
            <OperationalReviewAssistBand
                display={display!}
                supportingDetail={supportingDetail}
                variant="chrome"
            />,
        );
        expect(html).toContain("More detail · 1 factor");
        expect(html).toContain("New inquiry is stale");
        expect(html).not.toContain("stale_new_inquiry");
    });

    it("does not use AI or chatbot phrasing", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const html = renderBand({ _operational_recommendation: rec });
        expect(html).not.toMatch(/AI recommendation|chatbot|chain-of-thought|model confidence/i);
        expect(html).not.toContain("Alloy suggestion");
    });

    it("uses calm disclosure styling without dominant panel chrome", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const html = renderBand({ _operational_recommendation: rec });
        expect(html).toContain('data-review-assist-supporting-detail');
        expect(html).not.toContain("border-t border-alloy-stone/12 pt-1.5");
        expect(html).not.toContain("uppercase tracking-[0.08em]");
    });
});

describe("OperationalReviewAssistBand / Card 2.5 classification", () => {
    it("shows restrained type and escalation semantics for sla breach", () => {
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
        const html = renderToStaticMarkup(
            <OperationalReviewAssistBand display={display!} variant="panel" />,
        );
        expect(html).toContain('data-testid="review-assist-type-line"');
        expect(html).toContain("Type · Escalation");
        expect(html).toContain('data-testid="review-assist-escalation-chip"');
        expect(html).toContain("Needs leadership review");
        expect(html).toContain('data-testid="review-assist-classification-context"');
        expect(html).not.toMatch(/critical issue|immediate action|AI warning|chatbot/i);
    });

    it("shows communication type without alarm phrasing", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const display = getRecommendationDrawerStrip({ _operational_recommendation: rec });
        const html = renderToStaticMarkup(
            <OperationalReviewAssistBand display={display!} variant="panel" />,
        );
        expect(html).toContain("Type · Communication");
        expect(html).not.toContain("Needs leadership review");
        expect(html).not.toMatch(/AI recommendation|alert|danger/i);
    });
});

describe("OperationalAttentionHeaderStrip Card 2.1 integration", () => {
    it("prefers canonical assist band over legacy suggestion copy", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const html = renderToStaticMarkup(
            <OperationalAttentionHeaderStrip
                variant="chrome"
                overviewData={{
                    _operational_attention: minimalAttention(),
                    _operational_attention_error: null,
                    _operational_recommendation: rec,
                    _attention_suggestion: legacySuggestion(),
                }}
            />,
        );
        expect(html).toContain("New inquiry needs timely response");
        expect(html).toContain("Send a warm first response");
        expect(html).not.toContain("Operational attention: New inquiry is stale.");
        expect(html).not.toContain("Suggested next step");
        expect(html).toContain('data-drawer-slot="operational_review_assist"');
        expect(html).toContain("More detail ·");
    });

    it("legacy-only path still renders assist band without Needs attention headline", () => {
        const html = renderToStaticMarkup(
            <OperationalAttentionHeaderStrip
                variant="chrome"
                overviewData={{
                    _operational_attention: minimalAttention(),
                    _operational_attention_error: null,
                    _attention_suggestion: legacySuggestion(),
                }}
            />,
        );
        expect(html).toContain('data-review-assist-row="operational_read"');
        expect(html).toContain("New inquiry is stale.");
        expect(html).toContain("Respond to new request");
        expect(html).not.toContain("Needs attention:");
    });

    it("fallback without recommendation uses operational read and do next", () => {
        const html = renderToStaticMarkup(
            <OperationalAttentionHeaderStrip
                variant="chrome"
                overviewData={{
                    _operational_attention: minimalAttention(),
                    _operational_attention_error: null,
                    _attention_suggestion: null,
                }}
            />,
        );
        expect(html).toContain("Operational read");
        expect(html).toContain("Do next");
        expect(html).not.toContain("Suggested next step");
        expect(html).not.toContain("Needs attention:");
    });

    it("preserves draft and enhance affordances below assist band", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const suggestion = legacySuggestion();
        const sc = suggestedContentForReason("stale_new_inquiry", {
            entity_id: "opp-1",
            record_ref: "opp-1",
            contact_name: "there",
        });
        const html = renderToStaticMarkup(
            <OperationalAttentionHeaderStrip
                variant="chrome"
                overviewData={{
                    _operational_attention: minimalAttention(),
                    _operational_recommendation: rec,
                    _attention_suggestion: sc ? { ...suggestion, suggested_content: sc } : suggestion,
                }}
            />,
        );
        expect(html).toContain("Draft · not sent");
        expect(html).not.toContain('data-drawer-slot="enhance_draft_action"');
        expect(html).toContain('data-testid="review-assist-compact-expand"');
    });
});
