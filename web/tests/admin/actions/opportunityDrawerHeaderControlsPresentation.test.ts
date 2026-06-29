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
    it("title rail renders Work with BOS and Manage via header controls", () => {
        const runtime = read("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        const controls = read("components/admin/opportunity/OpportunityDrawerHeaderControls.tsx");
        expect(runtime).toContain("OpportunityDrawerHeaderControls");
        expect(runtime).toContain("actionPreflightBlocked");
        expect(runtime).toContain("useOpportunityDrawerActionPreflight");
        expect(controls).toContain("ActionPreflightBlockedPanel");
        expect(controls).toContain("BosDrawerAssistCta");
        expect(controls).toContain("RecordDrawerManageMenu");
        expect(controls).toContain('data-opportunity-header-controls="true"');
        expect(controls).toContain('data-opportunity-header-controls-row="actions"');
    });

    it("header attention and actions share the composed row", () => {
        const controls = read("components/admin/opportunity/OpportunityDrawerHeaderControls.tsx");
        expect(controls).toContain("DrawerHeaderAttentionBlock");
        expect(controls).toContain('data-opportunity-header-controls-row="composed"');
        expect(controls).toContain('data-opportunity-header-controls-row="attention"');
        expect(controls).toMatch(
            /data-opportunity-header-controls-row="composed"[\s\S]*flex-1[\s\S]*OpportunityDrawerHeaderManageRow/
        );
    });

    it("does not render primary/secondary action pills in header", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).not.toMatch(/headerActions\?\.primary[\s\S]*OpportunityDrawerHeaderActionButton/);
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

    it("registry Manage actions stay in Focus Panel header, not workspace command rail", () => {
        const runtime = read("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        const legacy = read("components/admin/AdminEntityDrawerLegacy.tsx");
        expect(runtime).toContain("displayVm.actions.header_menu");
        expect(runtime).not.toContain("DrawerCommandRailActionsRegistrar");
        expect(legacy).toContain("handleResolvedOpportunityHeaderAction");
        expect(legacy).toContain("flattenOpportunityRecordHeaderActionsForMenu");
    });

    it("BOS label remains Work with BOS", () => {
        expect(BOS_ASSIST_CTA_DRAWER).toBe("Work with BOS");
    });

    it("header attention uses modal center column width tokens", () => {
        const strip = read("components/admin/drawer/DrawerHeaderAttentionBlock.tsx");
        const tokens = read("lib/admin/drawer/drawerHeaderAttentionPresentation.ts");
        const controls = read("components/admin/opportunity/OpportunityDrawerHeaderControls.tsx");
        const runtime = read("components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx");
        const shell = read("components/admin/Drawer.tsx");
        expect(strip).toContain("buildDrawerHeaderMoreGuidance");
        expect(strip).toContain("buildReadinessDrawerHeaderMoreGuidance");
        expect(strip).not.toContain("header-attention-view-required-information");
        expect(strip).not.toContain("Supporting detail available");
        expect(tokens).toContain("DRAWER_HEADER_ATTENTION_MAX_WIDTH");
        expect(tokens).toContain("DRAWER_HEADER_ATTENTION_CENTER_COLUMN_CLASS");
        expect(tokens).toContain("min-w-[min(100%,450px)]");
        expect(tokens).toContain("max-w-[600px]");
        expect(controls).toContain('layout="modal-attention"');
        expect(controls).toContain('data-opportunity-header-controls-layout="modal-attention"');
        expect(runtime).toContain('layout="modal-actions"');
        expect(runtime).toContain("headerTitleRight");
        expect(runtime).toContain('data-opportunity-drawer-header-title-right="true"');
        expect(shell).toContain("headerTitleCenter");
        expect(shell).toContain("usesThreeColumnHeader");
        expect(shell).toContain("three-column");
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

    it("drawer body no longer renders standalone Required Information panel", () => {
        const drawer = read("components/admin/AdminEntityDrawer.tsx");
        expect(drawer).not.toContain("OpportunityDrawerRequiredInformationPanel");
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

describe("person drawer header controls presentation", () => {
    it("person title rail uses PersonDrawerHeaderControls with BOS on actions row", () => {
        const proofHeader = read("components/admin/vmDrawer/PersonDrawerProofLayoutHeader.tsx");
        expect(proofHeader).toContain("PersonDrawerHeaderControls");
        const controls = read("components/admin/entity/PersonDrawerHeaderControls.tsx");
        expect(controls).toContain("RecordDrawerManageMenu");
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
