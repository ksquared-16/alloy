"use client";

/**
 * POS → Documents.
 *
 * Upload a document; Alloy opens intake and (through the document setup path in
 * Incoming) recognizes its fields so you can review record sync and create a
 * reusable form. Storage + upload are live (`POST /api/admin/documents/upload`,
 * Supabase bucket `org_documents`). This surface stays honest: it describes the
 * real, shipped path — no "planned" capability that already works.
 */

import { FileText, FileUp, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WorkspaceSectionHeader from "@/components/workspace/WorkspaceSectionHeader";
import { WS_ACTION_PRIMARY } from "@/components/workspace/workspaceTokens";
import ProcessingWorkflowStepper from "./ProcessingWorkflowStepper";
import PosPanel from "./PosPanel";
import type { PosSection } from "./posSections";
import { warmProcessingQueueCache } from "@/lib/pos/processingQueueWarmCache";

interface PosDocListItem {
    documentId: string;
    label: string;
    uploadedAt: string | null;
    docType: string | null;
    processingCaseId: string | null;
    caseStatus: string | null;
    classificationKey: string | null;
}

const SETUP_STEPS = ["Detect questions", "Review and resolve", "Generate native form", "Edit and publish"];

function formatWhen(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function friendlyCaseStatus(status: string | null): string {
    switch (status) {
        case "received":
        case "processing":
        case "needs_review":
        case "needs_resolution":
            return "Waiting for review";
        case "ready":
            return "Ready to generate";
        case "completed":
            return "Processed";
        case "archived":
            return "Archived";
        default:
            return "Not in Incoming";
    }
}

/** Open a document via a fresh signed URL; show a useful error on failure. */
function OpenDocLink({ documentId }: { documentId: string }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    return (
        <>
            <button
                type="button"
                disabled={busy}
                onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                        const res = await fetch(`/api/admin/documents/${documentId}/signed-url`, { credentials: "same-origin" });
                        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; signedUrl?: string; error?: string };
                        if (!res.ok || !body.ok || !body.signedUrl) throw new Error(body.error || `Couldn’t open (${res.status})`);
                        window.open(body.signedUrl, "_blank", "noopener,noreferrer");
                    } catch (e) {
                        setError(e instanceof Error ? e.message : "Couldn’t open");
                    } finally {
                        setBusy(false);
                    }
                }}
                className="text-[11.5px] font-medium text-alloy-juniper hover:underline disabled:opacity-50"
            >
                {busy ? "Opening…" : "Open document"}
            </button>
            {error ? <span className="text-[11px] text-amber-700">· {error}</span> : null}
        </>
    );
}

export default function PosDocumentsPanel({ onNavigate }: { onNavigate: (section: PosSection) => void }) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [uploading, setUploading] = useState(false);
    const [status, setStatus] = useState<{ kind: "ok" | "error"; message: string } | null>(null);
    const [docs, setDocs] = useState<PosDocListItem[]>([]);
    const [docsLoading, setDocsLoading] = useState(true);
    const [docsError, setDocsError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const loadDocs = useCallback(async () => {
        setDocsLoading(true);
        setDocsError(null);
        try {
            const res = await fetch("/api/admin/pos/documents", { credentials: "same-origin" });
            const body = (await res.json().catch(() => ({}))) as { documents?: PosDocListItem[]; error?: string };
            if (!res.ok) throw new Error(body.error || `Failed to load documents (${res.status})`);
            setDocs(body.documents ?? []);
        } catch (e) {
            setDocsError(e instanceof Error ? e.message : "Failed to load documents");
        } finally {
            setDocsLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadDocs();
    }, [loadDocs]);

    const workflowCounts = useMemo(() => {
        let waiting = 0;
        let generated = 0;
        for (const doc of docs) {
            if (doc.caseStatus === "completed") generated += 1;
            else if (doc.processingCaseId) waiting += 1;
        }
        return { waiting, generated, imported: docs.length };
    }, [docs]);

    // Safe delete of an unused test upload (guarded server-side: refused if it produced a
    // form or its case is completed). Removes it from the list on success.
    const deleteDoc = useCallback(async (documentId: string, label: string) => {
        if (!window.confirm(`Delete “${label}”? This removes the upload and its intake. Forms already created are kept.`)) {
            return;
        }
        setDeletingId(documentId);
        setDocsError(null);
        try {
            const res = await fetch(`/api/admin/pos/documents/${documentId}`, { method: "DELETE", credentials: "same-origin" });
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(body.error || `Delete failed (${res.status})`);
            setDocs((prev) => prev.filter((d) => d.documentId !== documentId));
        } catch (e) {
            setDocsError(e instanceof Error ? e.message : "Delete failed");
        } finally {
            setDeletingId(null);
        }
    }, []);

    async function handleFile(file: File) {
        setUploading(true);
        setStatus(null);
        try {
            const form = new FormData();
            form.append("file", file);
            // POS document intake: open intake; no CRM entity required.
            form.append("open_processing_case", "true");
            const res = await fetch("/api/admin/documents/upload", {
                method: "POST",
                credentials: "same-origin",
                body: form,
            });
            const body = (await res.json().catch(() => ({}))) as {
                error?: string;
                processing_case_id?: string | null;
                classification_key?: string | null;
            };
            if (!res.ok) throw new Error(body.error || `Upload failed (${res.status})`);
            setStatus({
                kind: "ok",
                message: body.processing_case_id
                    ? "Imported — open Incoming to resolve detected questions."
                    : "Imported.",
            });
            void loadDocs();
            void warmProcessingQueueCache({ force: true });
        } catch (e) {
            setStatus({ kind: "error", message: e instanceof Error ? e.message : "Upload failed" });
        } finally {
            setUploading(false);
        }
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <WorkspaceSectionHeader
                title="Import existing form"
                subtitle="Upload any enrollment, state, medical, or operational form."
            />

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <div className="mb-3">
                    <ProcessingWorkflowStepper active="import" />
                </div>

                <PosPanel eyebrow="How it works" className="mb-4">
                    <ol className="space-y-2">
                        {SETUP_STEPS.map((s, i) => (
                            <li key={s} className="flex items-start gap-2 text-[12px] text-alloy-midnight/70">
                                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-alloy-juniper/10 text-[9px] font-semibold text-alloy-juniper">
                                    {i + 1}
                                </span>
                                <span>{s}</span>
                            </li>
                        ))}
                    </ol>
                    <p className="mt-2 text-[11px] text-alloy-midnight/45">
                        Your document is used as evidence. The generated form becomes the source of truth.
                    </p>
                </PosPanel>

                <div className="mb-4 rounded-xl border border-dashed border-alloy-juniper/35 bg-alloy-juniper/[0.04] p-6 text-center">
                    <FileUp className="mx-auto h-8 w-8 text-alloy-juniper/70" aria-hidden />
                    <p className="mt-2 text-[13px] font-medium text-alloy-midnight">Drop your PDF here</p>
                    <p className="mt-0.5 text-[11px] text-alloy-midnight/45">or choose a file from your computer</p>
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
                        className={`${WS_ACTION_PRIMARY} mt-3 inline-flex items-center gap-1.5`}
                    >
                        <FileUp className="h-3.5 w-3.5" aria-hidden />
                        {uploading ? "Importing…" : "Import existing form"}
                    </button>
                    {status ? (
                        <p className={`mt-2 text-[11.5px] ${status.kind === "ok" ? "text-emerald-700" : "text-amber-700"}`}>
                            {status.message}
                        </p>
                    ) : null}
                </div>

                <div className="mb-4 grid gap-2 sm:grid-cols-3">
                    <WorkflowStat label="Imported documents" value={workflowCounts.imported} />
                    <WorkflowStat label="Waiting for review" value={workflowCounts.waiting} tone="amber" />
                    <WorkflowStat label="Forms generated" value={workflowCounts.generated} tone="emerald" />
                </div>

                {/* Uploaded documents */}
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10.5px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Uploaded documents</span>
                    <button type="button" onClick={() => void loadDocs()} className="text-[11px] text-alloy-midnight/50 hover:underline">
                        Refresh
                    </button>
                </div>
                {docsLoading ? (
                    <div className="text-[12px] text-alloy-midnight/40">Loading…</div>
                ) : docsError ? (
                    <div className="text-[12px] text-amber-700">{docsError}</div>
                ) : docs.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-alloy-stone/30 bg-alloy-stone/40 p-4 text-[12px] text-alloy-midnight/55">
                        No documents yet. Import a PDF above — Alloy opens an Incoming review automatically.
                    </div>
                ) : (
                    <ul className="divide-y divide-alloy-stone/15 rounded-lg border border-alloy-stone/20">
                        {docs.map((d) => (
                            <li key={d.documentId} className="flex items-center gap-3 px-3 py-2">
                                <FileText className="h-4 w-4 shrink-0 text-alloy-midnight/35" aria-hidden />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-[13px] font-medium text-alloy-midnight">{d.label}</div>
                                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-alloy-midnight/50">
                                        <span>{formatWhen(d.uploadedAt)}</span>
                                        <span className="rounded bg-alloy-stone/70 px-1.5 py-0.5 text-[10px] font-medium text-alloy-midnight/60">
                                            Source document
                                        </span>
                                        <span>· {friendlyCaseStatus(d.caseStatus)}</span>
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-3">
                                    <OpenDocLink documentId={d.documentId} />
                                    {d.processingCaseId ? (
                                        <button
                                            type="button"
                                            onClick={() => onNavigate("processing")}
                                            className="text-[11.5px] font-medium text-alloy-juniper hover:underline"
                                        >
                                            Open in Incoming
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        disabled={deletingId === d.documentId}
                                        onClick={() => void deleteDoc(d.documentId, d.label)}
                                        aria-label="Delete document"
                                        title="Delete this upload (kept if it produced a form or has a completed intake)"
                                        className="inline-flex items-center gap-1 text-[11.5px] font-medium text-alloy-midnight/40 hover:text-amber-700 disabled:opacity-50"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                        {deletingId === d.documentId ? "Deleting…" : "Delete"}
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

function WorkflowStat({
    label,
    value,
    tone = "stone",
}: {
    label: string;
    value: number;
    tone?: "stone" | "amber" | "emerald";
}) {
    const toneClass =
        tone === "emerald"
            ? "border-emerald-200 bg-emerald-50/70 text-emerald-800"
            : tone === "amber"
              ? "border-amber-200 bg-amber-50/70 text-amber-800"
              : "border-alloy-stone/18 bg-white text-alloy-midnight";
    return (
        <div className={`rounded-lg border px-3 py-2 ${toneClass}`}>
            <div className="text-[18px] font-semibold tabular-nums">{value}</div>
            <div className="text-[10px] font-medium uppercase tracking-wide opacity-65">{label}</div>
        </div>
    );
}
