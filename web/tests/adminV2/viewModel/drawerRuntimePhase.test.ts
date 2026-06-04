import { describe, expect, it } from "vitest";

import {
    drawerRuntimePhaseForApplyingVm,
    drawerRuntimePhaseForIdle,
    drawerRuntimePhaseForOpeningCold,
    drawerRuntimePhaseForShowing,
    drawerRuntimePhaseForSwapFallbackFetch,
    drawerRuntimePhaseForSwapStart,
    INITIAL_DRAWER_RUNTIME_PHASE_STATE,
    shouldAllowColdOpenLoading,
    shouldHoldPriorDrawerContent,
    shouldRenderHeldDrawerBody,
    shouldSuppressFullDrawerLoading,
} from "@/lib/adminV2/viewModel/drawer/drawerRuntimePhase";

describe("drawerRuntimePhase helpers", () => {
    it("holds prior content only during swap_preparing and applying_vm", () => {
        expect(shouldHoldPriorDrawerContent("idle")).toBe(false);
        expect(shouldHoldPriorDrawerContent("showing")).toBe(false);
        expect(shouldHoldPriorDrawerContent("opening_cold")).toBe(false);
        expect(shouldHoldPriorDrawerContent("swap_preparing")).toBe(true);
        expect(shouldHoldPriorDrawerContent("applying_vm")).toBe(true);
        expect(shouldSuppressFullDrawerLoading("swap_preparing")).toBe(true);
    });

    it("allows cold-open loading only without visible content", () => {
        expect(
            shouldAllowColdOpenLoading({ phase: "opening_cold", hasVisibleDrawerContent: false })
        ).toBe(true);
        expect(
            shouldAllowColdOpenLoading({ phase: "opening_cold", hasVisibleDrawerContent: true })
        ).toBe(false);
        expect(
            shouldAllowColdOpenLoading({ phase: "swap_preparing", hasVisibleDrawerContent: true })
        ).toBe(false);
    });

    it("renders held body when data id mismatches during transition", () => {
        expect(
            shouldRenderHeldDrawerBody({
                phase: "swap_preparing",
                dataMatchesDrawer: false,
                hasData: true,
            })
        ).toBe(true);
        expect(
            shouldRenderHeldDrawerBody({
                phase: "showing",
                dataMatchesDrawer: false,
                hasData: true,
            })
        ).toBe(false);
    });

    it("resets swap fallback flag when returning to showing", () => {
        const preparing = drawerRuntimePhaseForSwapStart(INITIAL_DRAWER_RUNTIME_PHASE_STATE, {
            entityType: "persons",
            entityId: "p-2",
        });
        expect(preparing.phase).toBe("swap_preparing");
        expect(preparing.transitionId).toBe(1);

        const applying = drawerRuntimePhaseForApplyingVm(preparing);
        expect(applying.phase).toBe("applying_vm");
        expect(applying.swapFallbackFetch).toBe(false);

        const showing = drawerRuntimePhaseForShowing(applying);
        expect(showing.phase).toBe("showing");
        expect(showing.target).toBeNull();
        expect(showing.swapFallbackFetch).toBe(false);
        expect(showing.transitionId).toBe(1);
    });

    it("schedules swap fallback fetch while staying in swap_preparing", () => {
        const fallback = drawerRuntimePhaseForSwapFallbackFetch(
            drawerRuntimePhaseForSwapStart(INITIAL_DRAWER_RUNTIME_PHASE_STATE, {
                entityType: "opportunities",
                entityId: "opp-2",
            }),
            { entityType: "opportunities", entityId: "opp-2" }
        );
        expect(fallback.phase).toBe("swap_preparing");
        expect(fallback.swapFallbackFetch).toBe(true);
        expect(fallback.target?.entityId).toBe("opp-2");
    });

    it("drawerRuntimePhaseForSwapFallbackFetch is idempotent for the same target", () => {
        const first = drawerRuntimePhaseForSwapFallbackFetch(
            drawerRuntimePhaseForSwapStart(INITIAL_DRAWER_RUNTIME_PHASE_STATE, {
                entityType: "persons",
                entityId: "p-9",
            }),
            { entityType: "persons", entityId: "p-9" }
        );
        const second = drawerRuntimePhaseForSwapFallbackFetch(first, {
            entityType: "persons",
            entityId: "p-9",
        });
        expect(second).toBe(first);
    });

    it("drawerRuntimePhaseForApplyingVm is idempotent when already applying", () => {
        const preparing = drawerRuntimePhaseForSwapStart(INITIAL_DRAWER_RUNTIME_PHASE_STATE, {
            entityType: "persons",
            entityId: "p-3",
        });
        const applying = drawerRuntimePhaseForApplyingVm(preparing);
        const again = drawerRuntimePhaseForApplyingVm(applying);
        expect(again).toBe(applying);
    });

    it("idle clears transition state", () => {
        const idle = drawerRuntimePhaseForIdle();
        expect(idle).toEqual(INITIAL_DRAWER_RUNTIME_PHASE_STATE);
    });

    it("opening_cold does not increment transition id", () => {
        const cold = drawerRuntimePhaseForOpeningCold(
            drawerRuntimePhaseForSwapStart(INITIAL_DRAWER_RUNTIME_PHASE_STATE, {
                entityType: "persons",
                entityId: "p-1",
            }),
            { entityType: "opportunities", entityId: "opp-1" }
        );
        expect(cold.phase).toBe("opening_cold");
        expect(cold.transitionId).toBe(1);
    });
});

describe("drawer runtime phase wiring (source contracts)", () => {
    it("AdminDrawerContext uses explicit phase machine instead of sticky swap generation", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const ctx = readFileSync(join(webRoot, "contexts/AdminDrawerContext.tsx"), "utf8");
        expect(ctx).toContain("drawerRuntimePhase");
        expect(ctx).toContain("completeDrawerRuntimeTransition");
        expect(ctx).toContain("swapFallbackFetchPendingRef");
        expect(ctx).toContain("drawerRuntimePhaseForSwapStart");
        expect(ctx).not.toContain("drawerModelSwapGeneration");
        expect(ctx).toContain("drawerTransitionId: drawerRuntimePhase.transitionId");
    });

    it("Persons VM runtime places Back to Lead in header subtitle for child chrome", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const person = readFileSync(
            join(webRoot, "components/admin/vmDrawer/PersonsDrawerVmRuntime.tsx"),
            "utf8"
        );
        expect(person).toContain("resolvePersonDrawerOperatingBackLink");
        expect(person).toMatch(
            /chrome === "child"[\s\S]*data-record-drawer-back-link/
        );
        expect(person).not.toMatch(/statusBadge=\{[\s\S]*chrome === "child"/);
    });

    it("VM payload hooks schedule background related warm after apply", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const opp = readFileSync(
            join(webRoot, "lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmPayload.ts"),
            "utf8"
        );
        expect(opp).toContain("scheduleWarmRelatedDrawerTargetsAfterVmApply");
        expect(opp).toContain("generation: vm.generation");
    });

    it("VM payload hooks suppress cold shell during swap transition phases", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        for (const file of [
            "useOpportunityDrawerVmPayload.ts",
            "usePersonsDrawerVmPayload.ts",
        ]) {
            const hook = readFileSync(
                join(webRoot, "lib/adminV2/viewModel/drawer/vmRuntime", file),
                "utf8"
            );
            expect(hook).toContain("shouldShowVmDrawerColdShell");
            expect(hook).toContain("suppressFullDrawerLoading");
            expect(hook).toContain("swap_hold_current");
        }
    });

    it("Opportunity VM runtime uses progressive status without legacy header status", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const vm = readFileSync(
            join(webRoot, "components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx"),
            "utf8"
        );
        expect(vm).toContain("VmProgressiveStatusDropdown");
        expect(vm).not.toContain("opportunityInquiryWorkflowHeaderStatus");
        expect(vm).toContain("vmMatchesRender");
    });

    it("cached swap applies VM immediately via attachDrawerSwapPreload", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const ctx = readFileSync(join(webRoot, "contexts/AdminDrawerContext.tsx"), "utf8");
        expect(ctx).toMatch(/if \(syncPreload\)[\s\S]*commitDrawerModelSwap\(params, syncPreload\)/);
        expect(ctx).toMatch(/commitDrawerModelSwap[\s\S]*drawerRuntimePhaseForShowing/);
    });

    it("uncached swap schedules VM fallback fetch while holding source drawer", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const ctx = readFileSync(join(webRoot, "contexts/AdminDrawerContext.tsx"), "utf8");
        expect(ctx).toContain("swapFallbackFetchPendingRef");
        expect(ctx).toContain("drawerRuntimePhaseForSwapFallbackFetch");
        expect(ctx).toContain("drawerVmRender");
        expect(ctx).toContain("prepareDrawerViewModelDeduped(prepareParams)");
        expect(ctx).toContain("lastAttachedSwapPreloadKeyRef");
        expect(ctx).toContain("swapFallbackFetchInFlightKeyRef");
    });

    it("VM runtimes do not show loading copy during cross-drawer transition hold", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const opp = readFileSync(
            join(webRoot, "components/admin/vmDrawer/OpportunityDrawerVmRuntime.tsx"),
            "utf8"
        );
        const person = readFileSync(
            join(webRoot, "components/admin/vmDrawer/PersonsDrawerVmRuntime.tsx"),
            "utf8"
        );
        expect(opp).toContain("showColdShell");
        expect(person).toContain("showColdShell");
        expect(opp).not.toContain("Preparing parent profile");
        expect(person).not.toMatch(/Preparing child profile/);
    });

    it("cold open uses opening_cold phase only when no drawer is open", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const ctx = readFileSync(join(webRoot, "contexts/AdminDrawerContext.tsx"), "utf8");
        expect(ctx).toMatch(/coldVmOpen[\s\S]*drawerRuntimePhaseForOpeningCold/);
        expect(ctx).toMatch(/!\s*drawer\.type\s*\|\|\s*!\s*drawer\.id/);
    });

    it("OpportunityOperationalCompactStrip seeds tasks from VM on first paint commit", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const strip = readFileSync(
            join(webRoot, "components/admin/opportunity/OpportunityOperationalCompactStrip.tsx"),
            "utf8"
        );
        expect(strip).toContain("vmFirstPaintCommit");
        expect(strip).toContain("rightColumnModel?.tasks.open_tasks");
    });
});
