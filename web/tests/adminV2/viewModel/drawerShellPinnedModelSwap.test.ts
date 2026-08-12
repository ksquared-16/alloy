import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/adminV2/viewModel/drawer/person/personDrawerHardCutoverGate", () => ({
    personDrawerHardCutoverEnabled: () => true,
}));
vi.mock("@/lib/adminV2/viewModel/drawer/child/childDrawerHardCutoverGate", () => ({
    childDrawerHardCutoverEnabled: () => true,
}));
vi.mock("@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerHardCutoverGate", () => ({
    opportunityDrawerHardCutoverEnabled: () => true,
}));

import {
    buildPrepareParamsFromOpenDrawer,
    isShellPinnedModelSwapOpenSource,
    isVmBackedDrawerEntityType,
    peekDrawerViewModelPreloadSync,
    resolveModelSwapOpportunityContext,
} from "@/lib/adminV2/viewModel/drawer/drawerShellPinnedModelSwap";
import { clearDrawerViewModelSessionCacheForTests, putDrawerViewModelCacheEntry } from "@/lib/adminV2/viewModel/drawer/drawerViewModelSessionCache";

describe("drawerShellPinnedModelSwap", () => {
    it("recognizes VM-backed entity types and related-record open sources", () => {
        expect(isVmBackedDrawerEntityType("opportunities")).toBe(true);
        expect(isVmBackedDrawerEntityType("persons")).toBe(true);
        expect(isVmBackedDrawerEntityType("jobs")).toBe(false);
        expect(isShellPinnedModelSwapOpenSource("opportunity_primary_contact")).toBe(true);
        expect(isShellPinnedModelSwapOpenSource("drawer_model_swap")).toBe(true);
        expect(isShellPinnedModelSwapOpenSource("global_search")).toBe(false);
    });

    it("derives VM cache context from opportunity workspace when explicit context omitted", () => {
        const params = buildPrepareParamsFromOpenDrawer({
            type: "opportunities",
            id: "opp-1",
            opportunityWorkspaceContext: { department_id: "dept-1", work_unit_id: "wu-1" },
        });
        expect(params.context).toEqual({ departmentId: "dept-1", workUnitId: "wu-1" });
    });

    it("peeks VM preload synchronously from session cache", () => {
        clearDrawerViewModelSessionCacheForTests();
        putDrawerViewModelCacheEntry(
            {
                entityType: "persons",
                entityId: "person-1",
                surface: "person:parent",
                preload: {
                    personId: "person-1",
                    openPath: "view_model",
                    primaryEntity: { id: "person-1", first_name: "Ada" },
                    first_paint_settled: true,
                },
                generation: "g1",
                cachedAt: Date.now(),
            },
            { departmentId: "dept-1", workUnitId: "wu-1" }
        );

        const hit = peekDrawerViewModelPreloadSync({
            entityType: "persons",
            entityId: "person-1",
            context: { departmentId: "dept-1", workUnitId: "wu-1" },
            openSource: "opportunity_primary_contact",
        });
        expect(hit?.entityType).toBe("persons");
        expect(hit?.entityId).toBe("person-1");
        expect((hit?.preload as { primaryEntity?: { first_name?: string } }).primaryEntity?.first_name).toBe("Ada");
    });

    it("preserves opportunity workspace context when opening a person drawer", () => {
        const resolved = resolveModelSwapOpportunityContext(
            { type: "persons", id: "person-1", source: "opportunity_primary_contact" },
            {
                opportunityWorkspaceContext: { work_unit_id: "wu-1", department_id: "dept-1" },
            }
        );
        expect(resolved.opportunityWorkspaceContext?.work_unit_id).toBe("wu-1");
    });

    it("preserves opportunity workspace context on swap-back when params omit it", () => {
        const resolved = resolveModelSwapOpportunityContext(
            { type: "opportunities", id: "opp-1" },
            {
                opportunityWorkspaceContext: { work_unit_id: "wu-1", department_id: "dept-1" },
                opportunityQueueNavigator: {
                    work_unit_id: "wu-1",
                    department_id: "dept-1",
                    queue_key: "all",
                    selection: { workUnitId: "wu-1", queueKey: "all", source: "default" },
                    records: [{ id: "opp-1" }],
                    loaded_record_ids_in_order: ["opp-1"],
                    generation: 1,
                    drawer_nav_generation: 1,
                },
            }
        );
        expect(resolved.opportunityWorkspaceContext?.work_unit_id).toBe("wu-1");
        expect(resolved.opportunityQueueNavigator?.records?.[0]?.id).toBe("opp-1");
    });
});

describe("AdminDrawerContext shell-pinned swap wiring", () => {
    it("exports drawer runtime phase machine and sync cache peek path", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const ctx = readFileSync(join(webRoot, "contexts/AdminDrawerContext.tsx"), "utf8");
        expect(ctx).toContain("drawerRuntimePhase");
        expect(ctx).toContain("completeDrawerRuntimeTransition");
        expect(ctx).toContain("peekDrawerViewModelPreloadSync");
        expect(ctx).toContain("drawer_vm_model_swap_apply");
        expect(ctx).toContain("commitDrawerModelSwap");
    });

});
