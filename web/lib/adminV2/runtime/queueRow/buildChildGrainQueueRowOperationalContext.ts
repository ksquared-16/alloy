/**
 * Child-grain Queue Row Operational Context adapter.
 *
 * Builds a `QueueRowOperationalContext` where the primary subject is an
 * Opportunity Customer Member (OCM) — one child's enrollment record within a
 * family case.
 *
 * Child-grain rows appear in:
 *   - Enrollment Offers queue (one row per child ready for an offer decision)
 *
 * Grain rules (from Operational Grain Doctrine §2):
 *   - `subject.grain = "child"`
 *   - `subject.type = "opportunity_customer_member"`
 *   - `subject.caseRef.opportunityId` is required
 *   - Tour signal is null (tour belongs to the case, not the child)
 *   - Communications signal is null (outreach belongs to the case)
 *   - `childStatus` signal is populated from OCM outcome_status fields
 *   - `candidateStatus` is null
 *
 * @see docs/platform/operator/operational-grain-doctrine.md §2.2, §6
 */

import type {
    QueueRowCapabilities,
    QueueRowChildStatusSignal,
    QueueRowOperationalContext,
    QueueRowPlacementSignal,
    QueueRowSignals,
    QueueRowSubjectRef,
} from "@/lib/adminV2/runtime/queueRow/queueRowOperationalContext";
import type { OperationalAttentionSignal } from "@/lib/adminV2/runtime/operationalContext/types";
import { NULL_PLACEMENT_SIGNAL } from "@/lib/adminV2/runtime/queueRow/queueRowOperationalContext";

export type BuildChildGrainQueueRowContextInput = {
    /** The OCM id — primary subject of this row. */
    ocmId: string;
    /** The parent opportunity id — required for cross-grain navigation. */
    opportunityId: string;
    /** Operator-facing label for the child (display_name or fallback). */
    childLabel: string;
    /** Composed runtime record for this OCM row. */
    record: Record<string, unknown>;
    canMutate?: boolean;
    /**
     * When the published Waitlist variant exposes placement adjustment and a
     * placement_candidate is attached, allow the existing manual-position command.
     */
    canOverridePlacement?: boolean;
};

function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

function buildAttentionSignal(record: Record<string, unknown>): OperationalAttentionSignal {
    const attention = record["_attention"] as
        | { needs_attention?: boolean; primary_reason?: string; reason_count?: number }
        | null
        | undefined;
    return {
        needsAttention: Boolean(attention?.needs_attention),
        primaryReason: trimOrNull(attention?.primary_reason),
        reasonCount: typeof attention?.reason_count === "number" ? attention.reason_count : 0,
    };
}

function buildChildStatusSignal(record: Record<string, unknown>): QueueRowChildStatusSignal {
    return {
        outcomeStatusKey: trimOrNull(record["outcome_status_key"]),
        outcomeStatusLabel: trimOrNull(record["outcome_status_label"]),
    };
}

function buildChildPlacementSignal(record: Record<string, unknown>): QueueRowPlacementSignal {
    const candidateId = trimOrNull(record["_placement_candidate_id"]);
    if (!candidateId) return NULL_PLACEMENT_SIGNAL;

    return {
        hasPlacementPriority: Boolean(record["_has_placement_priority"]),
        rank: typeof record["_placement_rank"] === "number" ? record["_placement_rank"] : null,
        tierLabel: trimOrNull(record["_placement_tier_label"]),
        hasManualOverride: Boolean(record["_placement_has_override"]),
        overrideLabel: trimOrNull(record["_placement_override_label"]),
    };
}

/**
 * Project a composed child-grain (OCM) queue record into a
 * `QueueRowOperationalContext`. Pure; safe in `useMemo`.
 */
export function buildChildGrainQueueRowOperationalContext(
    input: BuildChildGrainQueueRowContextInput,
): QueueRowOperationalContext {
    const { ocmId, opportunityId, childLabel, record } = input;

    const subject: QueueRowSubjectRef = {
        type: "opportunity_customer_member",
        grain: "child",
        id: ocmId,
        label: childLabel,
        caseRef: { opportunityId },
    };

    const signals: QueueRowSignals = {
        primaryWork: null,
        attention: buildAttentionSignal(record),
        tour: null,          // tour belongs to the case, not the child
        placement: buildChildPlacementSignal(record),
        communications: null, // outreach belongs to the case
        childStatus: buildChildStatusSignal(record),
        candidateStatus: null,
    };

    const hasPlacementCandidate =
        Boolean(trimOrNull(record["_placement_candidate_id"])) ||
        Boolean(trimOrNull(record["placementCandidateId"])) ||
        (record["_placement_waitlist_row"] != null &&
            typeof record["_placement_waitlist_row"] === "object");

    const capabilities: QueueRowCapabilities = {
        // Placement override is Placement-System owned. Child Waitlist rows with an attached
        // placement_candidate may use the existing manual-position admin command.
        canOverridePlacement: input.canOverridePlacement ?? hasPlacementCandidate,
        canMutate: input.canMutate ?? false,
    };

    return {
        subject,
        truth: record,
        signals,
        capabilities,
        status: "ready",
    };
}
