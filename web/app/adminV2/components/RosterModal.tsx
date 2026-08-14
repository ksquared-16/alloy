"use client";

/**
 * Roster — workspace modal (like Processing / Inbox / Assignments), opened from
 * the left nav. Hosts the operating plan (Roster) and its actuality mode
 * (Attendance) in the shared workspace-modal shell.
 */
import AdminV2WorkspaceBosModalShell from "@/app/adminV2/components/AdminV2WorkspaceBosModalShell";
import RosterWorkspace from "@/components/adminV2/roster/RosterWorkspace";

export default function RosterModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
        <AdminV2WorkspaceBosModalShell
            open={open}
            onClose={onClose}
            dataModalAttr="adminv2-roster-modal"
            ariaLabelledBy="roster-workspace-title"
            panelClassName="max-h-[min(94vh,56rem)]"
        >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-adminv2-roster-modal="true">
                <RosterWorkspace onClose={onClose} />
            </div>
        </AdminV2WorkspaceBosModalShell>
    );
}
