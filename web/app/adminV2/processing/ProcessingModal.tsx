"use client";

/**
 * POS-FP-W — Processing Workspace, converged onto the Communications doctrine.
 *
 * Mounts inside `AdminV2WorkspaceBosModalShell` (same shell as Inbox / My Tasks),
 * which preserves the operator's current workspace + the fixed BOS rail behind it.
 * Three-column operational workspace: LEFT = the FP3 queue (`ProcessingQueueList`);
 * MIDDLE = the FP4 case detail (`ProcessingCaseDetailContent`); RIGHT = BOS, owned
 * by the shell (Processing renders nothing there). Pure overlay — no URL change,
 * context preserved. Read-only; no review/resolution/outcome/BOS logic.
 */

import { useCallback, useState } from "react";
import { X } from "lucide-react";
import AdminV2WorkspaceBosModalShell from "@/app/adminV2/components/AdminV2WorkspaceBosModalShell";
import ProcessingQueueList from "@/app/adminV2/processing/ProcessingQueueList";
import ProcessingCaseDetailContent from "@/app/adminV2/processing/ProcessingCaseDetailContent";

export default function ProcessingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

    // Reset selection on close (event handler — not an effect) so reopening starts clean.
    const handleClose = useCallback(() => {
        setSelectedCaseId(null);
        onClose();
    }, [onClose]);

    return (
        <AdminV2WorkspaceBosModalShell
            open={open}
            onClose={handleClose}
            dataModalAttr="adminv2-processing-modal"
            ariaLabelledBy="adminv2-processing-modal-title"
            panelClassName="max-h-[min(88vh,46rem)]"
        >
            <div
                className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-alloy-stone/18 bg-[#f7f6f3]"
                data-adminv2-processing-modal="true"
            >
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-alloy-stone/15 bg-white px-3 py-2.5">
                    <h2 id="adminv2-processing-modal-title" className="text-sm font-semibold text-alloy-midnight">
                        Processing
                    </h2>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="inline-flex items-center gap-1 rounded-md border border-alloy-stone/20 px-2 py-1 text-[11px] font-semibold text-alloy-forge hover:bg-alloy-stone/[0.06]"
                        aria-label="Close processing"
                    >
                        <X className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
                        Close
                    </button>
                </div>
                <div className="grid min-h-[min(26rem,68vh)] flex-1 grid-cols-[20rem_1fr] overflow-hidden">
                    <div className="min-h-0 overflow-y-auto border-r border-stone-200 bg-white">
                        <ProcessingQueueList selectedCaseId={selectedCaseId} onSelectCase={setSelectedCaseId} />
                    </div>
                    <div className="min-h-0 overflow-hidden bg-white">
                        {selectedCaseId ? (
                            <ProcessingCaseDetailContent caseId={selectedCaseId} />
                        ) : (
                            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                                <div className="text-sm font-medium text-stone-600">Select a case to start</div>
                                <p className="mx-auto mt-1 max-w-[20rem] text-xs leading-relaxed text-stone-400">
                                    Pick a case from the queue to review its source, proposed values, and destination — then approve the action to hand it off to the record.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </AdminV2WorkspaceBosModalShell>
    );
}
