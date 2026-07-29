"use client";

import { useCallback, useState } from "react";
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

type TourLifecycleChoice = "choose" | "reschedule" | "cancel_confirm";

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

function TourLifecycleChoiceBody({
    context,
    mutation,
    tourFields,
    onClose,
    onComplete,
}: {
    context: OperationalContext;
    mutation?: FocusPanelMutation;
    tourFields: ReturnType<typeof resolveOpportunityTourScheduleFromTruth>;
    onClose: () => void;
    onComplete: () => void;
}) {
    const opportunityId = context.subject.id;
    const bookingId = context.signals.tour.bookingId;
    const [choice, setChoice] = useState<TourLifecycleChoice>("choose");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleRescheduleComplete = useCallback(async () => {
        mutation?.tour.dispatchTourUpdated(opportunityId, "reschedule_tour");
        onComplete();
    }, [mutation, onComplete, opportunityId]);

    const handleCancelConfirm = useCallback(async () => {
        if (!mutation || !bookingId) {
            setError("No active tour booking is available to cancel.");
            return;
        }
        setBusy(true);
        setError(null);
        const result = await mutation.tour.cancelTour(bookingId);
        setBusy(false);
        if (result.ok) {
            onComplete();
            return;
        }
        setError(result.error);
    }, [bookingId, mutation, onComplete]);

    if (choice === "reschedule") {
        return (
            <OpportunityTourScheduleActionModal
                open
                variant="embedded"
                title="Reschedule tour"
                submitLabel="Reschedule tour"
                opportunityId={opportunityId}
                locationId={tourFields.locationId}
                initialTourDate={tourFields.initialTourDate}
                initialTourTime={tourFields.initialTourTime}
                onClose={onClose}
                onSlotBooked={async () => {
                    await handleRescheduleComplete();
                }}
                onLegacySubmit={async (payload) => {
                    await submitTourScheduleLegacyFromPanel({
                        opportunityId,
                        locationId: tourFields.locationId,
                        actionKey: "reschedule_tour",
                        payload,
                    });
                    await handleRescheduleComplete();
                }}
            />
        );
    }

    if (choice === "cancel_confirm") {
        return (
            <div
                className="alloy-os-currentwork__action-panel-body"
                data-tour-lifecycle-choice="cancel_confirm"
            >
                <p className="alloy-os-household__row-detail">
                    Cancel this tour booking? The family will no longer have a scheduled visit.
                </p>
                {error ?
                    <p className="alloy-os-ucard__inline-error" data-tour-lifecycle-error>
                        {error}
                    </p>
                :   null}
                <div className="flex flex-wrap items-center gap-2" data-tour-lifecycle-actions>
                    <button
                        type="button"
                        className="alloy-os-ucard__action alloy-os-ucard__action--system5 alloy-os-ucard__action--destructive"
                        disabled={busy || !bookingId}
                        onClick={() => void handleCancelConfirm()}
                        data-tour-lifecycle-action="cancel_confirm"
                    >
                        {busy ? "Canceling…" : "Confirm cancel"}
                    </button>
                    <button
                        type="button"
                        className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                        disabled={busy}
                        onClick={() => {
                            setError(null);
                            setChoice("choose");
                        }}
                        data-tour-lifecycle-action="cancel_back"
                    >
                        Back
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="alloy-os-currentwork__action-panel-body" data-tour-lifecycle-choice="choose">
            <p className="alloy-os-household__row-detail">
                A tour is already scheduled. Choose how to update it.
            </p>
            {error ?
                <p className="alloy-os-ucard__inline-error" data-tour-lifecycle-error>
                    {error}
                </p>
            :   null}
            <div className="flex flex-wrap items-center gap-2" data-tour-lifecycle-actions>
                <button
                    type="button"
                    className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                    onClick={() => setChoice("reschedule")}
                    data-tour-lifecycle-action="reschedule"
                >
                    Reschedule tour
                </button>
                <button
                    type="button"
                    className="alloy-os-ucard__action alloy-os-ucard__action--system5 alloy-os-ucard__action--destructive"
                    disabled={!bookingId}
                    onClick={() => setChoice("cancel_confirm")}
                    data-tour-lifecycle-action="cancel"
                >
                    Cancel tour
                </button>
            </div>
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
            : surface === "tour_lifecycle_choice" ?
                <TourLifecycleChoiceBody
                    context={context}
                    mutation={mutation}
                    tourFields={tourFields}
                    onClose={onClose}
                    onComplete={onComplete}
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
