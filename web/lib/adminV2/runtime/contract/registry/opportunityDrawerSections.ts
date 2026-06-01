import {
    opportunityInquiryFamilyBlockReadyOnPrimary,
    opportunityInquirySummaryRightPanelFromPrimaryOnly,
    opportunityInquiryTourDisplayFromPrimaryMetadata,
} from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import { opportunityInquiryChildrenCoordinatedReady } from "@/lib/admin/drawer/drawerAboveFoldCoordinatedReveal";
import type { AdminV2DrawerSectionContract } from "@/lib/adminV2/runtime/contract/drawerSectionContract";

/** Opportunity inquiry workflow — composer-owned above-fold contracts. */
export const OPPORTUNITY_DRAWER_SECTION_REGISTRY: readonly AdminV2DrawerSectionContract[] = [
    {
        sectionKey: "opportunity_lead_summary",
        surface: "opportunity",
        canRenderFromSeed: true,
        blocksFirstPaint: true,
        hasRenderableData: (ctx) => opportunityInquiryFamilyBlockReadyOnPrimary(ctx.record),
        renderReady: (ctx) =>
            ctx.bodyHydrated && opportunityInquiryFamilyBlockReadyOnPrimary(ctx.record),
        fallbackMode: "block-drawer-reveal",
    },
    {
        sectionKey: "opportunity_bos_right_column",
        surface: "opportunity",
        canRenderFromSeed: true,
        blocksFirstPaint: true,
        hasRenderableData: (ctx) =>
            opportunityInquirySummaryRightPanelFromPrimaryOnly(ctx.record) || ctx.fullHydrateReady,
        renderReady: (ctx) =>
            opportunityInquirySummaryRightPanelFromPrimaryOnly(ctx.record) || ctx.fullHydrateReady,
        fallbackMode: "block-drawer-reveal",
    },
    {
        sectionKey: "opportunity_tour_slot",
        surface: "opportunity",
        canRenderFromSeed: true,
        blocksFirstPaint: false,
        hasRenderableData: (ctx) => opportunityInquiryTourDisplayFromPrimaryMetadata(ctx.record),
        renderReady: (ctx) =>
            opportunityInquiryTourDisplayFromPrimaryMetadata(ctx.record) || ctx.fullHydrateReady,
        fallbackMode: "hidden",
    },
    {
        sectionKey: "opportunity_inquiry_children",
        surface: "opportunity",
        canRenderFromSeed: false,
        blocksFirstPaint: true,
        hasRenderableData: (ctx) => opportunityInquiryChildrenCoordinatedReady(ctx.record, true),
        renderReady: (ctx) =>
            ctx.bodyHydrated && opportunityInquiryChildrenCoordinatedReady(ctx.record, true),
        fallbackMode: "block-drawer-reveal",
    },
];
