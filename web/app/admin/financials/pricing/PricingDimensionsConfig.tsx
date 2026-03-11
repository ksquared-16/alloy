"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "@/lib/adminFormatters";
import type { PricingDimensionListItem } from "@/app/api/admin/pricing-dimensions/route";

type VerticalOption = { id: string; name: string | null; slug: string | null };

export default function PricingDimensionsConfig() {
    const [items, setItems] = useState<PricingDimensionListItem[]>([]);
    const [verticals, setVerticals] = useState<VerticalOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [addSaving, setAddSaving] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const [form, setForm] = useState({ dimension_label: "", dimension_key: "", name: "", vertical_id: "", is_active: true });
    const [patchingId, setPatchingId] = useState<string | null>(null);

    const fetchList = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [listRes, vertRes] = await Promise.all([fetch("/api/admin/pricing-dimensions"), fetch("/api/admin/verticals")]);
            const listJson = await listRes.json().catch(() => ({}));
            const vertData = await vertRes.json().catch(() => []);
            if (listRes.ok) setItems(listJson.pricing_dimensions ?? []);
            else setError((listJson as { error?: string }).error ?? "Failed to load");
            setVerticals(Array.isArray(vertData) ? vertData : []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchList(); }, [fetchList]);

    const openAdd = () => {
        setForm({ dimension_label: "", dimension_key: "", name: "", vertical_id: "", is_active: true });
        setAddError(null);
        setAddOpen(true);
    };

    const submitAdd = async () => {
        if (!form.dimension_label.trim() && !form.dimension_key.trim() && !form.name.trim()) {
            setAddError("Name, Key, or Label is required");
            return;
        }
        setAddSaving(true);
        setAddError(null);
        try {
            const res = await fetch("/api/admin/pricing-dimensions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    dimension_label: form.dimension_label.trim() || null,
                    dimension_key: form.dimension_key.trim() || null,
                    name: form.name.trim() || null,
                    vertical_id: form.vertical_id.trim() || null,
                    is_active: form.is_active,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { setAddError((json as { error?: string }).error ?? "Create failed"); return; }
            setAddOpen(false);
            fetchList();
        } finally {
            setAddSaving(false);
        }
    };

    const patch = useCallback(async (id: string, payload: Partial<PricingDimensionListItem>) => {
        setPatchingId(id);
        try {
            const res = await fetch(`/api/admin/pricing-dimensions/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (res.ok) setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...payload, updated_at: new Date().toISOString() } : r)));
        } finally {
            setPatchingId(null);
        }
    }, []);

    return (
        <section className="mt-4">
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-alloy-pine">Pricing Dimensions</h2>
                <button type="button" onClick={openAdd} className="px-3 py-1.5 text-sm font-medium bg-alloy-pine text-white rounded-md hover:opacity-90">Add Dimension</button>
            </div>
            {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
            <div className="rounded-lg border border-admin-border bg-white overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-alloy-midnight/60">Loading…</div>
                ) : items.length === 0 ? (
                    <div className="p-8 text-center text-alloy-midnight/60">No pricing dimensions. Add a dimension to use in the Pricing Matrix.</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-admin-border bg-alloy-pine/10">
                                <th className="text-left px-4 py-2 font-medium text-alloy-pine">Name</th>
                                <th className="text-left px-4 py-2 font-medium text-alloy-pine">Key</th>
                                <th className="text-left px-4 py-2 font-medium text-alloy-pine">Vertical</th>
                                <th className="text-left px-4 py-2 font-medium text-alloy-pine">Active</th>
                                <th className="text-left px-4 py-2 font-medium text-alloy-pine">Updated</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((r) => (
                                <tr key={r.id} className="border-b border-admin-border/50 hover:bg-alloy-pine/5">
                                    <td className="px-4 py-2">
                                        <input type="text" className="w-full max-w-xs rounded border border-admin-border px-2 py-1 text-sm" defaultValue={r.dimension_label ?? r.name ?? ""} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (r.dimension_label ?? r.name ?? "")) patch(r.id, { dimension_label: v || undefined }); }} disabled={patchingId === r.id} />
                                    </td>
                                    <td className="px-4 py-2">
                                        <input type="text" className="w-full max-w-[120px] rounded border border-admin-border px-2 py-1 text-sm font-mono" defaultValue={r.dimension_key ?? ""} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (r.dimension_key ?? "")) patch(r.id, { dimension_key: v || undefined }); }} disabled={patchingId === r.id} />
                                    </td>
                                    <td className="px-4 py-2">{r._vertical_name ?? "—"}</td>
                                    <td className="px-4 py-2">
                                        <input type="checkbox" checked={!!r.is_active} onChange={(e) => patch(r.id, { is_active: e.target.checked })} disabled={patchingId === r.id} />
                                    </td>
                                    <td className="px-4 py-2 text-alloy-midnight/70">{r.updated_at ? formatDateTime(r.updated_at) : "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            {addOpen && (
                <>
                    <div className="fixed inset-0 z-40 bg-black/40" onClick={() => !addSaving && setAddOpen(false)} aria-hidden />
                    <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-admin-border border-l-4 border-l-alloy-pine bg-white p-6 shadow-lg">
                        <h3 className="text-lg font-semibold text-alloy-pine mb-4">Add Pricing Dimension</h3>
                        {addError && <p className="mb-3 text-sm text-red-600">{addError}</p>}
                        <div className="space-y-3">
                            <label className="block">
                                <span className="block text-xs font-medium text-alloy-midnight/70 mb-1">Label / Name</span>
                                <input value={form.dimension_label} onChange={(e) => setForm((f) => ({ ...f, dimension_label: e.target.value }))} className="w-full rounded border border-admin-border px-2 py-1.5 text-sm" placeholder="e.g. Square Footage" />
                            </label>
                            <label className="block">
                                <span className="block text-xs font-medium text-alloy-midnight/70 mb-1">Key</span>
                                <input value={form.dimension_key} onChange={(e) => setForm((f) => ({ ...f, dimension_key: e.target.value }))} className="w-full rounded border border-admin-border px-2 py-1.5 text-sm font-mono" placeholder="e.g. sqft" />
                            </label>
                            <label className="block">
                                <span className="block text-xs font-medium text-alloy-midnight/70 mb-1">Vertical (optional)</span>
                                <select value={form.vertical_id} onChange={(e) => setForm((f) => ({ ...f, vertical_id: e.target.value }))} className="w-full rounded border border-admin-border px-2 py-1.5 text-sm">
                                    <option value="">— None —</option>
                                    {verticals.map((v) => <option key={v.id} value={v.id}>{v.name ?? v.slug ?? v.id}</option>)}
                                </select>
                            </label>
                            <label className="flex items-center gap-2">
                                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
                                <span className="text-sm text-alloy-midnight/80">Active</span>
                            </label>
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <button type="button" onClick={() => !addSaving && setAddOpen(false)} className="px-3 py-1.5 text-sm border border-admin-border rounded-md">Cancel</button>
                            <button type="button" onClick={submitAdd} disabled={addSaving} className="px-3 py-1.5 text-sm font-medium bg-alloy-pine text-white rounded-md disabled:opacity-50">{addSaving ? "Saving…" : "Add"}</button>
                        </div>
                    </div>
                </>
            )}
        </section>
    );
}
