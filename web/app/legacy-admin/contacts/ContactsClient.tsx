"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AdminListPageHeader from "@/components/admin/AdminListPageHeader";
import DataTable from "@/components/admin/DataTable";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { buildEntityTableColumns } from "@/components/admin/entity/buildEntityTableColumns";
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
    status_key?: string | null;
    contact_type?: string | null;
    notes?: string | null;
    customer_id?: string | null;
    vendor_id?: string | null;
    vendor_contact_role?: string | null;
    archived_at: string | null;
    archived_by?: string | null;
    _name?: string;
    _customer_name?: string;
    _is_primary_contact?: boolean;
    _updated?: string;
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
        const handleClickOutside = (e: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
                setFilterOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const columns = buildEntityTableColumns<Contact>("contacts", {});

    const filterTrigger = (
        <div className="relative flex items-center gap-2" ref={filterRef}>
            <button
                type="button"
                onClick={() => setFilterOpen((o) => !o)}
                className={`flex items-center gap-2 rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm font-medium text-alloy-midnight/80 hover:bg-alloy-stone/50 focus:outline-none focus:ring-2 focus:ring-alloy-blue/20 ${filterOpen ? "border-alloy-blue/50 ring-2 ring-alloy-blue/20" : ""}`}
                aria-expanded={filterOpen}
                aria-haspopup="true"
            >
                <Filter className="h-4 w-4 text-alloy-muted" />
                Filter
                {(searchApplied || includeArchived || statusKeyFilter) && (
                    <span className="h-1.5 w-1.5 rounded-full bg-alloy-blue" aria-hidden />
                )}
            </button>
            {filterOpen && (
                <div className="absolute right-0 top-full z-20 mt-1.5 w-72 rounded-lg border border-alloy-stone/40 bg-white p-4 shadow-lg" style={{ left: "auto" }}>
                    <div className="space-y-3">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-alloy-muted">Search (name, email, phone, company)</label>
                            <input
                                type="text"
                                placeholder="Search…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && (setSearchApplied(search.trim()), setFilterOpen(false))}
                                className="w-full rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm text-alloy-midnight placeholder:text-alloy-muted/70 focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs font-medium text-alloy-muted">Status</label>
                            <select
                                value={statusKeyFilter}
                                onChange={(e) => setStatusKeyFilter(e.target.value)}
                                className="w-full rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20"
                            >
                                <option value="">All</option>
                                {statusOptions.map((s) => (
                                    <option key={s.status_key} value={s.status_key}>{s.status_label ?? s.status_key}</option>
                                ))}
                            </select>
                        </div>
                        <label className="flex cursor-pointer items-center gap-2">
                            <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} className="rounded border-alloy-stone/40 text-alloy-blue focus:ring-alloy-blue/20" />
                            <span className="text-sm text-alloy-midnight/80">Include archived</span>
                        </label>
                        <div className="flex gap-2 pt-1">
                            <button type="button" onClick={() => { setSearchApplied(search.trim()); setFilterOpen(false); }} className="rounded-lg bg-alloy-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-alloy-blue/30">Apply</button>
                            {(searchApplied || statusKeyFilter) && (
                                <button type="button" onClick={() => { setSearch(""); setSearchApplied(""); setStatusKeyFilter(""); setFilterOpen(false); }} className="rounded-lg px-3 py-1.5 text-sm font-medium text-alloy-muted hover:text-alloy-midnight hover:underline">Clear</button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <>
            <AdminListPageHeader
                title={title}
                toolbarLeft={filterTrigger}
                toolbarRight={canMutate ? (
                    <button type="button" onClick={() => openDrawer({ type: "contacts", id: "new" })} className="rounded-lg bg-alloy-blue px-3 py-2 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-alloy-blue/30">New {singular}</button>
                ) : undefined}
            />
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-sm text-amber-900">
                <strong>Legacy view.</strong> For the canonical human record, use{" "}
                <Link href="/admin/people" className="font-medium text-alloy-blue hover:underline">People</Link>.
            </div>
            <div className="pt-4">
                <DataTable
                data={contacts}
                columns={columns}
                onRowClick={(row) => openDrawer({ type: "contacts", id: row.id })}
                searchable={false}
                filters={[]}
                hideToolbar
                loading={loading}
                />
            </div>
        </>
    );
}
