import { resolvePersonDrawerHouseholdModel } from "@/lib/admin/person/resolvePersonDrawerHouseholdModel";
import type { AdminV2DrawerSectionContract } from "@/lib/adminV2/runtime/contract/drawerSectionContract";

export const PARENT_DRAWER_SECTION_REGISTRY: readonly AdminV2DrawerSectionContract[] = [
    {
        sectionKey: "parent_summary",
        surface: "parent",
        canRenderFromSeed: true,
        blocksFirstPaint: true,
        reservedLayout: { minHeightClass: "min-h-[8rem]", reserveVariant: "parent_summary" },
        hasRenderableData: (ctx) => Boolean(String(ctx.record.display_name ?? ctx.record.name ?? "").trim()),
        renderReady: (ctx) => ctx.typedSnapshot || ctx.bodyHydrated,
        fallbackMode: "reserved",
    },
    {
        sectionKey: "parent_household",
        surface: "parent",
        canRenderFromSeed: true,
        blocksFirstPaint: true,
        reservedLayout: { minHeightClass: "min-h-[11rem]", reserveVariant: "household" },
        hasRenderableData: (ctx) =>
            resolvePersonDrawerHouseholdModel(ctx.record, { viewing_person_id: ctx.drawerId }).groups.length > 0,
        renderReady: (ctx) => {
            const has =
                resolvePersonDrawerHouseholdModel(ctx.record, { viewing_person_id: ctx.drawerId }).groups.length > 0;
            return has && (ctx.typedSnapshot || ctx.bodyHydrated);
        },
        fallbackMode: "reserved",
    },
    {
        sectionKey: "parent_address",
        surface: "parent",
        canRenderFromSeed: true,
        blocksFirstPaint: true,
        reservedLayout: { minHeightClass: "min-h-[5.5rem]", reserveVariant: "address" },
        hasRenderableData: (ctx) => {
            const addr = (ctx.record.address ?? ctx.record.mailing_address) as Record<string, unknown> | null;
            return Boolean(addr && typeof addr === "object" && Object.keys(addr).length > 0);
        },
        renderReady: (ctx) => ctx.bodyHydrated,
        fallbackMode: "reserved",
    },
    {
        sectionKey: "parent_bos_panel",
        surface: "parent",
        canRenderFromSeed: true,
        blocksFirstPaint: true,
        reservedLayout: { minHeightClass: "min-h-[5rem]", reserveVariant: "bos_panel" },
        hasRenderableData: () => true,
        renderReady: (ctx) => ctx.typedSnapshot || ctx.bodyHydrated,
        fallbackMode: "reserved",
    },
];
