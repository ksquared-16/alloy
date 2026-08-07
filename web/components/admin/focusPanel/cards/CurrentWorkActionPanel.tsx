"use client";

import { useCallback } from "react";
import dynamic from "next/dynamic";

import CurrentWorkStageTransitionPanel from "@/components/admin/focusPanel/cards/CurrentWorkStageTransitionPanel";

// These three surfaces render ONLY inside a specific Current Work action branch (form_delivery /
// communications_composer / inline_form) — never at first paint. Load them dynamically so their subtrees
// (the ~1.4k-line Communications runtime + FamilyCommunicationWorkspaceView, Form Delivery, the tour
// scheduler) leave the Work Unit initial-path graph; each loads when the operator opens that action.
// (Phase 4 ownership — this also re-removes the Communications module a prior split dropped, which this
// panel had been re-dragging onto first paint.)
const CommunicationsDrawerSection = dynamic(
    () => import("@/components/admin/communications/CommunicationsDrawerSection"),
    { ssr: false },
);
const FormDeliverySurface = dynamic(
    () => import("@/components/admin/focusPanel/cards/FormDeliverySurface"),
    { ssr: false },
);
const OpportunityTourScheduleActionModal = dynamic(
    () =>
        import("@/components/admin/opportunity/tours/OpportunityTourScheduleActionModal").then(
            (m) => m.OpportunityTourScheduleActionModal,
        ),
    { ssr: false },
);
const CurrentWorkSubjectSelectorPanel = dynamic(
    () => import("@/components/admin/focusPanel/cards/CurrentWorkSubjectSelectorPanel"),
    { ssr: false },
);
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
            ? "This action is not available inline from What's Next yet."
            : "This action cannot be run from What's Next.");

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

    if (surface === "subject_selector") {
        return (
            <aside
                className="alloy-os-currentwork__action-panel"
                data-work-action-panel="true"
                data-work-action-panel-key={action.key}
                data-work-action-surface="subject_selector"
                aria-label={`${action.label} — choose child`}
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
                <CurrentWorkSubjectSelectorPanel
                    action={action}
                    opportunityId={opportunityId}
                    onClose={onClose}
                    onComplete={onComplete}
                />
            </aside>
        );
    }

    if (surface === "form_delivery") {
        return (
            <FormDeliverySurface
                opportunityId={opportunityId}
                onClose={onClose}
                onComplete={onComplete}
            />
        );
    }

    if (surface === "communications_composer") {
        // #1: the communication host renders the REAL communications runtime inline in the centered
        // surface — reusing the SAME embedded section + fill/scroll/pinned-footer layout contract the
        // Focus Panel Activity uses (`.alloy-os-activity-cockpit__comms` → `.alloy-os-activity-
        // workspace__embed` → activity_embed variant). The composer fills the host height with an
        // internal-scroll thread and its Send / Send later / BOS Assist footer stays visible.
        // Close lives on the What's Next card header (capability-active) so the compose body
        // gets full vertical room — no Communication chip / Message sub-header here.
        return (
            <div
                className="alloy-os-currentwork__composer-host"
                data-work-action-panel="true"
                data-work-action-panel-key={action.key}
                data-work-action-surface="communications_composer"
                aria-label={`${action.label} composer`}
            >
                <div className="alloy-os-activity-cockpit__comms">
                    <div className="alloy-os-activity-workspace__embed" data-activity-cockpit-embed="true">
                        <CommunicationsDrawerSection
                            apiEntityType="opportunities"
                            entityId={opportunityId}
                            embedded
                            embeddedHeaderMode="description_only"
                            surfaceVariant="activity_embed"
                        />
                    </div>
                </div>
            </div>
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
