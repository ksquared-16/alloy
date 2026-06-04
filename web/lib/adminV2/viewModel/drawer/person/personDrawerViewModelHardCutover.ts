import {
    DrawerViewModelHardCutoverError,
} from "@/lib/adminV2/viewModel/drawer/drawerViewModelHardCutover";
import {
    drawerViewModelCutoverFlagSnapshot,
    safeLogDrawerViewModelCutover,
} from "@/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelCutover";
import type { LoadPersonDrawerViaViewModelResult } from "@/lib/adminV2/viewModel/drawer/person/loadPersonDrawerViaViewModel";

export class PersonDrawerViewModelHardCutoverError extends DrawerViewModelHardCutoverError {
    constructor(message: string, code: string, skipReason: string | null = null) {
        super("person", message, code, skipReason);
        this.name = "PersonDrawerViewModelHardCutoverError";
    }
}

export function personDrawerViewModelHardCutoverFailureMessage(
    result: Extract<LoadPersonDrawerViaViewModelResult, { ok: false }>
): string {
    if (result.reason === "skipped") {
        if (result.skip_reason === "person_not_found") return "Person not found.";
        if (result.skip_reason === "composed_not_ready") {
            return "Person drawer View Model did not meet first-paint readiness requirements.";
        }
        return "This person drawer is not eligible for View Model cutover.";
    }
    if (result.reason === "composed_not_ready") {
        return "Person drawer View Model did not meet first-paint readiness requirements.";
    }
    if (result.reason === "fetch_failed") return "Could not load the person drawer View Model.";
    return "Person drawer View Model cutover failed.";
}

export function throwPersonDrawerViewModelHardCutoverFailure(
    personId: string,
    result: Extract<LoadPersonDrawerViaViewModelResult, { ok: false }>
): never {
    const code =
        result.reason === "skipped" && result.skip_reason ?
            `${result.reason}:${result.skip_reason}`
        :   result.reason;
    safeLogDrawerViewModelCutover("hard_cutover_failure", {
        entity_type: "person",
        entity_id: personId,
        person_id: personId,
        ...drawerViewModelCutoverFlagSnapshot("person"),
        drawer_vm_open_committed: false,
        drawer_vm_fallback_reason: code,
        open_path: null,
    });
    throw new PersonDrawerViewModelHardCutoverError(
        personDrawerViewModelHardCutoverFailureMessage(result),
        code,
        result.reason === "skipped" ? (result.skip_reason ?? null) : null
    );
}
