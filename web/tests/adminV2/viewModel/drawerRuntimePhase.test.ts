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

});
