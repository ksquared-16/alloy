"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import SectionCard from "@/components/admin/SectionCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime } from "@/lib/adminFormatters";

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

  useEffect(() => {
    fetch("/api/admin/status-definitions?entity_type=jobs")
      .then((r) => r.ok ? r.json() : { statuses: [] })
      .then((j: { statuses?: { status_key: string; status_label: string | null }[] }) => setStatusOptions((j.statuses ?? []).filter((s) => s.status_key)));
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

  const openCreate = () => {
    openDrawer({ type: "jobs", id: "new" });
  };

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

  return (
    <>
      <AdminPageHeader
        title={title}
        subtitle={`${plural} scoped by your org. Customer is required. Only admins can create, edit, or archive.`}
      />
      <SectionCard title="Filters" className="mb-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Search (title)</label>
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
          <div>
            <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Status</label>
            <select
              value={statusKeyFilter}
              onChange={(e) => setStatusKeyFilter(e.target.value)}
              className="px-2 py-1.5 border border-alloy-stone/40 rounded text-sm w-40"
            >
              <option value="">All</option>
              {statusOptions.map((s) => (
                <option key={s.status_key} value={s.status_key}>{s.status_label ?? s.status_key}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="include_archived_jobs"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="rounded border-alloy-stone/40"
            />
            <label htmlFor="include_archived_jobs" className="text-sm text-alloy-midnight/70">Include archived</label>
          </div>
        </div>
      </SectionCard>
      <SectionCard title={plural}>
        <div className="flex items-center justify-between gap-4 mb-4">
          <span className="text-sm text-alloy-midnight/60">{jobs.length} {plural.toLowerCase()}</span>
          <button
            type="button"
            onClick={openCreate}
            className="px-3 py-1.5 text-sm font-medium bg-alloy-midnight text-white rounded-md hover:opacity-90"
          >
            New {singular}
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-alloy-midnight/60">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-alloy-stone/30 text-left text-alloy-midnight/70">
                  <th className="pb-2 pr-4">Title</th>
                  <th className="pb-2 pr-4">Customer</th>
                  <th className="pb-2 pr-4">Location</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Assigned {vendorSingular}</th>
                  <th className="pb-2 pr-4">Recurring</th>
                  <th className="pb-2 pr-4">Created</th>
                  <th className="pb-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.length === 0 ? (
                  <tr><td colSpan={8} className="py-4 text-alloy-midnight/60">No {plural.toLowerCase()} found.</td></tr>
                ) : (
                  jobs.map((j) => (
                    <tr
                      key={j.id}
                      className="border-b border-alloy-stone/20 hover:bg-alloy-stone/10 cursor-pointer"
                      onClick={() => openDrawer({ type: "jobs", id: j.id })}
                    >
                      <td className="py-2 pr-4 text-alloy-blue hover:underline">{j.title ?? "—"}</td>
                      <td className="py-2 pr-4">{j._customer_name ?? "—"}</td>
                      <td className="py-2 pr-4">{j._location_label ?? "—"}</td>
                      <td className="py-2 pr-4"><StatusBadge label={statusOptions.find((s) => s.status_key === j.status_key)?.status_label ?? j.status_key ?? "—"} variant="neutral" /></td>
                      <td className="py-2 pr-4">{j._assigned_vendor_name ?? "—"}</td>
                      <td className="py-2 pr-4">{j.is_recurring ? "Yes" : "No"}</td>
                      <td className="py-2 pr-4">{formatDateTime(j.created_at)}</td>
                      <td className="py-2 pr-4" onClick={(e) => e.stopPropagation()}>
                        <span className="flex flex-wrap gap-1">
                          {j.archived_at ? (
                            <button type="button" onClick={(e) => { e.stopPropagation(); unarchive(j.id); }} disabled={actionLoadingId === j.id} className="text-xs px-2 py-0.5 text-alloy-midnight/70 hover:underline disabled:opacity-50">Unarchive</button>
                          ) : (
                            <button type="button" onClick={(e) => { e.stopPropagation(); archive(j.id); }} disabled={actionLoadingId === j.id} className="text-xs px-2 py-0.5 text-amber-700 hover:underline disabled:opacity-50">Archive</button>
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
    </>
  );
}
