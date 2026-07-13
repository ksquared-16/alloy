"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import RelationshipActionGuidedModal from "@/components/layout/RelationshipActionGuidedModal";
import { fetchOpportunityDrawerOperationalBootstrap } from "@/lib/admin/opportunityDrawerBootstrapClient";
import type { OpportunityWorkspaceContext } from "@/contexts/AdminDrawerContext";
import { enrollmentScopeFromQueuePreviewItem } from "@/lib/admin/enrollmentStatus/enrollmentScopeFromQueueItem";
import {
    ADMINV2_OPEN_ENROLLMENT_STATUS_MODAL,
    parseOpenEnrollmentStatusModalDetail,
} from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionClient";
import type {
    EnrollmentStatusTransitionScope,
    EnrollmentStatusTransitionSourceSurface,
} from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";
import {
    ADMINV2_OPEN_RELATIONSHIP_ACTION_MODAL,
    parseOpenRelationshipActionModalDetail,
} from "@/lib/admin/relationship/relationshipActionClient";
import type {
    RelationshipActionKey,
    RelationshipActionSourceSurface,
} from "@/lib/admin/relationship/relationshipActionContract";
import { resolveRelationshipActionContext } from "@/lib/admin/relationship/relationshipActionRuntimeContext";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

type RelationshipModalState = {
    actionKey: RelationshipActionKey;
    opportunityId: string;
    sourceSurface: RelationshipActionSourceSurface;
    anchorRecord: ProofRuntimeRecord | null;
    loading: boolean;
    error: string | null;
    initialProposal?: Partial<import("@/lib/admin/relationship/relationshipActionContract").RelationshipActionExecutionRequest>;
};

type Params = {
    departmentId: string;
    workUnitId: string | null;
    workspaceContext: OpportunityWorkspaceContext | null;
    getSelectedOpportunityId: () => string | null;
    findQueueItemByOpportunityId: (opportunityId: string) => QueuePreviewItemVm | null;
    onEnrollmentStatusOpen: (input: {
        opportunityId: string;
        sourceSurface?: EnrollmentStatusTransitionSourceSurface;
        initialScope?: Partial<EnrollmentStatusTransitionScope>;
    }) => void;
    onInvalidate?: (opts: { entity_type?: string; entity_id?: string; action_key?: string }) => void;
    onActionError: (message: string) => void;
};

function mergeQueueGrainIntoAnchorRecord(
    record: ProofRuntimeRecord,
    queueItem: QueuePreviewItemVm | null,
    opportunityId: string,
): ProofRuntimeRecord {
    const scope = enrollmentScopeFromQueuePreviewItem(queueItem, opportunityId);
    const merged: ProofRuntimeRecord = { ...record };
    if (scope.opportunityCustomerMemberId) {
        merged["child.customer_member_id"] = scope.opportunityCustomerMemberId;
        merged.customer_member_id = scope.opportunityCustomerMemberId;
    }
    if (scope.placementCandidateId) {
        merged.placement_candidate_id = scope.placementCandidateId;
    }
    if (scope.grain === "child" || scope.grain === "candidate") {
        merged.row_grain = scope.grain;
    }
    return merged;
}

export function useWorkUnitRegistryModals(params: Params): {
    modals: ReactNode;
    openRelationshipAction: (input: {
        actionKey: RelationshipActionKey;
        opportunityId: string;
        sourceSurface?: RelationshipActionSourceSurface;
    }) => Promise<void>;
    openEnrollmentStatus: (input: {
        opportunityId: string;
        sourceSurface?: EnrollmentStatusTransitionSourceSurface;
        initialScope?: Partial<EnrollmentStatusTransitionScope>;
    }) => void;
} {
    const {
        workspaceContext,
        findQueueItemByOpportunityId,
        onEnrollmentStatusOpen,
        onInvalidate,
        onActionError,
    } = params;

    const [relationshipState, setRelationshipState] = useState<RelationshipModalState | null>(null);

    const loadRelationshipModal = useCallback(
        async (input: {
            actionKey: RelationshipActionKey;
            opportunityId: string;
            sourceSurface?: RelationshipActionSourceSurface;
            initialProposal?: Partial<import("@/lib/admin/relationship/relationshipActionContract").RelationshipActionExecutionRequest>;
        }) => {
            const oid = input.opportunityId.trim();
            if (!oid) {
                onActionError("Select a record first.");
                return;
            }
            setRelationshipState({
                actionKey: input.actionKey,
                opportunityId: oid,
                sourceSurface: input.sourceSurface ?? "opportunity_drawer",
                anchorRecord: null,
                loading: true,
                error: null,
                initialProposal: input.initialProposal,
            });
            try {
                const bootstrap = await fetchOpportunityDrawerOperationalBootstrap(
                    oid,
                    workspaceContext,
                    workspaceDataFetchInit(),
                );
                const queueItem = findQueueItemByOpportunityId(oid);
                const anchorRecord = mergeQueueGrainIntoAnchorRecord(
                    bootstrap.entity as ProofRuntimeRecord,
                    queueItem,
                    oid,
                );
                setRelationshipState((prev) =>
                    prev && prev.opportunityId === oid
                        ? { ...prev, anchorRecord, loading: false, error: null }
                        : prev,
                );
            } catch (e) {
                const message = e instanceof Error ? e.message : "Could not load record for this action.";
                setRelationshipState((prev) =>
                    prev && prev.opportunityId === oid
                        ? { ...prev, loading: false, error: message }
                        : prev,
                );
                onActionError(message);
            }
        },
        [findQueueItemByOpportunityId, onActionError, workspaceContext],
    );

    const openRelationshipAction = useCallback(
        async (input: {
            actionKey: RelationshipActionKey;
            opportunityId: string;
            sourceSurface?: RelationshipActionSourceSurface;
            initialProposal?: Partial<import("@/lib/admin/relationship/relationshipActionContract").RelationshipActionExecutionRequest>;
        }) => {
            await loadRelationshipModal(input);
        },
        [loadRelationshipModal],
    );

    const openEnrollmentStatus = useCallback(
        (input: {
            opportunityId: string;
            sourceSurface?: EnrollmentStatusTransitionSourceSurface;
            initialScope?: Partial<EnrollmentStatusTransitionScope>;
        }) => {
            const oid = input.opportunityId.trim();
            if (!oid) {
                onActionError("Select a record first.");
                return;
            }
            const queueItem = findQueueItemByOpportunityId(oid);
            onEnrollmentStatusOpen({
                opportunityId: oid,
                sourceSurface: input.sourceSurface,
                initialScope:
                    input.initialScope ?? enrollmentScopeFromQueuePreviewItem(queueItem, oid),
            });
        },
        [findQueueItemByOpportunityId, onActionError, onEnrollmentStatusOpen],
    );

    useEffect(() => {
        const onRelationship = (ev: Event) => {
            const detail = parseOpenRelationshipActionModalDetail(ev);
            if (!detail) return;
            void loadRelationshipModal({
                actionKey: detail.action_key,
                opportunityId: detail.opportunity_id,
                sourceSurface: detail.source_surface,
                initialProposal: detail.initial_proposal,
            });
        };
        const onEnrollment = (ev: Event) => {
            const detail = parseOpenEnrollmentStatusModalDetail(ev);
            if (!detail) return;
            openEnrollmentStatus({
                opportunityId: detail.opportunity_id,
                sourceSurface: detail.source_surface,
                initialScope: detail.scope,
            });
        };
        window.addEventListener(ADMINV2_OPEN_RELATIONSHIP_ACTION_MODAL, onRelationship as EventListener);
        window.addEventListener(ADMINV2_OPEN_ENROLLMENT_STATUS_MODAL, onEnrollment as EventListener);
        return () => {
            window.removeEventListener(ADMINV2_OPEN_RELATIONSHIP_ACTION_MODAL, onRelationship as EventListener);
            window.removeEventListener(ADMINV2_OPEN_ENROLLMENT_STATUS_MODAL, onEnrollment as EventListener);
        };
    }, [loadRelationshipModal, openEnrollmentStatus]);

    const relationshipContext = useMemo(() => {
        if (!relationshipState?.anchorRecord) return null;
        return resolveRelationshipActionContext({
            anchorRecord: relationshipState.anchorRecord,
            sourceSurface: relationshipState.sourceSurface,
        });
    }, [relationshipState]);

    const modals = useMemo(() => {
        if (!relationshipState) return null;
        if (relationshipState.loading) {
            return (
                <div
                    className="fixed inset-0 z-[70] flex items-center justify-center bg-black/20"
                    role="status"
                    aria-live="polite"
                    data-work-unit-relationship-loading
                >
                    <div className="rounded-md border border-alloy-stone/30 bg-white px-4 py-3 text-sm text-alloy-midnight shadow">
                        Loading record…
                    </div>
                </div>
            );
        }
        if (relationshipState.error || !relationshipContext || !relationshipState.anchorRecord) {
            return null;
        }
        return (
            <RelationshipActionGuidedModal
                open
                actionKey={relationshipState.actionKey}
                context={relationshipContext}
                anchorRecord={relationshipState.anchorRecord}
                initialProposal={relationshipState.initialProposal}
                onClose={() => setRelationshipState(null)}
                onSuccess={() => {
                    onInvalidate?.({
                        entity_type: "opportunity",
                        entity_id: relationshipState.opportunityId,
                        action_key: relationshipState.actionKey,
                    });
                    setRelationshipState(null);
                }}
            />
        );
    }, [relationshipContext, relationshipState, onInvalidate]);

    return {
        modals,
        openRelationshipAction,
        openEnrollmentStatus,
    };
}
