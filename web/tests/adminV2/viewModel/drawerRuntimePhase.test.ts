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

        const showing = drawerRuntimePhaseForShowing(applying);
        expect(showing.phase).toBe("showing");
        expect(showing.target).toBeNull();
        expect(showing.swapFallbackFetch).toBe(false);
        expect(showing.transitionId).toBe(1);
    });

    it("schedules swap fallback fetch without staying in swap_preparing", () => {
        const fallback = drawerRuntimePhaseForSwapFallbackFetch(
            drawerRuntimePhaseForSwapStart(INITIAL_DRAWER_RUNTIME_PHASE_STATE, {
                entityType: "opportunities",
                entityId: "opp-2",
            }),
            { entityType: "opportunities", entityId: "opp-2" }
        );
        expect(fallback.phase).toBe("showing");
        expect(fallback.swapFallbackFetch).toBe(true);
        expect(fallback.target?.entityId).toBe("opp-2");
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

    it("AdminEntityDrawer gates loading and body from runtime phase", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const drawer = readFileSync(join(webRoot, "components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(drawer).toContain("drawerRuntimePhase");
        expect(drawer).toContain("suppressFullDrawerLoading");
        expect(drawer).toContain("holdPriorDrawerContent");
        expect(drawer).toContain("drawerBodyDataMatches");
        expect(drawer).toContain("consumeDrawerSwapFallbackFetch");
        expect(drawer).not.toContain("drawerShellPinnedVmSwapActive");
        expect(drawer).not.toContain("drawerModelSwapGeneration");
        expect(drawer).toMatch(/suppressFullDrawerLoading[\s\S]*return false/);
    });

    it("opportunity status does not unmount with return null after VM settle", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const drawer = readFileSync(join(webRoot, "components/admin/AdminEntityDrawer.tsx"), "utf8");
        const block = drawer.slice(
            drawer.indexOf("opportunityInquiryWorkflowHeaderStatus"),
            drawer.indexOf("opportunityInquiryWorkflowHeaderStatus") + 4500
        );
        expect(block).toContain("blockStatusSkeletonAfterVmSettle");
        expect(block).not.toMatch(
            /opportunityDrawerVmFirstPaintSettled[\s\S]{0,120}return null/
        );
        expect(block).toContain("Updating…");
    });

    it("swap fallback fetch is consumed without early return during hold", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const drawer = readFileSync(join(webRoot, "components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(drawer).toMatch(/consumeDrawerSwapFallbackFetch\(\)[\s\S]*setLoading\(true\)/);
        expect(drawer).toMatch(/holdPriorDrawerContent[\s\S]*return;/);
    });

    it("cached swap applies VM immediately via attachDrawerSwapPreload", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const ctx = readFileSync(join(webRoot, "contexts/AdminDrawerContext.tsx"), "utf8");
        expect(ctx).toMatch(/if \(syncPreload\)[\s\S]*attachDrawerSwapPreload\(params, syncPreload\)/);
        expect(ctx).toMatch(/if \(preload\)[\s\S]*drawerRuntimePhaseForApplyingVm/);
    });

    it("uncached swap schedules entity fallback fetch without staying in swap_preparing", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const ctx = readFileSync(join(webRoot, "contexts/AdminDrawerContext.tsx"), "utf8");
        expect(ctx).toContain("swapFallbackFetchPendingRef");
        expect(ctx).toContain("drawerRuntimePhaseForSwapFallbackFetch");
        const drawer = readFileSync(join(webRoot, "components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(drawer).toContain("drawerBodyDataMatches");
    });

    it("loading visuals are gated off during swap transition phases", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const drawer = readFileSync(join(webRoot, "components/admin/AdminEntityDrawer.tsx"), "utf8");
        expect(drawer).toMatch(/opportunityDrawerPrimaryLoadingVisible[\s\S]*!suppressFullDrawerLoading/);
        expect(drawer).toMatch(/opportunityDrawerPreOverviewShell[\s\S]*!suppressFullDrawerLoading/);
        expect(drawer).toMatch(/personDrawerShowLoadingShell[\s\S]*!suppressFullDrawerLoading/);
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
