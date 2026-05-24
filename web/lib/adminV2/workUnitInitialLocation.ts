import type { WorkUnitBootstrapOwnership } from "@/lib/adminV2/workUnitBootstrapClientSession";
import {
    readWorkUnitQueueLocationParams,
    workUnitBootstrapOwnershipFromSelection,
    workUnitQueueSelectionFromLocation,
    type WorkUnitQueueLocationParams,
} from "@/lib/adminV2/workUnitQueueSelection";

/**
 * One-shot read of work-unit URL query on mount. Lane queue state must not re-read the URL after mount.
 */
export type WorkUnitInitialLocationParams = WorkUnitQueueLocationParams;

export function readWorkUnitInitialLocationParams(): WorkUnitInitialLocationParams {
    return readWorkUnitQueueLocationParams();
}

/** @deprecated Prefer {@link workUnitBootstrapOwnershipFromSelection} */
export function workUnitBootstrapOwnershipFromLocation(
    departmentId: string,
    workUnitId: string,
    selectedSiteId: string | null,
    loc: WorkUnitInitialLocationParams
): WorkUnitBootstrapOwnership {
    const selection = workUnitQueueSelectionFromLocation(workUnitId, loc);
    return workUnitBootstrapOwnershipFromSelection(departmentId, selectedSiteId, selection);
}

export {
    readWorkUnitQueueLocationParams,
    workUnitQueueSelectionFromLocation,
    workUnitBootstrapOwnershipFromSelection,
} from "@/lib/adminV2/workUnitQueueSelection";
