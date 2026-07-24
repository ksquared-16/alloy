"use client";

/**
 * Scheduling — a workspace modal (like Processing / Inbox), opened from the left nav.
 * The full Scheduling Workspace surface (Overview · Roster · Attendance) renders inside
 * the shared workspace-modal shell rather than a standalone route.
 */
import AdminV2WorkspaceBosModalShell from "@/app/adminV2/components/AdminV2WorkspaceBosModalShell";
import SchedulingWorkspace from "@/components/adminV2/scheduling/SchedulingWorkspace";

export default function SchedulingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
        <AdminV2WorkspaceBosModalShell
            open={open}
            onClose={onClose}
            dataModalAttr="adminv2-scheduling-modal"
            ariaLabelledBy="scheduling-workspace-title"
            panelClassName="max-h-[min(94vh,56rem)]"
        >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-adminv2-scheduling-modal="true">
                <SchedulingWorkspace onClose={onClose} />
            </div>
        </AdminV2WorkspaceBosModalShell>
    );
}
