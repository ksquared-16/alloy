"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import DataTable from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime } from "@/lib/adminFormatters";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Filter } from "lucide-react";

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
    status_key?: string | null;
    notes?: string | null;
    customer_id?: string | null;
    vendor_id?: string | null;
    vendor_contact_role?: string | null;
    archived_at: string | null;
    archived_by?: string | null;
};

type StatusOption = { status_key: string; status_label: string | null };

export default function ContactsClient() {
    const { labels } = useEntityLabels();
    const plural = labels?.contacts?.plural ?? "Contacts";
    const singular = labels?.contacts?.singular ?? "Contact";
    const title = plural;
    const { openDrawer } = useAdminDrawer();
    const { canMutate } = useAdminAuth();

    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [searchApplied, setSearchApplied] = useState("");
    const [includeArchived, setIncludeArchived] = useState(false);
    const [statusKeyFilter, setStatusKeyFilter] = useState("");
    const [statusOptions, setStatusOptions] = useState<StatusOption[]>([]);
    const [filterOpen, setFilterOpen] = useState(false);
    const filterRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetch("/api/admin/status-definitions?entity_type=contacts")
            .then((r) => r.ok ? r.json() : { statuses: [] })
            .then((j: { statuses?: StatusOption[] }) => setStatusOptions((j.statuses ?? []).filter((s) => s.status_key)));
    }, []);

    const fetchList = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (searchApplied) params.set("search", searchApplied);
        if (includeArchived) params.set("include_archived", "true");
        if (statusKeyFilter) params.set("status_key", statusKeyFilter);
        try {
            const res = await fetch(`/api/admin/contacts?${params}`);
            const json = await res.json();
            if (res.ok) {
                setContacts(json.contacts ?? []);
            } else {
                setContacts([]);
            }
        } catch {
            setContacts([]);
        } finally {
            setLoading(false);
        }
    }, [searchApplied, includeArchived, statusKeyFilter]);

    useEffect(() => {
        fetchList();
    }, [fetchList]);

    useEffect(() => {
        const onFocus = () => fetchList();
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, [fetchList]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
                setFilterOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const name = (c: Contact) => [c.first_name, c.last_name].filter(Boolean).join(" ") || "—";

    const columns = [
        { key: "name" as keyof Contact, label: "Name", sortable: true, render: (_: unknown, r: Contact) => name(r) },
        { key: "email", label: "Email", sortable: true, render: (v: string | null) => v ?? "—" },
        { key: "phone", label: "Phone", sortable: true, render: (v: string | null) => v ?? "—" },
        { key: "status", label: "Status", sortable: true, render: (_: unknown, r: Contact) => <StatusBadge label={r.status} variant={r.status === "active" ? "success" : "neutral"} /> },
        { key: "archived_at", label: "Archived", sortable: true, render: (v: string | null) => (v ? "Yes" : "—") },
        { key: "created_at", label: "Created", sortable: true, render: (v: string) => formatDateTime(v) },
    ];

    return (
        <>
            <AdminPageHeader title={title} subtitle="Contact records scoped by your org. Click a row to open." />
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="relative flex items-center gap-2" ref={filterRef}>
                    <button
                        type="button"
                        onClick={() => setFilterOpen((o) => !o)}
                        className="flex items-center gap-1.5 rounded-md border border-[#e6e8ec] bg-white px-2.5 py-1.5 text-sm text-[#45506c] hover:bg-[#F4F6F9]"
                        aria-expanded={filterOpen}
                        aria-haspopup="true"
                    >
                        <Filter className="h-4 w-4 text-[#59678b]" />
                        Filters
                        {(searchApplied || includeArchived || statusKeyFilter) && (
                            <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-alloy-blue" aria-hidden />
                        )}
                    </button>
                    {filterOpen && (
                        <div className="absolute left-0 top-full z-10 mt-1 w-72 rounded-md border border-[#e6e8ec] bg-white p-3 shadow-lg">
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-medium text-[#59678b] mb-1">Search (name, email, phone, company)</label>
                                    <input
                                        type="text"
                                        placeholder="Search…"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && (setSearchApplied(search.trim()), setFilterOpen(false))}
                                        className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-[#59678b] mb-1">Status</label>
                                    <select
                                        value={statusKeyFilter}
                                        onChange={(e) => setStatusKeyFilter(e.target.value)}
                                        className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded text-sm"
                                    >
                                        <option value="">All</option>
                                        {statusOptions.map((s) => (
                                            <option key={s.status_key} value={s.status_key}>{s.status_label ?? s.status_key}</option>
                                        ))}
                                    </select>
                                </div>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={includeArchived}
                                        onChange={(e) => setIncludeArchived(e.target.checked)}
                                        className="rounded border-alloy-stone/40"
                                    />
                                    <span className="text-sm text-alloy-midnight/70">Include archived</span>
                                </label>
                                <div className="flex gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSearchApplied(search.trim());
                                            setFilterOpen(false);
                                        }}
                                        className="px-2.5 py-1.5 text-sm bg-alloy-midnight text-white rounded hover:opacity-90"
                                    >
                                        Apply
                                    </button>
                                    {(searchApplied || statusKeyFilter) && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSearch("");
                                                setSearchApplied("");
                                                setStatusKeyFilter("");
                                                setFilterOpen(false);
                                            }}
                                            className="px-2.5 py-1.5 text-sm text-alloy-midnight/70 hover:underline"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                {canMutate && (
                    <button
                        type="button"
                        onClick={() => openDrawer({ type: "contacts", id: "new" })}
                        className="px-3 py-1.5 text-sm font-medium bg-alloy-midnight text-white rounded-md hover:opacity-90"
                    >
                        New {singular}
                    </button>
                )}
            </div>
            <DataTable
                data={contacts}
                columns={columns}
                onRowClick={(row) => openDrawer({ type: "contacts", id: row.id })}
                searchable={false}
                filters={[]}
                hideToolbar
                loading={loading}
            />
        </>
    );
}
