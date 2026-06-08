import {
    childDrawerHouseholdCoordinatedReady,
    childDrawerMedicalCoordinatedReady,
    childDrawerSummaryCoordinatedReady,
} from "@/lib/admin/drawer/drawerAboveFoldCoordinatedReveal";
import { personDrawerChildChromeActive } from "@/lib/admin/person/personDrawerChildChrome";
import type { AdminV2DrawerSectionContract } from "@/lib/adminV2/runtime/contract/drawerSectionContract";

export const CHILD_DRAWER_SECTION_REGISTRY: readonly AdminV2DrawerSectionContract[] = [
    {
        sectionKey: "child_summary",
        surface: "child",
        canRenderFromSeed: false,
        blocksFirstPaint: true,
        // childChromeHint threaded from ComposedPersonDrawerPayloadContext via evaluation ctx
        hasRenderableData: (ctx) => childDrawerSummaryCoordinatedReady(ctx.record, ctx.childChromeHint),
        renderReady: (ctx) =>
            ctx.bodyHydrated && childDrawerSummaryCoordinatedReady(ctx.record, ctx.childChromeHint),
        fallbackMode: "block-drawer-reveal",
    },
    {
        sectionKey: "child_header_chips",
        surface: "child",
        canRenderFromSeed: false,
        blocksFirstPaint: true,
        hasRenderableData: (ctx) => personDrawerChildChromeActive(ctx.record, ctx.childChromeHint),
        renderReady: (ctx) =>
            ctx.bodyHydrated && personDrawerChildChromeActive(ctx.record, ctx.childChromeHint),
        fallbackMode: "block-drawer-reveal",
    },
    {
        sectionKey: "child_household",
        surface: "child",
        canRenderFromSeed: false,
        blocksFirstPaint: true,
        // Known-empty: ready when _household_adult_links key is present (even empty array).
        hasRenderableData: (ctx) => childDrawerHouseholdCoordinatedReady(ctx.record),
        renderReady: (ctx) => ctx.bodyHydrated && childDrawerHouseholdCoordinatedReady(ctx.record),
        fallbackMode: "block-drawer-reveal",
    },
    {
        sectionKey: "child_medical",
        surface: "child",
        canRenderFromSeed: false,
        blocksFirstPaint: true,
        // Known-empty: the persons API has no medical column. After full fetch (bodyHydrated),
        // absence of medical data is the final answer — ready to render the empty/final medical section.
        hasRenderableData: (ctx) => childDrawerMedicalCoordinatedReady(ctx.record, ctx.bodyHydrated),
        renderReady: (ctx) => ctx.bodyHydrated && childDrawerMedicalCoordinatedReady(ctx.record, ctx.bodyHydrated),
        fallbackMode: "block-drawer-reveal",
    },
    {
        sectionKey: "child_bos_panel",
        surface: "child",
        canRenderFromSeed: false,
        blocksFirstPaint: true,
        hasRenderableData: (ctx) => personDrawerChildChromeActive(ctx.record, ctx.childChromeHint),
        renderReady: (ctx) =>
            ctx.bodyHydrated && personDrawerChildChromeActive(ctx.record, ctx.childChromeHint),
        fallbackMode: "block-drawer-reveal",
    },
];
