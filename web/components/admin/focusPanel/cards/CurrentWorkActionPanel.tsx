"use client";

import { useCallback } from "react";

import { OpportunityTourScheduleActionModal } from "@/components/admin/opportunity/tours/OpportunityTourScheduleActionModal";
import CurrentWorkStageTransitionPanel from "@/components/admin/focusPanel/cards/CurrentWorkStageTransitionPanel";
import { resolveOpportunityTourScheduleFromTruth } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveOpportunityTourScheduleFromTruth";
import {
    resolveCurrentWorkActionSurface,
    type CurrentWorkActionSurface,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkActionSurface";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";
import type { FocusPanelMutation } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import { submitTourScheduleLegacyFromPanel } from "@/lib/tours/actions/submitTourScheduleLegacyFromPanel";

type Props = {
    action: CurrentWorkActionVM;
    context: OperationalContext;
    mutation?: FocusPanelMutation;
    onClose: () => void;
    onComplete: () => void;
};

function UnsupportedPanelBody({ action, surface }: { action: CurrentWorkActionVM; surface: CurrentWorkActionSurface }) {
    const reason =
        action.disabledReason
        ?? (surface === "unsupported"
            ? "This action is not available inline from Current Work yet."
            : "This action cannot be run from Current Work.");

    return (
        <div className="alloy-os-currentwork__action-panel-body" data-work-action-panel-state="unsupported">
            <p className="alloy-os-household__row-detail">{reason}</p>
            <p className="alloy-os-currentwork__action-panel-hint">
                Use drawer header actions or the owning card when this action becomes available.
            </p>
        </div>
    );
}

export default function CurrentWorkActionPanel({ action, context, mutation, onClose, onComplete }: Props) {
    const surface = resolveCurrentWorkActionSurface(action);
    const opportunityId = context.subject.id;
    const tourFields = resolveOpportunityTourScheduleFromTruth(context.truth);
    const actionKey = (action.handlerKey ?? action.actionRef ?? action.key).trim();

    const handleTourComplete = useCallback(async () => {
        mutation?.tour.dispatchTourUpdated(opportunityId, actionKey || "schedule_tour");
        onComplete();
    }, [actionKey, mutation, onComplete, opportunityId]);

    if (surface === "process_transition") {
        const nextStatusKey = (action.actionRef ?? action.key).trim();
        return (
            <CurrentWorkStageTransitionPanel
                action={action}
                opportunityId={opportunityId}
                nextStatusKey={nextStatusKey}
                onClose={onClose}
                onComplete={onComplete}
            />
        );
    }

    const canRunInline = Boolean(mutation?.canEdit) && !action.disabled;

    return (
        <aside
            className="alloy-os-currentwork__action-panel"
            data-work-action-panel="true"
            data-work-action-panel-key={action.key}
            data-work-action-surface={surface}
            aria-label={`${action.label} action panel`}
        >
            <div className="alloy-os-currentwork__action-panel-header">
                <div>
                    <p className="alloy-os-currentwork__action-panel-eyebrow">Helpful action</p>
                    <h3 className="alloy-os-currentwork__action-panel-title">{action.label}</h3>
                    {action.description ?
                        <p className="alloy-os-currentwork__action-panel-desc">{action.description}</p>
                    :   null}
                </div>
                <button
                    type="button"
                    className="alloy-os-currentwork__action-panel-close"
                    onClick={onClose}
                    aria-label="Close action panel"
                    data-work-action-panel-close="true"
                >
                    Close
                </button>
            </div>

            {!canRunInline ?
                <UnsupportedPanelBody
                    action={{
                        ...action,
                        disabledReason:
                            action.disabledReason
                            ?? (mutation?.canEdit === false
                                ? "You do not have permission to run actions on this record."
                                : "This action is not available."),
                    }}
                    surface={surface}
                />
            : surface === "inline_form" ?
                // `inline_form` is the scheduling capability's declared interaction host (metadata,
                // not the action name). It is the only inline_form capability today; when more exist,
                // resolve the component from a host registry rather than assuming the scheduler.
                <OpportunityTourScheduleActionModal
                    open
                    variant="embedded"
                    title={action.label}
                    submitLabel={action.label}
                    opportunityId={opportunityId}
                    locationId={tourFields.locationId}
                    initialTourDate={tourFields.initialTourDate}
                    initialTourTime={tourFields.initialTourTime}
                    onClose={onClose}
                    onSlotBooked={async () => {
                        await handleTourComplete();
                    }}
                    onLegacySubmit={async (payload) => {
                        await submitTourScheduleLegacyFromPanel({
                            opportunityId,
                            locationId: tourFields.locationId,
                            actionKey: actionKey || "schedule_tour",
                            payload,
                        });
                        await handleTourComplete();
                    }}
                />
            :   <UnsupportedPanelBody action={action} surface={surface} />}
        </aside>
    );
}
