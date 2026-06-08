"use client";

import { useEffect, useMemo, useState } from "react";

import { buildScheduleSendBody, COMMUNICATION_SCHEDULED_SENDS_URL } from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import type { ComposerChannel } from "@/components/adminV2/messaging/ComposerChannelToggle";
import {
    MESSAGING_MODAL_BODY_CLASS,
    MESSAGING_MODAL_HEADER_CLASS,
    MESSAGING_MODAL_PANEL_CLASS,
    MESSAGING_MODAL_PRIMARY_BUTTON_CLASS,
    MESSAGING_MODAL_SECONDARY_BUTTON_CLASS,
} from "@/lib/adminV2/messaging/messagingComposerModalChrome";
import type { MessagingScheduleContext } from "@/lib/adminV2/messaging/messagingComposerScheduleContext";
import {
    combineLocalDateAndTime,
    defaultScheduleDateAndTime,
} from "@/lib/adminV2/messaging/messagingLocalDateTime";

type ComposerScheduleSendModalProps = {
    open: boolean;
    onClose: () => void;
    channel: ComposerChannel;
    subject: string;
    body: string;
    scheduleContext: MessagingScheduleContext;
    onScheduled?: () => void;
};

const DEFAULT_EMAIL_SUBJECT = "Follow up";

export default function ComposerScheduleSendModal({
    open,
    onClose,
    channel,
    subject,
    body,
    scheduleContext,
    onScheduled,
}: ComposerScheduleSendModalProps) {
    const [dateLocal, setDateLocal] = useState(() => defaultScheduleDateAndTime().date);
    const [timeLocal, setTimeLocal] = useState(() => defaultScheduleDateAndTime().time);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [okNote, setOkNote] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        const defaults = defaultScheduleDateAndTime();
        setDateLocal(defaults.date);
        setTimeLocal(defaults.time);
        setBusy(false);
        setError(null);
        setOkNote(null);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    const scheduledAt = useMemo(() => combineLocalDateAndTime(dateLocal, timeLocal), [dateLocal, timeLocal]);

    const canSubmit = useMemo(() => {
        if (!scheduleContext.ok) return false;
        if (!body.trim()) return false;
        if (!scheduledAt) return false;
        return scheduledAt.getTime() > Date.now();
    }, [body, scheduleContext.ok, scheduledAt]);

    const onSubmit = async () => {
        if (!scheduleContext.ok) return;
        if (!scheduledAt || scheduledAt.getTime() <= Date.now()) {
            setError("Choose a future date and time in your local timezone.");
            return;
        }
        if (!body.trim()) {
            setError("Write a message before scheduling.");
            return;
        }

        setBusy(true);
        setError(null);
        setOkNote(null);
        try {
            const resolvedSubject = subject.trim() || DEFAULT_EMAIL_SUBJECT;
            const payload = buildScheduleSendBody({
                entityId: scheduleContext.entityId,
                recipientPersonId: scheduleContext.recipientPersonId,
                channel,
                bodySnapshot: body.trim(),
                subjectSnapshot: channel === "email" ? resolvedSubject : null,
                scheduledForIso: scheduledAt.toISOString(),
                proposalId: null,
            });
            payload.metadata = {
                ...payload.metadata,
                messaging_v2_composer: true,
            };

            const res = await fetch(COMMUNICATION_SCHEDULED_SENDS_URL, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
            if (!res.ok) {
                throw new Error(json.message ?? json.error ?? `Schedule failed (${res.status})`);
            }
            setOkNote("Send scheduled. It will enqueue at the chosen time via process-due.");
            onScheduled?.();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Schedule failed");
        } finally {
            setBusy(false);
        }
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-alloy-midnight/40 px-3 py-6"
            data-adminv2-composer-schedule-modal="true"
        >
            <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="composer-schedule-title"
                className={`${MESSAGING_MODAL_PANEL_CLASS} max-w-md`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={MESSAGING_MODAL_HEADER_CLASS}>
                    <p id="composer-schedule-title" className="text-sm font-semibold text-alloy-midnight">
                        Send later
                    </p>
                    <p className="mt-0.5 text-[11px] leading-snug text-alloy-midnight/55">
                        Pick a local date and time. Your draft subject and body stay in the composer.
                    </p>
                </div>

                <div className={MESSAGING_MODAL_BODY_CLASS}>
                    {!scheduleContext.ok ? (
                        <div className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-[11px] leading-snug text-amber-950/90">
                            <p className="font-semibold">{scheduleContext.reason}</p>
                            <p className="mt-1 text-amber-900/80">{scheduleContext.technicalGap}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-2">
                            <label className="block space-y-1">
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#007a62]/80">
                                    Date
                                </span>
                                <input
                                    type="date"
                                    value={dateLocal}
                                    onChange={(e) => setDateLocal(e.target.value)}
                                    disabled={busy}
                                    className="w-full rounded-lg border border-[#00A283]/20 bg-white px-2 py-1.5 text-[12px] text-alloy-midnight/85 focus:border-[#00A283]/45 focus:outline-none focus:ring-1 focus:ring-[#00A283]/20"
                                />
                            </label>
                            <label className="block space-y-1">
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#007a62]/80">
                                    Time
                                </span>
                                <input
                                    type="time"
                                    value={timeLocal}
                                    onChange={(e) => setTimeLocal(e.target.value)}
                                    disabled={busy}
                                    className="w-full rounded-lg border border-[#00A283]/20 bg-white px-2 py-1.5 text-[12px] text-alloy-midnight/85 focus:border-[#00A283]/45 focus:outline-none focus:ring-1 focus:ring-[#00A283]/20"
                                />
                            </label>
                        </div>
                    )}

                    {error ? <p className="mt-2 text-[11px] text-red-700/90">{error}</p> : null}
                    {okNote ? <p className="mt-2 text-[11px] text-[#007a62]">{okNote}</p> : null}

                    <div className="mt-4 flex justify-end gap-2">
                        <button type="button" onClick={onClose} className={MESSAGING_MODAL_SECONDARY_BUTTON_CLASS}>
                            Close
                        </button>
                        {scheduleContext.ok ? (
                            <button
                                type="button"
                                disabled={!canSubmit || busy}
                                onClick={() => void onSubmit()}
                                className={MESSAGING_MODAL_PRIMARY_BUTTON_CLASS}
                            >
                                {busy ? "Scheduling…" : "Schedule send"}
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}
