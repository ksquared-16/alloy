"use client";

/**
 * Records — workspace modal (like Processing / Inbox / Assignments / Roster), opened from the left
 * nav. Hosts Staff and Children in the shared workspace-modal shell.
 */
import AdminV2WorkspaceBosModalShell from "@/app/adminV2/components/AdminV2WorkspaceBosModalShell";
import RecordsWorkspace from "@/components/adminV2/records/RecordsWorkspace";

export default function RecordsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
        <AdminV2WorkspaceBosModalShell
            open={open}
            onClose={onClose}
            dataModalAttr="adminv2-records-modal"
            ariaLabelledBy="records-workspace-title"
            panelClassName="max-h-[min(94vh,56rem)]"
        >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-adminv2-records-modal="true">
                <RecordsWorkspace onClose={onClose} />
            </div>
        </AdminV2WorkspaceBosModalShell>
    );
}
