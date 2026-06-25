"use client";

/**
 * POS Workspace — the home for information entering Alloy.
 *
 * Mounts inside `AdminV2WorkspaceBosModalShell` (same shell as Inbox / My Tasks),
 * which owns modal geometry, placement, sizing and the fixed BOS right rail. This
 * component only sets the workspace *content*; it does not touch the shell.
 *
 * Restored POS workspace shell: a left-nav `PosWorkspaceLayout` (white sidebar, grouped
 * Operate / Sources / Configure) → a per-section workspace, replacing the old horizontal
 * tab/header layout. Processing is the 3-column command center (`PosProcessingWorkspace`).
 *
 * Section map:
 *   • Home       → PosHome
 *   • Processing → PosProcessingWorkspace (queue · work · decision)
 *   • Review     → PosProcessingWorkspace (case review)
 *   • Linkage    → PosLinkagePanel
 *   • Forms      → PosFormsWorkspace
 *   • Packets    → PosPacketsPanel
 *   • Documents  → PosDocumentsPanel
 *   • Settings   → PosSettingsPanel
 */

import { useCallback, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import AdminV2WorkspaceBosModalShell from "@/app/adminV2/components/AdminV2WorkspaceBosModalShell";
import { BosMark } from "@/app/adminV2/components/bos/identity";
import PosWorkspaceLayout from "@/app/adminV2/pos/PosWorkspaceLayout";
import PosHome from "@/app/adminV2/pos/PosHome";
import PosProcessingWorkspace from "@/app/adminV2/pos/PosProcessingWorkspace";
import PosFormsWorkspace from "@/app/adminV2/pos/PosFormsWorkspace";
import PosLinkagePanel from "@/app/adminV2/pos/PosLinkagePanel";
import PosPacketsPanel from "@/app/adminV2/pos/PosPacketsPanel";
import PosDocumentsPanel from "@/app/adminV2/pos/PosDocumentsPanel";
import PosSettingsPanel from "@/app/adminV2/pos/PosSettingsPanel";
import type { PosSection } from "@/app/adminV2/pos/posSections";

export default function ProcessingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
    const [section, setSection] = useState<PosSection>("home");
    const [focusFormId, setFocusFormId] = useState<string | null>(null);

    const handleClose = useCallback(() => {
        setSelectedCaseId(null);
        setSection("home");
        setFocusFormId(null);
        onClose();
    }, [onClose]);

    const openCase = useCallback((caseId: string) => {
        setSelectedCaseId(caseId);
        setSection("processing");
    }, []);

    // Stay INSIDE POS: jump to Sources → Forms with the just-created form selected
    // (never route away to /admin/forms, never close the modal).
    const openForm = useCallback((formId: string) => {
        setFocusFormId(formId);
        setSection("forms");
    }, []);

    let body: ReactNode;
    switch (section) {
        case "home":
            body = <PosHome onNavigate={setSection} onOpenCase={openCase} />;
            break;
        case "processing":
            body = (
                <PosProcessingWorkspace
                    selectedCaseId={selectedCaseId}
                    onSelectCase={setSelectedCaseId}
                    onGoToSources={() => setSection("documents")}
                    onOpenForm={openForm}
                />
            );
            break;
        case "review":
            body = (
                <PosProcessingWorkspace
                    selectedCaseId={selectedCaseId}
                    onSelectCase={setSelectedCaseId}
                    onOpenForm={openForm}
                    title="Review"
                    subtitle="Cases Alloy has triaged and that are ready for your decision."
                />
            );
            break;
        case "linkage":
            body = <PosLinkagePanel onNavigate={setSection} />;
            break;
        case "forms":
            body = <PosFormsWorkspace focusFormId={focusFormId} />;
            break;
        case "packets":
            body = <PosPacketsPanel />;
            break;
        case "documents":
            body = <PosDocumentsPanel onNavigate={setSection} />;
            break;
        case "settings":
        default:
            body = <PosSettingsPanel />;
            break;
    }

    return (
        <AdminV2WorkspaceBosModalShell
            open={open}
            onClose={handleClose}
            dataModalAttr="adminv2-processing-modal"
            ariaLabelledBy="adminv2-processing-modal-title"
            panelClassName="max-h-[min(88vh,46rem)]"
        >
            <div
                className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-alloy-stone/18 bg-white"
                data-adminv2-processing-modal="true"
            >
                {/* Title bar — BOS mark + pine accent (operational workspace, not plain text) */}
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-alloy-stone/15 bg-gradient-to-r from-alloy-juniper/[0.06] to-transparent px-3 py-2.5">
                    <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-alloy-juniper/10 ring-1 ring-alloy-juniper/20">
                            <BosMark size="sm" />
                        </span>
                        <h2 id="adminv2-processing-modal-title" className="flex items-baseline gap-1.5 text-sm font-semibold text-alloy-midnight">
                            POS
                            <span className="text-[10.5px] font-medium text-alloy-midnight/45">Processing &amp; Sources</span>
                        </h2>
                    </div>
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

                {/* Left-nav workspace shell → active section workspace. */}
                <div className="flex min-h-[min(26rem,68vh)] min-w-0 flex-1 overflow-hidden">
                    <PosWorkspaceLayout active={section} onNavigate={setSection}>
                        {body}
                    </PosWorkspaceLayout>
                </div>
            </div>
        </AdminV2WorkspaceBosModalShell>
    );
}
