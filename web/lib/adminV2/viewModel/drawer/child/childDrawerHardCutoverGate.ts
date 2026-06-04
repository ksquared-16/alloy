import { adminV2ChildDrawerVmCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/drawerViewModelFeatureGates";

export function childDrawerHardCutoverEnabled(): boolean {
    return adminV2ChildDrawerVmCutoverEnabled();
}
