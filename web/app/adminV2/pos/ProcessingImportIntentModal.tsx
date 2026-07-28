"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ProcessingAlloyDialog from "./ProcessingAlloyDialog";
import {
    PROCESSING_IMPORT_INTENT_OPTIONS,
    type ProcessingImportIntent,
    processingIntentMetadata,
} from "@/lib/pos/processingImportIntent";
import {
    capabilitiesForFormat,
    detectProcessingSourceFormat,
    processingImportAcceptList,
} from "@/lib/pos/processingSourceCapabilities";
import { proposeImportDisplayName } from "@/lib/pos/documentInstanceNaming";

export type ProcessingImportSubmitPayload = {
    file: File;
    intent: ProcessingImportIntent;
    displayName: string;
    originalFilename: string;
};

export default function ProcessingImportIntentModal({
    open,
    onClose,
    onSubmit,
    submitting = false,
    error = null,
    existingDisplayNames = [],
    initialFile = null,
}: {
    open: boolean;
    onClose: () => void;
    onSubmit: (payload: ProcessingImportSubmitPayload) => void | Promise<void>;
    submitting?: boolean;
    error?: string | null;
    existingDisplayNames?: readonly string[];
    initialFile?: File | null;
}) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [file, setFile] = useState<File | null>(initialFile);
    const [intent, setIntent] = useState<ProcessingImportIntent>("generate_form");
    const [displayName, setDisplayName] = useState("");
    const [localErr, setLocalErr] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setFile(initialFile);
        setIntent("generate_form");
        setLocalErr(null);
        if (initialFile) {
            setDisplayName(
                proposeImportDisplayName({
                    fileName: initialFile.name,
                    existingDisplayNames,
                })
            );
        } else {
            setDisplayName("");
        }
        // Re-initialize ONLY when the modal opens or the seeded file changes — never on
        // every render. `existingDisplayNames` is deliberately excluded from deps: callers
        // frequently pass a fresh array literal (or rely on the `[]` default), so including
        // it would re-run this effect each render and wipe a file the operator just chose
        // in-modal via "Choose file". (Seeding uses the latest value at open time.)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, initialFile]);

    const formatCaps = useMemo(() => {
        if (!file) return null;
        const format = detectProcessingSourceFormat(file.name, file.type || "");
        return capabilitiesForFormat(format);
    }, [file]);

    const duplicateWarning = useMemo(() => {
        const normalized = displayName.trim().toLowerCase();
        if (!normalized) return false;
        return existingDisplayNames.some((n) => n.trim().toLowerCase() === normalized);
    }, [displayName, existingDisplayNames]);

    function pickFile(next: File | null) {
        setFile(next);
        setLocalErr(null);
        if (next) {
            setDisplayName(
                proposeImportDisplayName({
                    fileName: next.name,
                    existingDisplayNames,
                })
            );
        } else {
            setDisplayName("");
        }
    }

    const canSubmit =
        !!file &&
        displayName.trim().length > 0 &&
        intent !== "packet_source" &&
        formatCaps?.store === true &&
        !submitting;

    return (
        <ProcessingAlloyDialog
            open={open}
            onClose={onClose}
            title="What would you like to do with this document?"
            subtitle="Choose how Alloy should handle this file before import continues."
            testId="processing-import-intent-modal"
            footer={
                <>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="rounded-lg border border-alloy-stone/20 bg-white px-4 py-2 text-[12px] font-semibold text-alloy-midnight/70"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={!canSubmit}
                        onClick={() => {
                            if (!file) return;
                            const name = displayName.trim();
                            if (!name) {
                                setLocalErr("Document display name is required.");
                                return;
                            }
                            void onSubmit({
                                file,
                                intent,
                                displayName: name,
                                originalFilename: file.name,
                            });
                        }}
                        className="rounded-lg bg-alloy-bend-pine px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
                        data-testid="processing-import-intent-submit"
                    >
                        {submitting ? "Importing…" : "Continue import"}
                    </button>
                </>
            }
        >
            <div className="space-y-4">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept={processingImportAcceptList()}
                    className="hidden"
                    onChange={(e) => {
                        pickFile(e.target.files?.[0] ?? null);
                        e.target.value = "";
                    }}
                />

                <div className="space-y-2">
                    {PROCESSING_IMPORT_INTENT_OPTIONS.map((opt) => (
                        <label
                            key={opt.value}
                            className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
                                intent === opt.value
                                    ? "border-alloy-bend-pine/35 bg-alloy-bend-pine/[0.06]"
                                    : "border-alloy-stone/15 bg-white hover:border-alloy-stone/25"
                            } ${!opt.available ? "cursor-not-allowed opacity-55" : ""}`}
                        >
                            <input
                                type="radio"
                                name="processing-import-intent"
                                value={opt.value}
                                checked={intent === opt.value}
                                disabled={!opt.available}
                                onChange={() => setIntent(opt.value)}
                                className="mt-0.5 accent-alloy-bend-pine"
                                data-testid={`processing-import-intent-${opt.value}`}
                            />
                            <span>
                                <span className="block text-[12px] font-semibold text-alloy-midnight">{opt.label}</span>
                                <span className="mt-0.5 block text-[11px] text-alloy-midnight/45">{opt.description}</span>
                            </span>
                        </label>
                    ))}
                </div>

                <div className="rounded-xl border border-alloy-stone/15 bg-alloy-stone/[0.03] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold text-alloy-midnight">Document file</p>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={submitting}
                            className="text-[11px] font-semibold text-alloy-bend-pine hover:underline"
                        >
                            {file ? "Choose different file" : "Choose file"}
                        </button>
                    </div>
                    {file ? (
                        <p className="mt-1 text-[11px] text-alloy-midnight/60">
                            <span className="font-medium text-alloy-midnight">{file.name}</span>
                            {formatCaps ? (
                                <span className="ml-2 text-alloy-midnight/45">
                                    · {formatCaps.label}
                                    {!formatCaps.questionDetection && intent === "generate_form" ? " · question detection may be limited" : ""}
                                </span>
                            ) : null}
                        </p>
                    ) : (
                        <p className="mt-1 text-[11px] text-alloy-midnight/45">PDF, Word, images, text, or CSV.</p>
                    )}
                    {formatCaps && !formatCaps.store ? (
                        <p className="mt-2 text-[11px] text-rose-700">This format cannot be stored for Processing intake.</p>
                    ) : null}
                </div>

                <label className="block">
                    <span className="mb-1.5 block text-[12px] font-semibold text-alloy-midnight">Document display name</span>
                    <span className="mb-1.5 block text-[11px] text-alloy-midnight/45">
                        Source filename: {file?.name ?? "—"}
                    </span>
                    <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        disabled={!file || submitting}
                        placeholder="Child Medical Examination Report — Received 2026-07-10"
                        className="w-full rounded-[10px] border border-alloy-stone/20 px-3 py-2.5 text-[13px] shadow-sm outline-none focus:border-alloy-bend-pine/40 focus:ring-2 focus:ring-alloy-bend-pine/15 disabled:opacity-50"
                        data-testid="processing-import-display-name"
                    />
                    {duplicateWarning ? (
                        <p className="mt-1.5 text-[11px] text-amber-800">
                            A document with this name already exists — Alloy will add an instance suffix if needed.
                        </p>
                    ) : null}
                </label>

                <p className="text-[10px] text-alloy-midnight/40">
                    Intent stored as: {processingIntentMetadata(intent).processing_intent as string}
                </p>

                {localErr || error ? (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800" role="alert">
                        {localErr || error}
                    </p>
                ) : null}
            </div>
        </ProcessingAlloyDialog>
    );
}
