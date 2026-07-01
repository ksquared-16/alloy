"use client";

import { BarChart3 } from "lucide-react";

import AdminV2WorkspaceBosModalShell from "@/app/adminV2/components/AdminV2WorkspaceBosModalShell";
import OperationalModalHeader from "@/app/adminV2/components/OperationalModalHeader";
import AnalyticsWorkspacePanel from "@/app/adminV2/analytics/AnalyticsWorkspacePanel";

export type AnalyticsModalProps = {
    open: boolean;
    onClose: () => void;
};

export default function AnalyticsModal({ open, onClose }: AnalyticsModalProps) {
    return (
        <AdminV2WorkspaceBosModalShell
            open={open}
            onClose={onClose}
            dataModalAttr="adminv2-analytics-modal"
            ariaLabelledBy="adminv2-analytics-modal-title"
            panelClassName="max-h-[min(88vh,48rem)]"
        >
            <div
                className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-alloy-stone/20 bg-white"
                data-adminv2-analytics-modal="true"
            >
                <OperationalModalHeader
                    icon={<BarChart3 className="h-4 w-4" aria-hidden strokeWidth={2} />}
                    title="Operational Intelligence"
                    titleId="adminv2-analytics-modal-title"
                    onClose={onClose}
                    closeLabel="Close Operational Intelligence"
                />
                <AnalyticsWorkspacePanel onRequestClose={onClose} />
            </div>
        </AdminV2WorkspaceBosModalShell>
    );
}
