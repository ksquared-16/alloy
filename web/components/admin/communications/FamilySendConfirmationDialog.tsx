"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Send } from "lucide-react";

import { ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z } from "@/components/admin/Drawer";

import type { FamilySendResult } from "@/lib/communications/v2/familyWorkspace/orchestrateFamilySend";
import { buildContactFamilySendSuccessMessage } from "@/lib/communications/v2/familyWorkspace/contactFamilySendComplete";
import {
    buildFamilySendAckTitle,
    buildFamilySendConfirmChannelLine,
} from "@/lib/communications/v2/familyWorkspace/familySendConfirmationCopy";
import { composerMarkupToPlainText } from "@/lib/communications/v2/familyWorkspace/composerBodyMarkup";
import {
    MESSAGING_MODAL_BODY_CLASS,
    MESSAGING_MODAL_PANEL_CLASS,
    MESSAGING_MODAL_PRIMARY_BUTTON_CLASS,
    MESSAGING_MODAL_SECONDARY_BUTTON_CLASS,
} from "@/lib/adminV2/messaging/messagingComposerModalChrome";

type Props = {
    open: boolean;
    sendResult: FamilySendResult | null;
    sendError: string | null;
    sending: boolean;
    channel: "email" | "sms";
    /** Exact current draft subject (Email). Empty for SMS. */
    subjectDraft: string;
    /** Exact current draft body — same text Confirm send will submit. */
    bodyDraft: string;
    recipientLabel: string;
    /** When true, success title is Tour-aware. */
    tourInvitation?: boolean;
    onBackToEdit: () => void;
    onConfirmSend: () => void;
    onDone: () => void;
};

/**
 * Shared centered send confirmation + success acknowledgement for the canonical
 * family Communications composer (New Message, Reply, Tour seed, Contact Family).
 */
export default function FamilySendConfirmationDialog({
    open,
    sendResult,
    sendError,
    sending,
    channel,
    subjectDraft,
    bodyDraft,
    recipientLabel,
    tourInvitation = false,
    onBackToEdit,
    onConfirmSend,
    onDone,
}: Props) {
    const mode = sendResult?.mode ?? null;
    const isPreflight = mode === "preflight";
    const isSuccess = mode === "sent";

    // `document` does not exist during the server render, so the portal target is
    // claimed after mount.
    const [portalReady, setPortalReady] = useState(false);
    useEffect(() => {
        setPortalReady(true);
    }, []);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            if (isPreflight && !sending) onBackToEdit();
            else if (isSuccess) onDone();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, isPreflight, isSuccess, sending, onBackToEdit, onDone]);

    if (!open || !portalReady) return null;

    const channelLine = buildFamilySendConfirmChannelLine({ channel, recipientLabel });
    const bodyPreview = composerMarkupToPlainText(bodyDraft).trim() || "(Empty message)";
    const subjectPreview = subjectDraft.trim();
    const readyCount = sendResult?.summary.ready ?? 0;
    const blocked = (sendResult?.results ?? []).filter((r) => r.status === "blocked");
    const ackTitle = buildFamilySendAckTitle({ tourInvitation });
    const ackDetail = buildContactFamilySendSuccessMessage({
        channel,
        recipientLabel:
            sendResult?.results.find((r) => r.status === "sent")?.display_name
            ?? recipientLabel
            ?? null,
    });

    /*
     * PORTALED TO `document.body`, AT THE PLATFORM CONSTANT.
     *
     * This dialog previously rendered in place, inside the composer subtree, with
     * a raw `z-[120]`. A z-index only orders siblings within the stacking context
     * it lives in, so the backdrop could never rise above the Focus Panel that
     * contains it — the panel body dimmed and the panel HEADER stayed bright,
     * which reads to an operator as a half-applied overlay and leaves header
     * controls live behind a modal that is supposedly blocking.
     *
     * A larger number could not have fixed that; escaping the stacking context is
     * the only thing that can. `ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z` is the
     * platform's answer for exactly this class of overlay and carries the same
     * ordering guarantees the rest of adminV2 relies on, which a page-local
     * `z-[120]` does not.
     */
    return createPortal(
        <div
            className="fixed inset-0 flex items-center justify-center bg-alloy-midnight/40 px-3 py-6"
            style={{ zIndex: ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z }}
            data-cc-send-confirm-dialog="true"
            data-cc-send-confirm-phase={isPreflight ? "preflight" : isSuccess ? "success" : "error"}
        >
            <button
                type="button"
                className="absolute inset-0 cursor-default"
                aria-label={isPreflight ? "Back to edit" : "Dismiss"}
                onClick={() => {
                    if (sending) return;
                    if (isPreflight) onBackToEdit();
                    else onDone();
                }}
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="cc-send-confirm-title"
                className={`${MESSAGING_MODAL_PANEL_CLASS} max-w-md border-alloy-stone/25 shadow-lg`}
                data-cc-send-confirm={isPreflight ? "true" : undefined}
                data-cc-send-review="true"
                onClick={(e) => e.stopPropagation()}
            >
                <div className={MESSAGING_MODAL_BODY_CLASS}>
                    {sendError ? (
                        <div className="space-y-3">
                            <p id="cc-send-confirm-title" className="text-[15px] font-semibold text-alloy-midnight">
                                Could not send
                            </p>
                            <p className="text-[13px] text-alloy-ember">{sendError}</p>
                            <div className="flex justify-end">
                                <button type="button" onClick={onDone} className={MESSAGING_MODAL_SECONDARY_BUTTON_CLASS}>
                                    Back to edit
                                </button>
                            </div>
                        </div>
                    ) : isPreflight ? (
                        <div className="space-y-3">
                            <div>
                                <p id="cc-send-confirm-title" className="text-[15px] font-semibold tracking-tight text-alloy-midnight">
                                    Ready to send
                                </p>
                                <p
                                    className="mt-1 text-[13px] text-alloy-midnight/55"
                                    data-cc-send-confirm-recipient="true"
                                >
                                    {channelLine}
                                    {sendResult && sendResult.summary.blocked > 0
                                        ? ` · ${sendResult.summary.blocked} blocked`
                                        : ""}
                                </p>
                            </div>
                            <div
                                className="max-h-[40vh] overflow-y-auto rounded-lg border border-alloy-stone/20 bg-white px-3 py-2.5 text-[13px] leading-relaxed text-alloy-midnight"
                                data-cc-send-confirm-preview="true"
                            >
                                {channel === "email" && subjectPreview ? (
                                    <div className="mb-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                            Subject
                                        </p>
                                        <p className="font-medium text-alloy-midnight">{subjectPreview}</p>
                                    </div>
                                ) : null}
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                    Message
                                </p>
                                <p className="mt-0.5 whitespace-pre-wrap text-alloy-midnight/90">{bodyPreview}</p>
                            </div>
                            {blocked.length > 0 ? (
                                <ul className="space-y-0.5 text-[11px] text-alloy-midnight/55">
                                    {blocked.map((r) => (
                                        <li key={r.person_id}>
                                            {r.display_name}
                                            {r.reason ? ` — ${r.reason}` : " — blocked"}
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={onBackToEdit}
                                    disabled={sending}
                                    className={MESSAGING_MODAL_SECONDARY_BUTTON_CLASS}
                                    data-cc-send-back="true"
                                >
                                    Back to edit
                                </button>
                                {readyCount > 0 ? (
                                    <button
                                        type="button"
                                        disabled={sending}
                                        onClick={onConfirmSend}
                                        className={`inline-flex items-center gap-1.5 ${MESSAGING_MODAL_PRIMARY_BUTTON_CLASS}`}
                                        data-cc-send-confirm-action="true"
                                    >
                                        <Send className="h-3.5 w-3.5" />
                                        {sending ? "Sending…" : "Confirm send"}
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    ) : isSuccess ? (
                        <div className="space-y-3" data-cc-send-success="true">
                            <div className="flex items-start gap-2.5">
                                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-alloy-juniper/15 text-alloy-juniper">
                                    <Check className="h-4 w-4" strokeWidth={2.5} />
                                </span>
                                <div>
                                    <p id="cc-send-confirm-title" className="text-[15px] font-semibold tracking-tight text-alloy-midnight">
                                        {ackTitle}
                                    </p>
                                    <p className="mt-1 text-[13px] text-alloy-midnight/55">{ackDetail}</p>
                                </div>
                            </div>
                            <div className="flex justify-end pt-1">
                                <button
                                    type="button"
                                    onClick={onDone}
                                    className={MESSAGING_MODAL_PRIMARY_BUTTON_CLASS}
                                    data-cc-send-done="true"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>,
        document.body,
    );
}
