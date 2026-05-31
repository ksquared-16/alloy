import { personDrawerChildChromeActive } from "@/lib/admin/person/personDrawerChildChrome";
import { resolvePersonDrawerHouseholdModel } from "@/lib/admin/person/resolvePersonDrawerHouseholdModel";
import { resolvePersonDrawerChildSummaryModel } from "@/lib/admin/person/personDrawerChildSummaryModel";
import type { AdminV2DrawerSectionContract } from "@/lib/adminV2/runtime/contract/drawerSectionContract";

export const CHILD_DRAWER_SECTION_REGISTRY: readonly AdminV2DrawerSectionContract[] = [
    {
        sectionKey: "child_summary",
        surface: "child",
        canRenderFromSeed: true,
        blocksFirstPaint: true,
        reservedLayout: { minHeightClass: "min-h-[10rem]", reserveVariant: "child_summary" },
        hasRenderableData: (ctx) =>
            personDrawerChildChromeActive(ctx.record) &&
            Boolean(resolvePersonDrawerChildSummaryModel(ctx.record).display_name?.trim()),
        renderReady: (ctx) => ctx.typedSnapshot || (ctx.bodyHydrated && personDrawerChildChromeActive(ctx.record)),
        fallbackMode: "reserved",
    },
    {
        sectionKey: "child_header_chips",
        surface: "child",
        canRenderFromSeed: true,
        blocksFirstPaint: true,
        reservedLayout: { minHeightClass: "min-h-[2.5rem]", reserveVariant: "header_chips" },
        hasRenderableData: (ctx) => personDrawerChildChromeActive(ctx.record),
        renderReady: (ctx) => ctx.typedSnapshot || ctx.bodyHydrated,
        fallbackMode: "reserved",
    },
    {
        sectionKey: "child_household",
        surface: "child",
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
        sectionKey: "child_medical",
        surface: "child",
        canRenderFromSeed: true,
        blocksFirstPaint: true,
        reservedLayout: { minHeightClass: "min-h-[8rem]", reserveVariant: "medical" },
        hasRenderableData: (ctx) => {
            const med = ctx.record.medical ?? ctx.record.health;
            return med != null && typeof med === "object";
        },
        renderReady: (ctx) => ctx.typedSnapshot || ctx.bodyHydrated,
        fallbackMode: "reserved",
    },
    {
        sectionKey: "child_bos_panel",
        surface: "child",
        canRenderFromSeed: true,
        blocksFirstPaint: true,
        reservedLayout: { minHeightClass: "min-h-[5rem]", reserveVariant: "bos_panel" },
        hasRenderableData: (ctx) => personDrawerChildChromeActive(ctx.record),
        renderReady: (ctx) => ctx.typedSnapshot || ctx.bodyHydrated,
        fallbackMode: "reserved",
    },
];
