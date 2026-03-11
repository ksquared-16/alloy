"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminListPageHeader from "@/components/admin/AdminListPageHeader";
import DataTable from "@/components/admin/DataTable";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { buildEntityTableColumns } from "@/components/admin/entity/buildEntityTableColumns";
import type { AddonListItem } from "@/app/api/admin/addons/route";

type VerticalOption = { id: string; name: string | null; slug: string | null };

export default function AddOnsClient() {
    const { openDrawer } = useAdminDrawer();
    const { labels } = useEntityLabels();
    const plural = labels?.addons?.plural ?? "Add-ons";
    const [items, setItems] = useState<AddonListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [addSaving, setAddSaving] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const [verticals, setVerticals] = useState<VerticalOption[]>([]);
    const [form, setForm] = useState({
        addon_name: "",
        addon_key: "",
        vertical_id: "",
        amount: "",
        sort_order: "0",
        is_active: true,
    });

    const fetchList = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/addons?limit=200&offset=0");
            const json = await res.json();
            if (res.ok) {
                setItems(json.addons ?? []);
                setTotal(json.total ?? 0);
            } else {
                setError((json as { error?: string }).error ?? "Failed to load");
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchList();
    }, [fetchList]);

    useEffect(() => {
        fetch("/api/admin/verticals")
            .then((r) => (r.ok ? r.json() : []))
            .then((data: VerticalOption[]) => setVerticals(Array.isArray(data) ? data : []))
            .catch(() => setVerticals([]));
    }, []);

    useEffect(() => {
        const onSaved = (e: Event) => {
            const d = (e as CustomEvent<{ type: string; id: string }>)?.detail;
            if (d?.type === "addons") fetchList();
        };
        window.addEventListener("admin-entity-saved", onSaved);
        return () => window.removeEventListener("admin-entity-saved", onSaved);
    }, [fetchList]);

    const openAdd = () => {
        setForm({ addon_name: "", addon_key: "", vertical_id: "", amount: "", sort_order: "0", is_active: true });
        setAddError(null);
        setAddOpen(true);
    };

    const submitAdd = async () => {
        if (!form.addon_name.trim() && !form.addon_key.trim()) {
            setAddError("Add-on name or Key is required");
            return;
        }
        const amountNum = parseFloat(form.amount);
        if (form.amount !== "" && (Number.isNaN(amountNum) || amountNum < 0)) {
            setAddError("Amount must be a non-negative number");
            return;
        }
        setAddSaving(true);
        setAddError(null);
        try {
            const amount = form.amount === "" ? 0 : amountNum;
            const res = await fetch("/api/admin/addons", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    addon_name: form.addon_name.trim() || null,
                    addon_key: form.addon_key.trim() || null,
                    vertical_id: form.vertical_id.trim() || null,
                    amount,
                    sort_order: parseInt(form.sort_order, 10) || 0,
                    is_active: form.is_active,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setAddError((json.error as string) ?? "Create failed");
                return;
            }
            const id = (json as { id?: string }).id;
            setAddOpen(false);
            fetchList();
            if (id) openDrawer({ type: "addons", id });
        } finally {
            setAddSaving(false);
        }
    };

    const columns = useMemo(
        () => buildEntityTableColumns<AddonListItem>("addons", {}),
        []
    );

    return (
        <>
            <AdminListPageHeader
                title={plural}
                toolbarRight={
                    <button
                        type="button"
                        onClick={openAdd}
                        className="px-3 py-1.5 text-sm font-medium bg-alloy-blue text-white rounded-md hover:opacity-90"
                    >
                        Add Add-on
                    </button>
                }
            />
            {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    {error}
                </div>
            )}
            {addOpen && (
                <>
                    <div className="fixed inset-0 z-40 bg-black/40" onClick={() => !addSaving && setAddOpen(false)} aria-hidden />
                    <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-admin-border bg-white p-6 shadow-lg">
                        <h2 className="text-lg font-semibold text-alloy-forge mb-4">Add Add-on</h2>
                        {addError && <p className="mb-3 text-sm text-red-600">{addError}</p>}
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Add-on name</label>
                                <input
                                    value={form.addon_name}
                                    onChange={(e) => setForm((f) => ({ ...f, addon_name: e.target.value }))}
                                    className="w-full rounded border border-admin-border px-2 py-1.5 text-sm"
                                    placeholder="Add-on name"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Key</label>
                                <input
                                    value={form.addon_key}
                                    onChange={(e) => setForm((f) => ({ ...f, addon_key: e.target.value }))}
                                    className="w-full rounded border border-admin-border px-2 py-1.5 text-sm"
                                    placeholder="addon_key"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Vertical</label>
                                <select
                                    value={form.vertical_id}
                                    onChange={(e) => setForm((f) => ({ ...f, vertical_id: e.target.value }))}
                                    className="w-full rounded border border-admin-border px-2 py-1.5 text-sm"
                                >
                                    <option value="">— None —</option>
                                    {verticals.map((v) => (
                                        <option key={v.id} value={v.id}>{v.name ?? v.slug ?? v.id}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Amount ($)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={form.amount}
                                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                                    className="w-full rounded border border-admin-border px-2 py-1.5 text-sm"
                                    placeholder="0.00"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Sort order</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={form.sort_order}
                                    onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
                                    className="w-full rounded border border-admin-border px-2 py-1.5 text-sm"
                                />
                            </div>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={form.is_active}
                                    onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                                    className="rounded border-admin-border"
                                />
                                <span className="text-sm text-alloy-forge/90">Active</span>
                            </label>
                        </div>
                        <div className="mt-6 flex gap-2 justify-end">
                            <button type="button" onClick={() => !addSaving && setAddOpen(false)} className="px-3 py-1.5 text-sm border border-admin-border rounded-md hover:bg-alloy-stone/20" disabled={addSaving}>Cancel</button>
                            <button type="button" onClick={submitAdd} disabled={addSaving} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50">{addSaving ? "Creating…" : "Create"}</button>
                        </div>
                    </div>
                </>
            )}
            <div className="pt-4">
                <DataTable
                    data={items}
                    columns={columns}
                    filters={[]}
                    searchable={false}
                    hideToolbar
                    loading={loading}
                    onRowClick={(row) => openDrawer({ type: "addons", id: row.id })}
                />
                {total > 0 && (
                    <p className="mt-2 px-1 text-xs text-alloy-muted">
                        Showing {items.length} of {total}
                    </p>
                )}
            </div>
        </>
    );
}
