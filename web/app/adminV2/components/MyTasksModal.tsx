"use client";

import { useEffect, useState } from "react";
import { ListChecks, Plus } from "lucide-react";

import AdminV2WorkspaceBosModalShell from "@/app/adminV2/components/AdminV2WorkspaceBosModalShell";
import OperationalModalHeader, {
    OPERATIONAL_PRIMARY_ACTION_CLASS,
} from "@/app/adminV2/components/OperationalModalHeader";
import MyTasksPanel from "@/app/adminV2/components/MyTasksPanel";
import CompactKpiStrip, { type CompactKpiItem } from "@/components/workspace/CompactKpiStrip";
import { fetchOperationalTasksSummary, readJson } from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";

export type MyTasksModalProps = {
    open: boolean;
    onClose: () => void;
};

type TaskCounts = { open: number; due_soon: number; overdue: number };

export default function MyTasksModal({ open, onClose }: MyTasksModalProps) {
    const [counts, setCounts] = useState<TaskCounts | null>(null);
    // Header "New task" is the doctrinal primary action. The create form + all its state
    // live in MyTasksPanel (and the standalone /adminV2/tasks page); bumping this nonce asks
    // the panel to open its create form. No task logic moves out of the panel.
    const [newTaskNonce, setNewTaskNonce] = useState(0);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetchOperationalTasksSummary();
                const json = await readJson<{ ok?: boolean; counts?: TaskCounts }>(res);
                if (!cancelled && res.ok && json.ok && json.counts) {
                    setCounts(json.counts);
                }
            } catch {
                /* non-fatal */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open]);

    // Compact status strip — same primitive + semantics as Processing / Communications.
    // Real counts from the existing summary endpoint; never fabricated.
    const kpiItems: CompactKpiItem[] = [
        { key: "open", label: "Open", value: String(counts?.open ?? 0), state: "neutral" },
        { key: "due_soon", label: "Due soon", value: String(counts?.due_soon ?? 0), state: "pending" },
        { key: "overdue", label: "Overdue", value: String(counts?.overdue ?? 0), state: "attention" },
    ];

    return (
        <AdminV2WorkspaceBosModalShell
            open={open}
            onClose={onClose}
            dataModalAttr="adminv2-tasks-modal"
            ariaLabelledBy="adminv2-tasks-modal-title"
            panelClassName="max-h-[min(92vh,56rem)]"
        >
            <div
                className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-alloy-stone/18 bg-white"
                data-adminv2-tasks-modal="true"
            >
                <OperationalModalHeader
                    icon={<ListChecks className="h-4 w-4" aria-hidden strokeWidth={2} />}
                    title="Work Items"
                    titleId="adminv2-tasks-modal-title"
                    onClose={onClose}
                    actions={
                        <button
                            type="button"
                            data-adminv2-new-task="true"
                            className={OPERATIONAL_PRIMARY_ACTION_CLASS}
                            onClick={() => setNewTaskNonce((n) => n + 1)}
                        >
                            <Plus className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
                            New task
                        </button>
                    }
                />
                <CompactKpiStrip items={kpiItems} loading={counts === null} ariaLabel="Work Items status" data-adminv2-tasks-summary="true" />
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3 sm:px-5 sm:py-4">
                    <MyTasksPanel compact onClose={onClose} requestCreateNonce={newTaskNonce} />
                </div>
            </div>
        </AdminV2WorkspaceBosModalShell>
    );
}
