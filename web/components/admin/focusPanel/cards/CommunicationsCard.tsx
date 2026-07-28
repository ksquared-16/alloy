"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import {
    buildCommunicationsCardEvidence,
} from "@/lib/adminV2/runtime/focusPanel/communications/buildCommunicationsCardEvidence";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type {
    FocusPanelCoordination,
    FocusPanelPerspectiveLevel,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import { focusPanelCardBackLabel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { FocusPanelMutation } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import {
    useDismissSignal,
    useReportPerspective,
} from "@/lib/adminV2/runtime/focusPanel/useFocusPanelCoordination";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    /** Cross-card handoff (e.g. Current Work checklist → Communications Focus). */
    coordination?: FocusPanelCoordination;
    /** Injected action seam. Absent → card is read-only (no cancel action). */
    mutation?: FocusPanelMutation;
};

/**
 * Communications card (action-only). Answers "What is the current outreach
 * status for this family?".
 *
 * Summary → Focus (elevating) — same grammar as Household / Current Work.
 * Composing mail/SMS stays in the Communications workspace / action registry;
 * Focus is the outreach status surface checklist handoffs land on.
 *
 * Pure over `context.signals.communications`.
 */
export default function CommunicationsCard({
    model,
    context,
    receded = false,
    coordination,
    mutation,
}: Props) {
    const evidence = useMemo(() => buildCommunicationsCardEvidence(context), [context]);

    const [focused, setFocused] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [justActed, setJustActed] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

    const request = coordination?.request;
    const requestNonce = request?.card === "communications" ? request.nonce : null;
    useLayoutEffect(() => {
        if (request?.card !== "communications") return;
        setFocused(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- nonce gates re-apply
    }, [requestNonce]);

    const level: FocusPanelPerspectiveLevel = focused ? "focused" : "base";
    useReportPerspective(coordination, "communications", level);
    useDismissSignal(coordination, "communications", () => setFocused(false));

    const nextScheduledSendId = context.signals.communications.nextScheduledSendId;

    async function handleCancelSend() {
        if (!mutation || !nextScheduledSendId) return;
        setBusy(true);
        setError(null);
        const result = await mutation.communications.cancelScheduledSend(nextScheduledSendId);
        setBusy(false);
        if (result.ok) {
            setJustActed(true);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setJustActed(false), 2600);
        } else {
            setError(result.error);
        }
    }

    const statusChip = justActed ? "✓ Canceled" : focused ? null : evidence.statusChip;
    const statusTone = justActed ? "ready" : evidence.statusTone;
    const canCancelSend = Boolean(mutation) && Boolean(nextScheduledSendId) && !busy && !justActed;

    const previousFocus = coordination?.previousFocus ?? null;
    const handleBack = () => {
        if (previousFocus && coordination?.back) {
            setFocused(false);
            coordination.back();
            return;
        }
        setFocused(false);
    };

    const footerAction = focused ? (
        <div className="alloy-os-card-nav" data-communications-focus-footer="true">
            <button
                type="button"
                className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                onClick={handleBack}
                data-communications-action="back"
            >
                {previousFocus ?
                    `← Back to ${focusPanelCardBackLabel(previousFocus.card)}`
                :   "← Back to panel"}
            </button>
            {canCancelSend ?
                <button
                    type="button"
                    className="alloy-os-ucard__action alloy-os-ucard__action--system5 alloy-os-ucard__action--destructive"
                    disabled={busy}
                    onClick={() => void handleCancelSend()}
                    data-communications-action="cancel-scheduled-send"
                >
                    {busy ? "Canceling…" : "Cancel scheduled send"}
                </button>
            :   null}
        </div>
    ) : canCancelSend ? (
        <button
            type="button"
            className="alloy-os-ucard__action alloy-os-ucard__action--system5 alloy-os-ucard__action--destructive"
            disabled={busy}
            onClick={() => void handleCancelSend()}
            data-communications-action="cancel-scheduled-send"
        >
            {busy ? "Canceling…" : "Cancel scheduled send"}
        </button>
    ) : (
        <button
            type="button"
            className="alloy-os-ucard__action alloy-os-ucard__action--system5"
            onClick={() => setFocused(true)}
            data-communications-action="open-focus"
        >
            View outreach →
        </button>
    );

    const body = focused ? (
        <div className="alloy-os-communications__focus" data-communications-focus="true">
            <p className="alloy-os-household__row-detail">{evidence.supportingLine}</p>
            {evidence.scheduledSendCount > 0 ?
                <p className="alloy-os-communications__fact">
                    {evidence.scheduledSendCount} scheduled send
                    {evidence.scheduledSendCount === 1 ? "" : "s"} pending
                </p>
            :   null}
            {evidence.nextFollowUpAt ?
                <p className="alloy-os-communications__fact">
                    Next follow-up: {evidence.nextFollowUpAt.slice(0, 10)}
                </p>
            :   null}
            <p className="alloy-os-communications__hint">
                Send and compose stay on configured Communications actions — this Focus shows
                outreach status for the current work.
            </p>
            {error ?
                <p className="alloy-os-ucard__inline-error" data-communications-error>
                    {error}
                </p>
            :   null}
        </div>
    ) : error ? (
        <p className="alloy-os-ucard__inline-error" data-communications-error>
            {error}
        </p>
    ) : null;

    return (
        <div
            className="alloy-os-communications"
            data-communications-card="true"
            data-communications-perspective={focused ? "focused" : evidence.isEmpty ? "empty" : "summary"}
        >
            <UniversalCard
                title={model.title}
                insight={evidence.answerLine}
                supportingInsight={focused ? null : evidence.supportingLine}
                iconName={model.iconName}
                tier={model.tier}
                archetype={model.archetype}
                statusChip={statusChip}
                statusTone={statusTone}
                density={focused ? "expanded" : model.density}
                gridSpan={model.span}
                data-universal-card-key={model.key}
                receded={receded}
                footerAction={footerAction}
            >
                {body}
            </UniversalCard>
        </div>
    );
}
