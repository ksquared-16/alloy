"use client";

import { useEffect } from "react";
import { BarChart3, X } from "lucide-react";

import AdminV2WorkspaceBosModalShell from "@/app/adminV2/components/AdminV2WorkspaceBosModalShell";
import AnalyticsWorkspacePanel from "@/app/adminV2/analytics/AnalyticsWorkspacePanel";

export type AnalyticsModalProps = {
    open: boolean;
    onClose: () => void;
};

export default function AnalyticsModal({ open, onClose }: AnalyticsModalProps) {
    useEffect(() => {
        if (!open) return;
    }, [open]);

    return (
        <AdminV2WorkspaceBosModalShell
            open={open}
            onClose={onClose}
            dataModalAttr="adminv2-analytics-modal"
            ariaLabelledBy="adminv2-analytics-modal-title"
            panelClassName="max-h-[min(92vh,56rem)]"
        >
            <div
                className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-alloy-stone/18 bg-[#f7f6f3]"
                data-adminv2-analytics-modal="true"
            >
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-alloy-stone/15 bg-white px-4 py-3.5 sm:px-5">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <BarChart3
                                className="h-4 w-4 shrink-0 text-alloy-midnight/65"
                                aria-hidden
                                strokeWidth={2}
                            />
                            <h2 id="adminv2-analytics-modal-title" className="text-sm font-semibold text-alloy-midnight">
                                Analytics
                            </h2>
                        </div>
                        <p className="mt-1 text-xs text-alloy-midnight/55">
                            Operational intelligence — live metrics from MetricEngine (rolling 30 days).
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-alloy-stone/20 px-2 py-1 text-[11px] font-semibold text-alloy-forge hover:bg-alloy-stone/[0.06]"
                        aria-label="Close analytics"
                    >
                        <X className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
                        Close
                    </button>
                </div>
                <AnalyticsWorkspacePanel />
            </div>
        </AdminV2WorkspaceBosModalShell>
    );
}
