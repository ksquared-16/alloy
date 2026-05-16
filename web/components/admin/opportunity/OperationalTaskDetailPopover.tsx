"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

import Link from "next/link";

import { formatTaskAssistClientError } from "@/lib/agent/taskAssist/taskAssistClientErrorMessages";
import { patchOperationalTaskStatus, readJson } from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";

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

export type OperationalTaskDetailPopoverProps = {
    task: OperationalTaskDetail;
    anchorRef: RefObject<HTMLElement | null>;
    onClose: () => void;
    onUpdated: () => void;
    onViewTask?: () => void;
};

export default function OperationalTaskDetailPopover({
    task,
    anchorRef,
    onClose,
    onUpdated,
    onViewTask,
}: OperationalTaskDetailPopoverProps) {
    const panelRef = useRef<HTMLDivElement>(null);

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

    const onPatch = useCallback(
        async (status: "completed" | "canceled") => {
            try {
                const res = await patchOperationalTaskStatus(task.id, status);
                const json = await readJson<{ ok?: boolean; error?: string; message?: string }>(res);
                if (!res.ok || !json.ok) throw new Error(formatTaskAssistClientError(json.message || json.error, json.error));
                onUpdated();
                onClose();
            } catch (e: unknown) {
                console.error("[OperationalTaskDetailPopover]", e);
            }
        },
        [task.id, onClose, onUpdated]
    );

    const open = task.status === "open";
    const linkedLabel = task.entity_label?.trim() || "Linked record";

    return (
        <div
            ref={panelRef}
            role="dialog"
            aria-label="Task details"
            data-operational-task-popover="true"
            className="absolute right-0 top-full z-50 mt-1 w-[min(100vw-2rem,18rem)] rounded-lg border border-alloy-stone/20 bg-white p-2.5 text-[11px] shadow-lg ring-1 ring-alloy-stone/10"
        >
            <p className="font-semibold text-alloy-midnight/90">{task.title}</p>
            <dl className="mt-1.5 space-y-0.5 text-alloy-midnight/70">
                <div className="flex justify-between gap-2">
                    <dt className="text-alloy-midnight/50">Due</dt>
                    <dd className="text-right font-medium">{formatWhen(task.due_at)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                    <dt className="text-alloy-midnight/50">Status</dt>
                    <dd className="capitalize">{task.status}</dd>
                </div>
                <div className="flex justify-between gap-2">
                    <dt className="text-alloy-midnight/50">Source</dt>
                    <dd>{task.source}</dd>
                </div>
                <div className="flex justify-between gap-2">
                    <dt className="text-alloy-midnight/50">Linked</dt>
                    <dd className="max-w-[10rem] truncate text-right">{linkedLabel}</dd>
                </div>
                {task.created_at ? (
                    <div className="flex justify-between gap-2">
                        <dt className="text-alloy-midnight/50">Created</dt>
                        <dd className="text-right">{formatWhen(task.created_at)}</dd>
                    </div>
                ) : null}
            </dl>
            {task.description?.trim() ? (
                <p className="mt-1.5 rounded border border-alloy-stone/15 bg-alloy-stone/[0.04] px-2 py-1 text-[10px] text-alloy-midnight/75">
                    {task.description.trim()}
                </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
                {open ? (
                    <>
                        <button
                            type="button"
                            className="rounded-md bg-alloy-midnight/90 px-2 py-1 text-[10px] font-semibold text-white"
                            onClick={() => void onPatch("completed")}
                        >
                            Mark complete
                        </button>
                        <button
                            type="button"
                            className="rounded-md border border-alloy-stone/30 px-2 py-1 text-[10px] font-semibold"
                            onClick={() => void onPatch("canceled")}
                        >
                            Dismiss
                        </button>
                    </>
                ) : null}
                {onViewTask ? (
                    <button
                        type="button"
                        className="rounded-md border border-alloy-stone/30 px-2 py-1 text-[10px] font-semibold text-alloy-blue"
                        onClick={onViewTask}
                    >
                        View task
                    </button>
                ) : null}
                <Link
                    href="/adminV2/tasks"
                    className="rounded-md px-2 py-1 text-[10px] font-semibold text-alloy-midnight/60 hover:text-alloy-midnight"
                >
                    All tasks
                </Link>
            </div>
        </div>
    );
}
