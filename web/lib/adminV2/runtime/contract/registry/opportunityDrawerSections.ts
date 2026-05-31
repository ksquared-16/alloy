import { opportunityInquiryFamilyBlockReadyOnPrimary } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import { opportunityInquirySummaryRightPanelFromPrimaryOnly } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import { opportunityInquiryTourDisplayFromPrimaryMetadata } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import type { AdminV2DrawerSectionContract } from "@/lib/adminV2/runtime/contract/drawerSectionContract";

const OPPORTUNITY_INQUIRY_CHILDREN_COLLAPSED_SHELL = "min-h-[2.75rem]";

/** Opportunity inquiry workflow — composer-owned above-fold contracts. */
export const OPPORTUNITY_DRAWER_SECTION_REGISTRY: readonly AdminV2DrawerSectionContract[] = [
    {
        sectionKey: "opportunity_lead_summary",
        surface: "opportunity",
        canRenderFromSeed: true,
        blocksFirstPaint: true,
        reservedLayout: { minHeightClass: "min-h-[12rem]", reserveVariant: "lead_summary" },
        hasRenderableData: (ctx) => opportunityInquiryFamilyBlockReadyOnPrimary(ctx.record),
        renderReady: (ctx) =>
            ctx.typedSnapshot || (ctx.bodyHydrated && opportunityInquiryFamilyBlockReadyOnPrimary(ctx.record)),
        fallbackMode: "reserved",
    },
    {
        sectionKey: "opportunity_bos_right_column",
        surface: "opportunity",
        canRenderFromSeed: true,
        blocksFirstPaint: true,
        reservedLayout: { minHeightClass: "min-h-[6rem]", reserveVariant: "bos_right_column" },
        hasRenderableData: (ctx) => opportunityInquirySummaryRightPanelFromPrimaryOnly(ctx.record),
        renderReady: (ctx) =>
            ctx.typedSnapshot ||
            opportunityInquirySummaryRightPanelFromPrimaryOnly(ctx.record) ||
            ctx.fullHydrateReady,
        fallbackMode: "reserved",
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
        belowFoldLazy: true,
        reservedLayout: {
            minHeightClass: OPPORTUNITY_INQUIRY_CHILDREN_COLLAPSED_SHELL,
            reserveVariant: "inquiry_children_collapsed",
        },
        hasRenderableData: (ctx) => Array.isArray((ctx.record.inquiry_children as unknown) ?? null),
        renderReady: (ctx) => ctx.fullHydrateReady && ctx.bodyHydrated,
        fallbackMode: "reserved",
    },
];
