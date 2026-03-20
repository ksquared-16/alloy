"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Drawer from "@/components/admin/Drawer";
import {
    V1_DOCUMENT_ENTITY_OPTIONS,
    type V1DocumentEntityValue,
} from "@/lib/admin/v1DocumentEntities";

type Option = { id: string; label: string };

type Props = {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    /** When true, entity type/id are fixed (e.g. record drawer). */
    lockAssociation?: boolean;
    fixedEntityType?: V1DocumentEntityValue;
    fixedEntityId?: string;
};

export default function AssociatedDocumentUploadModal({
    isOpen,
    onClose,
    onSuccess,
    lockAssociation = false,
    fixedEntityType,
    fixedEntityId,
}: Props) {
    const hintsListId = useId().replace(/:/g, "");
    const [entityType, setEntityType] = useState<V1DocumentEntityValue>("customer");
    const [entityId, setEntityId] = useState("");
    const [options, setOptions] = useState<Option[]>([]);
    const [optionsLoading, setOptionsLoading] = useState(false);
    const [optionsError, setOptionsError] = useState<string | null>(null);
    const [labelFilter, setLabelFilter] = useState("");
    const [docType, setDocType] = useState("");
    const [title, setTitle] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [docTypeHints, setDocTypeHints] = useState<string[]>([]);

    const effectiveType = lockAssociation && fixedEntityType ? fixedEntityType : entityType;
    const effectiveId = lockAssociation && fixedEntityId ? fixedEntityId : entityId;

    const filteredOptions = useMemo(() => {
        const q = labelFilter.trim().toLowerCase();
        if (!q) return options;
        return options.filter((o) => o.label.toLowerCase().includes(q));
    }, [options, labelFilter]);

    const loadHints = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/org-settings");
            const json = await res.json().catch(() => ({}));
            if (!res.ok) return;
            const meta = (json as { metadata?: Record<string, unknown> }).metadata ?? {};
            const raw = meta.v1_document_type_hints;
            const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
            setDocTypeHints(list.map((s) => String(s).trim()).filter(Boolean));
        } catch {
            setDocTypeHints([]);
        }
    }, []);

    const loadOptions = useCallback(async () => {
        if (lockAssociation) return;
        setOptionsLoading(true);
        setOptionsError(null);
        try {
            const res = await fetch(`/api/admin/documents/entity-options?entity_type=${encodeURIComponent(entityType)}`);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load records");
            const opts = (json as { options?: Option[] }).options ?? [];
            setOptions(opts);
            setEntityId("");
        } catch (e) {
            setOptionsError((e as Error).message);
            setOptions([]);
        } finally {
            setOptionsLoading(false);
        }
    }, [entityType, lockAssociation]);

    useEffect(() => {
        if (!isOpen) return;
        loadHints();
    }, [isOpen, loadHints]);

    useEffect(() => {
        if (!isOpen) return;
        if (lockAssociation) {
            setEntityType(fixedEntityType ?? "customer");
            setEntityId(fixedEntityId ?? "");
            setOptions([]);
            setOptionsError(null);
            return;
        }
        loadOptions();
    }, [isOpen, lockAssociation, fixedEntityType, fixedEntityId, entityType, loadOptions]);

    useEffect(() => {
        if (!isOpen) {
            setLabelFilter("");
            setDocType("");
            setTitle("");
            setFile(null);
            setUploadError(null);
            setOptionsError(null);
            if (!lockAssociation) {
                setEntityType("customer");
                setEntityId("");
                setOptions([]);
            }
        }
    }, [isOpen, lockAssociation]);

    const fixedLabel = useMemo(() => {
        if (!lockAssociation || !fixedEntityType) return "";
        const opt = V1_DOCUMENT_ENTITY_OPTIONS.find((o) => o.value === fixedEntityType);
        return opt?.label ?? fixedEntityType;
    }, [lockAssociation, fixedEntityType]);

    const shortId = (id: string) => (id.length <= 14 ? id : `${id.slice(0, 8)}…`);

    const submit = async () => {
        setUploadError(null);
        if (!file) {
            setUploadError("Choose a file to upload.");
            return;
        }
        if (!effectiveId?.trim()) {
            setUploadError("Select the record this document belongs to.");
            return;
        }
        setUploading(true);
        try {
            const fd = new FormData();
            fd.set("file", file);
            fd.set("entity_type", effectiveType);
            fd.set("entity_id", effectiveId.trim());
            if (docType.trim()) fd.set("doc_type", docType.trim());
            if (title.trim()) fd.set("title", title.trim());
            const res = await fetch("/api/admin/documents/upload", { method: "POST", body: fd });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? `Upload failed (${res.status})`);
            onSuccess();
            onClose();
        } catch (e) {
            setUploadError((e as Error).message);
        } finally {
            setUploading(false);
        }
    };

    return (
        <Drawer isOpen={isOpen} onClose={() => !uploading && onClose()} title="Attach document" zIndexBackdrop={60} zIndexPanel={70}>
            <div className="space-y-4 text-sm">
                <p className="text-alloy-midnight/70 text-xs">
                    Documents must be linked to a customer, vendor, opportunity, contact, person, job, or schedule.
                </p>

                {lockAssociation ? (
                    <div className="rounded-md border border-alloy-stone/30 bg-alloy-stone/5 px-3 py-2">
                        <p className="text-xs font-medium text-alloy-midnight/60">Linked record</p>
                        <p className="text-alloy-forge/90 font-medium">
                            {fixedLabel}
                            {fixedEntityId ? (
                                <>
                                    {" · "}
                                    <span className="font-mono text-xs font-normal text-alloy-midnight/80">{shortId(fixedEntityId)}</span>
                                </>
                            ) : null}
                        </p>
                    </div>
                ) : (
                    <>
                        <div>
                            <label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Record type</label>
                            <select
                                value={entityType}
                                onChange={(e) => setEntityType(e.target.value as V1DocumentEntityValue)}
                                className="w-full px-2 py-1.5 border rounded text-sm"
                            >
                                {V1_DOCUMENT_ENTITY_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Search / filter</label>
                            <input
                                value={labelFilter}
                                onChange={(e) => setLabelFilter(e.target.value)}
                                placeholder="Filter loaded records…"
                                className="w-full px-2 py-1.5 border rounded text-sm mb-2"
                            />
                            {optionsLoading ? (
                                <p className="text-xs text-alloy-midnight/50">Loading records…</p>
                            ) : optionsError ? (
                                <p className="text-xs text-red-600">{optionsError}</p>
                            ) : (
                                <select
                                    value={entityId}
                                    onChange={(e) => setEntityId(e.target.value)}
                                    className="w-full px-2 py-1.5 border rounded text-sm"
                                    size={Math.min(8, Math.max(3, filteredOptions.length || 3))}
                                >
                                    <option value="">— Select record —</option>
                                    {filteredOptions.map((o) => (
                                        <option key={o.id} value={o.id}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <p className="text-[11px] text-alloy-midnight/45 mt-1">
                                Showing up to 40 matches (recent or alphabetical). Refine with the filter above.
                            </p>
                        </div>
                    </>
                )}

                <div>
                    <label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">File *</label>
                    <input
                        type="file"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        className="w-full text-sm"
                    />
                </div>

                <div>
                    <label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Doc type (optional)</label>
                    <input
                        value={docType}
                        onChange={(e) => setDocType(e.target.value)}
                        list={hintsListId}
                        placeholder="e.g. contract, w9"
                        className="w-full px-2 py-1.5 border rounded text-sm"
                    />
                    <datalist id={hintsListId}>
                        {docTypeHints.map((h) => (
                            <option key={h} value={h} />
                        ))}
                    </datalist>
                </div>

                <div>
                    <label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Title (optional)</label>
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Shown in lists"
                        className="w-full px-2 py-1.5 border rounded text-sm"
                    />
                </div>

                {uploadError && (
                    <div className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-sm text-red-800" role="alert">
                        {uploadError}
                    </div>
                )}

                <div className="flex gap-2 pt-2">
                    <button
                        type="button"
                        disabled={uploading}
                        onClick={submit}
                        className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50"
                    >
                        {uploading ? "Uploading…" : "Upload"}
                    </button>
                    <button
                        type="button"
                        disabled={uploading}
                        onClick={onClose}
                        className="px-3 py-1.5 text-sm border rounded-md"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </Drawer>
    );
}
