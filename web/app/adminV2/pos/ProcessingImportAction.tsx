"use client";

/**
 * Import existing form — a Work action, not navigation.
 * Uploads PDF, opens processing case for review. Engine path unchanged.
 */

import { useRef, useState, type DragEvent } from "react";
import { FileUp } from "lucide-react";
import clsx from "clsx";
import { WS_ACTION_PRIMARY } from "@/components/workspace/workspaceTokens";
import { warmProcessingQueueCache } from "@/lib/pos/processingQueueWarmCache";
import ProcessingActionCard from "./ProcessingActionCard";

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

    async function handleFile(file: File) {
        setUploading(true);
        setError(null);
        try {
            const form = new FormData();
            form.append("file", file);
            form.append("open_processing_case", "true");
            const res = await fetch("/api/admin/documents/upload", {
                method: "POST",
                credentials: "same-origin",
                body: form,
            });
            const body = (await res.json().catch(() => ({}))) as {
                error?: string;
                processing_case_id?: string | null;
            };
            if (!res.ok) throw new Error(body.error || `Upload failed (${res.status})`);
            void warmProcessingQueueCache({ force: true });
            if (body.processing_case_id) {
                onImported(body.processing_case_id);
            } else {
                throw new Error("Import succeeded but no review case was created.");
            }
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
        if (file) void handleFile(file);
        else setDragActive(false);
    }

    if (variant === "card") {
        return (
            <div className="relative">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleFile(f);
                        e.target.value = "";
                    }}
                />
                <div
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    className={clsx(dragActive && "ring-2 ring-alloy-bend-pine/40 ring-offset-2 rounded-xl")}
                >
                    <ProcessingActionCard
                        primary
                        disabled={uploading}
                        testId="processing-import-action-card"
                        icon={<FileUp className="h-4 w-4" aria-hidden />}
                        title={uploading ? "Importing…" : "Import form"}
                        description="PDF, form, or document — click to browse or drop a file here."
                        onClick={() => fileInputRef.current?.click()}
                    />
                </div>
                {error ? <p className="mt-1.5 text-[11px] text-alloy-midnight/60">{error}</p> : null}
            </div>
        );
    }

    return (
        <div className={compact ? "inline-flex flex-col items-end" : "flex flex-col items-end gap-1"}>
            <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                    e.target.value = "";
                }}
            />
            <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className={`${WS_ACTION_PRIMARY} inline-flex items-center gap-1.5 ${compact ? "px-2 py-1 text-[11px]" : ""}`}
            >
                <FileUp className="h-3.5 w-3.5" aria-hidden />
                {uploading ? "Importing…" : "Import form"}
            </button>
            {error ? <span className="max-w-[14rem] text-right text-[10px] text-alloy-midnight/60">{error}</span> : null}
        </div>
    );
}
