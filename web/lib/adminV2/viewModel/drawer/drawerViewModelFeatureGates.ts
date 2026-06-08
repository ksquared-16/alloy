/** Per-entity drawer VM cutover — opportunity/person/child default-on; kill switches opt out. */

import { childDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/child/childDrawerHardCutoverGate";
import { opportunityDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerHardCutoverGate";
import { personDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/person/personDrawerHardCutoverGate";

export function adminV2OpportunityDrawerVmCutoverEnabled(): boolean {
    return opportunityDrawerHardCutoverEnabled();
}

export function adminV2PersonDrawerVmCutoverEnabled(): boolean {
    return personDrawerHardCutoverEnabled();
}

export function adminV2ChildDrawerVmCutoverEnabled(): boolean {
    return childDrawerHardCutoverEnabled();
}

/** @deprecated Use adminV2OpportunityDrawerVmCutoverEnabled — kept for existing imports. */
export function adminV2DrawerViewModelCutoverEnabled(): boolean {
    return adminV2OpportunityDrawerVmCutoverEnabled();
}
