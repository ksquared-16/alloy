import { createElement } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { BOS_ASSIST_CTA_DRAWER } from "@/lib/adminV2/bos/bosDrawerAssistHandoff";
import { buildOperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations";
import { buildTestOperationalRecommendationInput } from "@/tests/adminV2/bos/recommendations/buildOperationalRecommendationV1.test";
import { DrawerHeaderAttentionBlock } from "@/components/admin/drawer/DrawerHeaderAttentionBlock";

const webRoot = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("opportunity drawer header controls presentation", () => {

    it("header attention and actions share the composed row", () => {
        const controls = read("components/admin/opportunity/OpportunityDrawerHeaderControls.tsx");
        expect(controls).toContain("DrawerHeaderAttentionBlock");
        expect(controls).toContain('data-opportunity-header-controls-row="composed"');
        expect(controls).toContain('data-opportunity-header-controls-row="attention"');
        expect(controls).toMatch(
            /data-opportunity-header-controls-row="composed"[\s\S]*flex-1[\s\S]*OpportunityDrawerHeaderManageRow/
        );
    });

    it("BOS CTA is not duplicated in inquiry summary panels", () => {
        const rightCol = read("components/admin/opportunity/OpportunityInquirySummaryRightColumn.tsx");
        expect(rightCol).not.toContain("BosDrawerAssistCta");
        expect(rightCol).not.toContain("bosAssistEntityId");
        expect(rightCol).not.toContain('"bos_only"');
        const strip = read("components/admin/drawer/OperationalAttentionHeaderStrip.tsx");
        expect(strip).not.toContain("BosDrawerAssistCta");
        expect(strip).not.toContain("bosAssistSlot");
    });

    it("Manage menu enforces single-line labels", () => {
        const menu = read("components/admin/drawer/record/RecordDrawerManageMenu.tsx");
        expect(menu).toContain("whitespace-nowrap");
        expect(menu).toContain("truncate");
        expect(menu).toContain("RECORD_DRAWER_MANAGE_MENU_LABEL");
        expect(menu).toContain('aria-haspopup="menu"');
        expect(menu).toContain('ev.key === "Escape"');
    });

    it("header controls omit card chrome on action rail", () => {
        const bos = read("components/admin/drawer/BosDrawerAssistCta.tsx");
        expect(bos).toContain("bare");
        expect(bos).toMatch(/if \(bare\) return button/);
        const controls = read("components/admin/opportunity/OpportunityDrawerHeaderControls.tsx");
        expect(controls).not.toContain("OpportunityDrawerHeaderActionsPanel");
    });

    it("BOS label remains Work with BOS", () => {
        expect(BOS_ASSIST_CTA_DRAWER).toBe("Work with BOS");
    });

    it("composed sidebar layout keeps attention and actions in one block", () => {
        const controls = read("components/admin/opportunity/OpportunityDrawerHeaderControls.tsx");
        expect(controls).toContain('data-opportunity-header-controls-row="composed"');
        expect(controls).toContain('data-opportunity-header-controls-layout="composed"');
        expect(controls).toContain("flex-1");
        expect(controls).not.toMatch(/flex-col[\s\S]*data-opportunity-header-controls-row="actions"[\s\S]*data-opportunity-header-controls-row="attention"/);
    });

    it("inquiry summary dedupes body when header attention is visible", () => {
        const rightCol = read("components/admin/opportunity/OpportunityInquirySummaryRightColumn.tsx");
        expect(rightCol).toContain("isDrawerHeaderAttentionVisible");
        expect(rightCol).toContain("headerAttentionVisible");
        const band = read("components/admin/drawer/OperationalReviewAssistBand.tsx");
        expect(band).toMatch(/bodyOnlyAttention[\s\S]*do_next/);
        expect(band).toContain("!bodyOnlyAttention");
    });

    it("inquiry summary review assist omits header-duplicated chips and operational read", () => {
        const strip = read("components/admin/drawer/OperationalAttentionHeaderStrip.tsx");
        expect(strip).toContain("bodyOnlyAttention");
        const band = read("components/admin/drawer/OperationalReviewAssistBand.tsx");
        expect(band).toContain("bodyOnlyAttention");
    });

});

describe("DrawerHeaderAttentionBlock", () => {
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

    it("renders chips and multi-line-capable summary when recommendation present", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const html = renderToStaticMarkup(
            createElement(DrawerHeaderAttentionBlock, {
                overviewData: {
                    _operational_recommendation: rec,
                    _operational_attention: minimalAttention,
                },
            })
        );
        expect(html).toContain("header-attention-summary");
        expect(html).toContain("Send a warm first response");
        expect(html).toContain("header-attention-more-guidance");
        expect(html).not.toContain("header-attention-view-required-information");
    });

    it("renders readiness-primary attention without BOS recommendation", () => {
        const html = renderToStaticMarkup(
            createElement(DrawerHeaderAttentionBlock, {
                overviewData: {
                    _operational_attention: {
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
                    },
                },
            })
        );
        expect(html).toContain("header-attention-summary");
        expect(html).toContain("Child · Program Interest");
        expect(html).toContain("header-attention-readiness-next");
        expect(html).toContain("Add Child · Program Interest to continue this inquiry.");
        expect(html).not.toContain("header-attention-urgency-chip");
        expect(html).not.toContain("header-attention-view-required-information");
    });

    it("shows readiness supporting detail when platform reason is primary", () => {
        const rec = buildOperationalRecommendationV1(buildTestOperationalRecommendationInput());
        const html = renderToStaticMarkup(
            createElement(DrawerHeaderAttentionBlock, {
                overviewData: {
                    _operational_recommendation: rec,
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
                },
            })
        );
        expect(html).toContain("Send a warm first response");
        expect(html).toContain("header-attention-readiness-supporting");
        expect(html).toContain("Also missing: Child · Program Interest");
        expect(html).not.toContain("header-attention-view-required-information");
    });
});
