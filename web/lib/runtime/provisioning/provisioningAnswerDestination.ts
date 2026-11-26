/**
 * Pure map: provisioning answer → canonical {@link DestinationId} (B2 / history restoration).
 *
 * Split out from `workUnitProvisioningAnswer.ts` on purpose: that module is server-only (it reads the
 * database), while this deriver is needed on the CLIENT (the Surface Host stamps history at commit).
 * It imports the answer only as a TYPE (erased at compile), so no server code follows it into the
 * client bundle.
 *
 * The operational and empty terminals both carry the resolved `(workUnit, workView)` identity; the
 * operational terminal also pins the Record of Attention as the committed subject. The error terminal
 * resolved no destination. This lets history restoration key on the CANONICAL destination even for a
 * direct/history entry whose attention carried no producer-resolved destination — closing the last
 * `surfaceIdFor` slug fallback (the residual fracture across pill views the URL cannot express).
 */

import type { DestinationId } from "@/lib/runtime/graph/destinationId";
import type { ProvisioningAnswer } from "./workUnitProvisioningAnswer";

export function destinationIdFromAnswer(answer: ProvisioningAnswer): DestinationId | null {
    if (answer.terminal === "error") return null;

    // CONTEXTUAL — a destination the operator reached by naming a record. The host is real and the
    // subject is real; the LENS is genuinely absent and is recorded as absent. Substituting the host's
    // default view here would make Back navigation land on a cohort the operator never chose — the
    // exact defect the nullable lens exists to remove, arriving by way of history instead of entry.
    if (answer.terminal === "contextual") {
        return {
            workUnitId: answer.workUnit.id,
            workViewId: null,
            subjectId: answer.subject.id,
            focusMode: null,
        };
    }

    return {
        workUnitId: answer.workUnit.id,
        workViewId: answer.activeWorkView.id,
        subjectId: answer.terminal === "operational" ? answer.recordOfAttention.id : null,
        focusMode: null,
    };
}
