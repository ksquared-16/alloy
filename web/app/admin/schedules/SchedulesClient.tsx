"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useAdminPreview } from "@/contexts/AdminPreviewContext";
import AdminListPageHeader from "@/components/admin/AdminListPageHeader";
import { useEntityLabels, getEntityLabel } from "@/contexts/EntityLabelsContext";
import Drawer from "@/components/admin/Drawer";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime } from "@/lib/adminFormatters";
import { Filter } from "lucide-react";

type ScheduleRow = {
  id: string;
  job_id: string;
  start_at: string;
  end_at: string;
  timezone: string | null;
  canceled_at?: string | null;
  _job_title?: string | null;
  _customer_name?: string | null;
  _assigned_vendor_name?: string | null;
  _location_label?: string | null;
};

type JobOption = { id: string; title: string | null };

const EMPTY_FORM = {
  job_id: "",
  start_at: "",
  end_at: "",
  timezone: "America/Los_Angeles",
  visit_type: "",
  status: "",
};

export default function SchedulesClient() {
  const { openDrawer } = useAdminDrawer();
  const { openPreview } = useAdminPreview();
  const { labels } = useEntityLabels();
  const plural = getEntityLabel(labels, "schedules", "plural");
  const singular = getEntityLabel(labels, "schedules", "singular");
  const vendorSingular = getEntityLabel(labels, "vendors", "singular");
  const title = plural;
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [jobIdFilter, setJobIdFilter] = useState("");
  const [includeCanceled, setIncludeCanceled] = useState(false);
  const [statusKeyFilter, setStatusKeyFilter] = useState("");
  const [statusOptions, setStatusOptions] = useState<{ status_key: string; status_label: string | null }[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ScheduleRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    fetch("/api/admin/status-definitions?entity_type=schedules")
      .then((r) => r.ok ? r.json() : { statuses: [] })
      .then((j: { statuses?: { status_key: string; status_label: string | null }[] }) => setStatusOptions((j.statuses ?? []).filter((s) => s.status_key)));
  }, []);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (includeCanceled) params.set("include_canceled", "true");
    if (jobIdFilter) params.set("job_id", jobIdFilter);
    if (statusKeyFilter) params.set("status_key", statusKeyFilter);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    try {
      const res = await fetch(`/api/admin/schedules?${params}`);
      const json = await res.json();
      if (res.ok) setSchedules(json.schedules ?? []);
    } finally {
      setLoading(false);
    }
  }, [includeCanceled, jobIdFilter, statusKeyFilter, from, to]);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/jobs?limit=500");
      const json = await res.json();
      if (res.ok) {
        const list = (json.jobs ?? []) as { id: string; title: string | null }[];
        setJobs(list.map((j) => ({ id: j.id, title: j.title })));
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setSaveError(null);
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!form.job_id || !form.start_at || !form.end_at) {
      setSaveError("Job, start, and end are required.");
      return;
    }
    setSaveLoading(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/admin/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: form.job_id,
          start_at: new Date(form.start_at).toISOString(),
          end_at: new Date(form.end_at).toISOString(),
          timezone: form.timezone || null,
          visit_type: form.visit_type || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError((json as { error?: string }).error ?? "Create failed");
        return;
      }
      setDrawerOpen(false);
      fetchSchedules();
    } finally {
      setSaveLoading(false);
    }
  };

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return;
    setCancelLoading(true);
    try {
      const res = await fetch(`/api/admin/schedules/${cancelTarget.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancel_reason: cancelReason || null }),
      });
      if (res.ok) {
        setCancelTarget(null);
        setCancelReason("");
        fetchSchedules();
      }
    } finally {
      setCancelLoading(false);
    }
  };

  const hasActiveFilters = from || to || jobIdFilter || statusKeyFilter || includeCanceled;

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
        <div className="absolute left-0 top-full z-20 mt-1.5 w-80 rounded-lg border border-alloy-stone/40 bg-white p-4 shadow-lg">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-alloy-muted">From (start_at)</label>
              <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-alloy-muted">To (start_at)</label>
              <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="w-full rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-alloy-muted">Job</label>
              <select value={jobIdFilter} onChange={(e) => setJobIdFilter(e.target.value)} className="w-full rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20">
                <option value="">All jobs</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>{j.title ?? j.id}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-alloy-muted">Status</label>
              <select value={statusKeyFilter} onChange={(e) => setStatusKeyFilter(e.target.value)} className="w-full rounded-lg border border-alloy-stone/40 bg-white px-3 py-2 text-sm text-alloy-midnight focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20">
                <option value="">All</option>
                {statusOptions.map((s) => (
                  <option key={s.status_key} value={s.status_key}>{s.status_label ?? s.status_key}</option>
                ))}
              </select>
            </div>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={includeCanceled} onChange={(e) => setIncludeCanceled(e.target.checked)} className="rounded border-alloy-stone/40 text-alloy-blue focus:ring-alloy-blue/20" />
              <span className="text-sm text-alloy-midnight/80">Include canceled</span>
            </label>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setFilterOpen(false)} className="rounded-lg bg-alloy-blue px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-alloy-blue/30">Apply</button>
              {hasActiveFilters && (
                <button type="button" onClick={() => { setFrom(""); setTo(""); setJobIdFilter(""); setStatusKeyFilter(""); setIncludeCanceled(false); setFilterOpen(false); }} className="rounded-lg px-3 py-1.5 text-sm font-medium text-alloy-muted hover:text-alloy-midnight hover:underline">Clear</button>
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
        <div className="rounded-xl border border-admin-border bg-admin-surface-card shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-alloy-muted">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-alloy-stone/30 bg-alloy-stone/40">
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-alloy-slate">Start</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-alloy-slate">End</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-alloy-slate">Job</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-alloy-slate">Customer</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-alloy-slate">Location</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-alloy-slate">Assigned {vendorSingular}</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-alloy-slate">Status</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-alloy-slate">Canceled?</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-alloy-slate">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-alloy-stone/30">
                {schedules.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-14 text-center">
                      <p className="text-sm font-medium text-alloy-midnight/80">No data found</p>
                      <p className="mt-1 text-xs text-alloy-muted">There are no schedules to show.</p>
                    </td>
                  </tr>
                ) : (
                  schedules.map((s) => (
                    <tr
                      key={s.id}
                      className="transition-colors duration-150 cursor-pointer hover:bg-alloy-pine/15 active:bg-alloy-pine/20"
                      onClick={(e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        openPreview({ type: "schedules", id: s.id, anchor: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } });
                      }}
                    >
                      <td className="px-5 py-3.5 text-alloy-midnight/90">{formatDateTime(s.start_at)}</td>
                      <td className="px-5 py-3.5 text-alloy-midnight/90">{formatDateTime(s.end_at)}</td>
                      <td className="px-5 py-3.5 text-alloy-midnight/90">{s._job_title ?? s.job_id?.slice(0, 8) ?? "—"}</td>
                      <td className="px-5 py-3.5 text-alloy-midnight/90">{s._customer_name ?? "—"}</td>
                      <td className="px-5 py-3.5 text-alloy-midnight/90">{s._location_label ?? "—"}</td>
                      <td className="px-5 py-3.5 text-alloy-midnight/90">{s._assigned_vendor_name ?? "—"}</td>
                      <td className="px-5 py-3.5"><StatusBadge label={s.canceled_at ? "Canceled" : "—"} variant="neutral" /></td>
                      <td className="px-5 py-3.5 text-alloy-midnight/90">{s.canceled_at ? "Yes" : "—"}</td>
                      <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <span className="flex flex-wrap gap-1">
                          {!s.canceled_at && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); setCancelTarget(s); }} className="text-xs font-medium text-amber-700 hover:underline">Cancel</button>
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
        </div>
      </div>

      <Drawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} title={`New ${singular}`} zIndexBackdrop={60} zIndexPanel={70}>
        <div className="space-y-4">
          {saveError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{saveError}</p>}
          <div className="grid grid-cols-1 gap-3 text-sm">
            <div>
              <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Job (required)</label>
              <select
                value={form.job_id}
                onChange={(e) => setForm((f) => ({ ...f, job_id: e.target.value }))}
                className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded"
              >
                <option value="">Select job</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>{j.title ?? j.id}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Start (required)</label>
              <input
                type="datetime-local"
                value={form.start_at}
                onChange={(e) => setForm((f) => ({ ...f, start_at: e.target.value }))}
                className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">End (required)</label>
              <input
                type="datetime-local"
                value={form.end_at}
                onChange={(e) => setForm((f) => ({ ...f, end_at: e.target.value }))}
                className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Timezone</label>
              <input
                value={form.timezone}
                onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded"
                placeholder="America/Los_Angeles"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Visit type</label>
              <input
                value={form.visit_type}
                onChange={(e) => setForm((f) => ({ ...f, visit_type: e.target.value }))}
                className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded"
              />
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

      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
          <div className="bg-white rounded-lg shadow-lg border border-alloy-stone/30 p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-alloy-midnight mb-2">Cancel {singular.toLowerCase()}</h3>
            <p className="text-sm text-alloy-midnight/80 mb-2">Cancel this {singular.toLowerCase()}? Start: {formatDateTime(cancelTarget.start_at)}</p>
            <div className="mb-4">
              <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Reason (optional)</label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded text-sm"
                placeholder="e.g. customer request"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setCancelTarget(null); setCancelReason(""); }} disabled={cancelLoading} className="px-3 py-1.5 text-sm border border-alloy-stone/40 rounded hover:bg-alloy-stone/20 disabled:opacity-50">Back</button>
              <button type="button" onClick={handleCancelConfirm} disabled={cancelLoading} className="px-3 py-1.5 text-sm font-medium bg-amber-600 text-white rounded hover:opacity-90 disabled:opacity-50">{cancelLoading ? "Canceling…" : `Cancel ${singular.toLowerCase()}`}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
