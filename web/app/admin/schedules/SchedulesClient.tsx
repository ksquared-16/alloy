"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import Drawer from "@/components/admin/Drawer";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime } from "@/lib/adminFormatters";

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
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [jobIdFilter, setJobIdFilter] = useState("");
  const [includeCanceled, setIncludeCanceled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ScheduleRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (includeCanceled) params.set("include_canceled", "true");
    if (jobIdFilter) params.set("job_id", jobIdFilter);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    try {
      const res = await fetch(`/api/admin/schedules?${params}`);
      const json = await res.json();
      if (res.ok) setSchedules(json.schedules ?? []);
    } finally {
      setLoading(false);
    }
  }, [includeCanceled, jobIdFilter, from, to]);

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

  return (
    <>
      <AdminPageHeader
        title="Schedules"
        subtitle="Org-scoped schedules. Job is required. Only admins can create, edit, or cancel."
      />
      <SectionCard title="Filters" className="mb-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">From (start_at)</label>
            <input
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="px-2 py-1.5 border border-alloy-stone/40 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">To (start_at)</label>
            <input
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="px-2 py-1.5 border border-alloy-stone/40 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Job</label>
            <select
              value={jobIdFilter}
              onChange={(e) => setJobIdFilter(e.target.value)}
              className="px-2 py-1.5 border border-alloy-stone/40 rounded text-sm min-w-[180px]"
            >
              <option value="">All jobs</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.title ?? j.id}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="include_canceled_sched"
              checked={includeCanceled}
              onChange={(e) => setIncludeCanceled(e.target.checked)}
              className="rounded border-alloy-stone/40"
            />
            <label htmlFor="include_canceled_sched" className="text-sm text-alloy-midnight/70">Include canceled</label>
          </div>
        </div>
      </SectionCard>
      <SectionCard title="Schedules">
        <div className="flex items-center justify-between gap-4 mb-4">
          <span className="text-sm text-alloy-midnight/60">{schedules.length} schedule(s)</span>
          <button
            type="button"
            onClick={openCreate}
            className="px-3 py-1.5 text-sm font-medium bg-alloy-midnight text-white rounded-md hover:opacity-90"
          >
            New Schedule
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-alloy-midnight/60">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-alloy-stone/30 text-left text-alloy-midnight/70">
                  <th className="pb-2 pr-4">Start</th>
                  <th className="pb-2 pr-4">End</th>
                  <th className="pb-2 pr-4">Job</th>
                  <th className="pb-2 pr-4">Customer</th>
                  <th className="pb-2 pr-4">Assigned vendor</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Canceled?</th>
                  <th className="pb-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {schedules.length === 0 ? (
                  <tr><td colSpan={8} className="py-4 text-alloy-midnight/60">No schedules found.</td></tr>
                ) : (
                  schedules.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-alloy-stone/20 hover:bg-alloy-stone/10 cursor-pointer"
                      onClick={() => openDrawer({ type: "schedules", id: s.id })}
                    >
                      <td className="py-2 pr-4">{formatDateTime(s.start_at)}</td>
                      <td className="py-2 pr-4">{formatDateTime(s.end_at)}</td>
                      <td className="py-2 pr-4">{s._job_title ?? s.job_id?.slice(0, 8) ?? "—"}</td>
                      <td className="py-2 pr-4">{s._customer_name ?? "—"}</td>
                      <td className="py-2 pr-4">{s._assigned_vendor_name ?? "—"}</td>
                      <td className="py-2 pr-4"><StatusBadge label={s.canceled_at ? "Canceled" : "—"} variant="neutral" /></td>
                      <td className="py-2 pr-4">{s.canceled_at ? "Yes" : "—"}</td>
                      <td className="py-2 pr-4" onClick={(e) => e.stopPropagation()}>
                        <span className="flex flex-wrap gap-1">
                          {!s.canceled_at && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); setCancelTarget(s); }} className="text-xs px-2 py-0.5 text-amber-700 hover:underline">Cancel</button>
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

      <Drawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} title="New schedule" zIndexBackdrop={60} zIndexPanel={70}>
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
            <h3 className="text-lg font-semibold text-alloy-midnight mb-2">Cancel schedule</h3>
            <p className="text-sm text-alloy-midnight/80 mb-2">Cancel this schedule? Start: {formatDateTime(cancelTarget.start_at)}</p>
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
              <button type="button" onClick={handleCancelConfirm} disabled={cancelLoading} className="px-3 py-1.5 text-sm font-medium bg-amber-600 text-white rounded hover:opacity-90 disabled:opacity-50">{cancelLoading ? "Canceling…" : "Cancel schedule"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
