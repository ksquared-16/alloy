"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/adminFormatters";
import { isV1DocumentEntityType } from "@/lib/admin/v1DocumentEntities";
import type { V1DocumentEntityValue } from "@/lib/admin/v1DocumentEntities";
import AssociatedDocumentUploadModal from "@/components/admin/AssociatedDocumentUploadModal";
import {
    artifactKindBadgeClass,
    artifactKindDisplayLabel,
    isSyntheticPacketDocumentId,
} from "@/lib/forms/packets/documentProvenanceDisplay";
import type { NormalizedDocumentRow } from "@/lib/admin/normalizeDocumentRow";

/** Aligned with `NormalizedDocumentRow` from `/api/admin/related/...` and upload response. */
export type EntityDocumentListItem = NormalizedDocumentRow;

type Props = {
    documents: EntityDocumentListItem[];
    loading?: boolean;
    /** When set (e.g. related API failed), show error state for the list; upload may still work. */
    fetchError?: string | null;
    onRetryFetch?: () => void;
    /** Canonical type for documents.entity_type (e.g. customer, job, contact). */
    uploadEntityType: string;
    entityId: string;
    canMutate: boolean;
    onAfterUpload: () => void;
    showUpload?: boolean;
};

export default function EntityDocumentsSection({
    documents,
    loading = false,
    fetchError = null,
    onRetryFetch,
    uploadEntityType,
    entityId,
    canMutate,
    onAfterUpload,
    showUpload = true,
}: Props) {
    const [uploadModalOpen, setUploadModalOpen] = useState(false);
    const fileUploadSupported = isV1DocumentEntityType(uploadEntityType);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [docType, setDocType] = useState("");
    const [title, setTitle] = useState("");
    const [openingId, setOpeningId] = useState<string | null>(null);
    const [openError, setOpenError] = useState<string | null>(null);

    const openSignedUrl = async (docId: string) => {
        setOpenError(null);
        setOpeningId(docId);
        try {
            const res = await fetch(`/api/admin/documents/${encodeURIComponent(docId)}/signed-url`);
            let json: { ok?: boolean; signedUrl?: string; error?: string; code?: string } = {};
            try {
                json = (await res.json()) as typeof json;
            } catch {
                setOpenError(`Could not read response (${res.status})`);
                return;
            }
            if (!res.ok) {
                setOpenError(json.error || `Could not open file (${res.status})`);
                return;
            }
            if (json.ok && json.signedUrl) {
                window.open(json.signedUrl, "_blank", "noopener,noreferrer");
                return;
            }
            setOpenError(json.error || "Could not open file");
        } catch (e) {
            setOpenError((e as Error).message || "Network error while opening file");
        } finally {
            setOpeningId(null);
        }
    };

    const onPickFileLegacy = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file || !canMutate) return;
        setUploading(true);
        setUploadError(null);
        try {
            const fd = new FormData();
            fd.set("file", file);
            fd.set("entity_type", uploadEntityType);
            fd.set("entity_id", entityId);
            if (docType.trim()) fd.set("doc_type", docType.trim());
            if (title.trim()) fd.set("title", title.trim());
            const res = await fetch("/api/admin/documents/upload", { method: "POST", body: fd });
            let json: { error?: string; code?: string } = {};
            try {
                json = (await res.json()) as typeof json;
            } catch {
                throw new Error(`Upload failed (${res.status})`);
            }
            if (!res.ok) {
                throw new Error(json.error || `Upload failed (${res.status})`);
            }
            onAfterUpload();
        } catch (err) {
            setUploadError((err as Error).message);
        } finally {
            setUploading(false);
        }
    };

    const displayName = (doc: EntityDocumentListItem) =>
        (doc.name && String(doc.name).trim()) ||
        (doc.original_filename && String(doc.original_filename).trim()) ||
        "Untitled";

    const displayWhen = (doc: EntityDocumentListItem) => {
        const raw = doc.uploaded_at || doc.created_at;
        return raw ? formatDateTime(raw) : "";
    };

    const listEmpty = documents.length === 0;

    return (
        <div className="space-y-3">
            {showUpload && canMutate && fileUploadSupported && (
                <>
                    <div className="rounded-lg border border-alloy-stone/30 bg-alloy-pine/5 p-3 space-y-2">
                        <p className="text-xs font-medium text-alloy-midnight/70">Attach document</p>
                        <p className="text-[11px] text-alloy-midnight/50">Uploads are linked to this record.</p>
                        <button
                            type="button"
                            onClick={() => setUploadModalOpen(true)}
                            className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90"
                        >
                            Upload…
                        </button>
                    </div>
                    <AssociatedDocumentUploadModal
                        isOpen={uploadModalOpen}
                        onClose={() => setUploadModalOpen(false)}
                        onSuccess={onAfterUpload}
                        lockAssociation
                        fixedEntityType={uploadEntityType as V1DocumentEntityValue}
                        fixedEntityId={entityId}
                    />
                </>
            )}

            {showUpload && canMutate && !fileUploadSupported && (
                <div className="rounded-lg border border-alloy-stone/30 bg-alloy-pine/5 p-3 space-y-2">
                    <p className="text-xs font-medium text-alloy-midnight/70">Upload document</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                            <label className="block text-xs text-alloy-midnight/60 mb-0.5">Doc type (optional)</label>
                            <input
                                value={docType}
                                onChange={(e) => setDocType(e.target.value)}
                                placeholder="e.g. contract, w9"
                                className="w-full px-2 py-1.5 border rounded text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-alloy-midnight/60 mb-0.5">Title (optional)</label>
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Shown in lists"
                                className="w-full px-2 py-1.5 border rounded text-sm"
                            />
                        </div>
                    </div>
                    <label className="inline-block">
                        <span className="sr-only">Choose file</span>
                        <input type="file" className="text-sm" disabled={uploading} onChange={onPickFileLegacy} />
                    </label>
                    {uploadError && (
                        <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-sm text-red-800" role="alert">
                            {uploadError}
                        </div>
                    )}
                </div>
            )}

            {fetchError && (
                <div
                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 flex flex-wrap items-center justify-between gap-2"
                    role="alert"
                >
                    <span>Could not load documents: {fetchError}</span>
                    {onRetryFetch && (
                        <button
                            type="button"
                            onClick={onRetryFetch}
                            className="shrink-0 px-2 py-1 text-xs font-medium rounded border border-amber-300 hover:bg-amber-100"
                        >
                            Retry
                        </button>
                    )}
                </div>
            )}

            {loading ? (
                <div className="rounded-lg border border-alloy-stone/20 bg-alloy-stone/5 px-3 py-4 text-sm text-alloy-midnight/60" aria-busy="true">
                    Loading documents…
                </div>
            ) : listEmpty && !fetchError ? (
                <div className="rounded-lg border border-dashed border-alloy-stone/40 bg-alloy-stone/5 px-3 py-4 text-center text-sm text-alloy-midnight/60">
                    <p className="font-medium text-alloy-midnight/70">No documents linked yet</p>
                    <p className="mt-1 text-xs text-alloy-midnight/50">
                        {canMutate ? "Upload a file to attach it to this record." : "Documents will appear here after upload."}
                    </p>
                </div>
            ) : listEmpty && fetchError ? null : (
                <ul className="space-y-2">
                    {documents.map((doc) => (
                        <li
                            key={doc.id}
                            className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-alloy-stone/20 px-3 py-2 bg-white/80"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <p className="text-sm font-medium text-alloy-forge/90 truncate">{displayName(doc)}</p>
                                    {doc.artifact_kind === "generated_pdf" || doc.artifact_kind === "submitted_record" ?
                                        <span
                                            className={`shrink-0 rounded border px-1 py-0.5 text-[10px] font-medium ${artifactKindBadgeClass(doc.artifact_kind)}`}
                                        >
                                            {artifactKindDisplayLabel(doc.artifact_kind)}
                                        </span>
                                    : null}
                                    {doc.generation_label_display ?
                                        <span className="shrink-0 text-[10px] text-alloy-midnight/55">
                                            {doc.generation_label_display}
                                        </span>
                                    : null}
                                </div>
                                {doc.provenance_line ?
                                    <p className="mt-0.5 text-[11px] text-alloy-midnight/65">{doc.provenance_line}</p>
                                : null}
                                <p className="text-xs text-alloy-muted">
                                    {[doc.document_type, doc.status, displayWhen(doc)].filter(Boolean).join(" · ") || "—"}
                                </p>
                                {(doc.source_form_submission_admin_path || doc.source_packet_session_admin_path) && (
                                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                                        {doc.source_form_submission_admin_path ?
                                            <a
                                                href={doc.source_form_submission_admin_path}
                                                className="font-medium text-alloy-blue hover:underline"
                                            >
                                                {doc.open_target === "submission_link" ? "View submission" : "Form submission"}
                                            </a>
                                        : null}
                                        {doc.source_packet_session_admin_path ?
                                            <a
                                                href={doc.source_packet_session_admin_path}
                                                className="font-medium text-alloy-blue hover:underline"
                                            >
                                                Packet session
                                            </a>
                                        : null}
                                    </p>
                                )}
                            </div>
                            {doc.open_target === "submission_link" || isSyntheticPacketDocumentId(doc.id) ?
                                doc.source_form_submission_admin_path ?
                                    <a
                                        href={doc.source_form_submission_admin_path}
                                        className="shrink-0 text-xs px-2 py-1 border border-alloy-blue/50 rounded text-alloy-blue hover:bg-alloy-blue/10 font-medium"
                                    >
                                        View submission
                                    </a>
                                :   null
                            :   <button
                                    type="button"
                                    disabled={openingId === doc.id}
                                    onClick={() => openSignedUrl(doc.id)}
                                    className="text-xs px-2 py-1 border border-alloy-blue/50 rounded text-alloy-blue hover:bg-alloy-blue/10 shrink-0 disabled:opacity-50"
                                >
                                    {openingId === doc.id ? "Opening…" : "Open"}
                                </button>
                            }
                        </li>
                    ))}
                </ul>
            )}

            {openError && (
                <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-sm text-red-800" role="alert">
                    {openError}
                </div>
            )}
        </div>
    );
}
