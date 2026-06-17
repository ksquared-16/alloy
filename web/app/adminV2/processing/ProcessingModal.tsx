"use client";

/**
 * POS Workspace — the home for information entering Alloy.
 *
 * Mounts inside `AdminV2WorkspaceBosModalShell` (the SAME shell as Inbox / My
 * Tasks), which owns the modal geometry, placement, sizing and the fixed BOS
 * right rail behind it. This component ONLY changes the workspace *content*; it
 * does not touch the shell, so modal shape and right-rail sticky behavior are
 * preserved exactly. Mount point (TopNavBar) and the `dispatchAdminV2OpenProcessingModal`
 * open path are unchanged.
 *
 * Internal subnav (POS sections): Home · Processing · Sources · Forms · Packets ·
 * Documents · Settings. Forms is one Source; Processing is one workspace.
 *
 * Reuse map:
 *   • Processing → ProcessingQueueList + ProcessingCaseDetailContent (real)
 *   • Sources    → SourcesPanel (real)
 *   • Forms      → PosFormsPanel (real list via /api/admin/forms)
 *   • Home       → PosHome (real counts via /api/admin/processing/queue)
 *   • Packets / Documents / Settings → prototype surfaces (clearly marked)
 */

import { useCallback, useState } from "react";
import { X } from "lucide-react";
import AdminV2WorkspaceBosModalShell from "@/app/adminV2/components/AdminV2WorkspaceBosModalShell";
import ProcessingQueueList from "@/app/adminV2/processing/ProcessingQueueList";
import ProcessingCaseDetailContent from "@/app/adminV2/processing/ProcessingCaseDetailContent";
import SourcesPanel from "@/app/adminV2/processing/SourcesPanel";
import PosHome from "@/app/adminV2/pos/PosHome";
import PosFormsPanel from "@/app/adminV2/pos/PosFormsPanel";
import PosPacketsPanel from "@/app/adminV2/pos/PosPacketsPanel";
import PosDocumentsPanel from "@/app/adminV2/pos/PosDocumentsPanel";
import PosSettingsPanel from "@/app/adminV2/pos/PosSettingsPanel";
import { POS_SECTIONS, type PosSection } from "@/app/adminV2/pos/posSections";

export default function ProcessingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
    const [section, setSection] = useState<PosSection>("home");

    // Reset to a clean Home on close (event handler, not an effect) so reopening starts fresh.
    const handleClose = useCallback(() => {
        setSelectedCaseId(null);
        setSection("home");
        onClose();
    }, [onClose]);

    // Open a case from Home/anywhere: switch to Processing and select it.
    const openCase = useCallback((caseId: string) => {
        setSelectedCaseId(caseId);
        setSection("processing");
    }, []);

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
                {/* Title bar (unchanged geometry) */}
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

                {/* POS subnav */}
                <div
                    className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-stone-200 bg-white px-3"
                    role="tablist"
                    aria-label="POS sections"
                >
                    {POS_SECTIONS.map((s) => (
                        <button
                            key={s.key}
                            type="button"
                            role="tab"
                            aria-selected={section === s.key}
                            onClick={() => setSection(s.key)}
                            className={
                                section === s.key
                                    ? "whitespace-nowrap border-b-2 border-emerald-600 px-3 py-2 text-[12px] font-medium text-emerald-800"
                                    : "whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-[12px] text-stone-500 hover:text-stone-700"
                            }
                        >
                            {s.label}
                        </button>
                    ))}
                </div>

                {/* Section content (only this changes per section) */}
                {section === "home" ? (
                    <div className="min-h-[min(26rem,68vh)] flex-1 overflow-hidden">
                        <PosHome onNavigate={setSection} onOpenCase={openCase} />
                    </div>
                ) : section === "processing" ? (
                    <div className="grid min-h-[min(26rem,68vh)] flex-1 grid-cols-[20rem_1fr] overflow-hidden">
                        <div className="min-h-0 overflow-y-auto border-r border-stone-200 bg-white">
                            <ProcessingQueueList
                                selectedCaseId={selectedCaseId}
                                onSelectCase={setSelectedCaseId}
                                onGoToSources={() => setSection("forms")}
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
                ) : section === "sources" ? (
                    <div className="min-h-[min(26rem,68vh)] flex-1 overflow-hidden">
                        <SourcesPanel />
                    </div>
                ) : section === "forms" ? (
                    <div className="min-h-[min(26rem,68vh)] flex-1 overflow-hidden">
                        <PosFormsPanel />
                    </div>
                ) : section === "packets" ? (
                    <div className="min-h-[min(26rem,68vh)] flex-1 overflow-hidden">
                        <PosPacketsPanel />
                    </div>
                ) : section === "documents" ? (
                    <div className="min-h-[min(26rem,68vh)] flex-1 overflow-hidden">
                        <PosDocumentsPanel onNavigate={setSection} />
                    </div>
                ) : (
                    <div className="min-h-[min(26rem,68vh)] flex-1 overflow-hidden">
                        <PosSettingsPanel />
                    </div>
                )}
            </div>
        </AdminV2WorkspaceBosModalShell>
    );
}
