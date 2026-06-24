"use client";

import { BarChart3, X } from "lucide-react";

import AdminV2WorkspaceBosModalShell from "@/app/adminV2/components/AdminV2WorkspaceBosModalShell";
import AnalyticsWorkspacePanel from "@/app/adminV2/analytics/AnalyticsWorkspacePanel";
import { OIP_SECONDARY_BTN_CLASS } from "@/app/adminV2/analytics/oipWorkspaceUi";

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
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-alloy-midnight/10 bg-white px-4 py-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 shrink-0 text-alloy-juniper" aria-hidden strokeWidth={2} />
                            <h2 id="adminv2-analytics-modal-title" className="text-sm font-semibold text-alloy-midnight">
                                Operational Intelligence
                            </h2>
                        </div>
                        <p className="mt-1 text-xs text-alloy-midnight/55">
                            Operational command center — enrollment, communications, forms, and operations.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className={`${OIP_SECONDARY_BTN_CLASS} inline-flex shrink-0 items-center gap-1 !px-2 !py-1 text-[11px]`}
                        aria-label="Close Operational Intelligence"
                    >
                        <X className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
                        Close
                    </button>
                </div>
                <AnalyticsWorkspacePanel onRequestClose={onClose} />
            </div>
        </AdminV2WorkspaceBosModalShell>
    );
}
