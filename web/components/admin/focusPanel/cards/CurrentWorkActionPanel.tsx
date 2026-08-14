"use client";

import { useCallback } from "react";
import dynamic from "next/dynamic";

import CurrentWorkStageTransitionPanel from "@/components/admin/focusPanel/cards/CurrentWorkStageTransitionPanel";
// Subject selector is small and must paint inside the shell on the same click frame — static import
// avoids next/dynamic chunk lag after the centered shell chrome commits.
import CurrentWorkSubjectSelectorPanel from "@/components/admin/focusPanel/cards/CurrentWorkSubjectSelectorPanel";

// Heavy surfaces render ONLY inside a specific Current Work action branch — never at first paint.
// Load them dynamically so their subtrees leave the Work Unit initial-path graph.
const CommunicationsDrawerSection = dynamic(
    () => import("@/components/admin/communications/CommunicationsDrawerSection"),
    {
        ssr: false,
        loading: () => (
            <div
                className="flex min-h-[16rem] flex-1 items-center justify-center px-4 text-[12px] text-alloy-midnight/55"
                data-work-composer-loading="true"
            >
                Opening message…
            </div>
        ),
    },
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
const CurrentWorkAddChildPanel = dynamic(
    () => import("@/components/admin/focusPanel/cards/CurrentWorkAddChildPanel"),
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
import type { FamilyComposeDraftSeed } from "@/lib/communications/v2/familyWorkspace/familyComposeIntent";
import { submitTourScheduleLegacyFromPanel } from "@/lib/tours/actions/submitTourScheduleLegacyFromPanel";
import { useTourInvitationComposeSeed } from "@/lib/tours/useTourInvitationComposeSeed";

type Props = {
    action: CurrentWorkActionVM;
    context: OperationalContext;
    /** Canonical opportunity id (not child process-instance id). */
    opportunityId: string;
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

/** Canonical Current Work New Message host — Contact Family, Send Message, Tour Invitation. */
function CurrentWorkNewMessageComposerHost({
    actionKey,
    actionLabel,
    opportunityId,
    draftSeed,
}: {
    actionKey: string;
    actionLabel: string;
    opportunityId: string;
    draftSeed?: FamilyComposeDraftSeed | null;
}) {
    return (
        <div
            className="alloy-os-currentwork__composer-host"
            data-work-action-panel="true"
            data-work-action-panel-key={actionKey}
            data-work-action-surface="communications_composer"
            data-work-compose-intent="new_message"
            aria-label={`${actionLabel} composer`}
        >
            <div className="alloy-os-activity-cockpit__comms">
                <div className="alloy-os-activity-workspace__embed" data-activity-cockpit-embed="true">
                    <CommunicationsDrawerSection
                        apiEntityType="opportunities"
                        entityId={opportunityId}
                        embedded
                        embeddedHeaderMode="description_only"
                        surfaceVariant="activity_embed"
                        entryContext="current_work"
                        composeIntent="new_message"
                        draftSeed={draftSeed ?? null}
                    />
                </div>
            </div>
        </div>
    );
}

function CurrentWorkTourInvitationComposerHost({
    action,
    opportunityId,
}: {
    action: CurrentWorkActionVM;
    opportunityId: string;
}) {
    const actionKey = (action.handlerKey ?? action.actionRef ?? action.key).trim();
    const seedState = useTourInvitationComposeSeed(opportunityId, true);

    if (seedState.phase === "preparing") {
        return (
            <div
                className="alloy-os-currentwork__composer-host"
                data-work-action-panel="true"
                data-work-action-panel-key={actionKey}
                data-work-action-surface="communications_composer"
                data-work-compose-intent="new_message"
                data-tour-invitation-prepare="true"
                aria-label={`${action.label} composer`}
            >
                <div className="flex min-h-[16rem] flex-1 items-center justify-center px-4 text-[12px] text-alloy-midnight/55">
                    Preparing tour invitation…
                </div>
            </div>
        );
    }

    if (seedState.phase === "error") {
        return (
            <div
                className="alloy-os-currentwork__composer-host"
                data-work-action-panel="true"
                data-work-action-panel-key={actionKey}
                data-work-action-surface="communications_composer"
                data-tour-invitation-prepare="error"
                aria-label={`${action.label} composer`}
            >
                <div className="flex min-h-[16rem] flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
                    <p className="text-[13px] font-semibold text-alloy-ember">{seedState.message}</p>
                    <p className="text-[12px] text-alloy-midnight/55">Close and try Send Tour Invitation again.</p>
                </div>
            </div>
        );
    }

    return (
        <CurrentWorkNewMessageComposerHost
            actionKey={actionKey}
            actionLabel={action.label}
            opportunityId={opportunityId}
            draftSeed={seedState.seed}
        />
    );
}

export default function CurrentWorkActionPanel({
    action,
    context,
    opportunityId,
    mutation,
    onClose,
    onComplete,
}: Props) {
    const surface = resolveCurrentWorkActionSurface(action);
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
        const isTourInvitation = actionKey === "send_tour_invitation";
        // One canonical New Message host for Contact Family, Send Message, and Tour Invitation.
        // Tour prepares draft content (subject/body/link) then hands it to the shared composer.
        if (isTourInvitation) {
            return <CurrentWorkTourInvitationComposerHost action={action} opportunityId={opportunityId} />;
        }
        return (
            <CurrentWorkNewMessageComposerHost
                actionKey={actionKey}
                actionLabel={action.label}
                opportunityId={opportunityId}
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
                actionKey === "add_child" || actionKey === "add_sibling" ?
                    <CurrentWorkAddChildPanel
                        action={action}
                        opportunityId={opportunityId}
                        defaultLocationId={
                            typeof context.truth?.location_id === "string"
                                ? context.truth.location_id
                                : tourFields.locationId
                        }
                        onClose={onClose}
                        onComplete={onComplete}
                    />
                :   // Scheduling capability's declared interaction host (metadata-driven).
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
