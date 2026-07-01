"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import {
    buildCommunicationsCardEvidence,
} from "@/lib/adminV2/runtime/focusPanel/communications/buildCommunicationsCardEvidence";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelMutation } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    /** Injected action seam. Absent → card is read-only (no cancel action). */
    mutation?: FocusPanelMutation;
};

/**
 * Communications card (action-only). Answers "What is the current outreach
 * status for this family?".
 *
 * When `mutation` is provided and a pending scheduled send exists:
 *   - Shows "Cancel scheduled send" action
 *   - On success: "✓ Canceled" chip for 2600ms
 *   - On failure: inline error, retained for retry
 *
 * No inline message composer — composing lives in the Communications workspace.
 * Pure over `context.signals.communications`.
 */
export default function CommunicationsCard({ model, context, receded = false, mutation }: Props) {
    const evidence = useMemo(() => buildCommunicationsCardEvidence(context), [context]);

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [justActed, setJustActed] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

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

    const statusChip = justActed ? "✓ Canceled" : evidence.statusChip;
    const statusTone = justActed ? "ready" : evidence.statusTone;
    const canCancelSend = Boolean(mutation) && Boolean(nextScheduledSendId) && !busy && !justActed;

    const footerAction = canCancelSend ? (
        <button
            type="button"
            className="alloy-os-ucard__action alloy-os-ucard__action--system5 alloy-os-ucard__action--destructive"
            disabled={busy}
            onClick={() => void handleCancelSend()}
            data-communications-action="cancel-scheduled-send"
        >
            {busy ? "Canceling…" : "Cancel scheduled send"}
        </button>
    ) : null;

    return (
        <div data-communications-card="true">
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
                <p className="alloy-os-ucard__inline-error" data-communications-error>{error}</p>
            ) : null}
        </div>
    );
}
