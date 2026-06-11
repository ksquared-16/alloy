import type { OpportunityDrawerOpenPreload } from "@/lib/admin/opportunityDrawerOpenCoordinator";
import { opportunityDrawerComposedAboveFoldReady } from "@/lib/admin/drawer/drawerAboveFoldCoordinatedReveal";
import { opportunityDrawerPrimaryContractReady } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import { isOpportunityDrawerViewModelPreload } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerOpenPreloadFromViewModel";

export function diagnoseOpportunityDrawerComposedRevealReady(
    preload: OpportunityDrawerOpenPreload
): string[] {
    const missing: string[] = [];
    const id = preload.opportunityId?.trim() ?? "";
    if (!id) missing.push("opportunity_id");
    if (!opportunityDrawerPrimaryContractReady(preload.primaryEntity, id)) {
        missing.push("primary_contract");
    }
    if (preload.headerActions == null || typeof preload.headerActions !== "object") {
        missing.push("header_actions");
    }
    if (preload.bootstrap?.entity == null) missing.push("bootstrap_entity");
    const paintRecord = (preload.fullEntity ?? preload.primaryEntity) as Record<string, unknown>;
    if (
        !opportunityDrawerComposedAboveFoldReady({
            primaryEntity: paintRecord,
            opportunityId: id,
            inquiryChildrenSectionVisible: true,
        })
    ) {
        if (!("_inquiry_children" in paintRecord)) {
            missing.push("inquiry_children_key");
        } else if (!Array.isArray(paintRecord._inquiry_children)) {
            missing.push("inquiry_children_array");
        } else {
            missing.push("inquiry_children_hydrated_or_identity");
        }
    }
    return missing;
}

/** VM first-paint is authoritative — legacy composed gate must not block settled VM opens. */
export function opportunityDrawerVmPreloadRevealReady(preload: OpportunityDrawerOpenPreload): boolean {
    if (!isOpportunityDrawerViewModelPreload(preload)) return false;
    const vm: OpportunityDrawerViewModel = preload.viewModel;
    if (!vm.first_paint?.settled || !vm.structureSettled) return false;
    if (!preload.headerActions || preload.bootstrap?.entity == null) return false;
    return opportunityDrawerPrimaryContractReady(preload.primaryEntity, preload.opportunityId);
}
