"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminListPageHeader from "@/components/admin/AdminListPageHeader";
import DataTable from "@/components/admin/DataTable";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { buildEntityTableColumns } from "@/components/admin/entity/buildEntityTableColumns";
import { RECURRENCE_UNIT_OPTIONS } from "@/lib/adminFormatters";
import type { ServicePlanTemplateListItem } from "@/app/api/admin/service-plan-templates/route";

export default function PlanTemplatesClient() {
    const { openDrawer } = useAdminDrawer();
    const { labels } = useEntityLabels();
    const plural = labels?.service_plan_templates?.plural ?? "Plan Templates";
    const [items, setItems] = useState<ServicePlanTemplateListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [addSaving, setAddSaving] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const [form, setForm] = useState({
        plan_name: "",
        plan_key: "",
        is_recurring: true,
        recurrence_unit: "week",
        recurrence_interval: 1,
        is_active: true,
    });

    const fetchList = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/service-plan-templates?limit=200&offset=0");
            const json = await res.json();
            if (res.ok) {
                setItems(json.service_plan_templates ?? []);
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
        const onSaved = (e: Event) => {
            const d = (e as CustomEvent<{ type: string; id: string }>)?.detail;
            if (d?.type === "service_plan_templates") fetchList();
        };
        window.addEventListener("admin-entity-saved", onSaved);
        return () => window.removeEventListener("admin-entity-saved", onSaved);
    }, [fetchList]);

    const openAdd = () => {
        setForm({
            plan_name: "",
            plan_key: "",
            is_recurring: true,
            recurrence_unit: "week",
            recurrence_interval: 1,
            is_active: true,
        });
        setAddError(null);
        setAddOpen(true);
    };

    const submitAdd = async () => {
        if (!form.plan_name.trim() && !form.plan_key.trim()) {
            setAddError("Name or Key is required");
            return;
        }
        setAddSaving(true);
        setAddError(null);
        try {
            const res = await fetch("/api/admin/service-plan-templates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    plan_name: form.plan_name.trim() || null,
                    plan_key: form.plan_key.trim() || null,
                    is_recurring: form.is_recurring,
                    recurrence_unit: form.recurrence_unit || null,
                    recurrence_interval: form.recurrence_interval,
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
            if (id) openDrawer({ type: "service_plan_templates", id });
        } finally {
            setAddSaving(false);
        }
    };

    const columns = useMemo(
        () => buildEntityTableColumns<ServicePlanTemplateListItem>("service_plan_templates", {}),
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
                        Add Plan
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
                        <h2 className="text-lg font-semibold text-alloy-forge mb-4">Add Plan</h2>
                        {addError && <p className="mb-3 text-sm text-red-600">{addError}</p>}
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Name</label>
                                <input
                                    value={form.plan_name}
                                    onChange={(e) => setForm((f) => ({ ...f, plan_name: e.target.value }))}
                                    className="w-full rounded border border-admin-border px-2 py-1.5 text-sm"
                                    placeholder="Plan name"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Key</label>
                                <input
                                    value={form.plan_key}
                                    onChange={(e) => setForm((f) => ({ ...f, plan_key: e.target.value }))}
                                    className="w-full rounded border border-admin-border px-2 py-1.5 text-sm"
                                    placeholder="plan_key"
                                />
                            </div>
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={form.is_recurring}
                                    onChange={(e) => setForm((f) => ({ ...f, is_recurring: e.target.checked }))}
                                    className="rounded border-admin-border"
                                />
                                <span className="text-sm text-alloy-forge/90">Recurring</span>
                            </label>
                            {form.is_recurring && (
                                <>
                                    <div>
                                        <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Recurrence unit</label>
                                        <select
                                            value={form.recurrence_unit}
                                            onChange={(e) => setForm((f) => ({ ...f, recurrence_unit: e.target.value }))}
                                            className="w-full rounded border border-admin-border px-2 py-1.5 text-sm"
                                        >
                                            {RECURRENCE_UNIT_OPTIONS.map((o) => (
                                                <option key={o.value} value={o.value}>{o.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Recurrence interval</label>
                                        <input
                                            type="number"
                                            min={1}
                                            value={form.recurrence_interval}
                                            onChange={(e) => setForm((f) => ({ ...f, recurrence_interval: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                                            className="w-full rounded border border-admin-border px-2 py-1.5 text-sm"
                                        />
                                    </div>
                                </>
                            )}
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
                    onRowClick={(row) => openDrawer({ type: "service_plan_templates", id: row.id })}
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
