"use client";

import { useCallback, useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

const FIELD_TYPES = ["text", "email", "phone", "number", "date", "datetime", "boolean"] as const;

type DocFieldDef = {
    id: string;
    org_id: string;
    doc_type: string;
    field_key: string;
    field_label: string;
    field_type: string;
    is_required: boolean;
    is_ai_extractable: boolean;
    extraction_hint: string | null;
    sort_order: number | null;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string | null;
};

function toDef(r: Record<string, unknown>): DocFieldDef {
    return {
        id: String(r.id),
        org_id: String(r.org_id),
        doc_type: String(r.doc_type),
        field_key: String(r.field_key),
        field_label: String(r.field_label),
        field_type: String(r.field_type),
        is_required: Boolean(r.is_required),
        is_ai_extractable: Boolean(r.is_ai_extractable),
        extraction_hint: r.extraction_hint != null ? String(r.extraction_hint) : null,
        sort_order: typeof r.sort_order === "number" ? r.sort_order : r.sort_order != null ? Number(r.sort_order) : null,
        metadata: r.metadata != null && typeof r.metadata === "object" ? (r.metadata as Record<string, unknown>) : {},
        created_at: String(r.created_at),
        updated_at: r.updated_at != null ? String(r.updated_at) : null,
    };
}

export default function DocumentFieldsClient() {
    const { canMutate } = useAdminAuth();
    const [docTypeFilter, setDocTypeFilter] = useState("general");
    const [docTypeInput, setDocTypeInput] = useState("general");
    const [items, setItems] = useState<DocFieldDef[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [configLocked, setConfigLocked] = useState(false);

    const [createOpen, setCreateOpen] = useState(false);
    const [createKey, setCreateKey] = useState("");
    const [createLabel, setCreateLabel] = useState("");
    const [createType, setCreateType] = useState<string>("text");
    const [createRequired, setCreateRequired] = useState(false);
    const [createAi, setCreateAi] = useState(false);
    const [createHint, setCreateHint] = useState("");
    const [createSort, setCreateSort] = useState<number | "">("");
    const [createSaving, setCreateSaving] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    const [editRow, setEditRow] = useState<DocFieldDef | null>(null);
    const [editLabel, setEditLabel] = useState("");
    const [editType, setEditType] = useState("");
    const [editRequired, setEditRequired] = useState(false);
    const [editAi, setEditAi] = useState(false);
    const [editHint, setEditHint] = useState("");
    const [editSort, setEditSort] = useState<number | "">("");
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);

    const fetchConfigLock = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/org-settings");
            const json = await res.json().catch(() => ({}));
            if (res.ok) setConfigLocked(Boolean((json as { config_locked?: boolean }).config_locked));
        } catch {
            setConfigLocked(false);
        }
    }, []);

    const fetchItems = useCallback(async () => {
        const dt = docTypeFilter.trim();
        if (!dt) {
            setItems([]);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/document-field-definitions?doc_type=${encodeURIComponent(dt)}`);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Failed to load");
            const raw = (json as { definitions?: Record<string, unknown>[] }).definitions ?? [];
            setItems(raw.map(toDef));
        } catch (e) {
            setError((e as Error).message);
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [docTypeFilter]);

    useEffect(() => {
        fetchConfigLock();
    }, [fetchConfigLock]);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    const applyDocType = () => {
        const next = docTypeInput.trim() || "general";
        setDocTypeInput(next);
        setDocTypeFilter(next);
    };

    const locked = configLocked || !canMutate;

    const openCreate = () => {
        setCreateKey("");
        setCreateLabel("");
        setCreateType("text");
        setCreateRequired(false);
        setCreateAi(false);
        setCreateHint("");
        setCreateSort("");
        setCreateError(null);
        setCreateOpen(true);
    };

    const saveCreate = async () => {
        if (locked) return;
        setCreateSaving(true);
        setCreateError(null);
        try {
            const res = await fetch("/api/admin/document-field-definitions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    doc_type: docTypeFilter.trim(),
                    field_key: createKey.trim().toLowerCase(),
                    field_label: createLabel.trim(),
                    field_type: createType,
                    is_required: createRequired,
                    is_ai_extractable: createAi,
                    extraction_hint: createHint.trim() || null,
                    sort_order: createSort === "" ? null : Number(createSort),
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Create failed");
            setCreateOpen(false);
            await fetchItems();
        } catch (e) {
            setCreateError((e as Error).message);
        } finally {
            setCreateSaving(false);
        }
    };

    const openEdit = (row: DocFieldDef) => {
        setEditRow(row);
        setEditLabel(row.field_label);
        setEditType(row.field_type);
        setEditRequired(row.is_required);
        setEditAi(row.is_ai_extractable);
        setEditHint(row.extraction_hint ?? "");
        setEditSort(row.sort_order ?? "");
        setEditError(null);
    };

    const saveEdit = async () => {
        if (!editRow || locked) return;
        setEditSaving(true);
        setEditError(null);
        try {
            const res = await fetch(`/api/admin/document-field-definitions/${editRow.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    field_label: editLabel.trim(),
                    field_type: editType,
                    is_required: editRequired,
                    is_ai_extractable: editAi,
                    extraction_hint: editHint.trim() || null,
                    sort_order: editSort === "" ? null : Number(editSort),
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Update failed");
            setEditRow(null);
            await fetchItems();
        } catch (e) {
            setEditError((e as Error).message);
        } finally {
            setEditSaving(false);
        }
    };

    const removeRow = async (row: DocFieldDef) => {
        if (locked) return;
        if (!confirm(`Delete field "${row.field_key}" for doc type "${row.doc_type}"?`)) return;
        const res = await fetch(`/api/admin/document-field-definitions/${row.id}`, { method: "DELETE" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            alert((json as { error?: string }).error ?? "Delete failed");
            return;
        }
        await fetchItems();
    };

    return (
        <>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <AdminPageHeader
                    title="Document field definitions"
                    subtitle="Per doc_type schema for structured values and future AI extraction. Doc type is a free-form key (e.g. w9, contract, general) — align with documents.doc_type when uploading."
                />
            </div>

            <SectionCard title="Doc type">
                <div className="flex flex-wrap items-end gap-2">
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs font-medium text-[#59678b] mb-0.5">doc_type</label>
                        <input
                            value={docTypeInput}
                            onChange={(e) => setDocTypeInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && applyDocType()}
                            className="w-full px-2 py-1.5 border rounded text-sm"
                            placeholder="e.g. w9, invoice, general"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={applyDocType}
                        className="px-3 py-1.5 text-sm bg-alloy-midnight text-white rounded-md hover:opacity-90"
                    >
                        Load fields
                    </button>
                    {canMutate && !configLocked && (
                        <button
                            type="button"
                            onClick={openCreate}
                            className="px-3 py-1.5 text-sm border border-alloy-stone/50 rounded-md hover:bg-alloy-stone/10"
                        >
                            Add field
                        </button>
                    )}
                </div>
                {configLocked && (
                    <p className="mt-2 text-sm text-amber-800">Organization configuration is locked; field changes are disabled.</p>
                )}
            </SectionCard>

            {loading && <p className="text-sm text-[#59678b] mt-4">Loading…</p>}
            {error && (
                <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
            )}

            {!loading && !error && (
                <SectionCard title={`Fields for “${docTypeFilter}”`}>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-left text-sm">
                            <thead>
                                <tr className="border-b border-[#e6e8ec] text-[#59678b]">
                                    <th className="pb-2 pr-4 font-semibold">Key</th>
                                    <th className="pb-2 pr-4 font-semibold">Label</th>
                                    <th className="pb-2 pr-4 font-semibold">Type</th>
                                    <th className="pb-2 pr-4 font-semibold">Required</th>
                                    <th className="pb-2 pr-4 font-semibold">AI</th>
                                    <th className="pb-2 pr-4 font-semibold">Sort</th>
                                    <th className="pb-2 pr-4 font-semibold">Hint</th>
                                    {canMutate && !configLocked && <th className="pb-2 font-semibold">Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {items.length === 0 ? (
                                    <tr>
                                        <td colSpan={canMutate && !configLocked ? 8 : 7} className="py-4 text-[#59678b]">
                                            No definitions for this doc type. Add fields to describe extracted or manual values.
                                        </td>
                                    </tr>
                                ) : (
                                    items.map((row) => (
                                        <tr key={row.id} className="border-b border-[#e6e8ec] align-middle">
                                            <td className="py-2 pr-4 font-mono text-[#59678b]">{row.field_key}</td>
                                            <td className="py-2 pr-4 font-medium text-[#31394d]">{row.field_label}</td>
                                            <td className="py-2 pr-4 text-[#59678b]">{row.field_type}</td>
                                            <td className="py-2 pr-4">{row.is_required ? "Yes" : "No"}</td>
                                            <td className="py-2 pr-4">{row.is_ai_extractable ? "Yes" : "No"}</td>
                                            <td className="py-2 pr-4 text-[#59678b]">{row.sort_order ?? "—"}</td>
                                            <td className="py-2 pr-4 text-[#59678b] max-w-[200px] truncate" title={row.extraction_hint ?? ""}>
                                                {row.extraction_hint ?? "—"}
                                            </td>
                                            {canMutate && !configLocked && (
                                                <td className="py-2 space-x-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => openEdit(row)}
                                                        className="rounded border border-alloy-stone/50 px-2 py-1 text-xs font-medium hover:bg-alloy-stone/20"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeRow(row)}
                                                        className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-50"
                                                    >
                                                        Delete
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </SectionCard>
            )}

            {createOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    onClick={() => !createSaving && setCreateOpen(false)}
                >
                    <div
                        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-[#e6e8ec] bg-white p-4 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="mb-4 text-lg font-semibold text-[#31394d]">New field ({docTypeFilter})</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">field_key</label>
                                <input
                                    value={createKey}
                                    onChange={(e) => setCreateKey(e.target.value)}
                                    className="w-full px-2 py-1.5 border rounded text-sm font-mono"
                                    placeholder="snake_case"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">field_label</label>
                                <input
                                    value={createLabel}
                                    onChange={(e) => setCreateLabel(e.target.value)}
                                    className="w-full px-2 py-1.5 border rounded text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">field_type</label>
                                <select
                                    value={createType}
                                    onChange={(e) => setCreateType(e.target.value)}
                                    className="w-full px-2 py-1.5 border rounded text-sm"
                                >
                                    {FIELD_TYPES.map((t) => (
                                        <option key={t} value={t}>
                                            {t}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={createRequired} onChange={(e) => setCreateRequired(e.target.checked)} />
                                Required
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={createAi} onChange={(e) => setCreateAi(e.target.checked)} />
                                AI extractable
                            </label>
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">extraction_hint</label>
                                <textarea
                                    value={createHint}
                                    onChange={(e) => setCreateHint(e.target.value)}
                                    className="w-full px-2 py-1.5 border rounded text-sm"
                                    rows={2}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">sort_order</label>
                                <input
                                    type="number"
                                    value={createSort}
                                    onChange={(e) => setCreateSort(e.target.value === "" ? "" : Number(e.target.value))}
                                    className="w-full px-2 py-1.5 border rounded text-sm"
                                />
                            </div>
                            {createError && <p className="text-sm text-red-600">{createError}</p>}
                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    disabled={createSaving || locked}
                                    onClick={saveCreate}
                                    className="px-3 py-1.5 text-sm bg-alloy-midnight text-white rounded-md disabled:opacity-50"
                                >
                                    {createSaving ? "Saving…" : "Create"}
                                </button>
                                <button type="button" onClick={() => setCreateOpen(false)} className="px-3 py-1.5 text-sm border rounded-md">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {editRow && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    onClick={() => !editSaving && setEditRow(null)}
                >
                    <div
                        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-[#e6e8ec] bg-white p-4 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="mb-4 text-lg font-semibold text-[#31394d]">Edit field: {editRow.field_key}</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">field_label</label>
                                <input
                                    value={editLabel}
                                    onChange={(e) => setEditLabel(e.target.value)}
                                    className="w-full px-2 py-1.5 border rounded text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">field_type</label>
                                <select
                                    value={editType}
                                    onChange={(e) => setEditType(e.target.value)}
                                    className="w-full px-2 py-1.5 border rounded text-sm"
                                >
                                    {FIELD_TYPES.map((t) => (
                                        <option key={t} value={t}>
                                            {t}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={editRequired} onChange={(e) => setEditRequired(e.target.checked)} />
                                Required
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={editAi} onChange={(e) => setEditAi(e.target.checked)} />
                                AI extractable
                            </label>
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">extraction_hint</label>
                                <textarea
                                    value={editHint}
                                    onChange={(e) => setEditHint(e.target.value)}
                                    className="w-full px-2 py-1.5 border rounded text-sm"
                                    rows={2}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[#59678b] mb-0.5">sort_order</label>
                                <input
                                    type="number"
                                    value={editSort}
                                    onChange={(e) => setEditSort(e.target.value === "" ? "" : Number(e.target.value))}
                                    className="w-full px-2 py-1.5 border rounded text-sm"
                                />
                            </div>
                            {editError && <p className="text-sm text-red-600">{editError}</p>}
                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    disabled={editSaving || locked}
                                    onClick={saveEdit}
                                    className="px-3 py-1.5 text-sm bg-alloy-midnight text-white rounded-md disabled:opacity-50"
                                >
                                    {editSaving ? "Saving…" : "Save"}
                                </button>
                                <button type="button" onClick={() => setEditRow(null)} className="px-3 py-1.5 text-sm border rounded-md">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
