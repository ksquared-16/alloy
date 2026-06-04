import {
    DrawerViewModelHardCutoverError,
} from "@/lib/adminV2/viewModel/drawer/drawerViewModelHardCutover";
import {
    drawerViewModelCutoverFlagSnapshot,
    safeLogDrawerViewModelCutover,
} from "@/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelCutover";
import type { LoadChildDrawerViaViewModelResult } from "@/lib/adminV2/viewModel/drawer/child/loadChildDrawerViaViewModel";

export class ChildDrawerViewModelHardCutoverError extends DrawerViewModelHardCutoverError {
    constructor(message: string, code: string, skipReason: string | null = null) {
        super("child", message, code, skipReason);
        this.name = "ChildDrawerViewModelHardCutoverError";
    }
}

export function childDrawerViewModelHardCutoverFailureMessage(
    result: Extract<LoadChildDrawerViaViewModelResult, { ok: false }>
): string {
    if (result.reason === "skipped") {
        if (result.skip_reason === "person_not_found") return "Child record not found.";
        if (result.skip_reason === "composed_not_ready") {
            return "Child drawer View Model did not meet first-paint readiness requirements.";
        }
        return "This child drawer is not eligible for View Model cutover.";
    }
    if (result.reason === "composed_not_ready") {
        return "Child drawer View Model did not meet first-paint readiness requirements.";
    }
    if (result.reason === "fetch_failed") return "Could not load the child drawer View Model.";
    return "Child drawer View Model cutover failed.";
}

export function throwChildDrawerViewModelHardCutoverFailure(
    personId: string,
    result: Extract<LoadChildDrawerViaViewModelResult, { ok: false }>
): never {
    const code =
        result.reason === "skipped" && result.skip_reason ?
            `${result.reason}:${result.skip_reason}`
        :   result.reason;
    safeLogDrawerViewModelCutover("hard_cutover_failure", {
        entity_type: "child",
        entity_id: personId,
        person_id: personId,
        ...drawerViewModelCutoverFlagSnapshot("child"),
        drawer_vm_open_committed: false,
        drawer_vm_fallback_reason: code,
        open_path: null,
    });
    throw new ChildDrawerViewModelHardCutoverError(
        childDrawerViewModelHardCutoverFailureMessage(result),
        code,
        result.reason === "skipped" ? (result.skip_reason ?? null) : null
    );
}
