import { adminV2PersonDrawerVmCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/drawerViewModelFeatureGates";

export function personDrawerHardCutoverEnabled(): boolean {
    return adminV2PersonDrawerVmCutoverEnabled();
}
