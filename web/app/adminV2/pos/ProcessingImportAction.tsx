"use client";

/**
 * Import document — a Work action, not navigation.
 * Opens intent modal, uploads with explicit purpose metadata, opens processing case.
 */

import { useRef, useState, type DragEvent } from "react";
import { FileUp } from "lucide-react";
import clsx from "clsx";
import { WS_ACTION_PRIMARY } from "@/components/workspace/workspaceTokens";
import { warmProcessingQueueCache } from "@/lib/pos/processingQueueWarmCache";
import { uploadProcessingDocument } from "@/lib/pos/processingDocumentUpload";
import { processingImportAcceptList } from "@/lib/pos/processingSourceCapabilities";
import ProcessingActionCard from "./ProcessingActionCard";
import ProcessingImportIntentModal from "./ProcessingImportIntentModal";

export default function ProcessingImportAction({
    onImported,
    compact = false,
    variant = "button",
}: {
    onImported: (caseId: string) => void;
    compact?: boolean;
    variant?: "button" | "card";
}) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [pendingFile, setPendingFile] = useState<File | null>(null);

    function openModal(file: File | null = null) {
        setPendingFile(file);
        setModalOpen(true);
        setError(null);
    }

    async function submitImport(payload: {
        file: File;
        intent: import("@/lib/pos/processingImportIntent").ProcessingImportIntent;
        displayName: string;
    }) {
        setUploading(true);
        setError(null);
        try {
            const body = await uploadProcessingDocument({
                file: payload.file,
                intent: payload.intent,
                displayName: payload.displayName,
            });
            void warmProcessingQueueCache({ force: true });
            setModalOpen(false);
            setPendingFile(null);
            if (body.processing_case_id) onImported(body.processing_case_id);
            else throw new Error("Import succeeded but no review case was created.");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Upload failed");
        } finally {
            setUploading(false);
            setDragActive(false);
        }
    }

    function onDragOver(e: DragEvent) {
        e.preventDefault();
        setDragActive(true);
    }

    function onDragLeave() {
        setDragActive(false);
    }

    function onDrop(e: DragEvent) {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) openModal(file);
        else setDragActive(false);
    }

    const modal = (
        <ProcessingImportIntentModal
            open={modalOpen}
            onClose={() => {
                if (!uploading) {
                    setModalOpen(false);
                    setPendingFile(null);
                }
            }}
            onSubmit={submitImport}
            submitting={uploading}
            error={error}
            initialFile={pendingFile}
        />
    );

    if (variant === "card") {
        return (
            <div className="relative">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept={processingImportAcceptList()}
                    className="hidden"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) openModal(f);
                        e.target.value = "";
                    }}
                />
                <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} className={clsx(dragActive && "ring-2 ring-alloy-bend-pine/40 ring-offset-2 rounded-xl")}>
                    <ProcessingActionCard
                        primary
                        disabled={uploading}
                        testId="processing-import-action-card"
                        icon={<FileUp className="h-4 w-4" aria-hidden />}
                        title={uploading ? "Importing…" : "Import document"}
                        description="PDF, Word, images, or text — choose what Alloy should do."
                        onClick={() => openModal()}
                    />
                </div>
                {error && !modalOpen ? <p className="mt-1.5 text-[11px] text-alloy-midnight/60">{error}</p> : null}
                {modal}
            </div>
        );
    }

    return (
        <div className={compact ? "inline-flex flex-col items-end" : "flex flex-col items-end gap-1"}>
            <input
                ref={fileInputRef}
                type="file"
                accept={processingImportAcceptList()}
                className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) openModal(f);
                    e.target.value = "";
                }}
            />
            <button
                type="button"
                disabled={uploading}
                onClick={() => openModal()}
                className={`${WS_ACTION_PRIMARY} inline-flex items-center gap-1.5 ${compact ? "px-2 py-1 text-[11px]" : ""}`}
            >
                <FileUp className="h-3.5 w-3.5" aria-hidden />
                {uploading ? "Importing…" : "Import document"}
            </button>
            {error && !modalOpen ? <span className="max-w-[14rem] text-right text-[10px] text-alloy-midnight/60">{error}</span> : null}
            {modal}
        </div>
    );
}
