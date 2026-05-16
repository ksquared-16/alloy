"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { ADMIN_V2_OPEN_TASKS_MODAL } from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import { formatTaskAssistClientError } from "@/lib/agent/taskAssist/taskAssistClientErrorMessages";
import { operationalTaskUrgencyBadge } from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";
import { patchOperationalTaskFields, patchOperationalTaskStatus, readJson } from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import { minDatetimeLocalValue } from "@/components/admin/taskAssist/TaskAssistOpportunityWorkspace";

export type OperationalTaskDetail = {
    id: string;
    title: string;
    description: string | null;
    due_at: string;
    status: string;
    source: string;
    entity_id: string;
    entity_type: string;
    created_at?: string;
    created_by?: string;
    entity_label?: string | null;
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

function dueToLocalInput(iso: string): string {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return "";
    const d = new Date(t);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type OperationalTaskDetailPopoverProps = {
    task: OperationalTaskDetail;
    anchorRef: RefObject<HTMLElement | null>;
    onClose: () => void;
    onUpdated: () => void;
};

export default function OperationalTaskDetailPopover({
    task,
    anchorRef,
    onClose,
    onUpdated,
}: OperationalTaskDetailPopoverProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState(task.title);
    const [dueLocal, setDueLocal] = useState(dueToLocalInput(task.due_at));
    const [notes, setNotes] = useState(task.description ?? "");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setTitle(task.title);
        setDueLocal(dueToLocalInput(task.due_at));
        setNotes(task.description ?? "");
        setEditing(false);
        setError(null);
    }, [task.id, task.title, task.due_at, task.description]);

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

    const badge = operationalTaskUrgencyBadge(task);
    const open = task.status === "open";
    const linkedLabel = task.entity_label?.trim() || "Linked record";

    const onPatch = useCallback(
        async (status: "completed" | "canceled") => {
            setBusy(true);
            setError(null);
            try {
                const res = await patchOperationalTaskStatus(task.id, status);
                const json = await readJson<{ ok?: boolean; error?: string; message?: string }>(res);
                if (!res.ok || !json.ok) throw new Error(formatTaskAssistClientError(json.message || json.error, json.error));
                onUpdated();
                onClose();
            } catch (e: unknown) {
                setError(formatTaskAssistClientError((e as Error).message));
            } finally {
                setBusy(false);
            }
        },
        [task.id, onClose, onUpdated]
    );

    const onSave = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await patchOperationalTaskFields(task.id, {
                title,
                description: notes.trim() || null,
                due_at: new Date(dueLocal).toISOString(),
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
    }, [dueLocal, notes, onUpdated, task.id, title]);

    const openAllTasks = useCallback(() => {
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent(ADMIN_V2_OPEN_TASKS_MODAL));
        }
        onClose();
    }, [onClose]);

    return (
        <div
            ref={panelRef}
            role="dialog"
            aria-label="Task details"
            data-operational-task-popover="true"
            className="absolute right-0 top-full z-50 mt-1 w-[min(100vw-2rem,20rem)] rounded-lg border border-alloy-stone/20 bg-white p-2.5 text-[11px] shadow-lg ring-1 ring-alloy-stone/10"
        >
            <div className="flex items-start justify-between gap-2">
                {editing ? (
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="min-w-0 flex-1 rounded border border-alloy-stone/25 px-2 py-1 text-[12px] font-semibold"
                    />
                ) : (
                    <p className="font-semibold leading-snug text-alloy-midnight/90">{task.title}</p>
                )}
                <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${badge.className}`}>
                    {badge.label}
                </span>
            </div>

            {editing ? (
                <div className="mt-2 space-y-1.5">
                    <label className="block text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Due</label>
                    <input
                        type="datetime-local"
                        value={dueLocal}
                        min={minDatetimeLocalValue()}
                        onChange={(e) => setDueLocal(e.target.value)}
                        className="w-full rounded border border-alloy-stone/25 px-2 py-1 text-[11px]"
                    />
                    <label className="block text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Notes</label>
                    <textarea
                        rows={2}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full resize-y rounded border border-alloy-stone/25 px-2 py-1 text-[10px]"
                    />
                </div>
            ) : (
                <>
                    <p className="mt-1 text-[10px] font-medium text-alloy-midnight/70">Due {formatWhen(task.due_at)}</p>
                    <p className="mt-1 text-[10px] text-alloy-midnight/65">
                        <span className="text-alloy-midnight/45">Linked · </span>
                        {linkedLabel}
                    </p>
                    {task.description?.trim() ? (
                        <p className="mt-1.5 rounded border border-alloy-stone/15 bg-alloy-stone/[0.04] px-2 py-1 text-[10px] leading-snug text-alloy-midnight/75">
                            {task.description.trim()}
                        </p>
                    ) : null}
                    <p className="mt-1 text-[9px] text-alloy-midnight/45">
                        {task.source}
                        {task.created_at ? ` · ${formatWhen(task.created_at)}` : ""}
                    </p>
                </>
            )}

            {error ? (
                <p className="mt-1 text-[10px] font-medium text-red-800/90" role="alert">
                    {error}
                </p>
            ) : null}

            <div className="mt-2 flex flex-wrap gap-1.5">
                {open && !editing ? (
                    <>
                        <button
                            type="button"
                            disabled={busy}
                            className="rounded-md bg-alloy-midnight/90 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-45"
                            onClick={() => void onPatch("completed")}
                        >
                            Mark complete
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            className="rounded-md border border-alloy-stone/30 px-2 py-1 text-[10px] font-semibold disabled:opacity-45"
                            onClick={() => void onPatch("canceled")}
                        >
                            Dismiss
                        </button>
                        <button
                            type="button"
                            className="rounded-md border border-alloy-stone/30 px-2 py-1 text-[10px] font-semibold text-alloy-blue"
                            onClick={() => setEditing(true)}
                            data-operational-task-edit="true"
                        >
                            Edit task
                        </button>
                    </>
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
                <button
                    type="button"
                    className="rounded-md px-2 py-1 text-[10px] font-semibold text-alloy-midnight/60 hover:text-alloy-midnight"
                    onClick={openAllTasks}
                >
                    All tasks
                </button>
            </div>
        </div>
    );
}
