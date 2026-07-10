"use client";

/**
 * Digital Mailroom — Work | Studio modes with Overview + operational Work inside Work mode.
 */

import { useCallback, useEffect, useState } from "react";
import AdminV2WorkspaceBosModalShell from "@/app/adminV2/components/AdminV2WorkspaceBosModalShell";
import { warmProcessingQueueCache } from "@/lib/pos/processingQueueWarmCache";
import DigitalMailroomShell, {
    type DigitalMailroomMode,
    type DigitalMailroomWorkView,
} from "@/app/adminV2/pos/DigitalMailroomShell";
import ProcessingOverviewLanding from "@/app/adminV2/pos/ProcessingOverviewLanding";
import PosProcessingWorkspace from "@/app/adminV2/pos/PosProcessingWorkspace";
import ProcessingFormsStudio from "@/app/adminV2/pos/ProcessingFormsStudio";
import type { ProcessingStudioTab } from "@/app/adminV2/pos/ProcessingStudioShell";

export default function ProcessingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
    const [mode, setMode] = useState<DigitalMailroomMode>("work");
    const [workView, setWorkView] = useState<DigitalMailroomWorkView>("overview");
    const [studioTab, setStudioTab] = useState<ProcessingStudioTab>("forms");
    const [studioFormId, setStudioFormId] = useState<string | null>(null);

    useEffect(() => {
        if (open) void warmProcessingQueueCache();
    }, [open]);

    const handleClose = useCallback(() => {
        setSelectedCaseId(null);
        setMode("work");
        setWorkView("overview");
        setStudioTab("forms");
        setStudioFormId(null);
        onClose();
    }, [onClose]);

    const openCase = useCallback((caseId: string) => {
        setSelectedCaseId(caseId);
        setMode("work");
        setWorkView("work");
    }, []);

    const openFormInStudio = useCallback((formId: string) => {
        setStudioFormId(formId);
        setMode("studio");
        setStudioTab("forms");
    }, []);

    return (
        <AdminV2WorkspaceBosModalShell
            open={open}
            onClose={handleClose}
            dataModalAttr="adminv2-processing-modal"
            ariaLabelledBy="digital-mailroom-title"
            panelClassName="max-h-[min(94vh,56rem)]"
        >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-adminv2-processing-modal="true">
                <DigitalMailroomShell
                    mode={mode}
                    workView={workView}
                    studioTab={studioTab}
                    onModeChange={(next) => {
                        setMode(next);
                        if (next === "work") setWorkView("overview");
                    }}
                    onWorkViewChange={setWorkView}
                    onStudioTabChange={setStudioTab}
                    onClose={handleClose}
                    hideChrome={!!studioFormId}
                >
                    {mode === "work" ? (
                        workView === "overview" ? (
                            <ProcessingOverviewLanding
                                onOpenWork={() => setWorkView("work")}
                                onOpenStudio={() => setMode("studio")}
                                onOpenCase={openCase}
                            />
                        ) : (
                            <PosProcessingWorkspace
                                selectedCaseId={selectedCaseId}
                                onSelectCase={setSelectedCaseId}
                                onOpenForm={openFormInStudio}
                            />
                        )
                    ) : (
                        <ProcessingFormsStudio
                            selectedFormId={studioFormId}
                            onSelectedFormIdChange={setStudioFormId}
                            initialTab={studioTab}
                            onTabChange={setStudioTab}
                        />
                    )}
                </DigitalMailroomShell>
            </div>
        </AdminV2WorkspaceBosModalShell>
    );
}
