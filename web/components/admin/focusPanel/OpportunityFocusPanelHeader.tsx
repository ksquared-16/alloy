"use client";

import { useMemo } from "react";

import FocusPanelCompactHeader from "@/components/admin/focusPanel/FocusPanelCompactHeader";
import { OpportunityDrawerHeaderControls } from "@/components/admin/opportunity/OpportunityDrawerHeaderControls";
import {
    buildFocusPanelContextChips,
    formatFocusPanelDisplayLabel,
    resolveFocusPanelEffectiveStageChip,
    resolveFocusPanelLocationChip,
    resolveFocusPanelProcessLabel,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelDisplayLabels";
import { buildSubjectManageMenuFromResolvedActions } from "@/lib/admin/recordManage/buildSubjectManageMenuFromResolvedActions";
import type { FocusPanelMode } from "@/lib/adminV2/runtime/focusPanel/focusPanelMode";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { OpportunityDrawerRegistryActionFeedback } from "@/lib/admin/actions/useOpportunityDrawerRegistryActionFeedback";
import type { ActionPreflightUiPayload } from "@/lib/admin/actions/actionPreflightPresentation";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { OpportunityQueuePreviewSeed } from "@/lib/adminV2/bos/activeOperationalContext";
import type { StatusControlVm } from "@/lib/adminV2/viewModel/drawer/types";

export type OpportunityFocusPanelHeaderProps = {
    title: string;
    opportunityId: string;
    record: Record<string, unknown>;
    displayVm: OpportunityDrawerViewModel;
    queuePreviewSeed?: OpportunityQueuePreviewSeed | null;
    opportunitySingular: string;
    statusLabel: string | null;
    currentStatusKey: string;
    statusControl: StatusControlVm;
    statusCanMutate: boolean;
    manageCanMutate: boolean;
    activeMode: FocusPanelMode;
    onModeChange: (mode: FocusPanelMode) => void;
    onClose: () => void;
    onSubjectManageActionSelect: (action: ResolvedActionForClient) => void;
    subjectManageActionLoadingKey?: string | null;
    actionPreflightBlocked: ActionPreflightUiPayload | null;
    onDismissActionPreflightBlocked: () => void;
    registryActionFeedback: OpportunityDrawerRegistryActionFeedback | null;
    /**
     * The SETTLED participant scope. When it names a child, the header shows that child's identity;
     * when it is null the header stays the case/household identity — which is the right answer for
     * a family with several children and none selected.
     */
    subjectScope?: { displayName: string | null; imageUrl: string | null; customerMemberId: string | null } | null;
    /** Ignored in Focus Panel — stage movement via operational actions, not header CTA. */
    primaryHeaderAction?: ResolvedActionForClient | null;
    onPrimaryHeaderAction?: (action: ResolvedActionForClient) => void;
    primaryActionLoading?: boolean;
    /** Composer preview — match runtime header without dismiss control. */
    hideClose?: boolean;
};

export default function OpportunityFocusPanelHeader({
    title,
    opportunityId,
    record,
    displayVm,
    queuePreviewSeed,
    opportunitySingular,
    statusLabel,
    currentStatusKey,
    manageCanMutate,
    activeMode,
    onModeChange,
    onClose,
    onSubjectManageActionSelect,
    subjectManageActionLoadingKey = null,
    actionPreflightBlocked,
    onDismissActionPreflightBlocked,
    registryActionFeedback,
    hideClose = false,
    subjectScope,
}: OpportunityFocusPanelHeaderProps) {
    const subjectManageActions = useMemo(
        () => buildSubjectManageMenuFromResolvedActions(displayVm.actions.header_menu),
        [displayVm.actions.header_menu],
    );

    const readOnlyStatusLabel = useMemo(
        () => formatFocusPanelDisplayLabel(statusLabel) ?? null,
        [statusLabel],
    );

    // Effective Process Position stage rollup — prefer over raw status when participants diverge
    // or have branched (e.g. both Waitlist while family status still reads New Lead).
    const effectiveStageLabel = useMemo(
        () => resolveFocusPanelEffectiveStageChip(record),
        [record],
    );

    const processLabel = useMemo(() => resolveFocusPanelProcessLabel(record), [record]);

    const locationLabel = useMemo(() => resolveFocusPanelLocationChip(record), [record]);

    const hasActiveTour = (displayVm.summaries.active_tour_bookings?.length ?? 0) > 0;

    const contextChips = useMemo(() => {
        const stageOrStatus = effectiveStageLabel ?? readOnlyStatusLabel;
        // Booked Tour is overlapping operational context — not a stage move. Surface it beside
        // Waitlist/EPP rollup so All / family Focus does not flatten to one stage alone.
        const statusWithTour =
            hasActiveTour && stageOrStatus && !/tour/i.test(stageOrStatus)
                ? `${stageOrStatus} · Tour Scheduled`
                : hasActiveTour && !stageOrStatus
                  ? "Tour Scheduled"
                  : stageOrStatus;
        return buildFocusPanelContextChips({
            statusLabel: statusWithTour,
            statusKey: currentStatusKey,
            processLabel,
            locationLabel,
        });
    }, [
        currentStatusKey,
        effectiveStageLabel,
        hasActiveTour,
        locationLabel,
        processLabel,
        readOnlyStatusLabel,
    ]);

    const secondaryActions = (
        <OpportunityDrawerHeaderControls
            opportunityId={opportunityId}
            overviewData={record}
            opportunitySingular={opportunitySingular}
            queuePreviewSeed={queuePreviewSeed}
            inquiryWorkflow
            subjectManageActions={subjectManageActions}
            onSubjectManageActionSelect={onSubjectManageActionSelect}
            subjectManageActionLoadingKey={subjectManageActionLoadingKey}
            canMutate={manageCanMutate}
            layout="modal-actions"
            proofLayoutActions
            hideBos
            actionPreflightBlocked={actionPreflightBlocked}
            onDismissActionPreflightBlocked={onDismissActionPreflightBlocked}
            registryActionFeedback={registryActionFeedback}
            manageDisabledReason={
                subjectManageActionLoadingKey ? "An action is running — wait for it to finish."
                : !manageCanMutate ? "You don't have permission to manage this record."
                :   null
            }
        />
    );

    return (
        <FocusPanelCompactHeader
            subjectTitle={title}
            /*
             * A scoped child's own identity, or nothing.
             *
             * `subjectScope` is the resolver's settled answer, not "the first child on the case" —
             * merely HAVING children never picks one, and a scope that does not belong to this case
             * has already resolved to null upstream.
             */
            personSubjectName={subjectScope?.displayName ?? null}
            personSubjectImageUrl={subjectScope?.imageUrl ?? null}
            personSubjectRecordId={subjectScope?.customerMemberId ?? null}
            contextChips={contextChips}
            secondaryActions={secondaryActions}
            activeMode={activeMode}
            onModeChange={onModeChange}
            onClose={onClose}
            hideClose={hideClose}
        />
    );
}
