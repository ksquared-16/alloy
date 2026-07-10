import { describe, expect, it, vi, beforeEach } from "vitest";

import {
    adminV2ChildDrawerVmCutoverEnabled,
    adminV2OpportunityDrawerVmCutoverEnabled,
    adminV2PersonDrawerVmCutoverEnabled,
} from "@/lib/adminV2/viewModel/drawer/drawerViewModelFeatureGates";
import { isDrawerViewModelPreload } from "@/lib/adminV2/viewModel/drawer/drawerViewModelPreloadTypes";
import { drawerFirstPaintDependenciesSettled } from "@/lib/adminV2/viewModel/drawer/drawerFirstPaint";
import { DrawerViewModelHardCutoverError } from "@/lib/adminV2/viewModel/drawer/drawerViewModelHardCutover";

describe("drawerViewModelFeatureGates", () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
    });

    it("defaults opportunity, person, and child VM on", () => {
        expect(adminV2OpportunityDrawerVmCutoverEnabled()).toBe(true);
        expect(adminV2PersonDrawerVmCutoverEnabled()).toBe(true);
        expect(adminV2ChildDrawerVmCutoverEnabled()).toBe(true);
    });

    it("kill switch env no longer disables VM cutover", () => {
        vi.stubEnv("NEXT_PUBLIC_ADMINV2_PERSON_DRAWER_VM_KILL_SWITCH", "1");
        expect(adminV2PersonDrawerVmCutoverEnabled()).toBe(true);
        expect(adminV2OpportunityDrawerVmCutoverEnabled()).toBe(true);
        expect(adminV2ChildDrawerVmCutoverEnabled()).toBe(true);
    });

    it("opportunity kill switch env no longer disables VM cutover", () => {
        vi.stubEnv("NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH", "1");
        expect(adminV2OpportunityDrawerVmCutoverEnabled()).toBe(true);
        expect(adminV2PersonDrawerVmCutoverEnabled()).toBe(true);
    });
});

describe("drawerViewModelPreloadTypes", () => {
    it("detects view_model preload", () => {
        expect(
            isDrawerViewModelPreload({
                openPath: "view_model",
                viewModel: { id: "x" },
            } as Parameters<typeof isDrawerViewModelPreload>[0])
        ).toBe(true);
        expect(isDrawerViewModelPreload({ openPath: "legacy" } as Parameters<typeof isDrawerViewModelPreload>[0])).toBe(false);
    });
});

describe("drawerFirstPaintDependenciesSettled", () => {
    it("requires first_paint_required deps ready or empty", () => {
        expect(
            drawerFirstPaintDependenciesSettled([
                { key: "a", disposition: "first_paint_required", status: "ready", satisfied_by: "server_fetch" },
                { key: "b", disposition: "first_paint_required", status: "empty", satisfied_by: "server_fetch" },
            ])
        ).toBe(true);
        expect(
            drawerFirstPaintDependenciesSettled([
                { key: "a", disposition: "first_paint_required", status: "pending", satisfied_by: "pending" },
            ])
        ).toBe(false);
    });
});

describe("DrawerViewModelHardCutoverError", () => {
    it("carries entity type and code", () => {
        const err = new DrawerViewModelHardCutoverError("person", "msg", "fetch_failed", null);
        expect(err.entityType).toBe("person");
        expect(err.code).toBe("fetch_failed");
    });
});
