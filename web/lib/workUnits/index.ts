/**
 * Work unit surface contracts — lifecycle subject, queue row context, layout runtime payload.
 * @see docs/system/work-unit-surface-context-contract.md
 */

export {
    QUEUE_ROW_CONTEXT_CONTRACT_VERSION,
    type DrawerSubjectContext,
    type LifecycleSubjectCaseAnchor,
    type LifecycleSubjectRef,
    type LifecycleSubjectType,
    type OpportunityQueueRowWithContext,
    type QueueMembershipGrain,
    type QueueRowAttentionSummary,
    type QueueRowCaseContext,
    type QueueRowContext,
    type QueueRowContextContractVersion,
    type QueueRowDrawerOpen,
    type QueueRowNextBestAction,
    type QueueRowPrimaryContact,
    type QueueRowSubjectPresentation,
    type QueueRowWorkSummary,
    type RelatedSubjectSummary,
    type WorkUnitQueueCountUnit,
    type WorkUnitSurfaceContext,
    type WorkUnitSurfaceContextRow,
    type WorkUnitSurfaceDrawerContext,
    isQueueMembershipGrain,
} from "@/lib/workUnits/lifecycleSubjectContracts";

export {
    attachPartialQueueRowContext,
    attachPartialQueueRowContextToRows,
    buildPartialQueueRowContext,
    buildWorkUnitSurfaceContextFromRows,
    queueGrainToLifecycleSubjectType,
    readChildLifecycleSummaryFromRow,
    resolveBoringCaseStatusLabel,
    type BuildPartialQueueRowContextInput,
    type PartialQueueRowContextQueueMeta,
} from "@/lib/workUnits/buildPartialQueueRowContext";

export {
    attachOpportunityQueueRowsWithRowContext,
    isQueueRowContextWiringEnabled,
    queueRowContextMetaFromLane,
    type OpportunityQueueRowContextLaneParams,
} from "@/lib/workUnits/attachQueueRowContextToItems";
