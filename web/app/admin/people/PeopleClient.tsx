"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DataTable from "@/components/admin/DataTable";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useAdminPreview } from "@/contexts/AdminPreviewContext";
import AdminListPageHeader from "@/components/admin/AdminListPageHeader";
import { buildEntityTableColumns } from "@/components/admin/entity/buildEntityTableColumns";
import { formatDateTime } from "@/lib/adminFormatters";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Filter } from "lucide-react";

type PersonRow = {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    _person_name?: string | null;
    _customer_count?: number;
    _compatibility_contacts_count?: number;
    _compatibility_members_count?: number;
    _updated?: string | null;
};

export default function PeopleClient() {
    const { openDrawer } = useAdminDrawer();
    const { openPreview, preview } = useAdminPreview();
    const { canMutate } = useAdminAuth();
    const [persons, setPersons] = useState<PersonRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filterOpen, setFilterOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [searchApplied, setSearchApplied] = useState("");
    const filterRef = useRef<HTMLDivElement>(null);

    const fetchList = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/persons");
            const json = await res.json().catch(() => ({}));
            if (res.ok) {
                setPersons(json.persons ?? []);
            } else {
                setPersons([]);
                setError((json as { error?: string }).error ?? "Failed to load people");
            }
        } catch {
            setPersons([]);
            setError("Failed to load people");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchList();
    }, [fetchList]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filteredData = useMemo(() => {
        if (!searchApplied.trim()) return persons;
        const q = searchApplied.trim().toLowerCase();
        return persons.filter((p) => {
            const name = (p._person_name ?? [p.first_name, p.last_name].filter(Boolean).join(" ")).toLowerCase();
            const email = (p.email ?? "").toLowerCase();
            const phone = (p.phone ?? "").replace(/\D/g, "");
            const qNum = q.replace(/\D/g, "");
            return name.includes(q) || email.includes(q) || (qNum.length >= 4 && phone.includes(qNum));
        });
    }, [persons, searchApplied]);

    const columns = buildEntityTableColumns<PersonRow>("persons", {
        _customer_count: (value) => (value != null && Number(value) > 0 ? String(value) : "—"),
        _updated: (value) => (value != null && value !== "" ? formatDateTime(String(value)) : "—"),
    });

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
                {searchApplied && <span className="h-1.5 w-1.5 rounded-full bg-alloy-blue" aria-hidden />}
            </button>
            {filterOpen && (
                <div className="absolute left-0 top-full z-20 mt-1.5 w-72 rounded-lg border border-alloy-stone/40 bg-white p-4 shadow-lg">
                    <div className="space-y-3">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-alloy-muted">Search (name, email, phone)</label>
                            <input
                                type="text"
                                placeholder="Search…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && (setSearchApplied(search.trim()), setFilterOpen(false))}
                                className="w-full rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm text-alloy-midnight placeholder:text-alloy-muted/70 focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20"
                            />
                        </div>
                        <div className="flex gap-2 pt-1">
                            <button type="button" onClick={() => { setSearchApplied(search.trim()); setFilterOpen(false); }} className="rounded-lg bg-alloy-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-alloy-blue/30">Apply</button>
                            {searchApplied && <button type="button" onClick={() => { setSearch(""); setSearchApplied(""); setFilterOpen(false); }} className="rounded-lg px-3 py-1.5 text-sm font-medium text-alloy-muted hover:text-alloy-midnight hover:underline">Clear</button>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div>
            <AdminListPageHeader
                title="People"
                toolbarLeft={filterTrigger}
                toolbarRight={canMutate ? (
                    <button
                        type="button"
                        onClick={() => openDrawer({ type: "persons", id: "new" })}
                        className="rounded-lg bg-alloy-blue px-3 py-2 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-alloy-blue/30"
                    >
                        Add Person
                    </button>
                ) : undefined}
            />
            <div className="pt-4">
                {error && (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                        {error}
                    </div>
                )}
                {loading ? (
                    <div className="py-8 text-center text-sm text-alloy-muted">Loading…</div>
                ) : (
                    <DataTable
                        data={filteredData}
                        columns={columns}
                        filters={[]}
                        onRowClick={(row, e) => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          openPreview({ type: "persons", id: row.id, anchor: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }, clickPosition: { x: e.clientX, y: e.clientY } });
                        }}
                        highlightedRowId={preview?.type === "persons" ? preview.id : null}
                      />
                )}
            </div>
        </div>
    );
}
