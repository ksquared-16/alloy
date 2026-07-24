"use client";

/**
 * Work — active operational information requiring attention.
 * Folder rail + queue lanes + source-document-first review.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import WorkspaceEmptyState from "@/components/workspace/WorkspaceEmptyState";
import WorkspaceZonePanel from "@/components/workspace/WorkspaceZonePanel";
import { WS_ACTION_SECONDARY, WS_CANVAS, WS_INSPECTOR, WS_QUEUE_RAIL } from "@/components/workspace/workspaceTokens";
import ProcessingQueueList from "@/app/adminV2/processing/ProcessingQueueList";
import ProcessingImportAction from "./ProcessingImportAction";
import { usePosCase } from "./usePosCase";
import PosCaseWorkColumn from "./PosCaseWorkColumn";
import PosCaseDecisionColumn from "./PosCaseDecisionColumn";
import PosTemplateSetupColumn from "./PosTemplateSetupColumn";
import { capabilitiesForFormat, detectProcessingSourceFormat } from "@/lib/pos/processingSourceCapabilities";
import { uploadProcessingDocument } from "@/lib/pos/processingDocumentUpload";
import ProcessingImportIntentModal from "./ProcessingImportIntentModal";
import { getProcessingQueueWarmSnapshot, warmProcessingQueueCache } from "@/lib/pos/processingQueueWarmCache";

export default function PosProcessingWorkspace({
    selectedCaseId,
    onSelectCase,
    onOpenForm,
}: {
    selectedCaseId: string | null;
    onSelectCase: (caseId: string | null) => void;
    onOpenForm?: (formId: string, formName?: string) => void;
}) {
    const state = usePosCase(selectedCaseId);
    const advancedForRef = useRef<string | null>(null);
    const [dropActive, setDropActive] = useState(false);

    // Auto-advance (§ completed-state): once a case reaches its completed conclusion, let the operator
    // read the outcome, then return to the queue and select the next available case — preserving flow
    // without an extra click. Only fires once per completed case; cancels if they navigate away first.
    useEffect(() => {
        if (!selectedCaseId || !state.isClosed) {
            advancedForRef.current = null;
            return;
        }
        if (advancedForRef.current === selectedCaseId) return;
        advancedForRef.current = selectedCaseId;
        const timer = setTimeout(() => {
            const rows = getProcessingQueueWarmSnapshot().data?.rows ?? [];
            const next = rows.find(
                (r) => r.id !== selectedCaseId && r.status !== "completed" && r.status !== "archived",
            );
            onSelectCase(next?.id ?? null);
        }, 3200);
        return () => clearTimeout(timer);
    }, [state.isClosed, selectedCaseId, onSelectCase]);
    const [uploading, setUploading] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
    const [importErr, setImportErr] = useState<string | null>(null);

    const primary = state.detail?.sources.find((s) => s.role === "primary") ?? state.detail?.sources[0] ?? null;
    const isDocumentCase =
        primary?.kind === "document" || primary?.kind === "upload" || primary?.kind === "recreated_document";
    const detailLoading = !!selectedCaseId && state.loading && !state.detail;

    const uploadDocument = useCallback(
        async (payload: {
            file: File;
            intent: import("@/lib/pos/processingImportIntent").ProcessingImportIntent;
            displayName: string;
        }) => {
            setUploading(true);
            setImportErr(null);
            try {
                const body = await uploadProcessingDocument({
                    file: payload.file,
                    intent: payload.intent,
                    displayName: payload.displayName,
                });
                void warmProcessingQueueCache({ force: true });
                setImportOpen(false);
                setPendingImportFile(null);
                if (body.processing_case_id) onSelectCase(body.processing_case_id);
                else throw new Error("Import succeeded but no review case was created.");
            } catch (e) {
                setImportErr(e instanceof Error ? e.message : "Upload failed");
            } finally {
                setUploading(false);
                setDropActive(false);
            }
        },
        [onSelectCase]
    );

    return (
        <div
            className={`flex min-h-0 flex-1 flex-col overflow-hidden ${dropActive ? "ring-2 ring-inset ring-alloy-bend-pine/40" : ""}`}
            onDragOver={(e) => {
                e.preventDefault();
                setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) {
                    const format = detectProcessingSourceFormat(file.name, file.type || "");
                    if (capabilitiesForFormat(format).store) {
                        setPendingImportFile(file);
                        setImportOpen(true);
                    } else setDropActive(false);
                } else setDropActive(false);
            }}
        >
            <div className="flex min-h-0 flex-1 overflow-hidden">
                <WorkspaceZonePanel
                    title="Queue"
                    className={`w-[22%] min-w-[11rem] max-w-[15rem] shrink-0 self-stretch border-0 ${WS_QUEUE_RAIL}`}
                >
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <ProcessingQueueList
                            selectedCaseId={selectedCaseId}
                            onSelectCase={onSelectCase}
                            showFolders
                            panelMode
                            headerAction={<ProcessingImportAction compact onImported={onSelectCase} />}
                            onCaseRemoved={(caseId) => {
                                if (selectedCaseId === caseId) onSelectCase(null);
                            }}
                        />
                    </div>
                </WorkspaceZonePanel>

                {!selectedCaseId ? (
                    <div className={`flex min-w-[20rem] flex-1 flex-col overflow-hidden p-5 ${WS_CANVAS}`}>
                        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center">
                            <div className="text-center">
                                <WorkspaceEmptyState
                                    title="Select an import"
                                    body="Choose a document from the work queue."
                                />
                                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setPendingImportFile(null);
                                            setImportOpen(true);
                                        }}
                                        className={WS_ACTION_SECONDARY}
                                    >
                                        Import document
                                    </button>
                                </div>
                                {dropActive ? (
                                    <p className="mt-4 text-[12px] font-semibold text-alloy-bend-pine">Drop a document to import</p>
                                ) : uploading ? (
                                    <p className="mt-4 text-[12px] text-alloy-midnight/50">Importing…</p>
                                ) : null}
                            </div>
                        </div>
                    </div>
                ) : detailLoading ? (
                    <div className={`flex min-w-[28rem] flex-1 flex-col overflow-hidden ${WS_CANVAS}`} aria-busy="true">
                        <div className="shrink-0 border-b border-alloy-stone/12 px-4 py-3">
                            <div className="h-5 w-48 animate-pulse rounded bg-alloy-stone/10" />
                            <div className="mt-2 h-3 w-72 animate-pulse rounded bg-alloy-stone/10" />
                        </div>
                        <div className="flex min-h-0 flex-1">
                            <div className="flex min-w-0 flex-[55] flex-col border-r border-alloy-stone/12 p-2">
                                <div className="h-3 w-28 animate-pulse rounded bg-alloy-stone/10" />
                                <div className="mt-2 min-h-[20rem] flex-1 animate-pulse rounded bg-alloy-stone/10" />
                            </div>
                            <div className="flex min-w-0 flex-[23] p-2">
                                <div className="h-4 w-40 animate-pulse rounded bg-alloy-stone/10" />
                                <div className="mt-3 space-y-2">
                                    <div className="h-12 animate-pulse rounded bg-alloy-stone/10" />
                                    <div className="h-12 animate-pulse rounded bg-alloy-stone/10" />
                                    <div className="h-12 animate-pulse rounded bg-alloy-stone/10" />
                                </div>
                            </div>
                        </div>
                    </div>
                ) : isDocumentCase ? (
                    <div className={`flex min-w-[28rem] flex-1 flex-col overflow-hidden ${WS_CANVAS}`}>
                        <PosTemplateSetupColumn state={state} onOpenForm={onOpenForm} />
                    </div>
                ) : (
                    <>
                        {/* Case detail sits on a soft canvas, not a full-height white card: the panels
                            inside are already white surfaces, so a white column made a short case read
                            as one card stretched down the page with dead white space beneath it. */}
                        <div className="flex min-w-[20rem] flex-1 flex-col overflow-hidden bg-alloy-midnight/[0.045]">
                            <PosCaseWorkColumn state={state} />
                        </div>
                        <div className={`flex w-[19rem] shrink-0 flex-col overflow-hidden ${WS_INSPECTOR}`}>
                            <PosCaseDecisionColumn state={state} />
                        </div>
                    </>
                )}
            </div>
            <ProcessingImportIntentModal
                open={importOpen}
                onClose={() => {
                    if (!uploading) {
                        setImportOpen(false);
                        setPendingImportFile(null);
                    }
                }}
                onSubmit={uploadDocument}
                submitting={uploading}
                error={importErr}
                initialFile={pendingImportFile}
            />
        </div>
    );
}
