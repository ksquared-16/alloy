import { afterEach, describe, expect, it, vi } from "vitest";

import { adminV2DrawerViewModelCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/drawerViewModelCutoverGate";

describe("adminV2DrawerViewModelCutoverEnabled", () => {
    const prev = process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM;

    afterEach(() => {
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM = prev;
    });

    it("defaults off", () => {
        delete process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM;
        expect(adminV2DrawerViewModelCutoverEnabled()).toBe(false);
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM = "0";
        expect(adminV2DrawerViewModelCutoverEnabled()).toBe(false);
    });

    it("enables on true/1", () => {
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM = "true";
        expect(adminV2DrawerViewModelCutoverEnabled()).toBe(true);
        process.env.NEXT_PUBLIC_ADMINV2_DRAWER_VM = "1";
        expect(adminV2DrawerViewModelCutoverEnabled()).toBe(true);
    });
});
