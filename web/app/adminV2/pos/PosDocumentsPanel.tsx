"use client";

/**
 * POS → Documents (prototype surface).
 *
 * Shows the two intended document intake workflows so the product story is
 * visible end-to-end:
 *   A. Document → Data    (extract values → open a Processing case → approve)
 *   B. Document → Form    (read structure → draft a form → publish)
 *
 * Storage + upload foundations already exist (`POST /api/admin/documents/upload`,
 * Supabase bucket `org_documents`). AI extraction / structure detection are NOT
 * wired yet — these actions are clearly marked Prototype and route the operator
 * to the relevant POS section so the flow is demonstrable today.
 */

import { ArrowRight, FileSearch, FileText, FileUp, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { PosSection } from "./posSections";

interface PosDocListItem {
    documentId: string;
    label: string;
    uploadedAt: string | null;
    docType: string | null;
    processingCaseId: string | null;
    caseStatus: string | null;
    classificationKey: string | null;
}

function formatWhen(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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
                className="text-[11.5px] font-medium text-emerald-700 hover:underline disabled:opacity-50"
            >
                {busy ? "Opening…" : "Open document"}
            </button>
            {error ? <span className="text-[11px] text-amber-700">· {error}</span> : null}
        </>
    );
}

function WorkflowCard({
    badge,
    title,
    steps,
    cta,
    onCta,
    icon,
}: {
    badge: string;
    title: string;
    steps: string[];
    cta: string;
    onCta: () => void;
    icon: ReactNode;
}) {
    return (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-stone-700">
                    {icon}
                    <span className="text-sm font-semibold text-stone-900">{title}</span>
                </span>
                <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">{badge}</span>
            </div>
            <ol className="mb-3 space-y-1">
                {steps.map((s, i) => (
                    <li key={s} className="flex items-center gap-2 text-[12px] text-stone-600">
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[9px] font-semibold text-stone-500">
                            {i + 1}
                        </span>
                        {s}
                        {i < steps.length - 1 ? <ArrowRight className="h-3 w-3 text-stone-300" aria-hidden /> : null}
                    </li>
                ))}
            </ol>
            <button
                type="button"
                onClick={onCta}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50"
            >
                {cta}
            </button>
        </div>
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

    // Safe delete of an unused test upload (guarded server-side: refused if it produced a
    // form template or its case is completed). Removes it from the list on success.
    const deleteDoc = useCallback(async (documentId: string, label: string) => {
        if (!window.confirm(`Delete “${label}”? This removes the upload and its Processing case. Forms already created are kept.`)) {
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
            // POS document intake: open a Processing Case; no CRM entity required.
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
                    ? `Uploaded — Processing case opened${body.classification_key ? ` · ${body.classification_key}` : ""}.`
                    : "Uploaded.",
            });
            void loadDocs(); // refresh the list so the new upload appears immediately
        } catch (e) {
            setStatus({ kind: "error", message: e instanceof Error ? e.message : "Upload failed" });
        } finally {
            setUploading(false);
        }
    }

    return (
        <div className="h-full overflow-y-auto bg-white p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold text-stone-900">Documents</h3>
                    <p className="mt-0.5 text-xs text-stone-500">
                        Upload a document and let Alloy turn it into data or a form. Storage is live; extraction is being wired.
                    </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                    <input
                        ref={fileInputRef}
                        type="file"
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
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#00A283] px-3 py-2 text-xs font-semibold text-white hover:bg-[#009276] disabled:opacity-60"
                    >
                        <FileUp className="h-3.5 w-3.5" aria-hidden />
                        {uploading ? "Uploading…" : "Upload Document"}
                    </button>
                    {status ? (
                        <span className={`text-[11px] ${status.kind === "ok" ? "text-emerald-700" : "text-amber-700"}`}>
                            {status.message}
                        </span>
                    ) : null}
                </div>
            </div>

            {/* A — uploaded documents, with classification + linked Processing Case status. */}
            <section className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10.5px] font-semibold uppercase tracking-wide text-stone-500">Uploaded documents</span>
                    <button type="button" onClick={() => void loadDocs()} className="text-[11px] text-stone-500 hover:underline">
                        Refresh
                    </button>
                </div>
                {docsLoading ? (
                    <div className="text-[12px] text-stone-400">Loading…</div>
                ) : docsError ? (
                    <div className="text-[12px] text-amber-700">{docsError}</div>
                ) : docs.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-stone-200 bg-stone-50/60 p-4 text-[12px] text-stone-500">
                        No documents yet. Use <span className="font-medium text-stone-600">Upload Document</span> above — it opens a
                        Processing case automatically.
                    </div>
                ) : (
                    <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
                        {docs.map((d) => (
                            <li key={d.documentId} className="flex items-center gap-3 px-3 py-2">
                                <FileText className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-[13px] font-medium text-stone-800">{d.label}</div>
                                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-stone-500">
                                        <span>{formatWhen(d.uploadedAt)}</span>
                                        {d.classificationKey ? (
                                            <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-600">
                                                {d.classificationKey}
                                            </span>
                                        ) : (
                                            <span className="text-stone-400">unclassified</span>
                                        )}
                                        {d.caseStatus ? <span>· case {d.caseStatus.replace(/_/g, " ")}</span> : <span>· no case</span>}
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-3">
                                    <OpenDocLink documentId={d.documentId} />
                                    {d.processingCaseId ? (
                                        <button
                                            type="button"
                                            onClick={() => onNavigate("processing")}
                                            className="text-[11.5px] font-medium text-emerald-700 hover:underline"
                                        >
                                            Open in Processing
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        disabled={deletingId === d.documentId}
                                        onClick={() => void deleteDoc(d.documentId, d.label)}
                                        aria-label="Delete document"
                                        title="Delete this upload (kept if it produced a form or has a completed case)"
                                        className="inline-flex items-center gap-1 text-[11.5px] font-medium text-stone-400 hover:text-amber-700 disabled:opacity-50"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                        {deletingId === d.documentId ? "Deleting…" : "Delete"}
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <div className="mb-4 grid gap-3 lg:grid-cols-2">
                <WorkflowCard
                    icon={<FileSearch className="h-4 w-4" />}
                    title="Document → Data"
                    badge="Live"
                    steps={["Upload", "Classify", "Extract facts → candidates", "Review in Processing", "Approve (later)"]}
                    cta="See it in Processing"
                    onCta={() => onNavigate("processing")}
                />
                {/* E — Document → Form: correct next-step shell. Generation is NOT built yet. */}
                <div className="rounded-xl border border-stone-200 bg-white p-4">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-stone-700">
                            <Sparkles className="h-4 w-4" />
                            <span className="text-sm font-semibold text-stone-900">Document → Form</span>
                        </span>
                        <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">Planned</span>
                    </div>
                    <ol className="mb-3 space-y-1">
                        {[
                            "Classify document",
                            "Extract structure / facts",
                            "Identify sections & fields",
                            "Propose a form draft",
                            "Operator reviews",
                            "Publish form",
                        ].map((s, i) => (
                            <li key={s} className="flex items-center gap-2 text-[12px] text-stone-600">
                                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[9px] font-semibold text-stone-500">
                                    {i + 1}
                                </span>
                                {s}
                            </li>
                        ))}
                    </ol>
                    <button
                        type="button"
                        disabled
                        title="Needs document structure detection (steps 2–4) before a draft can be proposed"
                        className="inline-flex cursor-not-allowed items-center gap-1 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-400"
                    >
                        Create form draft
                        <span className="rounded bg-stone-100 px-1 py-0.5 text-[9px] font-semibold uppercase text-stone-400">Planned</span>
                    </button>
                    <p className="mt-1.5 text-[10.5px] text-stone-400">
                        Blocked on structure detection — classification + facts exist today; section/field detection is next.
                    </p>
                </div>
            </div>
        </div>
    );
}
