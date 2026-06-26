"use client";

/**
 * Processing — the product area for information entering Alloy.
 *
 * Mounts inside `AdminV2WorkspaceBosModalShell` (same shell as Inbox / My Tasks),
 * which owns modal geometry, placement, sizing and the fixed BOS right rail. This
 * component only sets the workspace *content*; it does not touch the shell.
 *
 * `PosWorkspaceLayout` provides the left nav with a [Work][Studio] mode control.
 *
 * Section map (Work = runtime processing · Studio = design-time setup):
 *   • Processing → PosProcessingWorkspace (Work — Incoming: queue · work · decision)
 *   • Documents  → PosDocumentsPanel      (Studio)
 *   • Forms      → PosFormsWorkspace      (Studio)
 *   • Packets    → PosPacketsPanel        (Studio)
 *   • Settings   → PosSettingsPanel       (Studio)
 *
 * Work lands directly on Incoming (no Home dashboard). `home` (former Work landing),
 * `review` (duplicated Incoming) and `linkage` (placeholder) are intentionally not
 * navigable; their components remain in the tree but are unreachable from nav.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Layers } from "lucide-react";
import AdminV2WorkspaceBosModalShell from "@/app/adminV2/components/AdminV2WorkspaceBosModalShell";
import { warmProcessingQueueCache } from "@/lib/pos/processingQueueWarmCache";
import OperationalModalHeader from "@/app/adminV2/components/OperationalModalHeader";
import PosWorkspaceLayout from "@/app/adminV2/pos/PosWorkspaceLayout";
import PosProcessingWorkspace from "@/app/adminV2/pos/PosProcessingWorkspace";
import PosFormsWorkspace from "@/app/adminV2/pos/PosFormsWorkspace";
import PosPacketsPanel from "@/app/adminV2/pos/PosPacketsPanel";
import PosDocumentsPanel from "@/app/adminV2/pos/PosDocumentsPanel";
import PosSettingsPanel from "@/app/adminV2/pos/PosSettingsPanel";
import type { PosSection } from "@/app/adminV2/pos/posSections";

export default function ProcessingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
    const [section, setSection] = useState<PosSection>("processing");
    const [focusFormId, setFocusFormId] = useState<string | null>(null);

    // Warm the shared Incoming queue cache the moment the modal opens (mirrors Inbox-on-open), so
    // the queue + KPI strip paint from cache instead of each firing the heavy endpoint on mount.
    useEffect(() => {
        if (open) void warmProcessingQueueCache();
    }, [open]);

    const handleClose = useCallback(() => {
        setSelectedCaseId(null);
        setSection("processing");
        setFocusFormId(null);
        onClose();
    }, [onClose]);

    // Stay INSIDE Processing: jump to Studio → Forms with the just-created form selected
    // (never route away to /admin/forms, never close the modal).
    const openForm = useCallback((formId: string) => {
        setFocusFormId(formId);
        setSection("forms");
    }, []);

    let body: ReactNode;
    switch (section) {
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
                <OperationalModalHeader
                    icon={<Layers className="h-4 w-4" aria-hidden strokeWidth={2} />}
                    title="Processing"
                    titleId="adminv2-processing-modal-title"
                    onClose={handleClose}
                    closeLabel="Close Processing"
                />

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
