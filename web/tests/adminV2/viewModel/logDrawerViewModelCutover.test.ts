import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    drawerViewModelCutoverFlagSnapshot,
    logDrawerViewModelCutover,
    safeLogDrawerViewModelCutover,
} from "@/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelCutover";
import { logDrawerViewModelRuntimeFlagsServerSummary } from "@/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelRuntimeFlagsServer";

describe("drawerViewModelCutoverFlagSnapshot", () => {
    const prev = process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM;

    afterEach(() => {
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM = prev;
        vi.unstubAllEnvs();
    });

    it("reports enabled and raw env value", () => {
        vi.stubEnv("NEXT_PUBLIC_ADMINV2_DRAWER_VM", "true");
        expect(drawerViewModelCutoverFlagSnapshot()).toEqual({
            drawer_vm_cutover_flag_enabled: true,
            drawer_vm_cutover_flag_value: "true",
        });
    });
});

describe("logDrawerViewModelCutover", () => {
    beforeEach(() => {
        vi.stubGlobal("window", {} as Window & typeof globalThis);
        vi.spyOn(console, "info").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("logs open_committed payload", () => {
        logDrawerViewModelCutover("open_committed", {
            opportunity_id: "opp-1",
            drawer_vm_cutover_flag_enabled: true,
            drawer_vm_cutover_flag_value: "true",
            drawer_vm_open_committed: true,
            open_path: "view_model",
            pipeline_pinned: true,
        });
        expect(console.info).toHaveBeenCalledWith(
            "[drawer-vm-cutover:open_committed]",
            expect.objectContaining({ open_path: "view_model" })
        );
    });

    it("safeLog never throws", () => {
        vi.mocked(console.info).mockImplementation(() => {
            throw new Error("fail");
        });
        expect(() =>
            safeLogDrawerViewModelCutover("fallback", {
                drawer_vm_cutover_flag_enabled: false,
                drawer_vm_fallback_reason: "cutover_disabled",
            })
        ).not.toThrow();
    });
});

describe("logDrawerViewModelRuntimeFlagsServerSummary", () => {
    beforeEach(() => {
        vi.spyOn(console, "info").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("logs server runtime flags when shadow is enabled", () => {
        vi.stubEnv("NEXT_PUBLIC_ADMINV2_DRAWER_VM_SHADOW", "true");
        vi.stubEnv("NEXT_PUBLIC_ADMINV2_DRAWER_VM", "false");
        logDrawerViewModelRuntimeFlagsServerSummary();
        expect(console.info).toHaveBeenCalledWith(
            "[drawer-vm-runtime:flags]",
            expect.objectContaining({
                drawer_vm_shadow_flag_enabled: true,
                drawer_vm_cutover_flag_enabled: false,
                drawer_vm_cutover_flag_value: "false",
            })
        );
    });
});
