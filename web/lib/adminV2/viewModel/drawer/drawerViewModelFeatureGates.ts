/** Per-entity drawer VM cutover — person/child env-gated; opportunity default-on in code. */

import { opportunityDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerHardCutoverGate";

function envFlagTrue(name: string): boolean {
    if (typeof process === "undefined") return false;
    const v = process.env[name]?.trim().toLowerCase();
    return v === "1" || v === "true";
}

export function adminV2OpportunityDrawerVmCutoverEnabled(): boolean {
    return opportunityDrawerHardCutoverEnabled();
}

export function adminV2PersonDrawerVmCutoverEnabled(): boolean {
    return envFlagTrue("NEXT_PUBLIC_ADMINV2_PERSON_DRAWER_VM");
}

export function adminV2ChildDrawerVmCutoverEnabled(): boolean {
    return envFlagTrue("NEXT_PUBLIC_ADMINV2_CHILD_DRAWER_VM");
}

/** @deprecated Use adminV2OpportunityDrawerVmCutoverEnabled — kept for existing imports. */
export function adminV2DrawerViewModelCutoverEnabled(): boolean {
    return adminV2OpportunityDrawerVmCutoverEnabled();
}
