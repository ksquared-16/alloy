"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { formatTaskAssistClientError } from "@/lib/agent/taskAssist/taskAssistClientErrorMessages";
import { scheduledSendUrgencyBadge } from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";
import {
    scheduledSendAttentionHeadline,
    scheduledSendCanCancel,
    scheduledSendCanEditContent,
    scheduledSendCanProcessNow,
    scheduledSendCanReschedule,
} from "@/lib/agent/taskAssist/taskAssistScheduledSendPresentation";
import {
    cancelCommunicationScheduledSend,
    patchCommunicationScheduledSend,
    processDueCommunicationScheduledSends,
    readJson,
} from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import { minDatetimeLocalValue } from "@/components/admin/taskAssist/TaskAssistOpportunityWorkspace";

export type ScheduledSendDetail = {
    id: string;
    channel: "sms" | "email";
    status: string;
    scheduled_for: string;
    body_snapshot: string;
    subject_snapshot: string | null;
    recipient_person_id: string;
    entity_id: string;
    entity_label?: string | null;
    metadata?: Record<string, unknown> | null;
};

function formatWhen(iso: string): string {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return iso;
    return new Date(t).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function schedToLocalInput(iso: string): string {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return "";
    const d = new Date(t);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type ScheduledSendDetailPopoverProps = {
    send: ScheduledSendDetail;
    anchorRef: RefObject<HTMLElement | null>;
    onClose: () => void;
    onUpdated: () => void;
};

export default function ScheduledSendDetailPopover({
    send,
    anchorRef,
    onClose,
    onUpdated,
}: ScheduledSendDetailPopoverProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const [editing, setEditing] = useState(false);
    const [schedLocal, setSchedLocal] = useState(schedToLocalInput(send.scheduled_for));
    const [body, setBody] = useState(send.body_snapshot);
    const [subject, setSubject] = useState(send.subject_snapshot ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const badge = scheduledSendUrgencyBadge(send);
    const headline = scheduledSendAttentionHeadline(badge.urgency, send.metadata);
    const canEdit = scheduledSendCanEditContent(send.status);
    const canReschedule = scheduledSendCanReschedule(send.status, send.scheduled_for);
    const canCancel = scheduledSendCanCancel(send.status);
    const canProcessNow = scheduledSendCanProcessNow(send.status, send.scheduled_for);
    const linkedLabel = send.entity_label?.trim() || "Linked record";
    const isEmail = send.channel === "email";

    useEffect(() => {
        setSchedLocal(schedToLocalInput(send.scheduled_for));
        setBody(send.body_snapshot);
        setSubject(send.subject_snapshot ?? "");
        setEditing(false);
        setError(null);
    }, [send.id, send.scheduled_for, send.body_snapshot, send.subject_snapshot, send.status]);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            const t = e.target as Node;
            if (panelRef.current?.contains(t)) return;
            if (anchorRef.current?.contains(t)) return;
            onClose();
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, [anchorRef, onClose]);

    const onCancel = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await cancelCommunicationScheduledSend(send.id);
            const json = await readJson<{ ok?: boolean; error?: string; message?: string }>(res);
            if (!res.ok || !json.ok) throw new Error(formatTaskAssistClientError(json.message || json.error, json.error));
            onUpdated();
            onClose();
        } catch (e: unknown) {
            setError(formatTaskAssistClientError((e as Error).message));
        } finally {
            setBusy(false);
        }
    }, [onClose, onUpdated, send.id]);

    const onSave = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await patchCommunicationScheduledSend(send.id, {
                scheduled_for: new Date(schedLocal).toISOString(),
                body_snapshot: body.trim(),
                subject_snapshot: isEmail ? subject.trim() : null,
            });
            const json = await readJson<{ ok?: boolean; error?: string; message?: string }>(res);
            if (!res.ok || !json.ok) throw new Error(formatTaskAssistClientError(json.message || json.error, json.error));
            setEditing(false);
            onUpdated();
        } catch (e: unknown) {
            setError(formatTaskAssistClientError((e as Error).message));
        } finally {
            setBusy(false);
        }
    }, [body, isEmail, onUpdated, schedLocal, send.id, subject]);

    const onProcessNow = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await processDueCommunicationScheduledSends(25);
            const json = await readJson<{ ok?: boolean; error?: string; message?: string }>(res);
            if (!res.ok || !json.ok) throw new Error(formatTaskAssistClientError(json.message || json.error, json.error));
            onUpdated();
        } catch (e: unknown) {
            setError(formatTaskAssistClientError((e as Error).message));
        } finally {
            setBusy(false);
        }
    }, [onUpdated]);

    const showEditActions = canEdit || canReschedule;

    return (
        <div
            ref={panelRef}
            role="dialog"
            aria-label="Scheduled message details"
            data-scheduled-send-popover="true"
            className="absolute right-0 top-full z-50 mt-1 w-[min(100vw-2rem,22rem)] rounded-lg border border-alloy-stone/20 bg-white p-2.5 text-[11px] shadow-lg ring-1 ring-alloy-stone/10"
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="font-semibold leading-snug text-alloy-midnight/90">
                        {isEmail ? "Scheduled email" : "Scheduled SMS"}
                    </p>
                    <p className="mt-0.5 text-[10px] text-alloy-midnight/60">Delivery · not a human task</p>
                </div>
                <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${badge.className}`}>
                    {badge.label}
                </span>
            </div>

            {headline ? (
                <p className="mt-1.5 rounded border border-amber-200/60 bg-amber-50/80 px-2 py-1 text-[10px] leading-snug text-amber-950/90">
                    {headline}
                </p>
            ) : null}

            {editing ? (
                <div className="mt-2 space-y-1.5">
                    <label className="block text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                        Send at
                    </label>
                    <input
                        type="datetime-local"
                        value={schedLocal}
                        min={minDatetimeLocalValue()}
                        onChange={(e) => setSchedLocal(e.target.value)}
                        className="w-full rounded border border-alloy-stone/25 px-2 py-1 text-[11px]"
                    />
                    {isEmail ? (
                        <>
                            <label className="block text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                                Subject
                            </label>
                            <input
                                type="text"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                className="w-full rounded border border-alloy-stone/25 px-2 py-1 text-[11px]"
                            />
                        </>
                    ) : null}
                    <label className="block text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                        Message
                    </label>
                    <textarea
                        rows={3}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        className="w-full resize-y rounded border border-alloy-stone/25 px-2 py-1 text-[10px]"
                    />
                </div>
            ) : (
                <>
                    <p className="mt-1 text-[10px] font-medium text-alloy-midnight/70">Send {formatWhen(send.scheduled_for)}</p>
                    <p className="mt-1 text-[10px] text-alloy-midnight/65">
                        <span className="text-alloy-midnight/45">Linked · </span>
                        {linkedLabel}
                    </p>
                    <p className="mt-1 text-[10px] text-alloy-midnight/65">
                        <span className="text-alloy-midnight/45">Recipient · </span>
                        {send.recipient_person_id.slice(0, 8)}…
                    </p>
                    {isEmail && send.subject_snapshot?.trim() ? (
                        <p className="mt-1 text-[10px] font-medium text-alloy-midnight/75">Subject: {send.subject_snapshot.trim()}</p>
                    ) : null}
                    <p className="mt-1.5 line-clamp-4 rounded border border-alloy-stone/15 bg-alloy-stone/[0.04] px-2 py-1 text-[10px] leading-snug text-alloy-midnight/75">
                        {send.body_snapshot.trim()}
                    </p>
                    <p className="mt-1 text-[9px] text-alloy-midnight/45">Status: {send.status}</p>
                </>
            )}

            {error ? (
                <p className="mt-1 text-[10px] font-medium text-red-800/90" role="alert">
                    {error}
                </p>
            ) : null}

            <div className="mt-2 flex flex-wrap gap-1.5">
                {showEditActions && !editing ? (
                    <button
                        type="button"
                        className="rounded-md border border-alloy-stone/30 px-2 py-1 text-[10px] font-semibold text-alloy-blue"
                        onClick={() => setEditing(true)}
                    >
                        {canReschedule && !canEdit ? "Edit & reschedule" : "Edit"}
                    </button>
                ) : null}
                {editing ? (
                    <>
                        <button
                            type="button"
                            disabled={busy}
                            className="rounded-md bg-alloy-midnight/90 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-45"
                            onClick={() => void onSave()}
                        >
                            Save
                        </button>
                        <button
                            type="button"
                            className="rounded-md border border-alloy-stone/30 px-2 py-1 text-[10px] font-semibold"
                            onClick={() => setEditing(false)}
                        >
                            Cancel
                        </button>
                    </>
                ) : null}
                {canProcessNow && !editing ? (
                    <button
                        type="button"
                        disabled={busy}
                        className="rounded-md border border-violet-300/80 bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-950 disabled:opacity-45"
                        onClick={() => void onProcessNow()}
                    >
                        Process now
                    </button>
                ) : null}
                {canCancel && !editing ? (
                    <button
                        type="button"
                        disabled={busy}
                        className="rounded-md border border-alloy-stone/30 px-2 py-1 text-[10px] font-semibold text-red-800/90 disabled:opacity-45"
                        onClick={() => void onCancel()}
                    >
                        Cancel send
                    </button>
                ) : null}
            </div>
        </div>
    );
}
