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
        hasRenderableData: (ctx) => childDrawerSummaryCoordinatedReady(ctx.record),
        renderReady: (ctx) => ctx.bodyHydrated && childDrawerSummaryCoordinatedReady(ctx.record),
        fallbackMode: "block-drawer-reveal",
    },
    {
        sectionKey: "child_header_chips",
        surface: "child",
        canRenderFromSeed: false,
        blocksFirstPaint: true,
        hasRenderableData: (ctx) => personDrawerChildChromeActive(ctx.record),
        renderReady: (ctx) => ctx.bodyHydrated && personDrawerChildChromeActive(ctx.record),
        fallbackMode: "block-drawer-reveal",
    },
    {
        sectionKey: "child_household",
        surface: "child",
        canRenderFromSeed: false,
        blocksFirstPaint: true,
        hasRenderableData: (ctx) => childDrawerHouseholdCoordinatedReady(ctx.record, ctx.drawerId),
        renderReady: (ctx) =>
            ctx.bodyHydrated && childDrawerHouseholdCoordinatedReady(ctx.record, ctx.drawerId),
        fallbackMode: "block-drawer-reveal",
    },
    {
        sectionKey: "child_medical",
        surface: "child",
        canRenderFromSeed: false,
        blocksFirstPaint: true,
        hasRenderableData: (ctx) => childDrawerMedicalCoordinatedReady(ctx.record),
        renderReady: (ctx) => ctx.bodyHydrated && childDrawerMedicalCoordinatedReady(ctx.record),
        fallbackMode: "block-drawer-reveal",
    },
    {
        sectionKey: "child_bos_panel",
        surface: "child",
        canRenderFromSeed: false,
        blocksFirstPaint: true,
        hasRenderableData: (ctx) => personDrawerChildChromeActive(ctx.record),
        renderReady: (ctx) => ctx.bodyHydrated && personDrawerChildChromeActive(ctx.record),
        fallbackMode: "block-drawer-reveal",
    },
];
