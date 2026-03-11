"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminListPageHeader from "@/components/admin/AdminListPageHeader";
import DataTable from "@/components/admin/DataTable";
import Drawer from "@/components/admin/Drawer";
import { formatDate, formatDateTime } from "@/lib/adminFormatters";

export type GLAccountRow = {
    id: string;
    code: string;
    name: string;
    type: string;
    currency: string;
    is_active: boolean;
    created_at?: string | null;
    updated_at?: string | null;
};

const ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense"] as const;

function formatType(t: string): string {
    if (!t) return "—";
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

export default function AccountsClient() {
    const [data, setData] = useState<GLAccountRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [detailId, setDetailId] = useState<string | null>(null);
    const [detail, setDetail] = useState<GLAccountRow | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [drawerTab, setDrawerTab] = useState<"overview" | "related" | "activity">("overview");

    const [newOpen, setNewOpen] = useState(false);
    const [newForm, setNewForm] = useState({ code: "", name: "", type: "expense", currency: "USD", is_active: true });
    const [newSaving, setNewSaving] = useState(false);
    const [newError, setNewError] = useState<string | null>(null);

    const [editForm, setEditForm] = useState({ code: "", name: "", type: "expense", currency: "USD", is_active: true });
    const [editDirty, setEditDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const fetchList = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/financials/accounts");
            const json = await res.json();
            if (res.ok) setData(json.data ?? []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchList();
    }, [fetchList]);

    const openDetail = useCallback(async (id: string) => {
        setDetailId(id);
        setDetail(null);
        setDrawerTab("overview");
        setDetailLoading(true);
        try {
            const res = await fetch(`/api/admin/financials/accounts/${id}`);
            const json = await res.json();
            if (res.ok) {
                setDetail(json);
                setEditForm({
                    code: json.code ?? "",
                    name: json.name ?? "",
                    type: json.type ?? "expense",
                    currency: json.currency ?? "USD",
                    is_active: json.is_active !== false,
                });
                setEditDirty(false);
                setSaveError(null);
            }
        } finally {
            setDetailLoading(false);
        }
    }, []);

    const saveEdit = useCallback(async () => {
        if (!detailId || !detail) return;
        setSaving(true);
        setSaveError(null);
        try {
            const res = await fetch(`/api/admin/financials/accounts/${detailId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editForm),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setSaveError((json.error as string) || "Save failed");
                return;
            }
            setDetail(json);
            setEditDirty(false);
            fetchList();
        } finally {
            setSaving(false);
        }
    }, [detailId, detail, editForm, fetchList]);

    const columns = useMemo(
        () => [
            { key: "code", label: "Code", sortable: true, render: (_: unknown, row: GLAccountRow) => <span className="font-mono text-alloy-forge">{row.code}</span> },
            { key: "name", label: "Name", sortable: true, render: (_: unknown, row: GLAccountRow) => row.name || "—" },
            { key: "type", label: "Type", sortable: true, render: (_: unknown, row: GLAccountRow) => formatType(row.type) },
            { key: "currency", label: "Currency", sortable: true, render: (_: unknown, row: GLAccountRow) => row.currency ?? "—" },
            { key: "is_active", label: "Active", sortable: true, render: (_: unknown, row: GLAccountRow) => (row.is_active ? "Yes" : "No") },
            { key: "updated_at", label: "Updated", sortable: true, render: (_: unknown, row: GLAccountRow) => (row.updated_at ? formatDateTime(row.updated_at) : row.created_at ? formatDate(row.created_at) : "—") },
        ],
        []
    );

    const handleCreate = async () => {
        if (!newForm.code.trim()) {
            setNewError("Code is required");
            return;
        }
        setNewSaving(true);
        setNewError(null);
        try {
            const res = await fetch("/api/admin/financials/accounts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newForm),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setNewError((json.error as string) || "Create failed");
                return;
            }
            setNewOpen(false);
            setNewForm({ code: "", name: "", type: "expense", currency: "USD", is_active: true });
            fetchList();
            openDetail(json.id);
        } finally {
            setNewSaving(false);
        }
    };

    return (
        <>
            <AdminListPageHeader
                title="GL Accounts"
                toolbarRight={
                    <button
                        type="button"
                        onClick={() => { setNewOpen(true); setNewError(null); }}
                        className="rounded-lg bg-alloy-blue px-3 py-2 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-alloy-blue/30"
                    >
                        New GL Account
                    </button>
                }
            />
            <div className="pt-4">
                <DataTable
                    data={data}
                    columns={columns}
                    hideToolbar
                    loading={loading}
                    onRowClick={(row) => openDetail(row.id)}
                />
            </div>
            {data.length === 0 && !loading && <p className="text-sm text-alloy-midnight/60 py-4">No GL accounts. Create one to get started.</p>}

            <Drawer
                isOpen={!!detailId}
                onClose={() => setDetailId(null)}
                title={detail ? `${detail.code} · ${detail.name || "GL Account"}` : "GL Account"}
                zIndexBackdrop={60}
                zIndexPanel={70}
            >
                {detailLoading && <p className="text-sm text-alloy-midnight/60">Loading…</p>}
                {!detailLoading && detail && (
                    <div className="space-y-4">
                        <div className="flex gap-2 rounded-lg border border-admin-border bg-white p-1">
                            {(["overview", "related", "activity"] as const).map((tab) => (
                                <button
                                    key={tab}
                                    type="button"
                                    onClick={() => setDrawerTab(tab)}
                                    className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${drawerTab === tab ? "bg-alloy-blue text-white shadow-sm" : "text-alloy-forge/80 hover:bg-alloy-stone/50"}`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>

                        {drawerTab === "overview" && (
                            <div className="space-y-4">
                                {saveError && <p className="text-sm text-red-600">{saveError}</p>}
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div>
                                        <label className="block text-xs font-medium text-alloy-muted mb-0.5">Code</label>
                                        <input
                                            value={editForm.code}
                                            onChange={(e) => { setEditForm((f) => ({ ...f, code: e.target.value })); setEditDirty(true); }}
                                            className="w-full rounded-lg border border-admin-border px-3 py-2 text-sm font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-alloy-muted mb-0.5">Name</label>
                                        <input
                                            value={editForm.name}
                                            onChange={(e) => { setEditForm((f) => ({ ...f, name: e.target.value })); setEditDirty(true); }}
                                            className="w-full rounded-lg border border-admin-border px-3 py-2 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-alloy-muted mb-0.5">Type</label>
                                        <select
                                            value={editForm.type}
                                            onChange={(e) => { setEditForm((f) => ({ ...f, type: e.target.value })); setEditDirty(true); }}
                                            className="w-full rounded-lg border border-admin-border px-3 py-2 text-sm"
                                        >
                                            {ACCOUNT_TYPES.map((t) => (
                                                <option key={t} value={t}>{formatType(t)}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-alloy-muted mb-0.5">Currency</label>
                                        <input
                                            value={editForm.currency}
                                            onChange={(e) => { setEditForm((f) => ({ ...f, currency: e.target.value })); setEditDirty(true); }}
                                            className="w-full rounded-lg border border-admin-border px-3 py-2 text-sm"
                                        />
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="inline-flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={editForm.is_active}
                                                onChange={(e) => { setEditForm((f) => ({ ...f, is_active: e.target.checked })); setEditDirty(true); }}
                                                className="rounded border-admin-border text-alloy-blue"
                                            />
                                            <span className="text-sm text-alloy-forge">Active</span>
                                        </label>
                                    </div>
                                </div>
                                {editDirty && (
                                    <div className="flex gap-2">
                                        <button type="button" onClick={saveEdit} disabled={saving} className="rounded-lg bg-alloy-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
                                            {saving ? "Saving…" : "Save"}
                                        </button>
                                        <button type="button" onClick={() => { setEditForm({ code: detail.code, name: detail.name ?? "", type: detail.type ?? "expense", currency: detail.currency ?? "USD", is_active: detail.is_active !== false }); setEditDirty(false); setSaveError(null); }} className="rounded-lg border border-admin-border px-3 py-1.5 text-sm font-medium text-alloy-forge/80 hover:bg-alloy-stone/50">
                                            Cancel
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {drawerTab === "related" && (
                            <div className="space-y-3">
                                <h4 className="text-xs font-semibold uppercase text-alloy-muted">Journal lines</h4>
                                <p className="text-sm text-alloy-muted">Recent journal lines for this account are not yet available in this view. Use the Ledger to inspect transactions and journal entries.</p>
                            </div>
                        )}

                        {drawerTab === "activity" && (
                            <div className="space-y-3">
                                {detail.created_at && (
                                    <div><span className="block text-xs font-medium text-alloy-muted">Created</span><span className="text-sm text-alloy-forge">{formatDateTime(detail.created_at)}</span></div>
                                )}
                                {detail.updated_at && (
                                    <div><span className="block text-xs font-medium text-alloy-muted">Updated</span><span className="text-sm text-alloy-forge">{formatDateTime(detail.updated_at)}</span></div>
                                )}
                                {!detail.created_at && !detail.updated_at && <p className="text-sm text-alloy-muted">No activity dates.</p>}
                            </div>
                        )}
                    </div>
                )}
            </Drawer>

            {newOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true">
                    <div className="w-full max-w-md rounded-xl border border-admin-border bg-white p-6 shadow-lg">
                        <h3 className="text-lg font-semibold text-alloy-forge mb-4">New GL Account</h3>
                        {newError && <p className="text-sm text-red-600 mb-3">{newError}</p>}
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-alloy-muted mb-0.5">Code *</label>
                                <input value={newForm.code} onChange={(e) => setNewForm((f) => ({ ...f, code: e.target.value }))} className="w-full rounded-lg border border-admin-border px-3 py-2 text-sm font-mono" placeholder="e.g. 4000" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-alloy-muted mb-0.5">Name</label>
                                <input value={newForm.name} onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))} className="w-full rounded-lg border border-admin-border px-3 py-2 text-sm" placeholder="e.g. Revenue - Services" />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-alloy-muted mb-0.5">Type</label>
                                <select value={newForm.type} onChange={(e) => setNewForm((f) => ({ ...f, type: e.target.value }))} className="w-full rounded-lg border border-admin-border px-3 py-2 text-sm">
                                    {ACCOUNT_TYPES.map((t) => (
                                        <option key={t} value={t}>{formatType(t)}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-alloy-muted mb-0.5">Currency</label>
                                <input value={newForm.currency} onChange={(e) => setNewForm((f) => ({ ...f, currency: e.target.value }))} className="w-full rounded-lg border border-admin-border px-3 py-2 text-sm" />
                            </div>
                            <label className="inline-flex items-center gap-2">
                                <input type="checkbox" checked={newForm.is_active} onChange={(e) => setNewForm((f) => ({ ...f, is_active: e.target.checked }))} className="rounded border-admin-border text-alloy-blue" />
                                <span className="text-sm text-alloy-forge">Active</span>
                            </label>
                        </div>
                        <div className="mt-6 flex gap-2 justify-end">
                            <button type="button" onClick={() => { setNewOpen(false); setNewError(null); }} className="rounded-lg border border-admin-border px-3 py-1.5 text-sm font-medium text-alloy-forge/80 hover:bg-alloy-stone/50">Cancel</button>
                            <button type="button" onClick={handleCreate} disabled={newSaving || !newForm.code.trim()} className="rounded-lg bg-alloy-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">{newSaving ? "Creating…" : "Create"}</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
