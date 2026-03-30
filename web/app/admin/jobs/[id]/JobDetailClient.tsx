"use client";

import { useCallback, useEffect, useState } from "react";
import { useEntityLabels, getEntityLabel } from "@/contexts/EntityLabelsContext";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import Drawer from "@/components/admin/Drawer";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime, formatMoneyFromCents } from "@/lib/adminFormatters";
import JobPricingBreakdown from "@/components/admin/JobPricingBreakdown";
import type { JobPaymentRow, JobPaymentsPaymentSummary } from "@/app/api/admin/jobs/[id]/payments/route";
import { paymentRowStatusDisplayLabel } from "@/lib/admin/jobPaymentSummary";

type JobRecord = Record<string, unknown> & {
    _customer_name?: string | null;
    _assigned_vendor_name?: string | null;
    _work_unit_label?: string | null;
};

type WorkUnitOpt = { id: string; label: string };

type ScheduleRow = {
    id: string;
    job_id: string;
    start_at: string;
    end_at: string;
    timezone: string | null;
    canceled_at?: string | null;
};

type VendorOption = { id: string; name: string | null; label?: string | null };

const TABS = ["overview", "related", "activity"] as const;
type TabKey = (typeof TABS)[number];

export default function JobDetailClient({
    jobId,
    initialJob,
    role,
}: {
    jobId: string;
    initialJob: JobRecord;
    role: string;
}) {
    const [job, setJob] = useState<JobRecord>(initialJob);
    const [tab, setTab] = useState<TabKey>("overview");
    const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
    const [payments, setPayments] = useState<JobPaymentRow[]>([]);
    const [paymentSummary, setPaymentSummary] = useState<JobPaymentsPaymentSummary | null>(null);
    const [paymentsFetchError, setPaymentsFetchError] = useState<string | null>(null);
    const [vendors, setVendors] = useState<VendorOption[]>([]);
    const { labels } = useEntityLabels();
    const vendorSingular = getEntityLabel(labels, "vendors", "singular");
    const jobSingular = getEntityLabel(labels, "jobs", "singular");
    const [loadingSchedules, setLoadingSchedules] = useState(false);
    const [loadingPayments, setLoadingPayments] = useState(false);
    const [assignDrawerOpen, setAssignDrawerOpen] = useState(false);
    const [assignVendorId, setAssignVendorId] = useState<string>("");
    const [assignLoading, setAssignLoading] = useState(false);
    const [assignError, setAssignError] = useState<string | null>(null);
    const [createScheduleOpen, setCreateScheduleOpen] = useState(false);
    const [scheduleForm, setScheduleForm] = useState({ start_at: "", end_at: "", timezone: "America/Los_Angeles" });
    const [scheduleSaveLoading, setScheduleSaveLoading] = useState(false);
    const [scheduleSaveError, setScheduleSaveError] = useState<string | null>(null);
    const [editSchedule, setEditSchedule] = useState<ScheduleRow | null>(null);
    const [editForm, setEditForm] = useState({ start_at: "", end_at: "", timezone: "America/Los_Angeles" });
    const [editSaveLoading, setEditSaveLoading] = useState(false);
    const [editSaveError, setEditSaveError] = useState<string | null>(null);
    const [cancelTarget, setCancelTarget] = useState<ScheduleRow | null>(null);
    const [cancelReason, setCancelReason] = useState("");
    const [cancelLoading, setCancelLoading] = useState(false);
    const [workUnitOptions, setWorkUnitOptions] = useState<WorkUnitOpt[]>([]);
    const [workUnitSaving, setWorkUnitSaving] = useState(false);
    const [workUnitError, setWorkUnitError] = useState<string | null>(null);

    const isAdmin = role === "admin";

    const refetchJob = useCallback(async () => {
        const res = await fetch(`/api/admin/jobs/${jobId}`);
        const data = await res.json().catch(() => ({}));
        if (res.ok && data) setJob(data);
    }, [jobId]);

    useEffect(() => {
        if (!isAdmin) return;
        (async () => {
            const res = await fetch(`/api/admin/jobs/${jobId}/vendors-for-assign`);
            const json = await res.json().catch(() => ({}));
            if (res.ok) setVendors(json.vendors ?? []);
        })();
    }, [isAdmin, jobId]);

    useEffect(() => {
        if (!isAdmin) return;
        let cancelled = false;
        Promise.all([fetch("/api/admin/departments"), fetch("/api/admin/work-units")])
            .then(async ([dRes, wRes]) => {
                if (!dRes.ok || !wRes.ok) {
                    if (!cancelled) setWorkUnitOptions([]);
                    return;
                }
                const dj = (await dRes.json().catch(() => ({}))) as { items?: { id: string; name: string | null; sort_order: number }[] };
                const wj = (await wRes.json().catch(() => ({}))) as {
                    items?: { id: string; name: string | null; department_id: string; sort_order: number }[];
                };
                const depts = [...(dj.items ?? [])].sort(
                    (a, b) => a.sort_order - b.sort_order || String(a.name ?? "").localeCompare(String(b.name ?? ""))
                );
                const deptIndex = new Map(depts.map((d, i) => [d.id, i]));
                const deptName = new Map(depts.map((d) => [d.id, d.name ?? "Department"]));
                const wus = [...(wj.items ?? [])].sort((a, b) => {
                    const da = deptIndex.get(a.department_id) ?? 999;
                    const db = deptIndex.get(b.department_id) ?? 999;
                    if (da !== db) return da - db;
                    return a.sort_order - b.sort_order || String(a.name ?? "").localeCompare(String(b.name ?? ""));
                });
                let opts = wus.map((wu) => ({
                    id: wu.id,
                    label: `${deptName.get(wu.department_id) ?? "Department"} · ${wu.name ?? wu.id}`,
                }));
                const wuid = job.work_unit_id ? String(job.work_unit_id) : "";
                const wuLbl = String(job._work_unit_label ?? "").trim();
                if (wuid && !opts.some((o) => o.id === wuid)) {
                    opts = [...opts, { id: wuid, label: wuLbl || `${wuid.slice(0, 8)}…` }];
                }
                if (!cancelled) setWorkUnitOptions(opts);
            })
            .catch(() => {
                if (!cancelled) setWorkUnitOptions([]);
            });
        return () => {
            cancelled = true;
        };
    }, [isAdmin, jobId, job.work_unit_id, job._work_unit_label]);

    const handleWorkUnitChange = async (next: string) => {
        if (!isAdmin) return;
        setWorkUnitSaving(true);
        setWorkUnitError(null);
        try {
            const res = await fetch(`/api/admin/jobs/${jobId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ work_unit_id: next.trim() ? next.trim() : null }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setWorkUnitError((data as { error?: string }).error ?? "Update failed");
                return;
            }
            setJob((prev) => ({ ...prev, ...data }));
        } finally {
            setWorkUnitSaving(false);
        }
    };

    useEffect(() => {
        if (tab !== "related") return;
        setLoadingSchedules(true);
        fetch(`/api/admin/schedules?job_id=${encodeURIComponent(jobId)}&include_canceled=true`)
            .then((r) => r.json())
            .then((d) => setSchedules(d.schedules ?? []))
            .finally(() => setLoadingSchedules(false));
    }, [tab, jobId]);

    useEffect(() => {
        if (tab !== "related") return;
        setLoadingPayments(true);
        setPaymentsFetchError(null);
        fetch(`/api/admin/jobs/${jobId}/payments`)
            .then(async (r) => {
                const raw = await r.text();
                let json: { payments?: JobPaymentRow[]; payment_summary?: JobPaymentsPaymentSummary; error?: string } = {};
                try {
                    json = raw ? (JSON.parse(raw) as typeof json) : {};
                } catch {
                    setPayments([]);
                    setPaymentSummary(null);
                    setPaymentsFetchError("Invalid response from payments API.");
                    return;
                }
                if (!r.ok) {
                    setPayments([]);
                    setPaymentSummary(null);
                    setPaymentsFetchError(json.error ?? `Payments unavailable (${r.status}).`);
                    return;
                }
                if (json.payment_summary == null || typeof json.payment_summary !== "object") {
                    setPayments([]);
                    setPaymentSummary(null);
                    setPaymentsFetchError("Payment summary missing from server response.");
                    return;
                }
                setPayments(json.payments ?? []);
                setPaymentSummary(json.payment_summary);
            })
            .catch(() => {
                setPayments([]);
                setPaymentSummary(null);
                setPaymentsFetchError("Could not load payments.");
            })
            .finally(() => setLoadingPayments(false));
    }, [tab, jobId]);

    const handleAssignVendor = async () => {
        setAssignLoading(true);
        setAssignError(null);
        try {
            const res = await fetch(`/api/admin/jobs/${jobId}/assign-vendor`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    vendor_id: assignVendorId || null,
                    apply_to_future_schedules: false,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setAssignError((data as { error?: string }).error ?? "Update failed");
                return;
            }
            const v = vendors.find((x) => x.id === assignVendorId);
            const assignLabel = (v?.label?.trim() || v?.name?.trim()) ?? null;
            const vid = (data as { assigned_vendor_id?: string | null }).assigned_vendor_id ?? null;
            setJob((prev) => ({ ...prev, assigned_vendor_id: vid, _assigned_vendor_name: assignLabel }));
            void refetchJob();
            setAssignDrawerOpen(false);
        } finally {
            setAssignLoading(false);
        }
    };

    const handleCreateSchedule = async () => {
        if (!scheduleForm.start_at || !scheduleForm.end_at) {
            setScheduleSaveError("Start and end are required.");
            return;
        }
        setScheduleSaveLoading(true);
        setScheduleSaveError(null);
        try {
            const res = await fetch("/api/admin/schedules", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    job_id: jobId,
                    start_at: new Date(scheduleForm.start_at).toISOString(),
                    end_at: new Date(scheduleForm.end_at).toISOString(),
                    timezone: scheduleForm.timezone || null,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setScheduleSaveError((data as { error?: string }).error ?? "Create failed");
                return;
            }
            setCreateScheduleOpen(false);
            setScheduleForm({ start_at: "", end_at: "", timezone: "America/Los_Angeles" });
            setSchedules((prev) => [...prev, data].sort((a, b) => (b.start_at > a.start_at ? 1 : -1)));
        } finally {
            setScheduleSaveLoading(false);
        }
    };

    const openReschedule = (s: ScheduleRow) => {
        setEditSchedule(s);
        setEditForm({
            start_at: s.start_at ? s.start_at.slice(0, 16) : "",
            end_at: s.end_at ? s.end_at.slice(0, 16) : "",
            timezone: (s as { timezone?: string }).timezone ?? "America/Los_Angeles",
        });
        setEditSaveError(null);
    };

    const handleReschedule = async () => {
        if (!editSchedule) return;
        if (!editForm.start_at || !editForm.end_at) {
            setEditSaveError("Start and end are required.");
            return;
        }
        setEditSaveLoading(true);
        setEditSaveError(null);
        try {
            const res = await fetch(`/api/admin/schedules/${editSchedule.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    start_at: new Date(editForm.start_at).toISOString(),
                    end_at: new Date(editForm.end_at).toISOString(),
                    timezone: editForm.timezone || null,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setEditSaveError((data as { error?: string }).error ?? "Update failed");
                return;
            }
            setEditSchedule(null);
            setSchedules((prev) => prev.map((x) => (x.id === editSchedule.id ? { ...x, ...data } : x)));
        } finally {
            setEditSaveLoading(false);
        }
    };

    const handleCancelSchedule = async () => {
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
                setSchedules((prev) => prev.map((s) => (s.id === cancelTarget.id ? { ...s, canceled_at: new Date().toISOString() } : s)));
            }
        } finally {
            setCancelLoading(false);
        }
    };

    const jobStatusDisplay =
        (job._status_display as string | null | undefined)?.trim() ||
        (job.status_key as string | null | undefined)?.trim() ||
        null;

    const title = (job.title as string) ?? jobSingular;
    const customerName = (job._customer_name as string) ?? "—";
    const vendorName = (job._assigned_vendor_name as string) ?? null;
    const scheduledAt = job.scheduled_at as string | null | undefined;
    const completedAt = job.completed_at as string | null | undefined;

    return (
        <>
            <AdminPageHeader
                title={title}
                subtitle={`${jobSingular} details · ${customerName}`}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge label={jobStatusDisplay} variant="neutral" />
                        <StatusBadge label={vendorName ?? `Unassigned`} variant="default" />
                        {isAdmin ? (
                        <>
                            <button
                                type="button"
                                onClick={() => {
                                    setAssignVendorId((job.assigned_vendor_id as string) ?? "");
                                    setAssignError(null);
                                    setAssignDrawerOpen(true);
                                }}
                                className="px-3 py-1.5 text-sm font-medium border border-alloy-stone/40 rounded-md hover:bg-alloy-stone/10"
                            >
                                Assign {vendorSingular}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setScheduleForm({ start_at: "", end_at: "", timezone: "America/Los_Angeles" });
                                    setScheduleSaveError(null);
                                    setCreateScheduleOpen(true);
                                }}
                                className="px-3 py-1.5 text-sm font-medium bg-alloy-midnight text-white rounded-md hover:opacity-90"
                            >
                                Create schedule
                            </button>
                        </>
                    ) : null}
                    </div>
                }
            />

            <SectionCard title={jobSingular} className="mb-4">
                <div className="flex gap-0.5 rounded-md border border-[#e6e8ec] bg-[#F4F6F9]/50 p-0.5 mb-4">
                    {TABS.map((t) => (
                        <button
                            key={t}
                            type="button"
                            onClick={() => setTab(t)}
                            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                                tab === t ? "bg-[#31394d] text-white shadow-sm" : "text-[#59678b] hover:bg-[#eef0f4]"
                            }`}
                        >
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                    ))}
                </div>

                {tab === "overview" && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="text-alloy-midnight/60">Title</span>
                                <p className="font-medium">{(job.title as string) ?? "—"}</p>
                            </div>
                            <div>
                                <span className="text-alloy-midnight/60">Description</span>
                                <p className="font-medium">{(job.description as string) ?? "—"}</p>
                            </div>
                            <div>
                                <span className="text-alloy-midnight/60">Recurring</span>
                                <p className="font-medium">{(job.is_recurring as boolean) ? "Yes" : "No"}</p>
                            </div>
                            <div>
                                <span className="text-alloy-midnight/60">Internal notes</span>
                                <p className="font-medium">
                                    {((job.metadata as Record<string, unknown>)?.internal_notes as string) ?? "—"}
                                </p>
                            </div>
                            <div className="sm:col-span-2">
                                <span className="text-alloy-midnight/60">Work unit</span>
                                {isAdmin ? (
                                    <div className="mt-1 max-w-md space-y-1">
                                        <select
                                            className="w-full border border-alloy-stone/40 rounded-md px-2 py-1.5 text-sm"
                                            value={String(job.work_unit_id ?? "")}
                                            disabled={workUnitSaving}
                                            onChange={(e) => void handleWorkUnitChange(e.target.value)}
                                        >
                                            <option value="">Unassigned</option>
                                            {workUnitOptions.map((o) => (
                                                <option key={o.id} value={o.id}>
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>
                                        {workUnitError ? <p className="text-sm text-red-600">{workUnitError}</p> : null}
                                        {workUnitSaving ? (
                                            <p className="text-xs text-alloy-midnight/50">Saving…</p>
                                        ) : null}
                                    </div>
                                ) : (
                                    <p className="font-medium mt-0.5">
                                        {String(job._work_unit_label ?? "").trim() || "Unassigned"}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="pt-4 border-t border-alloy-stone/20">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#59678b] mb-3">
                                Pricing breakdown
                            </h3>
                            <JobPricingBreakdown record={job} />
                        </div>
                        {(scheduledAt || completedAt) && (
                            <div className="pt-2 border-t border-alloy-stone/20 text-sm text-alloy-midnight/70">
                                {scheduledAt && <span>Scheduled: {formatDateTime(scheduledAt)}</span>}
                                {scheduledAt && completedAt && " · "}
                                {completedAt && <span>Completed: {formatDateTime(completedAt)}</span>}
                            </div>
                        )}
                    </div>
                )}

                {tab === "related" && (
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#59678b] mb-2">Customer</h3>
                            <p className="text-sm text-alloy-midnight">{customerName}</p>
                        </div>
                        {((job as { _primary_person_name?: string | null })._primary_person_name ?? (job._primary_contact_name as string)) && (
                            <div>
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#59678b] mb-2">Person</h3>
                                <p className="text-sm text-alloy-midnight">{(job as { _primary_person_name?: string | null })._primary_person_name ?? (job._primary_contact_name as string)}</p>
                            </div>
                        )}
                        <div>
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#59678b] mb-2">Assigned {vendorSingular}</h3>
                            <p className="text-sm text-alloy-midnight">{vendorName ?? "Unassigned"}</p>
                        </div>
                        <div>
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#59678b] mb-3">Schedules</h3>
                            {loadingSchedules ? (
                                <p className="text-sm text-alloy-midnight/60">Loading schedules…</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-alloy-stone/30 text-left text-alloy-midnight/70">
                                                <th className="pb-2 pr-4">Start</th>
                                                <th className="pb-2 pr-4">End</th>
                                                <th className="pb-2 pr-4">Timezone</th>
                                                <th className="pb-2 pr-4">Status</th>
                                                {isAdmin && <th className="pb-2 pr-4">Actions</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {schedules.length === 0 ? (
                                                <tr>
                                                    <td colSpan={isAdmin ? 5 : 4} className="py-4 text-alloy-midnight/60">
                                                        No schedules.
                                                    </td>
                                                </tr>
                                            ) : (
                                                schedules.map((s) => (
                                                    <tr key={s.id} className="border-b border-alloy-stone/20 hover:bg-alloy-stone/10">
                                                        <td className="py-2 pr-4">{formatDateTime(s.start_at)}</td>
                                                        <td className="py-2 pr-4">{formatDateTime(s.end_at)}</td>
                                                        <td className="py-2 pr-4">{(s as { timezone?: string }).timezone ?? "—"}</td>
                                                        <td className="py-2 pr-4">
                                                            <StatusBadge
                                                                label={s.canceled_at ? "Canceled" : "Scheduled"}
                                                                variant={s.canceled_at ? "neutral" : "default"}
                                                            />
                                                        </td>
                                                        {isAdmin && (
                                                            <td className="py-2 pr-4">
                                                                <span className="flex flex-wrap gap-1">
                                                                    {!s.canceled_at && (
                                                                        <>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => openReschedule(s)}
                                                                                className="text-xs px-2 py-0.5 text-alloy-blue hover:underline"
                                                                            >
                                                                                Reschedule
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setCancelTarget(s)}
                                                                                className="text-xs px-2 py-0.5 text-amber-700 hover:underline"
                                                                            >
                                                                                Cancel
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </span>
                                                            </td>
                                                        )}
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                        <div>
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#59678b] mb-3">Payments</h3>
                            {loadingPayments ? (
                                <p className="text-sm text-alloy-midnight/60">Loading payments…</p>
                            ) : paymentsFetchError ? (
                                <p className="text-sm text-red-600">{paymentsFetchError}</p>
                            ) : !paymentSummary ? (
                                <p className="text-sm text-alloy-midnight/60">Payment summary unavailable.</p>
                            ) : (
                                <>
                                    <div className="rounded-md border border-alloy-stone/30 bg-alloy-stone/10 px-3 py-2 text-sm space-y-1 mb-3">
                                        <div className="flex justify-between gap-2">
                                            <span className="text-alloy-midnight/70">Job total</span>
                                            <span className="font-medium">
                                                {paymentSummary.job_total_cents != null
                                                    ? formatMoneyFromCents(paymentSummary.job_total_cents)
                                                    : paymentSummary.original_amount_cents != null
                                                      ? formatMoneyFromCents(paymentSummary.original_amount_cents)
                                                      : "—"}
                                            </span>
                                        </div>
                                        <div className="flex justify-between gap-2">
                                            <span className="text-alloy-midnight/70">Paid</span>
                                            <span className="font-medium">{formatMoneyFromCents(paymentSummary.paid_amount_cents)}</span>
                                        </div>
                                        <div className="flex justify-between gap-2">
                                            <span className="text-alloy-midnight/70">Outstanding</span>
                                            <span className="font-medium">
                                                {(paymentSummary.outstanding_balance_cents ?? paymentSummary.balance_due_cents) != null
                                                    ? formatMoneyFromCents(
                                                          (paymentSummary.outstanding_balance_cents ??
                                                              paymentSummary.balance_due_cents) as number
                                                      )
                                                    : "—"}
                                            </span>
                                        </div>
                                        {paymentSummary.pending_payment_amount_cents > 0 ? (
                                            <div className="flex justify-between gap-2">
                                                <span className="text-alloy-midnight/70">Pending</span>
                                                <span className="font-medium">
                                                    {formatMoneyFromCents(paymentSummary.pending_payment_amount_cents)}
                                                </span>
                                            </div>
                                        ) : null}
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-alloy-stone/30 text-left text-alloy-midnight/70">
                                                    <th className="pb-2 pr-4">Charge</th>
                                                    <th className="pb-2 pr-4">Status</th>
                                                    <th className="pb-2 pr-4">Received</th>
                                                    <th className="pb-2 pr-4">Posted</th>
                                                    <th className="pb-2 pr-4">Processor</th>
                                                    <th className="pb-2 pr-4">Txn / ref</th>
                                                    <th className="pb-2 pr-4">Allocated</th>
                                                    <th className="pb-2 pr-4">Unallocated</th>
                                                    <th className="pb-2 pr-4">Allocation</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {payments.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={9} className="py-4 text-alloy-midnight/60">
                                                            No payments.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    payments.map((p) => {
                                                        const refId =
                                                            (p.processor_transaction_id?.trim() || "") ||
                                                            (p.provider_payment_id?.trim() || "");
                                                        return (
                                                            <tr key={p.id} className="border-b border-alloy-stone/20 hover:bg-alloy-stone/10">
                                                                <td className="py-2 pr-4">{formatMoneyFromCents(p.amount_cents)}</td>
                                                                <td className="py-2 pr-4">
                                                                    <StatusBadge label={paymentRowStatusDisplayLabel(p)} variant="neutral" />
                                                                </td>
                                                                <td className="py-2 pr-4">
                                                                    {p.received_at ? formatDateTime(p.received_at) : "—"}
                                                                </td>
                                                                <td className="py-2 pr-4">
                                                                    {p.posted_at
                                                                        ? formatDateTime(p.posted_at)
                                                                        : p.paid_at
                                                                          ? formatDateTime(p.paid_at)
                                                                          : "—"}
                                                                </td>
                                                                <td className="py-2 pr-4">{p.processor ?? "—"}</td>
                                                                <td className="py-2 pr-4 font-mono text-xs">{refId || "—"}</td>
                                                                <td className="py-2 pr-4">{formatMoneyFromCents(p.allocated_amount_cents)}</td>
                                                                <td className="py-2 pr-4">{formatMoneyFromCents(p.unallocated_amount_cents)}</td>
                                                                <td className="py-2 pr-4">{p.allocation_state ?? "—"}</td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {tab === "activity" && (
                    <p className="text-sm text-alloy-midnight/60">No activity yet.</p>
                )}
            </SectionCard>

            {/* Assign vendor drawer */}
            <Drawer isOpen={assignDrawerOpen} onClose={() => setAssignDrawerOpen(false)} title={`Assign ${vendorSingular}`} zIndexBackdrop={60} zIndexPanel={70}>
                <div className="space-y-4">
                    {assignError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{assignError}</p>}
                    <div>
                        <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">{vendorSingular}</label>
                        <select
                            value={assignVendorId}
                            onChange={(e) => setAssignVendorId(e.target.value)}
                            className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded"
                        >
                            <option value="">Unassigned</option>
                            {vendors.map((v) => (
                                <option key={v.id} value={v.id}>{v.label?.trim() || v.name?.trim() || v.id}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex gap-2 pt-2">
                        <button type="button" onClick={handleAssignVendor} disabled={assignLoading} className="px-3 py-1.5 text-sm font-medium bg-alloy-midnight text-white rounded-md hover:opacity-90 disabled:opacity-50">
                            {assignLoading ? "Saving…" : "Save"}
                        </button>
                        <button type="button" onClick={() => setAssignDrawerOpen(false)} className="px-3 py-1.5 text-sm border border-alloy-stone/40 rounded hover:bg-alloy-stone/20">Cancel</button>
                    </div>
                </div>
            </Drawer>

            {/* Create schedule drawer */}
            <Drawer isOpen={createScheduleOpen} onClose={() => setCreateScheduleOpen(false)} title="Create schedule" zIndexBackdrop={60} zIndexPanel={70}>
                <div className="space-y-4">
                    {scheduleSaveError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{scheduleSaveError}</p>}
                    <p className="text-sm text-alloy-midnight/70">Job: {title} (locked)</p>
                    <div>
                        <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Start (required)</label>
                        <input
                            type="datetime-local"
                            value={scheduleForm.start_at}
                            onChange={(e) => setScheduleForm((f) => ({ ...f, start_at: e.target.value }))}
                            className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">End (required)</label>
                        <input
                            type="datetime-local"
                            value={scheduleForm.end_at}
                            onChange={(e) => setScheduleForm((f) => ({ ...f, end_at: e.target.value }))}
                            className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Timezone</label>
                        <input
                            value={scheduleForm.timezone}
                            onChange={(e) => setScheduleForm((f) => ({ ...f, timezone: e.target.value }))}
                            className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded"
                        />
                    </div>
                    <div className="flex gap-2 pt-2">
                        <button type="button" onClick={handleCreateSchedule} disabled={scheduleSaveLoading} className="px-3 py-1.5 text-sm font-medium bg-alloy-midnight text-white rounded-md hover:opacity-90 disabled:opacity-50">
                            {scheduleSaveLoading ? "Creating…" : "Create"}
                        </button>
                        <button type="button" onClick={() => setCreateScheduleOpen(false)} className="px-3 py-1.5 text-sm border border-alloy-stone/40 rounded hover:bg-alloy-stone/20">Cancel</button>
                    </div>
                </div>
            </Drawer>

            {/* Reschedule drawer */}
            <Drawer isOpen={!!editSchedule} onClose={() => setEditSchedule(null)} title="Reschedule" zIndexBackdrop={60} zIndexPanel={70}>
                {editSchedule && (
                    <div className="space-y-4">
                        {editSaveError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{editSaveError}</p>}
                        <div>
                            <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Start (required)</label>
                            <input
                                type="datetime-local"
                                value={editForm.start_at}
                                onChange={(e) => setEditForm((f) => ({ ...f, start_at: e.target.value }))}
                                className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">End (required)</label>
                            <input
                                type="datetime-local"
                                value={editForm.end_at}
                                onChange={(e) => setEditForm((f) => ({ ...f, end_at: e.target.value }))}
                                className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Timezone</label>
                            <input
                                value={editForm.timezone}
                                onChange={(e) => setEditForm((f) => ({ ...f, timezone: e.target.value }))}
                                className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded"
                            />
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button type="button" onClick={handleReschedule} disabled={editSaveLoading} className="px-3 py-1.5 text-sm font-medium bg-alloy-midnight text-white rounded-md hover:opacity-90 disabled:opacity-50">
                                {editSaveLoading ? "Saving…" : "Update"}
                            </button>
                            <button type="button" onClick={() => setEditSchedule(null)} className="px-3 py-1.5 text-sm border border-alloy-stone/40 rounded hover:bg-alloy-stone/20">Cancel</button>
                        </div>
                    </div>
                )}
            </Drawer>

            {/* Cancel schedule modal */}
            {cancelTarget && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
                    <div className="bg-white rounded-lg shadow-lg border border-alloy-stone/30 p-6 max-w-md w-full mx-4">
                        <h3 className="text-lg font-semibold text-alloy-midnight mb-2">Cancel schedule</h3>
                        <p className="text-sm text-alloy-midnight/80 mb-2">Start: {formatDateTime(cancelTarget.start_at)}</p>
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
                            <button type="button" onClick={handleCancelSchedule} disabled={cancelLoading} className="px-3 py-1.5 text-sm font-medium bg-amber-600 text-white rounded hover:opacity-90 disabled:opacity-50">{cancelLoading ? "Canceling…" : "Cancel schedule"}</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
