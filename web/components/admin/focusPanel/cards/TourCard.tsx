"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";
import {
    buildTourCardEvidence,
} from "@/lib/adminV2/runtime/focusPanel/tour/buildTourCardEvidence";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelMutation } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    /** Injected action seam. Absent → card is read-only (no action buttons). */
    mutation?: FocusPanelMutation;
};

/**
 * Tour card (action-only). Answers "Is a tour scheduled, and when?"
 *
 * When `mutation` is provided:
 *   - Scheduled + pending_approval: Confirm action
 *   - Scheduled: Reschedule + Cancel actions
 *   - Unscheduled: Schedule action (opens existing tour-schedule modal)
 *   - On action success: "✓ Done" chip for 2600ms
 *   - On action failure: inline error, retained for retry
 *
 * Pure over `context.signals.tour`. No inline form — schedule/reschedule
 * fires the ADMINV2_OPEN_TOUR_SCHEDULE_MODAL event to the existing modal.
 */
export default function TourCard({ model, context, receded = false, mutation }: Props) {
    const viewerTimeZone = useAdminViewerTimezone();
    const evidence = useMemo(() => buildTourCardEvidence(context, viewerTimeZone), [context, viewerTimeZone]);

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [justActed, setJustActed] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

    const bookingId = context.signals.tour.bookingId;
    const opportunityId = context.subject.id;
    const statusKey = context.signals.tour.statusLabel ?? "";

    const isPendingApproval = /pending_approval/i.test(statusKey);

    const handleActed = () => {
        setJustActed(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setJustActed(false), 2600);
    };

    async function handleCancel() {
        if (!mutation || !bookingId) return;
        setBusy(true);
        setError(null);
        const result = await mutation.tour.cancelTour(bookingId);
        setBusy(false);
        if (result.ok) handleActed();
        else setError(result.error);
    }

    async function handleConfirm() {
        if (!mutation || !bookingId) return;
        setBusy(true);
        setError(null);
        const result = await mutation.tour.confirmTour(bookingId);
        setBusy(false);
        if (result.ok) handleActed();
        else setError(result.error);
    }

    function handleOpenScheduleModal(actionKey: "schedule_tour" | "reschedule_tour") {
        if (!mutation) return;
        mutation.tour.openTourScheduleModal({ opportunityId, actionKey });
    }

    const statusChip = justActed ? "✓ Done" : evidence.statusChip;
    const statusTone = justActed ? "ready" : evidence.statusTone;

    // A completed / no-showed / canceled tour is over. Offering Reschedule and Cancel on it is the
    // same class of defect as printing a raw status key: the card would be inviting an action the
    // tour system will refuse. This is what the deleted lifecycle bar knew and the card did not.
    const footerAction = mutation && !justActed && !evidence.terminal ? (
        evidence.scheduled ? (
            <div className="flex items-center gap-2" data-tour-actions>
                {isPendingApproval ? (
                    <button
                        type="button"
                        className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                        disabled={busy}
                        onClick={() => void handleConfirm()}
                        data-tour-action="confirm"
                    >
                        {busy ? "Confirming…" : "Confirm →"}
                    </button>
                ) : null}
                <button
                    type="button"
                    className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                    disabled={busy}
                    onClick={() => handleOpenScheduleModal("reschedule_tour")}
                    data-tour-action="reschedule"
                >
                    Reschedule
                </button>
                <button
                    type="button"
                    className="alloy-os-ucard__action alloy-os-ucard__action--system5 alloy-os-ucard__action--destructive"
                    disabled={busy}
                    onClick={() => void handleCancel()}
                    data-tour-action="cancel"
                >
                    {busy ? "Canceling…" : "Cancel tour"}
                </button>
            </div>
        ) : (
            <button
                type="button"
                className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                onClick={() => handleOpenScheduleModal("schedule_tour")}
                data-tour-action="schedule"
            >
                Schedule tour →
            </button>
        )
    ) : null;

    return (
        <div data-tour-card="true">
            <UniversalCard
                title={model.title}
                insight={evidence.answerLine}
                supportingInsight={evidence.supportingLine}
                iconName={model.iconName}
                tier={model.tier}
                archetype={model.archetype}
                statusChip={statusChip}
                statusTone={statusTone}
                density={model.density}
                gridSpan={model.span}
                data-universal-card-key={model.key}
                receded={receded}
                footerAction={footerAction}
            />
            {error ? (
                <p className="alloy-os-ucard__inline-error" data-tour-error>{error}</p>
            ) : null}
        </div>
    );
}
