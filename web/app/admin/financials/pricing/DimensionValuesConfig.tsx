"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "@/lib/adminFormatters";
import type { PricingDimensionValueListItem } from "@/app/api/admin/pricing-dimension-values/route";
import type { PricingDimensionListItem } from "@/app/api/admin/pricing-dimensions/route";

export default function DimensionValuesConfig() {
    const [items, setItems] = useState<PricingDimensionValueListItem[]>([]);
    const [dimensions, setDimensions] = useState<PricingDimensionListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [addSaving, setAddSaving] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const [form, setForm] = useState({ value_label: "", value_key: "", pricing_dimension_id: "", sort_order: "", is_active: true });
    const [patchingId, setPatchingId] = useState<string | null>(null);

    const fetchList = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [valsRes, dimRes] = await Promise.all([
                fetch("/api/admin/pricing-dimension-values"),
                fetch("/api/admin/pricing-dimensions"),
            ]);
            const valsJson = await valsRes.json().catch(() => ({}));
            const dimJson = await dimRes.json().catch(() => ({}));
            if (valsRes.ok) setItems(valsJson.pricing_dimension_values ?? []);
            else setError((valsJson as { error?: string }).error ?? "Failed to load");
            setDimensions(dimJson.pricing_dimensions ?? []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchList(); }, [fetchList]);

    const openAdd = () => {
        setForm({ value_label: "", value_key: "", pricing_dimension_id: dimensions[0]?.id ?? "", sort_order: "", is_active: true });
        setAddError(null);
        setAddOpen(true);
    };

    const submitAdd = async () => {
        if (!form.value_label.trim() && !form.value_key.trim()) {
            setAddError("Value label or key is required");
            return;
        }
        if (!form.pricing_dimension_id.trim()) {
            setAddError("Dimension is required");
            return;
        }
        setAddSaving(true);
        setAddError(null);
        try {
            const res = await fetch("/api/admin/pricing-dimension-values", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    value_label: form.value_label.trim() || null,
                    value_key: form.value_key.trim() || null,
                    pricing_dimension_id: form.pricing_dimension_id.trim() || null,
                    dimension_id: form.pricing_dimension_id.trim() || null,
                    sort_order: form.sort_order.trim() ? Number(form.sort_order) : null,
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

    const patch = useCallback(async (id: string, payload: Partial<PricingDimensionValueListItem>) => {
        setPatchingId(id);
        try {
            const res = await fetch(`/api/admin/pricing-dimension-values/${id}`, {
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
                <h2 className="text-lg font-semibold text-alloy-pine">Dimension Values</h2>
                <button type="button" onClick={openAdd} disabled={dimensions.length === 0} className="px-3 py-1.5 text-sm font-medium bg-alloy-pine text-white rounded-md hover:opacity-90 disabled:opacity-50">
                    Add Value
                </button>
            </div>
            {dimensions.length === 0 && !loading && <p className="text-sm text-alloy-midnight/70 mb-2">Add a Pricing Dimension first, then add values here.</p>}
            {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
            <div className="rounded-lg border border-admin-border bg-white overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-alloy-midnight/60">Loading…</div>
                ) : items.length === 0 ? (
                    <div className="p-8 text-center text-alloy-midnight/60">No dimension values. Add a value to use in the Pricing Matrix.</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-admin-border bg-alloy-pine/10">
                                <th className="text-left px-4 py-2 font-medium text-alloy-pine">Dimension</th>
                                <th className="text-left px-4 py-2 font-medium text-alloy-pine">Value Label</th>
                                <th className="text-left px-4 py-2 font-medium text-alloy-pine">Value Key</th>
                                <th className="text-left px-4 py-2 font-medium text-alloy-pine">Sort Order</th>
                                <th className="text-left px-4 py-2 font-medium text-alloy-pine">Active</th>
                                <th className="text-left px-4 py-2 font-medium text-alloy-pine">Updated</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((r) => (
                                <tr key={r.id} className="border-b border-admin-border/50 hover:bg-alloy-pine/5">
                                    <td className="px-4 py-2 text-alloy-midnight/80">{r._dimension_label ?? "—"}</td>
                                    <td className="px-4 py-2">
                                        <input
                                            type="text"
                                            className="w-full max-w-xs rounded border border-admin-border px-2 py-1 text-sm"
                                            defaultValue={r.value_label ?? ""}
                                            onBlur={(e) => { const v = e.target.value.trim(); if (v !== (r.value_label ?? "")) patch(r.id, { value_label: v || undefined }); }}
                                            disabled={patchingId === r.id}
                                        />
                                    </td>
                                    <td className="px-4 py-2">
                                        <input
                                            type="text"
                                            className="w-full max-w-[100px] rounded border border-admin-border px-2 py-1 text-sm font-mono"
                                            defaultValue={r.value_key ?? ""}
                                            onBlur={(e) => { const v = e.target.value.trim(); if (v !== (r.value_key ?? "")) patch(r.id, { value_key: v || undefined }); }}
                                            disabled={patchingId === r.id}
                                        />
                                    </td>
                                    <td className="px-4 py-2">
                                        <input
                                            type="number"
                                            className="w-16 rounded border border-admin-border px-2 py-1 text-sm text-right"
                                            defaultValue={r.sort_order ?? ""}
                                            onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== r.sort_order && (v === null || Number.isFinite(v))) patch(r.id, { sort_order: v ?? undefined }); }}
                                            disabled={patchingId === r.id}
                                        />
                                    </td>
                                    <td className="px-4 py-2">
                                        <input
                                            type="checkbox"
                                            checked={!!r.is_active}
                                            onChange={(e) => patch(r.id, { is_active: e.target.checked })}
                                            disabled={patchingId === r.id}
                                        />
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
                        <h3 className="text-lg font-semibold text-alloy-pine mb-4">Add Dimension Value</h3>
                        {addError && <p className="mb-3 text-sm text-red-600">{addError}</p>}
                        <div className="space-y-3">
                            <label className="block">
                                <span className="block text-xs font-medium text-alloy-midnight/70 mb-1">Dimension</span>
                                <select value={form.pricing_dimension_id} onChange={(e) => setForm((f) => ({ ...f, pricing_dimension_id: e.target.value }))} className="w-full rounded border border-admin-border px-2 py-1.5 text-sm" required>
                                    <option value="">Select dimension</option>
                                    {dimensions.map((d) => <option key={d.id} value={d.id}>{d.dimension_label ?? d.name ?? d.dimension_key ?? d.id}</option>)}
                                </select>
                            </label>
                            <label className="block">
                                <span className="block text-xs font-medium text-alloy-midnight/70 mb-1">Value Label</span>
                                <input value={form.value_label} onChange={(e) => setForm((f) => ({ ...f, value_label: e.target.value }))} className="w-full rounded border border-admin-border px-2 py-1.5 text-sm" placeholder="e.g. 0-1500 sqft" />
                            </label>
                            <label className="block">
                                <span className="block text-xs font-medium text-alloy-midnight/70 mb-1">Value Key (optional)</span>
                                <input value={form.value_key} onChange={(e) => setForm((f) => ({ ...f, value_key: e.target.value }))} className="w-full rounded border border-admin-border px-2 py-1.5 text-sm font-mono" placeholder="e.g. 0_1500" />
                            </label>
                            <label className="block">
                                <span className="block text-xs font-medium text-alloy-midnight/70 mb-1">Sort Order (optional)</span>
                                <input type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))} className="w-full rounded border border-admin-border px-2 py-1.5 text-sm" placeholder="0" />
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
