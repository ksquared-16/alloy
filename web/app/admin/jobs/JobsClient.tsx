"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import AdminListPageHeader from "@/components/admin/AdminListPageHeader";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import DataTable from "@/components/admin/DataTable";
import { StatusBadge, getStatusVariant } from "@/components/admin/StatusBadge";
import { buildEntityTableColumns } from "@/components/admin/entity/buildEntityTableColumns";
import { formatDateTime } from "@/lib/adminFormatters";
import { Filter } from "lucide-react";

export type JobRow = {
  id: string;
  created_at: string;
  updated_at?: string | null;
  title: string | null;
  description: string | null;
  job_status_id: string | null;
  status_key: string | null;
  service_key?: string | null;
  job_number_for_customer?: string | null;
  is_recurring: boolean | null;
  customer_id: string | null;
  assigned_vendor_id: string | null;
  location_id: string | null;
  gross_price_cents?: number | null;
  estimated_total_cents?: number | null;
  discount_amount?: number | null;
  discounted?: boolean | null;
  display_total_cents?: number | null;
  _customer_name?: string | null;
  _assigned_vendor_name?: string | null;
  _vendor_name?: string | null;
  _location_label?: string | null;
  work_unit_id?: string | null;
  _work_unit_label?: string | null;
  _job_label?: string | null;
  _status_display?: string | null;
  _next_schedule?: string | null;
  _price_display?: number | null;
  _updated?: string | null;
  archived_at?: string | null;
};

export default function JobsClient() {
  const { openDrawer, drawer } = useAdminDrawer();
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
  const [departmentFilter, setDepartmentFilter] = useState("");
  /** "" = all, "unassigned" = no work unit, else work unit uuid */
  const [workUnitFilter, setWorkUnitFilter] = useState<"" | "unassigned" | string>("");
  const [departmentOptions, setDepartmentOptions] = useState<{ id: string; name: string }[]>([]);
  const [workUnitOptionsAll, setWorkUnitOptionsAll] = useState<{ id: string; label: string; department_id: string }[]>(
    []
  );
  const [statusOptions, setStatusOptions] = useState<{ status_key: string; status_label: string | null }[]>([]);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/admin/status-options?entity_type=jobs")
      .then((r) => (r.ok ? r.json() : { options: [] }))
      .then((j: { options?: { value: string; label: string }[] }) =>
        setStatusOptions(
          (j.options ?? [])
            .filter((o) => o.value)
            .map((o) => ({ status_key: o.value, status_label: o.label }))
        )
      );
  }, []);

  useEffect(() => {
    Promise.all([fetch("/api/admin/departments"), fetch("/api/admin/work-units")])
      .then(async ([dRes, wRes]) => {
        if (!dRes.ok || !wRes.ok) {
          setDepartmentOptions([]);
          setWorkUnitOptionsAll([]);
          return;
        }
        const dj = (await dRes.json().catch(() => ({}))) as { items?: { id: string; name: string | null; sort_order: number }[] };
        const wj = (await wRes.json().catch(() => ({}))) as {
          items?: { id: string; name: string | null; department_id: string; sort_order: number }[];
        };
        const depts = [...(dj.items ?? [])].sort(
          (a, b) => a.sort_order - b.sort_order || String(a.name ?? "").localeCompare(String(b.name ?? ""))
        );
        setDepartmentOptions(depts.map((d) => ({ id: d.id, name: d.name ?? "Department" })));
        const deptIndex = new Map(depts.map((d, i) => [d.id, i]));
        const deptName = new Map(depts.map((d) => [d.id, d.name ?? "Department"]));
        const wus = [...(wj.items ?? [])].sort((a, b) => {
          const da = deptIndex.get(a.department_id) ?? 999;
          const db = deptIndex.get(b.department_id) ?? 999;
          if (da !== db) return da - db;
          return a.sort_order - b.sort_order || String(a.name ?? "").localeCompare(String(b.name ?? ""));
        });
        setWorkUnitOptionsAll(
          wus.map((wu) => ({
            id: wu.id,
            department_id: wu.department_id,
            label: `${deptName.get(wu.department_id) ?? "Department"} · ${wu.name ?? wu.id}`,
          }))
        );
      })
      .catch(() => {
        setDepartmentOptions([]);
        setWorkUnitOptionsAll([]);
      });
  }, []);

  const workUnitOptionsFiltered = useMemo(() => {
    if (!departmentFilter) return workUnitOptionsAll;
    return workUnitOptionsAll.filter((o) => o.department_id === departmentFilter);
  }, [departmentFilter, workUnitOptionsAll]);

  useEffect(() => {
    if (workUnitFilter === "" || workUnitFilter === "unassigned") return;
    if (!workUnitOptionsFiltered.some((o) => o.id === workUnitFilter)) {
      setWorkUnitFilter("");
    }
  }, [departmentFilter, workUnitFilter, workUnitOptionsFiltered]);

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
    if (workUnitFilter === "unassigned") {
      params.set("unassigned_work_unit", "true");
    } else if (workUnitFilter) {
      params.set("work_unit_id", workUnitFilter);
    } else if (departmentFilter) {
      params.set("department_id", departmentFilter);
    }
    try {
      const res = await fetch(`/api/admin/jobs?${params}`);
      const json = await res.json();
      if (res.ok) setJobs(json.jobs ?? []);
    } finally {
      setLoading(false);
    }
  }, [searchApplied, includeArchived, statusKeyFilter, departmentFilter, workUnitFilter]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);
  useEffect(() => {
    const onSaved = (e: Event) => {
      const d = (e as CustomEvent<{ type: string; id: string }>)?.detail;
      if (d?.type === "jobs" || d?.type === "payments") fetchJobs();
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
    setDepartmentFilter("");
    setWorkUnitFilter("");
    setFilterOpen(false);
  };

  const hasActiveFilters = searchApplied || statusKeyFilter || departmentFilter || workUnitFilter;

  const columns = useMemo(() => {
    const base = buildEntityTableColumns<JobRow>("jobs", {
      _customer_name: (_value: unknown, row: JobRow) => {
        const name = row._customer_name ?? "—";
        const id = row.customer_id;
        if (!id) return <span className="text-alloy-midnight/70">{name}</span>;
        return (
          <button type="button" onClick={(e) => { e.stopPropagation(); openDrawer({ type: "customers", id }); }} className="text-left text-alloy-blue hover:underline">
            {name}
          </button>
        );
      },
      _vendor_name: (_value: unknown, row: JobRow) => {
        const name = row._vendor_name ?? row._assigned_vendor_name ?? "—";
        const id = row.assigned_vendor_id;
        if (!id) return <span className="text-alloy-midnight/70">{name}</span>;
        return (
          <button type="button" onClick={(e) => { e.stopPropagation(); openDrawer({ type: "vendors", id }); }} className="text-left text-alloy-blue hover:underline">
            {name}
          </button>
        );
      },
      _status_display: (_value: unknown, row: JobRow) => {
        const sk = row.status_key ?? null;
        const label =
          (sk && statusOptions.find((s) => s.status_key === sk)?.status_label?.trim()) ||
          row._status_display ||
          sk ||
          "—";
        return <StatusBadge label={label} variant={getStatusVariant(sk)} />;
      },
    });
    return [
      ...base,
      {
        key: "id" as keyof JobRow,
        label: "Actions",
        sortable: false,
        render: (_: unknown, row: JobRow) => (
          <span className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Link
              href={`/admin/jobs/${row.id}`}
              className="text-xs font-medium text-alloy-blue hover:underline"
            >
              View details
            </Link>
            {row.archived_at ? (
              <button type="button" onClick={() => unarchive(row.id)} disabled={actionLoadingId === row.id} className="text-xs font-medium text-alloy-muted hover:text-alloy-midnight hover:underline disabled:opacity-50">Unarchive</button>
            ) : (
              <button type="button" onClick={() => archive(row.id)} disabled={actionLoadingId === row.id} className="text-xs font-medium text-alloy-ember hover:underline disabled:opacity-50">Archive</button>
            )}
          </span>
        ),
      },
    ];
  }, [openDrawer, statusOptions, actionLoadingId]);

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
            <div>
              <label className="mb-1 block text-xs font-medium text-alloy-muted">Department</label>
              <select
                value={departmentFilter}
                onChange={(e) => {
                  setDepartmentFilter(e.target.value);
                  setWorkUnitFilter("");
                }}
                className="w-full rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20"
              >
                <option value="">All</option>
                {departmentOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-alloy-muted">Work unit</label>
              <select
                value={workUnitFilter}
                onChange={(e) => setWorkUnitFilter((e.target.value || "") as "" | "unassigned" | string)}
                className="w-full rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20"
              >
                <option value="">All</option>
                <option value="unassigned">Unassigned</option>
                {workUnitOptionsFiltered.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
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
        onRowClick={(row) => {
          openDrawer({ type: "jobs", id: row.id });
        }}
        highlightedRowId={drawer.type === "jobs" ? drawer.id : null}
      />
      </div>
    </>
  );
}
