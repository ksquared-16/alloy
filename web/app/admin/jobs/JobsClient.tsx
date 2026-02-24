"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import Drawer from "@/components/admin/Drawer";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime } from "@/lib/adminFormatters";

type JobRow = {
  id: string;
  created_at: string;
  title: string | null;
  description: string | null;
  job_status_id: string | null;
  is_recurring: boolean | null;
  customer_id: string | null;
  _customer_name?: string | null;
  _assigned_vendor_name?: string | null;
  _location_label?: string | null;
  archived_at?: string | null;
};

type CustomerOption = { id: string; name: string | null };
type JobStatusOption = { id: string; label: string | null };

const EMPTY_FORM = {
  title: "",
  customer_id: "",
  job_status_id: "",
  is_recurring: false,
  description: "",
};

export default function JobsClient() {
  const { openDrawer } = useAdminDrawer();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [jobStatuses, setJobStatuses] = useState<JobStatusOption[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (searchApplied) params.set("search", searchApplied);
    if (includeArchived) params.set("include_archived", "true");
    try {
      const res = await fetch(`/api/admin/jobs?${params}`);
      const json = await res.json();
      if (res.ok) setJobs(json.jobs ?? []);
    } finally {
      setLoading(false);
    }
  }, [searchApplied, includeArchived]);

  const fetchCustomers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/customers");
      const json = await res.json();
      if (res.ok) setCustomers(json.customers ?? []);
    } catch (_) {}
  }, []);

  const fetchJobStatuses = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/job-statuses");
      const json = await res.json();
      if (res.ok) setJobStatuses(json.job_statuses ?? []);
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);
  useEffect(() => {
    fetchCustomers();
    fetchJobStatuses();
  }, [fetchCustomers, fetchJobStatuses]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setSaveError(null);
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!form.customer_id || !form.job_status_id) {
      setSaveError("Customer and Status are required.");
      return;
    }
    setSaveLoading(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/admin/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title || null,
          description: form.description || null,
          customer_id: form.customer_id,
          job_status_id: form.job_status_id,
          is_recurring: form.is_recurring,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError((json as { error?: string }).error ?? "Create failed");
        return;
      }
      setDrawerOpen(false);
      fetchJobs();
    } finally {
      setSaveLoading(false);
    }
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

  const statusLabel = (id: string | null) => {
    if (!id) return "—";
    const s = jobStatuses.find((x) => x.id === id);
    return s?.label ?? id;
  };

  return (
    <>
      <AdminPageHeader
        title="Jobs"
        subtitle="Jobs scoped by your org. Customer is required. Only admins can create, edit, or archive."
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
      <SectionCard title="Jobs">
        <div className="flex items-center justify-between gap-4 mb-4">
          <span className="text-sm text-alloy-midnight/60">{jobs.length} job(s)</span>
          <button
            type="button"
            onClick={openCreate}
            className="px-3 py-1.5 text-sm font-medium bg-alloy-midnight text-white rounded-md hover:opacity-90"
          >
            New Job
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
                  <th className="pb-2 pr-4">Assigned vendor</th>
                  <th className="pb-2 pr-4">Recurring</th>
                  <th className="pb-2 pr-4">Created</th>
                  <th className="pb-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.length === 0 ? (
                  <tr><td colSpan={8} className="py-4 text-alloy-midnight/60">No jobs found.</td></tr>
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
                      <td className="py-2 pr-4"><StatusBadge label={statusLabel(j.job_status_id)} variant="neutral" /></td>
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

      <Drawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} title="New job" zIndexBackdrop={60} zIndexPanel={70}>
        <div className="space-y-4">
          {saveError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{saveError}</p>}
          <div className="grid grid-cols-1 gap-3 text-sm">
            <div>
              <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Title (required)</label>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded" placeholder="Job title" />
            </div>
            <div>
              <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Customer (required)</label>
              <select
                value={form.customer_id}
                onChange={(e) => setForm((f) => ({ ...f, customer_id: e.target.value }))}
                className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded"
              >
                <option value="">Select customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name ?? c.id}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Status (required)</label>
              <select
                value={form.job_status_id}
                onChange={(e) => setForm((f) => ({ ...f, job_status_id: e.target.value }))}
                className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded"
              >
                <option value="">Select status</option>
                {jobStatuses.map((s) => (
                  <option key={s.id} value={s.id}>{s.label ?? s.id}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="job_recurring"
                checked={form.is_recurring}
                onChange={(e) => setForm((f) => ({ ...f, is_recurring: e.target.checked }))}
                className="rounded border-alloy-stone/40"
              />
              <label htmlFor="job_recurring" className="text-sm text-alloy-midnight/70">Recurring</label>
            </div>
            <div>
              <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Description</label>
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded" />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={handleSave} disabled={saveLoading} className="px-3 py-1.5 text-sm font-medium bg-alloy-midnight text-white rounded-md hover:opacity-90 disabled:opacity-50">
              {saveLoading ? "Saving…" : "Create"}
            </button>
            <button type="button" onClick={() => setDrawerOpen(false)} className="px-3 py-1.5 text-sm border border-alloy-stone/40 rounded hover:bg-alloy-stone/20">Cancel</button>
          </div>
        </div>
      </Drawer>
    </>
  );
}
