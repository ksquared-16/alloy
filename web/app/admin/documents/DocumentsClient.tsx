"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import AssociatedDocumentUploadModal from "@/components/admin/AssociatedDocumentUploadModal";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { formatDateTime } from "@/lib/adminFormatters";
import { StatusBadge, getStatusVariant } from "@/components/admin/StatusBadge";
import {
    V1_DOCUMENT_ENTITY_OPTIONS,
    drawerTypeForDocumentEntity,
    type V1DocumentEntityValue,
} from "@/lib/admin/v1DocumentEntities";

type DocListRow = {
    id: string;
    name: string | null;
    original_filename: string | null;
    document_type: string | null;
    status: string | null;
    status_key?: string | null;
    _status_display?: string | null;
    uploaded_at: string | null;
    created_at: string | null;
    entity_type: string | null;
    entity_id: string | null;
    related_label: string | null;
};

function rowTitle(r: DocListRow) {
    const t = r.name?.trim() || r.original_filename?.trim();
    return t || "Untitled";
}

function entityTypeLabel(t: string | null) {
    if (!t) return "—";
    const o = V1_DOCUMENT_ENTITY_OPTIONS.find((x) => x.value === t);
    return o?.label ?? t;
}

export default function DocumentsClient() {
    const { canMutate } = useAdminAuth();
    const { openDrawer } = useAdminDrawer();

    const [rows, setRows] = useState<DocListRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [entityFilter, setEntityFilter] = useState<"" | V1DocumentEntityValue>("");
    const [uploadOpen, setUploadOpen] = useState(false);
    const [hintsText, setHintsText] = useState("");
    const [hintsLoading, setHintsLoading] = useState(false);
    const [hintsSaving, setHintsSaving] = useState(false);
    const [hintsError, setHintsError] = useState<string | null>(null);
    const [hintsSaved, setHintsSaved] = useState(false);
    const [openingId, setOpeningId] = useState<string | null>(null);

    const fetchList = useCallback(async () => {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams();
        if (entityFilter) params.set("entity_type", entityFilter);
        params.set("limit", "200");
        try {
            const res = await fetch(`/api/admin/documents?${params}`);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load documents");
            setRows((json as { documents?: DocListRow[] }).documents ?? []);
        } catch (e) {
            setError((e as Error).message);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [entityFilter]);

    useEffect(() => {
        fetchList();
    }, [fetchList]);

    useEffect(() => {
        const onSaved = (ev: Event) => {
            const d = (ev as CustomEvent<{ type?: string }>).detail;
            if (d?.type === "documents") fetchList();
        };
        window.addEventListener("admin-entity-saved", onSaved);
        return () => window.removeEventListener("admin-entity-saved", onSaved);
    }, [fetchList]);

    const loadHints = useCallback(async () => {
        if (!canMutate) return;
        setHintsLoading(true);
        setHintsError(null);
        try {
            const res = await fetch("/api/admin/org-settings");
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load settings");
            const meta = (json as { metadata?: Record<string, unknown> }).metadata ?? {};
            const raw = meta.v1_document_type_hints;
            const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
            setHintsText(list.map((s) => String(s).trim()).filter(Boolean).join("\n"));
        } catch (e) {
            setHintsError((e as Error).message);
        } finally {
            setHintsLoading(false);
        }
    }, [canMutate]);

    useEffect(() => {
        loadHints();
    }, [loadHints]);

    const saveHints = async () => {
        if (!canMutate) return;
        setHintsSaving(true);
        setHintsError(null);
        setHintsSaved(false);
        try {
            const lines = hintsText
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean);
            const res = await fetch("/api/admin/org-settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ metadata: { v1_document_type_hints: lines } }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Save failed");
            setHintsSaved(true);
            setTimeout(() => setHintsSaved(false), 2000);
        } catch (e) {
            setHintsError((e as Error).message);
        } finally {
            setHintsSaving(false);
        }
    };

    const openSignedUrl = async (docId: string) => {
        setOpeningId(docId);
        try {
            const res = await fetch(`/api/admin/documents/${encodeURIComponent(docId)}/signed-url`);
            const json = await res.json().catch(() => ({}));
            if (res.ok && (json as { ok?: boolean; signedUrl?: string }).ok && (json as { signedUrl: string }).signedUrl) {
                window.open((json as { signedUrl: string }).signedUrl, "_blank", "noopener,noreferrer");
            }
        } finally {
            setOpeningId(null);
        }
    };

    const openRelated = (r: DocListRow) => {
        const dt = drawerTypeForDocumentEntity(r.entity_type);
        const id = r.entity_id?.trim();
        if (!dt || !id) return;
        openDrawer({ type: dt, id });
    };

    const filterNote = useMemo(() => {
        if (!entityFilter) return "Showing all types (up to 200, newest first).";
        return `Filtered to ${entityTypeLabel(entityFilter)}.`;
    }, [entityFilter]);

    return (
        <>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <AdminPageHeader
                    title="Documents"
                    subtitle="Upload files linked to customers, vendors, opportunities, contacts, people, jobs, or schedules. Use the table to audit and open files."
                />
                {canMutate && (
                    <button
                        type="button"
                        onClick={() => setUploadOpen(true)}
                        className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 shrink-0"
                    >
                        Upload document
                    </button>
                )}
            </div>

            <AssociatedDocumentUploadModal
                isOpen={uploadOpen}
                onClose={() => setUploadOpen(false)}
                onSuccess={fetchList}
            />

            {canMutate && (
                <SectionCard title="Doc type suggestions (optional)">
                    <p className="text-xs text-alloy-midnight/60 mb-2">
                        One value per line. Shown as autocomplete when uploading — not a formal schema.
                    </p>
                    {hintsLoading ? (
                        <p className="text-sm text-alloy-midnight/50">Loading…</p>
                    ) : (
                        <>
                            <textarea
                                value={hintsText}
                                onChange={(e) => setHintsText(e.target.value)}
                                rows={5}
                                className="w-full px-2 py-1.5 border rounded text-sm font-mono"
                                placeholder={"w9\ncontract\ninvoice"}
                            />
                            {hintsError && <p className="text-sm text-red-600 mt-1">{hintsError}</p>}
                            <div className="flex items-center gap-2 mt-2">
                                <button
                                    type="button"
                                    disabled={hintsSaving}
                                    onClick={saveHints}
                                    className="px-3 py-1.5 text-sm bg-alloy-midnight text-white rounded-md disabled:opacity-50"
                                >
                                    {hintsSaving ? "Saving…" : "Save suggestions"}
                                </button>
                                {hintsSaved && <span className="text-xs text-green-700">Saved.</span>}
                            </div>
                        </>
                    )}
                </SectionCard>
            )}

            <SectionCard title="All documents">
                <div className="flex flex-wrap items-end gap-3 mb-4">
                    <div>
                        <label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Related record type</label>
                        <select
                            value={entityFilter}
                            onChange={(e) => setEntityFilter((e.target.value || "") as "" | V1DocumentEntityValue)}
                            className="px-2 py-1.5 border rounded text-sm min-w-[180px]"
                        >
                            <option value="">All types</option>
                            {V1_DOCUMENT_ENTITY_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <p className="text-xs text-alloy-midnight/50 pb-1">{filterNote}</p>
                </div>

                {loading && <p className="text-sm text-alloy-midnight/60">Loading…</p>}
                {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

                {!loading && !error && (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[880px] text-left text-sm">
                            <thead>
                                <tr className="border-b border-alloy-stone/30 text-alloy-midnight/60">
                                    <th className="pb-2 pr-3 font-semibold">Status</th>
                                    <th className="pb-2 pr-3 font-semibold">Title</th>
                                    <th className="pb-2 pr-3 font-semibold">Doc type</th>
                                    <th className="pb-2 pr-3 font-semibold">Entity</th>
                                    <th className="pb-2 pr-3 font-semibold">Related record</th>
                                    <th className="pb-2 pr-3 font-semibold">Created</th>
                                    <th className="pb-2 font-semibold">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="py-6 text-alloy-midnight/50">
                                            No documents yet. Upload one and link it to a record.
                                        </td>
                                    </tr>
                                ) : (
                                    rows.map((r) => (
                                        <tr key={r.id} className="border-b border-alloy-stone/20 align-top">
                                            <td className="py-2 pr-3 whitespace-nowrap">
                                                <StatusBadge
                                                    label={r._status_display ?? r.status ?? "—"}
                                                    variant={getStatusVariant(r._status_display ?? r.status)}
                                                />
                                            </td>
                                            <td className="py-2 pr-3 font-medium text-alloy-forge/90 max-w-[200px]">
                                                <span className="line-clamp-2">{rowTitle(r)}</span>
                                            </td>
                                            <td className="py-2 pr-3 text-alloy-midnight/70">{r.document_type ?? "—"}</td>
                                            <td className="py-2 pr-3 text-alloy-midnight/70">{entityTypeLabel(r.entity_type)}</td>
                                            <td className="py-2 pr-3 text-alloy-midnight/80 max-w-[220px]">
                                                {r.related_label ? (
                                                    <span className="line-clamp-2">{r.related_label}</span>
                                                ) : r.entity_id ? (
                                                    <span className="font-mono text-xs">{r.entity_id.slice(0, 8)}…</span>
                                                ) : (
                                                    "—"
                                                )}
                                            </td>
                                            <td className="py-2 pr-3 text-alloy-midnight/60 whitespace-nowrap">
                                                {r.created_at ? formatDateTime(r.created_at) : "—"}
                                            </td>
                                            <td className="py-2 space-x-1 whitespace-nowrap">
                                                <button
                                                    type="button"
                                                    onClick={() => openDrawer({ type: "documents", id: r.id })}
                                                    className="text-xs px-2 py-1 border border-alloy-stone/40 rounded hover:bg-alloy-stone/10"
                                                >
                                                    Details
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={openingId === r.id}
                                                    onClick={() => openSignedUrl(r.id)}
                                                    className="text-xs px-2 py-1 border border-alloy-blue/50 rounded text-alloy-blue hover:bg-alloy-blue/10 disabled:opacity-50"
                                                >
                                                    {openingId === r.id ? "…" : "Open"}
                                                </button>
                                                {drawerTypeForDocumentEntity(r.entity_type) && r.entity_id ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => openRelated(r)}
                                                        className="text-xs px-2 py-1 border border-alloy-stone/40 rounded hover:bg-alloy-stone/10"
                                                    >
                                                        Record
                                                    </button>
                                                ) : null}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionCard>
        </>
    );
}
