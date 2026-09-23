import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import { opportunityDrawerVmStatusLabelFromControl } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerVmStatusReconciliation";
import type { StatusControlVm } from "@/lib/adminV2/viewModel/drawer/types";

function labelFromVmStatus(status: StatusControlVm): string | null {
    if (status.renderAs === "hidden") return null;
    const label = opportunityDrawerVmStatusLabelFromControl(status).trim();
    return label || null;
}

/**
 * THE STATUS LABEL HAS ONE OWNER: the drawer VM's status control, from the authored `status_defs`.
 *
 * This used to fall back to the queue preview seed, which reads the queue row's configured `status`
 * display slot. That slot is bound per work unit and on `new-leads` resolves to the process STAGE,
 * so the fallback answered a STATUS question with a STAGE and the header asserted it as settled.
 * The owner then corrected it after the frame was complete.
 *
 * `null` now means UNKNOWN — the owner has not answered yet — and the header reserves the chip.
 * It does NOT mean "no status": a record always has one. Callers must render absence as reserved
 * geometry, never as an empty or missing chip.
 */
export function resolveOpportunityVmStatusLabel(params: {
    drawerId: string | null | undefined;
    displayVm: OpportunityDrawerViewModel | null;
    /**
     * Accepted so callers keep one call shape, and deliberately NOT read. See the note above: the
     * seed carries a different vocabulary than this label, so promoting it here is what produced
     * the post-complete correction.
     */
    queueSeedStatusLabel?: string | null;
}): string | null {
    const vm =
        params.displayVm && params.drawerId ?
            String(params.displayVm.entity.id) === String(params.drawerId) ?
                params.displayVm
            :   null
        :   null;

    // No owner yet → UNKNOWN. Never the seed.
    if (!vm) return null;
    return labelFromVmStatus(vm.header.status);
}
