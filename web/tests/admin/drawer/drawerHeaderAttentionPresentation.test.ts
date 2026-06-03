import { describe, expect, it } from "vitest";
import { buildOperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations";
import { buildTestOperationalRecommendationInput } from "@/tests/adminV2/bos/recommendations/buildOperationalRecommendationV1.test";
import {
    buildDrawerHeaderMoreGuidance,
    buildReadinessDrawerHeaderMoreGuidance,
    drawerHeaderAttentionSummaryLine,
    hasDrawerReviewAssistBodyGuidance,
    isDrawerHeaderAttentionVisible,
    isDrawerHeaderReviewAssistVisible,
    resolveDrawerHeaderReadinessAttention,
} from "@/lib/admin/drawer/drawerHeaderAttentionPresentation";
import { resolveDrawerReviewAssistViewModel } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceViewModels";
import { getRecommendationDetailSummary } from "@/lib/adminV2/bos/recommendations/selectors/recommendationSurfaceSelectors";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";

describe("drawerHeaderAttentionPresentation", () => {
    const minimalAttention = {
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
        auxiliary: {},
        resolver_version: 2,
        computed_at_iso: "2026-05-13T12:00:00.000Z",
    };

    const readinessPrimaryAttention = (): OpportunityAttentionResult => ({
        needs_attention: true,
        reasons: [
            {
                code: "missing_required_info",
                label: "Child · Program Interest",
                severity: "high",
                sla_tier: "ok",
                sla_clock_confidence: "high",
                attention_source: "readiness",
                readiness_gap_ids: ["child:program_interest"],
            },
        ],
        primary_reason: {
            code: "missing_required_info",
            label: "Child · Program Interest",
            severity: "high",
            sla_tier: "ok",
            sla_clock_confidence: "high",
            attention_source: "readiness",
            readiness_gap_ids: ["child:program_interest"],
        },
        waiting: { bucket: "none", since_iso: null, active: false },
        priority_score: 1,
        priority_breakdown: [],
        auxiliary: { activity_stale: null },
        resolver_version: 2,
        computed_at_iso: "2026-06-03T12:00:00.000Z",
    });

    it("isDrawerHeaderAttentionVisible when recommendation operational read exists", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        expect(
            isDrawerHeaderAttentionVisible({
                _operational_recommendation: rec,
                _operational_attention: minimalAttention,
            })
        ).toBe(true);
    });

    it("isDrawerHeaderAttentionVisible when only readiness attention is present", () => {
        expect(
            isDrawerHeaderAttentionVisible({
                _operational_attention: readinessPrimaryAttention(),
            })
        ).toBe(true);
        expect(isDrawerHeaderReviewAssistVisible({ _operational_attention: readinessPrimaryAttention() })).toBe(
            false
        );
    });

    it("resolveDrawerHeaderReadinessAttention surfaces primary readiness copy", () => {
        const ctx = resolveDrawerHeaderReadinessAttention({
            _operational_attention: readinessPrimaryAttention(),
        });
        expect(ctx.hasReadinessAttention).toBe(true);
        expect(ctx.primaryIsReadiness).toBe(true);
        expect(ctx.primarySummaryLine).toBe("Child · Program Interest");
        expect(ctx.severityChipLabel).toBeNull();
        expect(ctx.nextStepLine).toContain("Add child · program interest");
    });

    it("resolveDrawerHeaderReadinessAttention builds supporting line for mixed reasons", () => {
        const ctx = resolveDrawerHeaderReadinessAttention({
            _operational_attention: {
                ...minimalAttention,
                reasons: [
                    minimalAttention.primary_reason!,
                    {
                        code: "missing_required_info",
                        label: "Child · Program Interest",
                        severity: "high",
                        sla_tier: "ok",
                        sla_clock_confidence: "high",
                        attention_source: "readiness",
                        readiness_gap_ids: ["child:program_interest"],
                    },
                ],
            },
        });
        expect(ctx.primaryIsReadiness).toBe(false);
        expect(ctx.supportingLine).toBe("Also missing: Child · Program Interest");
    });

    it("drawerHeaderAttentionSummaryLine prefers doNext over operationalRead", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const vm = resolveDrawerReviewAssistViewModel({
            _operational_recommendation: rec,
            _operational_attention: minimalAttention,
        });
        expect(vm).not.toBeNull();
        const line = drawerHeaderAttentionSummaryLine(vm!.display);
        expect(line).toBeTruthy();
        expect(line).toBe(vm!.display.doNext?.trim() || vm!.display.operationalRead?.trim());
    });

    it("hasDrawerReviewAssistBodyGuidance when why/expansion content exists", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        expect(
            hasDrawerReviewAssistBodyGuidance({
                _operational_recommendation: rec,
                _operational_attention: minimalAttention,
            })
        ).toBe(true);
    });

    it("buildReadinessDrawerHeaderMoreGuidance uses short human labels", () => {
        const ctx = resolveDrawerHeaderReadinessAttention({
            _operational_attention: readinessPrimaryAttention(),
        });
        const lines = buildReadinessDrawerHeaderMoreGuidance(ctx);
        expect(lines.map((l) => l.label)).toEqual(["What's missing", "Why it matters", "What to do"]);
        expect(lines.find((l) => l.key === "missing")?.body).toBe("Child · Program Interest");
        expect(lines.find((l) => l.key === "why")?.body).toBe("Needed to continue this inquiry.");
        expect(lines.every((l) => !/needs review|sla|escalat/i.test(`${l.label} ${l.body}`))).toBe(true);
    });

    it("buildDrawerHeaderMoreGuidance dedupes breached copy and omits trust noise", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const vm = resolveDrawerReviewAssistViewModel({
            _operational_recommendation: rec,
            _operational_attention: minimalAttention,
        });
        expect(vm).not.toBeNull();
        const lines = buildDrawerHeaderMoreGuidance({
            display: {
                ...vm!.display,
                whyNow: "SLA breached · breached · long escalation narrative",
            },
            summary: drawerHeaderAttentionSummaryLine(vm!.display),
            doNext: vm!.display.doNext?.trim() ?? "",
            readinessCtx: resolveDrawerHeaderReadinessAttention({}),
            supportingDetail: getRecommendationDetailSummary({ _operational_recommendation: rec }),
        });
        expect(lines.some((l) => l.key === "why")).toBe(true);
        expect(lines.find((l) => l.key === "why")?.body).not.toMatch(/breached\s*[·•|]\s*breached/i);
        expect(lines.every((l) => !/supporting detail available/i.test(l.body))).toBe(true);
    });
});
