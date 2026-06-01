import {
    opportunityInquiryFamilyBlockReadyOnPrimary,
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
        canRenderFromSeed: false,
        blocksFirstPaint: true,
        // Known-empty doctrine: BOS tasks and guidance only arrive with the full record.
        // fallbackMode "hidden" means the section does not render (no pop-in) but also does NOT
        // block canRevealDrawerFrame/canRevealHeaderActions — the header can show actions while
        // the body holds in "Preparing lead..." via evaluateComposedOpportunityDrawerPayload.
        // Once fullHydrateReady the section transitions to "render" and the composed payload
        // becomes ready, allowing the body to reveal with its final BOS content.
        hasRenderableData: (ctx) => ctx.fullHydrateReady,
        renderReady: (ctx) => ctx.fullHydrateReady,
        fallbackMode: "hidden",
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
        // Inquiry children are ready when all OCM labels are resolved (known-empty is valid).
        // Uses bodyHydrated (primary record is enough to carry _inquiry_children from bootstrap).
        hasRenderableData: (ctx) => opportunityInquiryChildrenCoordinatedReady(ctx.record, true),
        renderReady: (ctx) =>
            ctx.bodyHydrated && opportunityInquiryChildrenCoordinatedReady(ctx.record, true),
        fallbackMode: "block-drawer-reveal",
    },
];
