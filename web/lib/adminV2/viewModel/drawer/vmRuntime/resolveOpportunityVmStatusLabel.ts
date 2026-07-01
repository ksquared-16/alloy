import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import { opportunityDrawerVmStatusLabelFromControl } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerVmStatusReconciliation";
import type { StatusControlVm } from "@/lib/adminV2/viewModel/drawer/types";

function labelFromVmStatus(status: StatusControlVm): string | null {
    if (status.renderAs === "hidden") return null;
    const label = opportunityDrawerVmStatusLabelFromControl(status).trim();
    return label || null;
}

/**
 * Single stable status label for Opportunity VM header — VM payload when ids match, else queue seed.
 */
export function resolveOpportunityVmStatusLabel(params: {
    drawerId: string | null | undefined;
    displayVm: OpportunityDrawerViewModel | null;
    queueSeedStatusLabel?: string | null;
}): string | null {
    const seed = params.queueSeedStatusLabel?.trim() || null;
    const vm =
        params.displayVm && params.drawerId ?
            String(params.displayVm.entity.id) === String(params.drawerId) ?
                params.displayVm
            :   null
        :   null;

    if (vm) {
        return labelFromVmStatus(vm.header.status) ?? seed;
    }
    return seed;
}
