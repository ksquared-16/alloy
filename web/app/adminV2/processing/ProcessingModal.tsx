"use client";

/**
 * Digital Mailroom — Work | Studio modes with Overview + operational Work inside Work mode.
 */

import { useCallback, useEffect, useState } from "react";
import AdminV2WorkspaceBosModalShell from "@/app/adminV2/components/AdminV2WorkspaceBosModalShell";
import { warmProcessingQueueCache } from "@/lib/pos/processingQueueWarmCache";
import { warmProcessingFormsCache } from "@/lib/pos/processingFormsWarmCache";
import DigitalMailroomShell, {
    type DigitalMailroomMode,
    type DigitalMailroomWorkView,
} from "@/app/adminV2/pos/DigitalMailroomShell";
import ProcessingOverviewLanding from "@/app/adminV2/pos/ProcessingOverviewLanding";
import PosProcessingWorkspace from "@/app/adminV2/pos/PosProcessingWorkspace";
import ProcessingFormsStudio from "@/app/adminV2/pos/ProcessingFormsStudio";
import type { ProcessingStudioTab } from "@/app/adminV2/pos/ProcessingStudioShell";
import { ADMIN_V2_OPEN_PROCESSING_CASE, type OpenProcessingCaseDetail } from "@/lib/workItems/workItemsNavigation";
import type { ProcessingModalIntent } from "@/lib/adminV2/workspaceModalEvents";

export default function ProcessingModal({
    open,
    onClose,
    intent,
}: {
    open: boolean;
    onClose: () => void;
    intent?: ProcessingModalIntent | null;
}) {
    const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
    const [mode, setMode] = useState<DigitalMailroomMode>("work");
    const [workView, setWorkView] = useState<DigitalMailroomWorkView>("overview");
    const [studioTab, setStudioTab] = useState<ProcessingStudioTab>("forms");
    const [studioFormId, setStudioFormId] = useState<string | null>(null);
    const [studioFormName, setStudioFormName] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            void warmProcessingQueueCache();
            void warmProcessingFormsCache();
        }
    }, [open]);
    const handleClose = useCallback(() => {
        setSelectedCaseId(null);
        setMode("work");
        setWorkView("overview");
        setStudioTab("forms");
        setStudioFormId(null);
        setStudioFormName(null);
        onClose();
    }, [onClose]);

    const openCase = useCallback((caseId: string) => {
        setSelectedCaseId(caseId);
        setMode("work");
        setWorkView("work");
    }, []);

    const openFormInStudio = useCallback((formId: string, formName?: string) => {
        setStudioFormId(formId);
        setStudioFormName(formName?.trim() || null);
        setMode("studio");
        setStudioTab("forms");
    }, []);

    useEffect(() => {
        if (!open) return;
        const onOpenCase = (event: Event) => {
            const detail = (event as CustomEvent<OpenProcessingCaseDetail>).detail;
            const caseId = detail?.case_id?.trim();
            if (!caseId) return;
            openCase(caseId);
        };
        window.addEventListener(ADMIN_V2_OPEN_PROCESSING_CASE, onOpenCase as EventListener);
        return () => window.removeEventListener(ADMIN_V2_OPEN_PROCESSING_CASE, onOpenCase as EventListener);
    }, [open, openCase]);

    // Deep-link intent (Studio→Forms/Packets at a resource, or Work at the queue/a case) is applied
    // once when the modal opens. Former `/admin/forms…` links now route through this so a link that
    // identified a specific form/packet/case opens the Mailroom AT that resource.
    useEffect(() => {
        if (!open || !intent) return;
        if (intent.mode === "studio") {
            setMode("studio");
            setStudioTab(intent.studioTab ?? "forms");
            setStudioFormId(intent.formId ?? null);
            setStudioFormName(intent.formName ?? null);
        } else {
            setMode("work");
            const caseId = intent.caseId?.trim() || null;
            if (caseId) {
                setSelectedCaseId(caseId);
                setWorkView("work");
            } else {
                setWorkView(intent.workView ?? "overview");
            }
        }
    }, [open, intent]);


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
                            initialFormName={studioFormName}
                            onSelectedFormIdChange={(formId) => {
                                setStudioFormId(formId);
                                if (!formId) setStudioFormName(null);
                            }}
                            initialTab={studioTab}
                            onTabChange={setStudioTab}
                        />
                    )}
                </DigitalMailroomShell>
            </div>
        </AdminV2WorkspaceBosModalShell>
    );
}
