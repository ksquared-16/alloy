/**
 * The child's process position, as the durable record's operational context needs it.
 *
 * A wire-shaped input rather than the composer's own return type: the composer is server-only (it
 * reads), and this crosses to the client. Keeping the client's dependency on a plain shape is what
 * stops a `server-only` import from being dragged into the browser bundle to satisfy a type.
 */

import type { PublishedStageInputsForCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolvePublishedStageInputsForCurrentWork";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";

export type DurableChildStageWorkContextInput = {
    processKey?: string | null;
    /** Operator-facing process name, from the published configuration. */
    processLabel?: string | null;
    /** The child's OWN stage. Absent means the child has no process position. */
    stageKey?: string | null;
    /** Operator-facing stage name from the published plan, when one is resolved. */
    stageLabel?: string | null;
    opportunityCustomerMemberId?: string | null;
    /**
     * The acquisition episode this child's journey belongs to — the FAMILY record communications are
     * threaded on. It is not the action's subject and never becomes one: the child is the thing being
     * enrolled, and this only says which family conversation a message to them belongs in.
     */
    familyOpportunityId?: string | null;
    stageWorkRuntime?: StageWorkRuntimeProjection | null;
    publishedStageInputs?: PublishedStageInputsForCurrentWork | null;
};
