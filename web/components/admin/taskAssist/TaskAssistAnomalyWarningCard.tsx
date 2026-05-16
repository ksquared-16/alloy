"use client";

import type { OperationalAnomalyWarning } from "@/lib/agent/taskAssist/taskAssistOperationalAnomalies";

export type TaskAssistAnomalyWarningCardProps = {
    warning: OperationalAnomalyWarning;
    busy?: boolean;
    onKeepBoth: () => void;
    onCancel: () => void;
};

export default function TaskAssistAnomalyWarningCard({
    warning,
    busy,
    onKeepBoth,
    onCancel,
}: TaskAssistAnomalyWarningCardProps) {
    return (
        <div
            className="space-y-2 rounded-md border border-amber-200/80 bg-amber-50/90 p-2.5 text-[11px]"
            data-task-assist-anomaly-warning="true"
        >
            <p className="font-medium text-amber-950/95">{warning.message}</p>
            <div className="flex flex-wrap gap-1.5">
                <button
                    type="button"
                    disabled={busy}
                    className="rounded-md bg-alloy-midnight/90 px-2.5 py-1 text-[10px] font-semibold text-white disabled:opacity-45"
                    data-task-assist-anomaly-keep="true"
                    onClick={onKeepBoth}
                >
                    Keep both
                </button>
                <button
                    type="button"
                    disabled={busy}
                    title="Coming soon"
                    className="rounded-md border border-alloy-stone/30 px-2.5 py-1 text-[10px] font-semibold opacity-40 cursor-not-allowed"
                    data-task-assist-anomaly-update="true"
                >
                    Update existing
                </button>
                <button
                    type="button"
                    disabled={busy}
                    className="rounded-md border border-alloy-stone/30 px-2.5 py-1 text-[10px] font-semibold disabled:opacity-45"
                    data-task-assist-anomaly-cancel="true"
                    onClick={onCancel}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}
