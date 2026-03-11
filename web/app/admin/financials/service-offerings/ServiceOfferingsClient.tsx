"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminListPageHeader from "@/components/admin/AdminListPageHeader";
import DataTable from "@/components/admin/DataTable";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { buildEntityTableColumns } from "@/components/admin/entity/buildEntityTableColumns";
import type { ServiceOfferingListItem } from "@/app/api/admin/service-offerings/route";

type VerticalOption = { id: string; name: string | null; slug: string | null };

export default function ServiceOfferingsClient() {
    const { openDrawer } = useAdminDrawer();
    const { labels } = useEntityLabels();
    const plural = labels?.service_offerings?.plural ?? "Service Offerings";
    const [items, setItems] = useState<ServiceOfferingListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [addSaving, setAddSaving] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const [verticals, setVerticals] = useState<VerticalOption[]>([]);
    const [form, setForm] = useState({
        offering_name: "",
        offering_key: "",
        vertical_id: "",
        description: "",
        is_active: true,
    });

    const fetchList = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/service-offerings?limit=200&offset=0");
            const json = await res.json();
            if (res.ok) {
                setItems(json.service_offerings ?? []);
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
            if (d?.type === "service_offerings") fetchList();
        };
        window.addEventListener("admin-entity-saved", onSaved);
        return () => window.removeEventListener("admin-entity-saved", onSaved);
    }, [fetchList]);

    const openAdd = () => {
        setForm({ offering_name: "", offering_key: "", vertical_id: "", description: "", is_active: true });
        setAddError(null);
        setAddOpen(true);
    };

    const submitAdd = async () => {
        if (!form.offering_name.trim() && !form.offering_key.trim()) {
            setAddError("Name or Key is required");
            return;
        }
        setAddSaving(true);
        setAddError(null);
        try {
            const res = await fetch("/api/admin/service-offerings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    offering_name: form.offering_name.trim() || null,
                    offering_key: form.offering_key.trim() || null,
                    vertical_id: form.vertical_id.trim() || null,
                    description: form.description.trim() || null,
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
            if (id) openDrawer({ type: "service_offerings", id });
        } finally {
            setAddSaving(false);
        }
    };

    const columns = useMemo(
        () => buildEntityTableColumns<ServiceOfferingListItem>("service_offerings", {}),
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
                        Add Offering
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
                        <h2 className="text-lg font-semibold text-alloy-forge mb-4">Add Offering</h2>
                        {addError && <p className="mb-3 text-sm text-red-600">{addError}</p>}
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Name</label>
                                <input
                                    value={form.offering_name}
                                    onChange={(e) => setForm((f) => ({ ...f, offering_name: e.target.value }))}
                                    className="w-full rounded border border-admin-border px-2 py-1.5 text-sm"
                                    placeholder="Offering name"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Key</label>
                                <input
                                    value={form.offering_key}
                                    onChange={(e) => setForm((f) => ({ ...f, offering_key: e.target.value }))}
                                    className="w-full rounded border border-admin-border px-2 py-1.5 text-sm"
                                    placeholder="offering_key"
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
                                <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Description</label>
                                <textarea
                                    value={form.description}
                                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                                    rows={2}
                                    className="w-full rounded border border-admin-border px-2 py-1.5 text-sm"
                                    placeholder="Optional"
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
                    onRowClick={(row) => openDrawer({ type: "service_offerings", id: row.id })}
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
