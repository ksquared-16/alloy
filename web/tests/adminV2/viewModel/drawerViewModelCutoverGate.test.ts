import { afterEach, describe, expect, it, vi } from "vitest";

import { adminV2DrawerViewModelCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/drawerViewModelCutoverGate";
import { opportunityDrawerVmKillSwitchActive } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerHardCutoverGate";

describe("adminV2DrawerViewModelCutoverEnabled (opportunity)", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("is permanently enabled after legacy drawer elimination", () => {
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM_KILL_SWITCH = "1";
        expect(opportunityDrawerVmKillSwitchActive()).toBe(false);
        expect(adminV2DrawerViewModelCutoverEnabled()).toBe(true);
    });
});
