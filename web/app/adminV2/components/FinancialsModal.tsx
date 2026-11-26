"use client";

/**
 * Financials — workspace modal, opened from the left nav like Processing, Inbox and Operations.
 *
 * The same shared modal shell every other operational workspace is hosted in. Financials introduces
 * no modal hierarchy of its own: a second one would be a second answer to how a workspace opens.
 */
import AdminV2WorkspaceBosModalShell from "@/app/adminV2/components/AdminV2WorkspaceBosModalShell";
import FinancialsWorkspaceContainer from "@/app/adminV2/financials/FinancialsWorkspaceContainer";

export default function FinancialsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
        <AdminV2WorkspaceBosModalShell
            open={open}
            onClose={onClose}
            dataModalAttr="adminv2-financials-modal"
            ariaLabelledBy="financials-workspace-title"
            panelClassName="max-h-[min(94vh,56rem)]"
        >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-adminv2-financials-modal="true">
                <FinancialsWorkspaceContainer onClose={onClose} />
            </div>
        </AdminV2WorkspaceBosModalShell>
    );
}
