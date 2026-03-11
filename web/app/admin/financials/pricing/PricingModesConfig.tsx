"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDateTime } from "@/lib/adminFormatters";
import type { PricingModeListItem } from "@/app/api/admin/pricing-modes/route";

export default function PricingModesConfig() {
    const [items, setItems] = useState<PricingModeListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [addSaving, setAddSaving] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const [form, setForm] = useState({ mode_label: "", mode_key: "", is_active: true });
    const [patchingId, setPatchingId] = useState<string | null>(null);

    const fetchList = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/pricing-modes");
            const json = await res.json().catch(() => ({}));
            if (res.ok) setItems(json.pricing_modes ?? []);
            else setError((json as { error?: string }).error ?? "Failed to load");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchList(); }, [fetchList]);

    const openAdd = () => {
        setForm({ mode_label: "", mode_key: "", is_active: true });
        setAddError(null);
        setAddOpen(true);
    };

    const submitAdd = async () => {
        if (!form.mode_key.trim() && !form.mode_label.trim()) {
            setAddError("Name or Key is required");
            return;
        }
        setAddSaving(true);
        setAddError(null);
        try {
            const res = await fetch("/api/admin/pricing-modes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode_key: form.mode_key.trim() || null, mode_label: form.mode_label.trim() || null, is_active: form.is_active }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { setAddError((json as { error?: string }).error ?? "Create failed"); return; }
            setAddOpen(false);
            fetchList();
        } finally {
            setAddSaving(false);
        }
    };

    const patch = useCallback(async (id: string, payload: { mode_label?: string; mode_key?: string; is_active?: boolean }) => {
        setPatchingId(id);
        try {
            const res = await fetch(`/api/admin/pricing-modes/${id}`, {
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
                <h2 className="text-lg font-semibold text-alloy-pine">Pricing Modes</h2>
                <button type="button" onClick={openAdd} className="px-3 py-1.5 text-sm font-medium bg-alloy-pine text-white rounded-md hover:opacity-90">
                    Add Mode
                </button>
            </div>
            {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
            <div className="rounded-lg border border-admin-border bg-white overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-alloy-midnight/60">Loading…</div>
                ) : items.length === 0 ? (
                    <div className="p-8 text-center text-alloy-midnight/60">No pricing modes. Add a mode to use in the Pricing Matrix.</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-admin-border bg-alloy-pine/10">
                                <th className="text-left px-4 py-2 font-medium text-alloy-pine">Name</th>
                                <th className="text-left px-4 py-2 font-medium text-alloy-pine">Key</th>
                                <th className="text-left px-4 py-2 font-medium text-alloy-pine">Active</th>
                                <th className="text-left px-4 py-2 font-medium text-alloy-pine">Updated</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((r) => (
                                <tr key={r.id} className="border-b border-admin-border/50 hover:bg-alloy-pine/5">
                                    <td className="px-4 py-2">
                                        <input
                                            type="text"
                                            className="w-full max-w-xs rounded border border-admin-border px-2 py-1 text-sm"
                                            defaultValue={r.mode_label ?? ""}
                                            onBlur={(e) => { const v = e.target.value.trim(); if (v !== (r.mode_label ?? "")) patch(r.id, { mode_label: v || undefined }); }}
                                            disabled={patchingId === r.id}
                                        />
                                    </td>
                                    <td className="px-4 py-2">
                                        <input
                                            type="text"
                                            className="w-full max-w-[120px] rounded border border-admin-border px-2 py-1 text-sm font-mono"
                                            defaultValue={r.mode_key ?? ""}
                                            onBlur={(e) => { const v = e.target.value.trim(); if (v !== (r.mode_key ?? "")) patch(r.id, { mode_key: v || undefined }); }}
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
                        <h3 className="text-lg font-semibold text-alloy-pine mb-4">Add Pricing Mode</h3>
                        {addError && <p className="mb-3 text-sm text-red-600">{addError}</p>}
                        <div className="space-y-3">
                            <label className="block">
                                <span className="block text-xs font-medium text-alloy-midnight/70 mb-1">Name</span>
                                <input value={form.mode_label} onChange={(e) => setForm((f) => ({ ...f, mode_label: e.target.value }))} className="w-full rounded border border-admin-border px-2 py-1.5 text-sm" placeholder="e.g. Initial" />
                            </label>
                            <label className="block">
                                <span className="block text-xs font-medium text-alloy-midnight/70 mb-1">Key</span>
                                <input value={form.mode_key} onChange={(e) => setForm((f) => ({ ...f, mode_key: e.target.value }))} className="w-full rounded border border-admin-border px-2 py-1.5 text-sm font-mono" placeholder="e.g. initial" />
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
