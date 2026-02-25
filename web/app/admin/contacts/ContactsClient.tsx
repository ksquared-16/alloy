"use client";

import { useCallback, useEffect, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import SectionCard from "@/components/admin/SectionCard";
import Drawer from "@/components/admin/Drawer";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime } from "@/lib/adminFormatters";

type Contact = {
    id: string;
    created_at: string;
    updated_at?: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    company_name?: string | null;
    status: string | null;
    notes?: string | null;
    customer_id?: string | null;
    vendor_id?: string | null;
    vendor_contact_role?: string | null;
    archived_at: string | null;
    archived_by?: string | null;
};

const EMPTY_FORM = {
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    company_name: "",
    notes: "",
    status: "active",
    customer_id: "",
    vendor_id: "",
    vendor_contact_role: "",
};

export default function ContactsClient() {
    const { labels } = useEntityLabels();
    const title = labels?.contacts?.plural ?? "Contacts";
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [searchApplied, setSearchApplied] = useState("");
    const [includeArchived, setIncludeArchived] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saveLoading, setSaveLoading] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

    const fetchList = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (searchApplied) params.set("search", searchApplied);
        if (includeArchived) params.set("include_archived", "true");
        try {
            const res = await fetch(`/api/admin/contacts?${params}`);
            const json = await res.json();
            if (res.ok) {
                setContacts(json.contacts ?? []);
            }
        } finally {
            setLoading(false);
        }
    }, [searchApplied, includeArchived]);

    useEffect(() => {
        fetchList();
    }, [fetchList]);

    const openCreate = () => {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setSaveError(null);
        setDrawerOpen(true);
    };

    const openEdit = (c: Contact) => {
        setEditingId(c.id);
        setForm({
            first_name: c.first_name ?? "",
            last_name: c.last_name ?? "",
            email: c.email ?? "",
            phone: c.phone ?? "",
            company_name: (c as { company_name?: string }).company_name ?? "",
            notes: (c as { notes?: string }).notes ?? "",
            status: c.status ?? "active",
            customer_id: (c as { customer_id?: string }).customer_id ?? "",
            vendor_id: (c as { vendor_id?: string }).vendor_id ?? "",
            vendor_contact_role: (c as { vendor_contact_role?: string }).vendor_contact_role ?? "",
        });
        setSaveError(null);
        setDrawerOpen(true);
    };

    const handleSave = async () => {
        setSaveLoading(true);
        setSaveError(null);
        try {
            if (editingId) {
                const res = await fetch(`/api/admin/contacts/${editingId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        first_name: form.first_name || null,
                        last_name: form.last_name || null,
                        email: form.email || null,
                        phone: form.phone || null,
                        company_name: form.company_name || null,
                        notes: form.notes || null,
                        status: form.status || null,
                        customer_id: form.customer_id || null,
                        vendor_id: form.vendor_id || null,
                        vendor_contact_role: form.vendor_contact_role || null,
                    }),
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) {
                    setSaveError((json as { error?: string }).error ?? "Update failed");
                    return;
                }
            } else {
                const res = await fetch("/api/admin/contacts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        first_name: form.first_name || null,
                        last_name: form.last_name || null,
                        email: form.email || null,
                        phone: form.phone || null,
                        company_name: form.company_name || null,
                        notes: form.notes || null,
                        status: form.status || null,
                        customer_id: form.customer_id || null,
                        vendor_id: form.vendor_id || null,
                        vendor_contact_role: form.vendor_contact_role || null,
                    }),
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) {
                    setSaveError((json as { error?: string }).error ?? "Create failed");
                    return;
                }
            }
            setDrawerOpen(false);
            fetchList();
        } finally {
            setSaveLoading(false);
        }
    };

    const archive = async (id: string) => {
        setActionLoadingId(id);
        try {
            const res = await fetch(`/api/admin/contacts/${id}/archive`, { method: "POST" });
            if (res.ok) fetchList();
        } finally {
            setActionLoadingId(null);
        }
    };

    const unarchive = async (id: string) => {
        setActionLoadingId(id);
        try {
            const res = await fetch(`/api/admin/contacts/${id}/unarchive`, { method: "POST" });
            if (res.ok) fetchList();
        } finally {
            setActionLoadingId(null);
        }
    };

    const name = (c: Contact) => [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";

    return (
        <>
            <AdminPageHeader title={title} subtitle="Contact records scoped by your org. Create, edit, and archive." />
            <SectionCard title="Filters" className="mb-4">
                <div className="flex flex-wrap items-end gap-4">
                    <div>
                        <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Search (name, email, phone, company)</label>
                        <div className="flex gap-1">
                            <input
                                type="text"
                                placeholder="Search…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), setSearchApplied(search.trim()))}
                                className="px-2 py-1.5 border border-alloy-stone/40 rounded text-sm w-56"
                            />
                            <button
                                type="button"
                                onClick={() => setSearchApplied(search.trim())}
                                className="px-3 py-1.5 text-sm bg-alloy-stone/30 rounded hover:bg-alloy-stone/50"
                            >
                                Apply
                            </button>
                            {searchApplied && (
                                <button type="button" onClick={() => { setSearch(""); setSearchApplied(""); }} className="px-2 py-1.5 text-sm text-alloy-midnight/70 hover:underline">
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="include_archived"
                            checked={includeArchived}
                            onChange={(e) => setIncludeArchived(e.target.checked)}
                            className="rounded border-alloy-stone/40"
                        />
                        <label htmlFor="include_archived" className="text-sm text-alloy-midnight/70">Include archived</label>
                    </div>
                </div>
            </SectionCard>
            <SectionCard title="Contacts">
                <div className="flex items-center justify-between gap-4 mb-4">
                    <span className="text-sm text-alloy-midnight/60">{contacts.length} contact(s)</span>
                    <button
                        type="button"
                        onClick={openCreate}
                        className="px-3 py-1.5 text-sm font-medium bg-alloy-midnight text-white rounded-md hover:opacity-90"
                    >
                        New contact
                    </button>
                </div>
                {loading ? (
                    <p className="text-sm text-alloy-midnight/60">Loading…</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-alloy-stone/30 text-left text-alloy-midnight/70">
                                    <th className="pb-2 pr-4">Name</th>
                                    <th className="pb-2 pr-4">Email</th>
                                    <th className="pb-2 pr-4">Phone</th>
                                    <th className="pb-2 pr-4">Status</th>
                                    <th className="pb-2 pr-4">Archived</th>
                                    <th className="pb-2 pr-4">Created</th>
                                    <th className="pb-2 pr-4">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {contacts.length === 0 ? (
                                    <tr><td colSpan={7} className="py-4 text-alloy-midnight/60">No contacts found.</td></tr>
                                ) : (
                                    contacts.map((c) => (
                                        <tr key={c.id} className="border-b border-alloy-stone/20 hover:bg-alloy-stone/10">
                                            <td className="py-2 pr-4">{name(c)}</td>
                                            <td className="py-2 pr-4">{c.email ?? "—"}</td>
                                            <td className="py-2 pr-4">{c.phone ?? "—"}</td>
                                            <td className="py-2 pr-4"><StatusBadge label={c.status} variant={c.status === "active" ? "success" : "neutral"} /></td>
                                            <td className="py-2 pr-4">{c.archived_at ? "Yes" : "—"}</td>
                                            <td className="py-2 pr-4">{formatDateTime(c.created_at)}</td>
                                            <td className="py-2 pr-4">
                                                <span className="flex flex-wrap gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => openEdit(c)}
                                                        className="text-xs px-2 py-0.5 text-alloy-blue hover:underline"
                                                    >
                                                        Edit
                                                    </button>
                                                    {c.archived_at ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => unarchive(c.id)}
                                                            disabled={actionLoadingId === c.id}
                                                            className="text-xs px-2 py-0.5 text-alloy-midnight/70 hover:underline disabled:opacity-50"
                                                        >
                                                            Unarchive
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => archive(c.id)}
                                                            disabled={actionLoadingId === c.id}
                                                            className="text-xs px-2 py-0.5 text-amber-700 hover:underline disabled:opacity-50"
                                                        >
                                                            Archive
                                                        </button>
                                                    )}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </SectionCard>

            <Drawer
                isOpen={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                title={editingId ? "Edit contact" : "New contact"}
                zIndexBackdrop={60}
                zIndexPanel={70}
            >
                <div className="space-y-4">
                    {saveError && (
                        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{saveError}</p>
                    )}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">First name</label>
                            <input
                                value={form.first_name}
                                onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                                className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Last name</label>
                            <input
                                value={form.last_name}
                                onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                                className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Email</label>
                            <input
                                type="email"
                                value={form.email}
                                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                                className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Phone</label>
                            <input
                                value={form.phone}
                                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                                className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded"
                            />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Company name</label>
                            <input
                                value={form.company_name}
                                onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                                className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Status</label>
                            <select
                                value={form.status}
                                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                                className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded"
                            >
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </div>
                        <div className="col-span-2">
                            <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Notes</label>
                            <textarea
                                value={form.notes}
                                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                                rows={2}
                                className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded"
                            />
                        </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saveLoading}
                            className="px-3 py-1.5 text-sm font-medium bg-alloy-midnight text-white rounded-md hover:opacity-90 disabled:opacity-50"
                        >
                            {saveLoading ? "Saving…" : editingId ? "Update" : "Create"}
                        </button>
                        <button
                            type="button"
                            onClick={() => setDrawerOpen(false)}
                            className="px-3 py-1.5 text-sm border border-alloy-stone/40 rounded hover:bg-alloy-stone/20"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </Drawer>
        </>
    );
}
