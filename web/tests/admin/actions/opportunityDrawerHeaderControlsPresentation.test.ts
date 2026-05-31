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
    it("title rail renders Work with BOS and Actions via header controls", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("OpportunityDrawerHeaderControls");
        expect(drawer).toContain("data-opportunity-header-actions-rail");
        const controls = read("components/admin/opportunity/OpportunityDrawerHeaderControls.tsx");
        expect(controls).toContain("BosDrawerAssistCta");
        expect(controls).toContain("OpportunityDrawerHeaderActionsMenu");
        expect(controls).toContain('data-opportunity-header-controls="true"');
        expect(controls).toContain('data-opportunity-header-controls-row="actions"');
    });

    it("header buttons stay on top row; attention sits below", () => {
        const controls = read("components/admin/opportunity/OpportunityDrawerHeaderControls.tsx");
        expect(controls).toContain("DrawerHeaderAttentionBlock");
        expect(controls).toMatch(
            /data-opportunity-header-controls-row="actions"[\s\S]*BosDrawerAssistCta[\s\S]*OpportunityDrawerHeaderActionsMenu/
        );
        expect(controls).toMatch(
            /OpportunityDrawerHeaderActionsMenu[\s\S]*<\/div>[\s\S]*DrawerHeaderAttentionBlock/
        );
    });

    it("does not render primary/secondary action pills in header", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).not.toMatch(/headerActions\?\.primary.*OpportunityDrawerHeaderActionButton/s);
        expect(drawer).not.toMatch(/\.primary\s*\?\?\s*\[\]\)\.map\(\(a\)/);
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

    it("Actions menu enforces single-line labels", () => {
        const menu = read("components/admin/opportunity/OpportunityDrawerHeaderActionsMenu.tsx");
        expect(menu).toContain("whitespace-nowrap");
        expect(menu).toContain("truncate");
        expect(menu).toContain(">Actions<");
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

    it("registry action routing unchanged in drawer", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("handleResolvedOpportunityHeaderAction");
        expect(drawer).toContain("flattenOpportunityRecordHeaderActionsForMenu");
    });

    it("BOS label remains Work with BOS", () => {
        expect(BOS_ASSIST_CTA_DRAWER).toBe("Work with BOS");
    });

    it("header attention supports two-line summary with intelligence surface accent and More guidance", () => {
        const strip = read("components/admin/drawer/DrawerHeaderAttentionBlock.tsx");
        const tokens = read("lib/admin/drawer/drawerHeaderAttentionPresentation.ts");
        expect(strip).toContain("line-clamp-2");
        expect(strip).not.toContain("truncate");
        expect(strip).toContain("DRAWER_HEADER_ATTENTION_SURFACE");
        expect(strip).toContain("header-attention-more-guidance");
        expect(tokens).toContain("border-l-alloy-blue/40");
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
        expect(html).toContain("line-clamp-2");
        expect(html).toContain("header-attention-summary");
        expect(html).toContain("Send a warm first response");
        expect(html).toContain("header-attention-more-guidance");
    });
});

describe("person drawer header controls presentation", () => {
    it("person title rail uses PersonDrawerHeaderControls with BOS on actions row", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).toContain("PersonDrawerHeaderControls");
        const controls = read("components/admin/entity/PersonDrawerHeaderControls.tsx");
        expect(controls).toContain("BosDrawerAssistCta");
        expect(controls).toContain('data-person-header-controls-row="actions"');
    });

    it("person summary assist panels do not duplicate BOS CTA", () => {
        const parentPanel = read("components/admin/entity/PersonDrawerParentSummaryBosPanel.tsx");
        const childPanel = read("components/admin/entity/PersonDrawerChildSummaryBosPanel.tsx");
        expect(parentPanel).not.toContain("BosDrawerAssistCta");
        expect(childPanel).not.toContain("BosDrawerAssistCta");
    });
});
