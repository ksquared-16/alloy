import { afterEach, describe, expect, it, vi } from "vitest";

import { adminV2DrawerViewModelCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/drawerViewModelCutoverGate";
import { opportunityDrawerVmKillSwitchActive } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerHardCutoverGate";

describe("adminV2DrawerViewModelCutoverEnabled (opportunity)", () => {
    const prevKill = process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH;
    const prevLegacyVm = process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM;

    afterEach(() => {
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH = prevKill;
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM = prevLegacyVm;
        vi.unstubAllEnvs();
    });

    it("defaults on without NEXT_PUBLIC_ADMINV2_DRAWER_VM", () => {
        delete process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM;
        delete process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH;
        expect(adminV2DrawerViewModelCutoverEnabled()).toBe(true);
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM = "0";
        expect(adminV2DrawerViewModelCutoverEnabled()).toBe(true);
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM = "false";
        expect(adminV2DrawerViewModelCutoverEnabled()).toBe(true);
    });

    it("disables on kill switch", () => {
        delete process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM;
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH = "1";
        expect(opportunityDrawerVmKillSwitchActive()).toBe(true);
        expect(adminV2DrawerViewModelCutoverEnabled()).toBe(false);
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH = "true";
        expect(adminV2DrawerViewModelCutoverEnabled()).toBe(false);
    });
});
