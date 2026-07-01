/**
 * Candidate-grain Queue Row Operational Context adapter.
 *
 * Builds a `QueueRowOperationalContext` where the primary subject is a
 * PlacementCandidate — one child's waitlist entry.
 *
 * Candidate-grain rows appear in:
 *   - Enrollment Waitlist queue (one row per candidate)
 *
 * Grain rules (from Operational Grain Doctrine §2):
 *   - `subject.grain = "candidate"`
 *   - `subject.type = "placement_candidate"`
 *   - `subject.caseRef.opportunityId` is required
 *   - `subject.childRef.customerMemberId` is required
 *   - Tour signal is null (tour belongs to the case)
 *   - Communications signal is null (outreach belongs to the case)
 *   - `placement` signal is populated with full candidate priority detail
 *   - `candidateStatus` signal is populated
 *   - `childStatus` is null (OCM-level status belongs on child-grain rows)
 *   - Placement override: `canOverridePlacement` may be true (override is
 *     candidate-grain — the only grain where placement overrides belong)
 *
 * @see docs/platform/operator/operational-grain-doctrine.md §2.2, §4.3
 */

import type {
    QueueRowCapabilities,
    QueueRowCandidateStatusSignal,
    QueueRowOperationalContext,
    QueueRowPlacementSignal,
    QueueRowSignals,
    QueueRowSubjectRef,
} from "@/lib/adminV2/runtime/queueRow/queueRowOperationalContext";
import type { PlacementPrioritySnapshot } from "@/lib/orchestration/placement/placementPriorityTypes";
import type { OperationalAttentionSignal } from "@/lib/adminV2/runtime/operationalContext/types";
import { NULL_PLACEMENT_SIGNAL } from "@/lib/adminV2/runtime/queueRow/queueRowOperationalContext";

export type BuildCandidateGrainQueueRowContextInput = {
    /** The placement_candidate id — primary subject of this row. */
    candidateId: string;
    /** The parent opportunity id — required for cross-grain navigation. */
    opportunityId: string;
    /** The child's customer_member_id — required for cross-grain navigation. */
    customerMemberId: string;
    /** Operator-facing label (child display name or household label). */
    candidateLabel: string;
    /** Composed runtime record for this placement_candidate row. */
    record: Record<string, unknown>;
    /** Whether this operator may write placement overrides. */
    canOverridePlacement?: boolean;
    canMutate?: boolean;
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

function buildCandidatePlacementSignal(record: Record<string, unknown>): QueueRowPlacementSignal {
    const snapshot = record["metadata.placement_priority_v1"] as PlacementPrioritySnapshot | null | undefined;
    if (!snapshot?.bucket_key) return NULL_PLACEMENT_SIGNAL;

    const manualOverride = record["metadata.placement_manual_override"] as
        | { reason?: string; bucket_key?: string; label?: string }
        | null
        | undefined;

    return {
        hasPlacementPriority: true,
        rank: typeof snapshot.bucket_priority_order === "number" ? snapshot.bucket_priority_order : null,
        tierLabel: trimOrNull(snapshot.bucket_label),
        hasManualOverride: Boolean(manualOverride?.bucket_key),
        overrideLabel: trimOrNull(manualOverride?.label) ?? trimOrNull(manualOverride?.reason),
    };
}

function buildCandidateStatusSignal(record: Record<string, unknown>): QueueRowCandidateStatusSignal {
    const statusRaw = trimOrNull(record["status"]);
    const validStatuses = ["active", "paused", "withdrawn", "placed"] as const;
    type ValidStatus = (typeof validStatuses)[number];
    const candidateStatus: ValidStatus | null = validStatuses.includes(statusRaw as ValidStatus)
        ? (statusRaw as ValidStatus)
        : null;

    return {
        candidateStatus,
        waitSince: trimOrNull(record["wait_since"]),
    };
}

/**
 * Project a composed candidate-grain (placement_candidate) queue record into a
 * `QueueRowOperationalContext`. Pure; safe in `useMemo`.
 */
export function buildCandidateGrainQueueRowOperationalContext(
    input: BuildCandidateGrainQueueRowContextInput,
): QueueRowOperationalContext {
    const { candidateId, opportunityId, customerMemberId, candidateLabel, record } = input;

    const subject: QueueRowSubjectRef = {
        type: "placement_candidate",
        grain: "candidate",
        id: candidateId,
        label: candidateLabel,
        caseRef: { opportunityId },
        childRef: { customerMemberId },
    };

    const signals: QueueRowSignals = {
        primaryWork: null,
        attention: buildAttentionSignal(record),
        tour: null,           // tour belongs to the case
        placement: buildCandidatePlacementSignal(record),
        communications: null, // outreach belongs to the case
        childStatus: null,    // OCM status is child-grain, not candidate-grain
        candidateStatus: buildCandidateStatusSignal(record),
    };

    const capabilities: QueueRowCapabilities = {
        canOverridePlacement: input.canOverridePlacement ?? false,
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
