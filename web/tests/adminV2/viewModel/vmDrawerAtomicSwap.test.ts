import { describe, expect, it } from "vitest";

import {
    canCommitDrawerVmSwap,
    resolveDrawerVmRenderDrawer,
} from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerAtomicSwap";
import {
    drawerRuntimePhaseForSwapStart,
    INITIAL_DRAWER_RUNTIME_PHASE_STATE,
} from "@/lib/adminV2/viewModel/drawer/drawerRuntimePhase";

describe("vmDrawerAtomicSwap", () => {
    it("keeps visible drawer unchanged during swap_preparing", () => {
        const source = { type: "opportunities" as const, id: "opp-1" };
        const phase = drawerRuntimePhaseForSwapStart(INITIAL_DRAWER_RUNTIME_PHASE_STATE, {
            entityType: "persons",
            entityId: "person-2",
        });
        const render = resolveDrawerVmRenderDrawer(source, phase);
        expect(render).toBe(source);
        expect(render.type).toBe("opportunities");
        expect(render.id).toBe("opp-1");
    });

    it("canCommitDrawerVmSwap requires preload while still in swap_preparing", () => {
        const phase = drawerRuntimePhaseForSwapStart(INITIAL_DRAWER_RUNTIME_PHASE_STATE, {
            entityType: "persons",
            entityId: "person-2",
        });
        expect(
            canCommitDrawerVmSwap({
                phase,
                pendingTarget: { entityType: "persons", entityId: "person-2" },
                hasPreload: false,
            })
        ).toBe(false);
        expect(
            canCommitDrawerVmSwap({
                phase,
                pendingTarget: { entityType: "persons", entityId: "person-2" },
                hasPreload: true,
            })
        ).toBe(true);
    });
});

describe("atomic swap wiring", () => {
    it("defers drawer navigation until commitDrawerModelSwap", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const ctx = readFileSync(join(webRoot, "contexts/AdminDrawerContext.tsx"), "utf8");
        expect(ctx).toContain("commitDrawerModelSwap");
        expect(ctx).toContain("pendingModelSwapParamsRef");
        expect(ctx).toContain("skipStackPush: true");
        expect(ctx).toMatch(/pushDrawerToStack\(drawer\)[\s\S]*drawerRuntimePhaseForSwapStart/);
        expect(ctx).toContain("skipStackPush: true");
        expect(ctx).toMatch(/commitDrawerModelSwap\(swapParams, syncPreload\)/);
        expect(ctx).toContain("waitForDrawerSwapLayoutBodyWarm");
        expect(ctx).toContain("drawerRuntimePhaseForApplyingVm");
        expect(ctx).toContain("finishDrawerModelSwapCommit");
    });

    it("goBack restores VM preload from session cache before navigation", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../");
        const ctx = readFileSync(join(webRoot, "contexts/AdminDrawerContext.tsx"), "utf8");
        expect(ctx).toContain("restoreVmPreloadFromStackItem");
        expect(ctx).toContain("peekDrawerViewModelPreloadSync");
    });

});
