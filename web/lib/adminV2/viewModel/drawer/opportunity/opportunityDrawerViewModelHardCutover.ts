import type { LoadOpportunityDrawerViaViewModelResult } from "@/lib/adminV2/viewModel/drawer/opportunity/loadOpportunityDrawerViaViewModel";
import {
    DrawerViewModelHardCutoverError,
} from "@/lib/adminV2/viewModel/drawer/drawerViewModelHardCutover";
import {
    drawerViewModelCutoverFlagSnapshot,
    safeLogDrawerViewModelCutover,
} from "@/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelCutover";

export class OpportunityDrawerViewModelHardCutoverError extends DrawerViewModelHardCutoverError {
    constructor(message: string, code: string, skipReason: string | null = null) {
        super("opportunity", message, code, skipReason);
        this.name = "OpportunityDrawerViewModelHardCutoverError";
    }
}

export function opportunityDrawerViewModelHardCutoverFailureCode(
    result: Extract<LoadOpportunityDrawerViaViewModelResult, { ok: false }>
): string {
    if (result.reason === "skipped" && result.skip_reason) {
        return `${result.reason}:${result.skip_reason}`;
    }
    return result.reason;
}

export function opportunityDrawerViewModelHardCutoverFailureMessage(
    result: Extract<LoadOpportunityDrawerViaViewModelResult, { ok: false }>
): string {
    if (result.reason === "skipped") {
        if (result.skip_reason === "classic_layout_deferred") {
            return "This inquiry drawer uses a classic layout. View Model cutover supports workflow_v1 drawers only.";
        }
        if (result.skip_reason === "layout_unavailable") {
            return "Drawer layout is unavailable for View Model cutover.";
        }
        if (result.skip_reason === "opportunity_not_found") {
            return "Record not found.";
        }
        return "This opportunity is not eligible for View Model cutover.";
    }
    if (result.reason === "composed_not_ready") {
        return "Drawer View Model did not meet first-paint readiness requirements.";
    }
    if (result.reason === "not_structure_settled") {
        return "Drawer View Model structure did not settle.";
    }
    if (result.reason === "fetch_failed") {
        return "Could not load the opportunity drawer View Model.";
    }
    return "Drawer View Model cutover failed.";
}

export function throwOpportunityDrawerViewModelHardCutoverFailure(
    opportunityId: string,
    result: Extract<LoadOpportunityDrawerViaViewModelResult, { ok: false }>
): never {
    const code = opportunityDrawerViewModelHardCutoverFailureCode(result);
    const skipReason = result.reason === "skipped" ? (result.skip_reason ?? null) : null;
    safeLogDrawerViewModelCutover("hard_cutover_failure", {
        entity_type: "opportunity",
        entity_id: opportunityId,
        opportunity_id: opportunityId,
        ...drawerViewModelCutoverFlagSnapshot("opportunity"),
        drawer_vm_open_committed: false,
        drawer_vm_fallback_reason: code,
        open_path: null,
    });
    throw new OpportunityDrawerViewModelHardCutoverError(
        opportunityDrawerViewModelHardCutoverFailureMessage(result),
        code,
        skipReason
    );
}
