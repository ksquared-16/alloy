"use client";

/**
 * Work — active operational information requiring attention.
 * Folder rail + queue lanes + source-document-first review.
 */

import { useCallback, useRef, useState } from "react";
import WorkspaceEmptyState from "@/components/workspace/WorkspaceEmptyState";
import ProcessingQueueList from "@/app/adminV2/processing/ProcessingQueueList";
import ProcessingImportAction from "./ProcessingImportAction";
import { usePosCase } from "./usePosCase";
import PosCaseWorkColumn from "./PosCaseWorkColumn";
import PosCaseDecisionColumn from "./PosCaseDecisionColumn";
import PosTemplateSetupColumn from "./PosTemplateSetupColumn";
import { warmProcessingQueueCache } from "@/lib/pos/processingQueueWarmCache";
import ProcessingParentPanel from "./ProcessingParentPanel";

export default function PosProcessingWorkspace({
    selectedCaseId,
    onSelectCase,
    onOpenForm,
}: {
    selectedCaseId: string | null;
    onSelectCase: (caseId: string | null) => void;
    onOpenForm?: (formId: string) => void;
}) {
    const state = usePosCase(selectedCaseId);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [dropActive, setDropActive] = useState(false);
    const [uploading, setUploading] = useState(false);

    const primary = state.detail?.sources.find((s) => s.role === "primary") ?? state.detail?.sources[0] ?? null;
    const isDocumentCase =
        primary?.kind === "document" || primary?.kind === "upload" || primary?.kind === "recreated_document";
    const detailLoading = !!selectedCaseId && state.loading && !state.detail;

    const uploadPdf = useCallback(
        async (file: File) => {
            setUploading(true);
            try {
                const form = new FormData();
                form.append("file", file);
                form.append("open_processing_case", "true");
                const res = await fetch("/api/admin/documents/upload", {
                    method: "POST",
                    credentials: "same-origin",
                    body: form,
                });
                const body = (await res.json().catch(() => ({}))) as { processing_case_id?: string | null; error?: string };
                if (!res.ok) throw new Error(body.error || "Upload failed");
                void warmProcessingQueueCache({ force: true });
                if (body.processing_case_id) onSelectCase(body.processing_case_id);
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
                if (file && file.type === "application/pdf") void uploadPdf(file);
                else setDropActive(false);
            }}
        >
            <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadPdf(f);
                    e.target.value = "";
                }}
            />
            <div className="flex min-h-0 flex-1 overflow-hidden bg-white">
                <ProcessingParentPanel
                    title="Queue"
                    className="w-[22%] min-w-[11rem] max-w-[15rem] shrink-0 self-stretch border-0 border-r border-stone-200"
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
                </ProcessingParentPanel>

                {!selectedCaseId ? (
                    <div className="flex min-w-[20rem] flex-1 flex-col overflow-hidden bg-white p-6">
                        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center">
                            <div className="text-center">
                                <WorkspaceEmptyState
                                    title="Select an import"
                                    body="Choose a document from the work queue."
                                />
                                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-[12px] font-semibold text-alloy-midnight/70 hover:border-alloy-bend-pine/30"
                                    >
                                        Import form
                                    </button>
                                </div>
                                {dropActive ? (
                                    <p className="mt-4 text-[12px] font-semibold text-alloy-bend-pine">Drop PDF to import</p>
                                ) : uploading ? (
                                    <p className="mt-4 text-[12px] text-alloy-midnight/50">Importing…</p>
                                ) : null}
                            </div>
                        </div>
                    </div>
                ) : detailLoading ? (
                    <div className="flex min-w-[28rem] flex-1 flex-col overflow-hidden bg-white" aria-busy="true">
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
                    <div className="flex min-w-[28rem] flex-1 flex-col overflow-hidden">
                        <PosTemplateSetupColumn state={state} onOpenForm={onOpenForm} />
                    </div>
                ) : (
                    <>
                        <div className="flex min-w-[20rem] flex-1 flex-col overflow-hidden border-r border-alloy-stone/12 bg-white">
                            <PosCaseWorkColumn state={state} />
                        </div>
                        <div className="flex w-[19rem] shrink-0 flex-col overflow-hidden bg-white">
                            <PosCaseDecisionColumn state={state} />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
