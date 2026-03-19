"use client";

import { useRef, useState } from "react";
import { formatDateTime } from "@/lib/adminFormatters";

export type EntityDocumentListItem = {
    id: string;
    name?: string | null;
    original_filename?: string | null;
    document_type?: string | null;
    status?: string | null;
    uploaded_at?: string | null;
    created_at?: string | null;
};

type Props = {
    documents: EntityDocumentListItem[];
    loading?: boolean;
    /** Canonical type for documents.entity_type (e.g. customer, job, contact). */
    uploadEntityType: string;
    entityId: string;
    canMutate: boolean;
    onAfterUpload: () => void;
    /** Optional title above list (default: none — parent often has section header). */
    showUpload?: boolean;
};

export default function EntityDocumentsSection({
    documents,
    loading = false,
    uploadEntityType,
    entityId,
    canMutate,
    onAfterUpload,
    showUpload = true,
}: Props) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [docType, setDocType] = useState("");
    const [title, setTitle] = useState("");

    const openSignedUrl = async (docId: string) => {
        const res = await fetch(`/api/admin/documents/${encodeURIComponent(docId)}/signed-url`);
        const json = await res.json().catch(() => ({}));
        if (json.ok && (json as { signedUrl?: string }).signedUrl) {
            window.open((json as { signedUrl: string }).signedUrl, "_blank", "noopener,noreferrer");
        } else {
            alert((json as { error?: string }).error || "Could not open file");
        }
    };

    const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error || "Upload failed");
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

    return (
        <div className="space-y-3">
            {showUpload && canMutate && (
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
                    <input ref={fileInputRef} type="file" className="hidden" onChange={onPickFile} />
                    <button
                        type="button"
                        disabled={uploading}
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50"
                    >
                        {uploading ? "Uploading…" : "Choose file"}
                    </button>
                    {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
                </div>
            )}

            {loading ? (
                <p className="text-sm text-alloy-midnight/60">Loading…</p>
            ) : documents.length === 0 ? (
                <p className="text-sm text-alloy-midnight/60">No documents yet.</p>
            ) : (
                <ul className="space-y-2">
                    {documents.map((doc) => (
                        <li
                            key={doc.id}
                            className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-alloy-stone/20 px-3 py-2 bg-white/80"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-alloy-forge/90 truncate">{displayName(doc)}</p>
                                <p className="text-xs text-alloy-muted">
                                    {[doc.document_type, doc.status, displayWhen(doc)].filter(Boolean).join(" · ")}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => openSignedUrl(doc.id)}
                                className="text-xs px-2 py-1 border border-alloy-blue/50 rounded text-alloy-blue hover:bg-alloy-blue/10 shrink-0"
                            >
                                Open
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
