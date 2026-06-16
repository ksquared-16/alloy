"use client";

/**
 * POS-FP-W / FP-UI — POS Workspace (tabbed), converged onto the Communications doctrine.
 *
 * Mounts inside `AdminV2WorkspaceBosModalShell` (same shell as Inbox / My Tasks),
 * which preserves the operator's current workspace + the fixed BOS rail behind it.
 * Two tabs:
 *   • Processing — the operational queue (left) + case workspace (middle).
 *   • Sources    — where information enters Alloy (Forms, Packets, …) and feeds Processing.
 * BOS is owned by the shell rail (Processing renders nothing there). Read-only except
 * the FP5 approve action.
 */

import { useCallback, useState } from "react";
import { X } from "lucide-react";
import AdminV2WorkspaceBosModalShell from "@/app/adminV2/components/AdminV2WorkspaceBosModalShell";
import ProcessingQueueList from "@/app/adminV2/processing/ProcessingQueueList";
import ProcessingCaseDetailContent from "@/app/adminV2/processing/ProcessingCaseDetailContent";
import SourcesPanel from "@/app/adminV2/processing/SourcesPanel";

type PosTab = "processing" | "sources";

export default function ProcessingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
    const [tab, setTab] = useState<PosTab>("processing");

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
                        POS
                    </h2>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="inline-flex items-center gap-1 rounded-md border border-alloy-stone/20 px-2 py-1 text-[11px] font-semibold text-alloy-forge hover:bg-alloy-stone/[0.06]"
                        aria-label="Close POS"
                    >
                        <X className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
                        Close
                    </button>
                </div>

                <div className="flex shrink-0 items-center gap-1 border-b border-stone-200 bg-white px-3" role="tablist" aria-label="POS sections">
                    {(["processing", "sources"] as const).map((t) => (
                        <button
                            key={t}
                            type="button"
                            role="tab"
                            aria-selected={tab === t}
                            onClick={() => setTab(t)}
                            className={
                                tab === t
                                    ? "border-b-2 border-emerald-600 px-3 py-2 text-[12px] font-medium text-emerald-800"
                                    : "border-b-2 border-transparent px-3 py-2 text-[12px] text-stone-500 hover:text-stone-700"
                            }
                        >
                            {t === "processing" ? "Processing" : "Sources"}
                        </button>
                    ))}
                </div>

                {tab === "processing" ? (
                    <div className="grid min-h-[min(26rem,68vh)] flex-1 grid-cols-[20rem_1fr] overflow-hidden">
                        <div className="min-h-0 overflow-y-auto border-r border-stone-200 bg-white">
                            <ProcessingQueueList
                                selectedCaseId={selectedCaseId}
                                onSelectCase={setSelectedCaseId}
                                onGoToSources={() => setTab("sources")}
                            />
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
                ) : (
                    <div className="min-h-[min(26rem,68vh)] flex-1 overflow-hidden">
                        <SourcesPanel />
                    </div>
                )}
            </div>
        </AdminV2WorkspaceBosModalShell>
    );
}
