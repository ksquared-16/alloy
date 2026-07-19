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
    return {
        workUnitId: answer.workUnit.id,
        workViewId: answer.activeWorkView.id,
        subjectId: answer.terminal === "operational" ? answer.recordOfAttention.id : null,
        focusMode: null,
    };
}
