import {
    parentDrawerAddressCoordinatedReady,
    parentDrawerEmployeeStatusCoordinatedReady,
    parentDrawerHouseholdCoordinatedReady,
    parentDrawerSummaryCoordinatedReady,
} from "@/lib/admin/drawer/drawerAboveFoldCoordinatedReveal";
import type { AdminV2DrawerSectionContract } from "@/lib/adminV2/runtime/contract/drawerSectionContract";

export const PARENT_DRAWER_SECTION_REGISTRY: readonly AdminV2DrawerSectionContract[] = [
    {
        sectionKey: "parent_summary",
        surface: "parent",
        canRenderFromSeed: false,
        blocksFirstPaint: true,
        hasRenderableData: (ctx) => parentDrawerSummaryCoordinatedReady(ctx.record),
        renderReady: (ctx) => ctx.bodyHydrated && parentDrawerSummaryCoordinatedReady(ctx.record),
        fallbackMode: "block-drawer-reveal",
    },
    {
        sectionKey: "parent_household",
        surface: "parent",
        canRenderFromSeed: false,
        blocksFirstPaint: true,
        hasRenderableData: (ctx) => parentDrawerHouseholdCoordinatedReady(ctx.record, ctx.drawerId),
        renderReady: (ctx) =>
            ctx.bodyHydrated && parentDrawerHouseholdCoordinatedReady(ctx.record, ctx.drawerId),
        fallbackMode: "block-drawer-reveal",
    },
    {
        sectionKey: "parent_address",
        surface: "parent",
        canRenderFromSeed: false,
        blocksFirstPaint: true,
        hasRenderableData: (ctx) => parentDrawerAddressCoordinatedReady(ctx.record),
        renderReady: (ctx) => ctx.bodyHydrated && parentDrawerAddressCoordinatedReady(ctx.record),
        fallbackMode: "block-drawer-reveal",
    },
    {
        sectionKey: "parent_employee_status",
        surface: "parent",
        canRenderFromSeed: false,
        blocksFirstPaint: true,
        hasRenderableData: (ctx) => parentDrawerEmployeeStatusCoordinatedReady(ctx.record),
        renderReady: (ctx) =>
            ctx.bodyHydrated && parentDrawerEmployeeStatusCoordinatedReady(ctx.record),
        fallbackMode: "block-drawer-reveal",
    },
    {
        sectionKey: "parent_bos_panel",
        surface: "parent",
        canRenderFromSeed: false,
        blocksFirstPaint: true,
        hasRenderableData: () => true,
        renderReady: (ctx) => ctx.bodyHydrated,
        fallbackMode: "block-drawer-reveal",
    },
];
