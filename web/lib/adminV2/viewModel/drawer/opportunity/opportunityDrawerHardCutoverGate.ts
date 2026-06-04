import { adminV2DrawerViewModelCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/drawerViewModelCutoverGate";

/** True when hard VM cutover is active — legacy drawer first-paint paths must not run. */
export function opportunityDrawerHardCutoverEnabled(): boolean {
    return adminV2DrawerViewModelCutoverEnabled();
}
