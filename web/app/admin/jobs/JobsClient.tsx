"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import AdminListPageHeader from "@/components/admin/AdminListPageHeader";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import DataTable from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime } from "@/lib/adminFormatters";
import { Filter } from "lucide-react";

type JobRow = {
  id: string;
  created_at: string;
  title: string | null;
  description: string | null;
  job_status_id: string | null;
  status_key: string | null;
  is_recurring: boolean | null;
  customer_id: string | null;
  _customer_name?: string | null;
  _assigned_vendor_name?: string | null;
  _location_label?: string | null;
  archived_at?: string | null;
};

export default function JobsClient() {
  const { openDrawer } = useAdminDrawer();
  const { labels } = useEntityLabels();
  const plural = labels?.jobs?.plural ?? "Jobs";
  const singular = labels?.jobs?.singular ?? "Job";
  const vendorSingular = labels?.vendors?.singular ?? "Vendor";
  const title = plural;
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [statusKeyFilter, setStatusKeyFilter] = useState("");
  const [statusOptions, setStatusOptions] = useState<{ status_key: string; status_label: string | null }[]>([]);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/admin/status-definitions?entity_type=jobs")
      .then((r) => r.ok ? r.json() : { statuses: [] })
      .then((j: { statuses?: { status_key: string; status_label: string | null }[] }) => setStatusOptions((j.statuses ?? []).filter((s) => s.status_key)));
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (searchApplied) params.set("search", searchApplied);
    if (includeArchived) params.set("include_archived", "true");
    if (statusKeyFilter) params.set("status_key", statusKeyFilter);
    try {
      const res = await fetch(`/api/admin/jobs?${params}`);
      const json = await res.json();
      if (res.ok) setJobs(json.jobs ?? []);
    } finally {
      setLoading(false);
    }
  }, [searchApplied, includeArchived, statusKeyFilter]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);
  useEffect(() => {
    const onSaved = (e: Event) => {
      const d = (e as CustomEvent<{ type: string; id: string }>)?.detail;
      if (d?.type === "jobs") fetchJobs();
    };
    window.addEventListener("admin-entity-saved", onSaved);
    return () => window.removeEventListener("admin-entity-saved", onSaved);
  }, [fetchJobs]);

  const openCreate = () => openDrawer({ type: "jobs", id: "new" });

  const archive = async (id: string) => {
    setActionLoadingId(id);
    try {
      const res = await fetch(`/api/admin/jobs/${id}/archive`, { method: "POST" });
      if (res.ok) fetchJobs();
    } finally {
      setActionLoadingId(null);
    }
  };

  const unarchive = async (id: string) => {
    setActionLoadingId(id);
    try {
      const res = await fetch(`/api/admin/jobs/${id}/unarchive`, { method: "POST" });
      if (res.ok) fetchJobs();
    } finally {
      setActionLoadingId(null);
    }
  };

  const applyFilter = () => {
    setSearchApplied(search.trim());
    setFilterOpen(false);
  };

  const clearFilter = () => {
    setSearch("");
    setSearchApplied("");
    setStatusKeyFilter("");
    setFilterOpen(false);
  };

  const hasActiveFilters = searchApplied || statusKeyFilter;

  const columns = [
    { key: "title" as keyof JobRow, label: "Title", sortable: true, render: (_: unknown, row: JobRow) => <span className="text-alloy-blue">{row.title ?? "—"}</span> },
    { key: "_customer_name", label: "Customer", sortable: true, render: (_: unknown, row: JobRow) => row._customer_name ?? "—" },
    { key: "_location_label", label: "Location", sortable: true, render: (_: unknown, row: JobRow) => row._location_label ?? "—" },
    { key: "status_key", label: "Status", sortable: true, render: (_: unknown, row: JobRow) => <StatusBadge label={statusOptions.find((s) => s.status_key === row.status_key)?.status_label ?? row.status_key ?? "—"} variant="neutral" /> },
    { key: "_assigned_vendor_name", label: `Assigned ${vendorSingular}`, sortable: true, render: (_: unknown, row: JobRow) => row._assigned_vendor_name ?? "—" },
    { key: "is_recurring", label: "Recurring", sortable: true, render: (v: boolean | null) => v ? "Yes" : "No" },
    { key: "created_at", label: "Created", sortable: true, render: (v: string) => formatDateTime(v) },
    {
      key: "id",
      label: "Actions",
      sortable: false,
      render: (_: unknown, row: JobRow) => (
        <span className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
          {row.archived_at ? (
            <button type="button" onClick={() => unarchive(row.id)} disabled={actionLoadingId === row.id} className="text-xs font-medium text-alloy-muted hover:text-alloy-midnight hover:underline disabled:opacity-50">Unarchive</button>
          ) : (
            <button type="button" onClick={() => archive(row.id)} disabled={actionLoadingId === row.id} className="text-xs font-medium text-alloy-ember hover:underline disabled:opacity-50">Archive</button>
          )}
        </span>
      ),
    },
  ];

  const filterTrigger = (
    <div className="relative" ref={filterRef}>
      <button
        type="button"
        onClick={() => setFilterOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm font-medium text-alloy-midnight/80 hover:bg-alloy-stone/50 focus:outline-none focus:ring-2 focus:ring-alloy-blue/20 ${filterOpen ? "border-alloy-blue/50 ring-2 ring-alloy-blue/20" : ""}`}
        aria-expanded={filterOpen}
        aria-haspopup="true"
      >
        <Filter className="h-4 w-4 text-alloy-muted" />
        Filter
        {hasActiveFilters && <span className="h-1.5 w-1.5 rounded-full bg-alloy-blue" aria-hidden />}
      </button>
      {filterOpen && (
        <div className="absolute left-0 top-full z-20 mt-1.5 w-72 rounded-lg border border-alloy-stone/40 bg-white p-4 shadow-lg">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-alloy-muted">Search (title)</label>
              <input
                type="text"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (applyFilter(), e.preventDefault())}
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
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
                className="rounded border-alloy-stone/40 text-alloy-blue focus:ring-alloy-blue/20"
              />
              <span className="text-sm text-alloy-midnight/80">Include archived</span>
            </label>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={applyFilter} className="rounded-lg bg-alloy-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-alloy-blue/30">Apply</button>
              {hasActiveFilters && (
                <button type="button" onClick={clearFilter} className="rounded-lg px-3 py-1.5 text-sm font-medium text-alloy-muted hover:text-alloy-midnight hover:underline">Clear</button>
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
        toolbarRight={<button type="button" onClick={openCreate} className="rounded-lg bg-alloy-blue px-3 py-2 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-alloy-blue/30">New {singular}</button>}
      />
      <div className="pt-4">
        <DataTable
        data={jobs}
        columns={columns}
        filters={[]}
        searchable={false}
        hideToolbar
        loading={loading}
        onRowClick={(row) => openDrawer({ type: "jobs", id: row.id })}
        />
      </div>
    </>
  );
}
