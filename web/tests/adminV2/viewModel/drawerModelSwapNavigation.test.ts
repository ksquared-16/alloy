import { describe, expect, it } from "vitest";

import {
    buildDrawerViewModelCacheKey,
    clearDrawerViewModelSessionCacheForTests,
    peekDrawerViewModelCacheEntry,
    putDrawerViewModelCacheEntry,
    resolvePersonDrawerViewModelSurface,
} from "@/lib/adminV2/viewModel/drawer/drawerViewModelSessionCache";
import { isDrawerModelSwapEligible } from "@/lib/adminV2/viewModel/drawer/drawerModelSwapNavigation";

describe("drawerViewModelSessionCache", () => {
    it("keys cache entries by entity, surface, and workspace context", () => {
        clearDrawerViewModelSessionCacheForTests();
        putDrawerViewModelCacheEntry(
            {
                entityType: "persons",
                entityId: "p-1",
                surface: "person:parent",
                preload: {
                    personId: "p-1",
                    openPath: "view_model",
                    primaryEntity: { id: "p-1" },
                    first_paint_settled: true,
                },
                generation: "gen-1",
                cachedAt: Date.now(),
            },
            { orgId: "org-1", departmentId: "dept-1", workUnitId: "wu-1" }
        );

        const hit = peekDrawerViewModelCacheEntry({
            entityType: "persons",
            entityId: "p-1",
            surface: "person:parent",
            context: { orgId: "org-1", departmentId: "dept-1", workUnitId: "wu-1" },
        });
        expect(hit?.entityId).toBe("p-1");

        const miss = peekDrawerViewModelCacheEntry({
            entityType: "persons",
            entityId: "p-1",
            surface: "child",
            context: { orgId: "org-1", departmentId: "dept-1", workUnitId: "wu-1" },
        });
        expect(miss).toBeNull();
    });

    it("resolves child vs parent person cache surfaces", () => {
        expect(
            resolvePersonDrawerViewModelSurface({
                openSource: "opportunity_inquiry_child",
            })
        ).toBe("child");
        expect(
            resolvePersonDrawerViewModelSurface({
                openSource: "queue_row_person",
            })
        ).toBe("person:parent");
    });
});

describe("drawerModelSwapNavigation", () => {
    it("allows model swap between opportunity and person drawers", () => {
        expect(isDrawerModelSwapEligible("opportunities", "opp-1", "persons", "p-1")).toBe(true);
        expect(isDrawerModelSwapEligible("persons", "p-1", "opportunities", "opp-2")).toBe(true);
        expect(isDrawerModelSwapEligible("opportunities", "opp-1", "opportunities", "opp-1")).toBe(false);
        expect(isDrawerModelSwapEligible(null, null, "persons", "p-1")).toBe(false);
    });
});

describe("AdminDrawerContext model-swap wiring", () => {
    it("exports model-swap open helpers", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const ctx = readFileSync(join(webRoot, "contexts/AdminDrawerContext.tsx"), "utf8");
        expect(ctx).toContain("openDrawerModelSwap");
        expect(ctx).toContain("prepareDrawerViewModelForOpen");
        expect(ctx).toContain("consumePersonDrawerPreload");
        expect(ctx).toContain("isDrawerModelSwapEligible");
    });
});
