"use client";

/**
 * AFTER APPROVE — an acknowledgement the operator leaves when THEY choose.
 *
 * Every destination here is a canonical one, reached the canonical way:
 *   Open Lead / Contact Family / Update Information — the lead's Focus Panel in the Work View the
 *     server placed it in, through the same `resolveOpenLeadFocusPanelHref` + `openCreatedLead`
 *     BOS → Create Lead uses (a focus intent from above the kernel, never a blind route push);
 *     the latter two land on the Communications / Household card.
 *   Open parent / Open child — the durable record, through `useOperatorRecordFocus`.
 *   Next Item / Return to Queue — stay in Processing, no reload.
 * A destination that does not exist for these records is not offered.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import { WS_ACTION_PRIMARY } from "@/components/workspace/workspaceTokens";
import { openCreatedLead } from "@/lib/platform/commands/createLead/openCreatedLead";
import { resolveOpenLeadFocusPanelHref } from "@/lib/platform/commands/createLead/resolveOpenLeadFocusPanelHref";
import {
    buildLeadAcknowledgementView,
    LEAD_ACKNOWLEDGEMENT_ACTION_LABEL,
    type LeadAcknowledgementAction,
    type LeadCommitResultLike,
} from "@/lib/pos/leadAcknowledgementPresentation";
import { OPERATOR_FOCUS_CARDS } from "@/lib/runtime/focus/operatorFocusCards";
import { useOperatorRecordFocus } from "@/lib/runtime/focus/useOperatorRecordFocus";

const SECONDARY =
    "w-full rounded-md border border-alloy-stone/25 px-3 py-1.5 text-[12px] font-medium text-alloy-midnight/80 hover:bg-alloy-stone/10 disabled:opacity-50";

export default function ProcessingLeadAcknowledgement({
    result,
    lines,
    onLeaveProcessing,
    onNextItem,
    onReturnToQueue,
}: {
    result: LeadCommitResultLike;
    /** The honest Linked / Created / Updated lines. */
    lines: string[];
    /** Processing is a modal over the workspace: leave it so the record is in front of the operator. */
    onLeaveProcessing?: () => void;
    /** Selects the next open item; returns false when there is none. */
    onNextItem: () => boolean;
    onReturnToQueue: () => void;
}) {
    const view = buildLeadAcknowledgementView(result);
    const router = useRouter();
    const focusRecord = useOperatorRecordFocus();
    const [busy, setBusy] = useState<LeadAcknowledgementAction | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [queueEmpty, setQueueEmpty] = useState(false);

    const openLead = async (action: LeadAcknowledgementAction) => {
        if (!view.leadId) return;
        setBusy(action);
        setNotice(null);
        try {
            const target = await resolveOpenLeadFocusPanelHref({
                opportunityId: view.leadId,
                workViewId: result.handoff?.workViewId ?? null,
                workViewRouteKey: result.handoff?.workViewRouteKey ?? null,
                statusKey: result.handoff?.statusKey ?? null,
                stageKey: result.handoff?.stageKey ?? "lead",
            });
            // Workspace home is the resolver's "no queue holds this lead" answer — say so, don't go there.
            if (!target || target === "/workspace") {
                setNotice("This lead isn't in a work queue you can open yet.");
                return;
            }
            const cardFocus =
                action === "contact_family"
                    ? { card_key: "communications" }
                    : action === "update_information"
                      ? { card_key: OPERATOR_FOCUS_CARDS.household }
                      : null;
            const outcome = openCreatedLead({
                href: target,
                opportunityId: view.leadId,
                pathname: typeof window !== "undefined" ? window.location.pathname : null,
                push: (h) => router.push(h),
                cardFocus,
            });
            if (outcome === "none") return;
            onLeaveProcessing?.();
        } finally {
            setBusy(null);
        }
    };

    const openDurable = async (action: "open_person" | "open_child") => {
        const id = action === "open_person" ? view.personId : view.childId;
        if (!id) return;
        setBusy(action);
        setNotice(null);
        try {
            const opened = await focusRecord({
                entity_type: action === "open_person" ? "persons" : "customer_members",
                entity_id: id,
                intent: "durable_record",
            });
            if (!opened) {
                setNotice("That record can't be opened from here.");
                return;
            }
            onLeaveProcessing?.();
        } finally {
            setBusy(null);
        }
    };

    const run = (action: LeadAcknowledgementAction) =>
        action === "open_person" || action === "open_child" ? openDurable(action) : openLead(action);

    const [primary, ...secondary] = view.actions;

    return (
        <div
            className="rounded-lg border border-alloy-bend-pine/25 bg-alloy-bend-pine/[0.06] p-3.5"
            data-testid="processing-lead-acknowledgement"
            data-matched={view.matched ? "true" : "false"}
        >
            <div className="flex items-center gap-2">
                <span aria-hidden className="text-[15px] text-alloy-bend-pine">✓</span>
                <span className="text-[14px] font-semibold text-alloy-midnight" data-testid="processing-lead-acknowledgement-title">
                    {view.title}
                </span>
            </div>
            <p className="mt-1 text-[12px] leading-snug text-alloy-midnight/70">{view.body}</p>
            {lines.length > 0 ? (
                <ul className="mt-2 space-y-1">
                    {lines.map((l, i) => (
                        <li key={i} className="flex items-baseline gap-1.5 text-[12.5px] text-alloy-midnight">
                            <span aria-hidden className="text-alloy-bend-pine">✓</span>
                            <span>{l}</span>
                        </li>
                    ))}
                </ul>
            ) : null}

            <div className="mt-3 space-y-1.5">
                {primary ? (
                    <button
                        type="button"
                        className={`${WS_ACTION_PRIMARY} w-full`}
                        disabled={busy !== null}
                        onClick={() => void run(primary)}
                        data-testid={`processing-ack-${primary}`}
                    >
                        {busy === primary ? "Opening…" : LEAD_ACKNOWLEDGEMENT_ACTION_LABEL[primary]}
                    </button>
                ) : null}
                {secondary.length > 0 ? (
                    <div className="grid grid-cols-2 gap-1.5">
                        {secondary.map((action) => (
                            <button
                                key={action}
                                type="button"
                                className={SECONDARY}
                                disabled={busy !== null}
                                onClick={() => void run(action)}
                                data-testid={`processing-ack-${action}`}
                            >
                                {busy === action ? "Opening…" : LEAD_ACKNOWLEDGEMENT_ACTION_LABEL[action]}
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>

            {notice ? <p className="mt-2 text-[11px] text-amber-700">{notice}</p> : null}

            <div className="mt-3 flex items-center justify-between border-t border-alloy-bend-pine/15 pt-2.5">
                <button
                    type="button"
                    className="text-[12px] font-medium text-alloy-midnight/70 hover:underline"
                    onClick={onReturnToQueue}
                    data-testid="processing-ack-return-to-queue"
                >
                    Return to Queue
                </button>
                <button
                    type="button"
                    className="text-[12px] font-semibold text-alloy-bend-pine hover:underline disabled:opacity-50"
                    disabled={queueEmpty}
                    onClick={() => {
                        if (!onNextItem()) setQueueEmpty(true);
                    }}
                    data-testid="processing-ack-next-item"
                >
                    Next Item →
                </button>
            </div>
            {queueEmpty ? (
                <p className="mt-1.5 text-right text-[11px] text-alloy-midnight/50" data-testid="processing-ack-queue-empty">
                    No more items waiting in the queue.
                </p>
            ) : null}
        </div>
    );
}
