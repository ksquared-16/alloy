"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SectionCard from "@/components/admin/SectionCard";
import Drawer from "@/components/admin/Drawer";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatDateTime, formatMoneyFromCents } from "@/lib/adminFormatters";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";

type ScheduleRecord = Record<string, unknown> & {
    _job_title?: string | null;
    _customer_name?: string | null;
    _assigned_vendor_name?: string | null;
};

type PaymentRow = {
    id: string;
    created_at: string;
    amount_cents: number;
    paid_at: string | null;
    payment_status: string | null;
};

const TABS = ["overview", "related", "activity"] as const;
type TabKey = (typeof TABS)[number];

export default function ScheduleDetailClient({
    scheduleId,
    initialSchedule,
    role,
}: {
    scheduleId: string;
    initialSchedule: ScheduleRecord;
    role: string;
}) {
    const [schedule, setSchedule] = useState<ScheduleRecord>(initialSchedule);
    const [tab, setTab] = useState<TabKey>("overview");
    const [payments, setPayments] = useState<PaymentRow[]>([]);
    const [loadingPayments, setLoadingPayments] = useState(false);
    const [rescheduleOpen, setRescheduleOpen] = useState(false);
    const [rescheduleForm, setRescheduleForm] = useState({ start_at: "", end_at: "", timezone: "America/Los_Angeles" });
    const [rescheduleLoading, setRescheduleLoading] = useState(false);
    const [rescheduleError, setRescheduleError] = useState<string | null>(null);
    const [cancelOpen, setCancelOpen] = useState(false);
    const [cancelReason, setCancelReason] = useState("");
    const [cancelLoading, setCancelLoading] = useState(false);

    const { labels } = useEntityLabels();
    const scheduleSingular = labels?.schedules?.singular ?? "Schedule";
    const isAdmin = role === "admin";
    const jobId = schedule.job_id as string | null | undefined;
    const canceledAt = schedule.canceled_at as string | null | undefined;
    const vendorName = (schedule._assigned_vendor_name as string) ?? null;
    const title = `${scheduleSingular} · ${schedule.start_at ? formatDateTime(schedule.start_at as string) : scheduleId}`;

    useEffect(() => {
        if (tab !== "related" || !jobId) return;
        setLoadingPayments(true);
        fetch(`/api/admin/jobs/${jobId}/payments`)
            .then((r) => r.json())
            .then((d) => setPayments(d.payments ?? []))
            .finally(() => setLoadingPayments(false));
    }, [tab, jobId]);

    const handleReschedule = async () => {
        if (!rescheduleForm.start_at || !rescheduleForm.end_at) {
            setRescheduleError("Start and end are required.");
            return;
        }
        setRescheduleLoading(true);
        setRescheduleError(null);
        try {
            const res = await fetch(`/api/admin/schedules/${scheduleId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    start_at: new Date(rescheduleForm.start_at).toISOString(),
                    end_at: new Date(rescheduleForm.end_at).toISOString(),
                    timezone: rescheduleForm.timezone || null,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setRescheduleError((data as { error?: string }).error ?? "Update failed");
                return;
            }
            setSchedule((prev) => ({ ...prev, ...data }));
            setRescheduleOpen(false);
        } finally {
            setRescheduleLoading(false);
        }
    };

    const handleCancel = async () => {
        setCancelLoading(true);
        try {
            const res = await fetch(`/api/admin/schedules/${scheduleId}/cancel`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cancel_reason: cancelReason || null }),
            });
            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                setSchedule((prev) => ({ ...prev, ...data }));
                setCancelOpen(false);
                setCancelReason("");
            }
        } finally {
            setCancelLoading(false);
        }
    };

    return (
        <>
            <AdminPageHeader
                title={title}
                subtitle={schedule._job_title ? `Job: ${schedule._job_title}` : undefined}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                            label={canceledAt ? "Canceled" : "Scheduled"}
                            variant={canceledAt ? "neutral" : "default"}
                        />
                        <StatusBadge label={vendorName ?? "Unassigned"} variant="default" />
                        {isAdmin && !canceledAt && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRescheduleForm({
                                            start_at: schedule.start_at ? (schedule.start_at as string).slice(0, 16) : "",
                                            end_at: schedule.end_at ? (schedule.end_at as string).slice(0, 16) : "",
                                            timezone: (schedule.timezone as string) ?? "America/Los_Angeles",
                                        });
                                        setRescheduleError(null);
                                        setRescheduleOpen(true);
                                    }}
                                    className="px-3 py-1.5 text-sm font-medium border border-alloy-stone/40 rounded-md hover:bg-alloy-stone/10"
                                >
                                    Reschedule
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCancelOpen(true)}
                                    className="px-3 py-1.5 text-sm font-medium bg-amber-600 text-white rounded-md hover:opacity-90"
                                >
                                    Cancel schedule
                                </button>
                            </>
                        )}
                    </div>
                }
            />

            <SectionCard title={scheduleSingular} className="mb-4">
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-alloy-midnight/60">Start</span>
                            <p className="font-medium">{schedule.start_at ? formatDateTime(schedule.start_at as string) : "—"}</p>
                        </div>
                        <div>
                            <span className="text-alloy-midnight/60">End</span>
                            <p className="font-medium">{schedule.end_at ? formatDateTime(schedule.end_at as string) : "—"}</p>
                        </div>
                        <div>
                            <span className="text-alloy-midnight/60">Timezone</span>
                            <p className="font-medium">{(schedule.timezone as string) ?? "—"}</p>
                        </div>
                        <div>
                            <span className="text-alloy-midnight/60">Job</span>
                            <p className="font-medium">
                                {jobId ? (
                                    <Link href={`/admin/jobs/${jobId}`} className="text-alloy-blue hover:underline">
                                        {schedule._job_title ?? jobId}
                                    </Link>
                                ) : (
                                    "—"
                                )}
                            </p>
                        </div>
                        <div>
                            <span className="text-alloy-midnight/60">Canceled</span>
                            <p className="font-medium">{canceledAt ? formatDateTime(canceledAt) : "No"}</p>
                        </div>
                    </div>
                )}

                {tab === "related" && (
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#59678b] mb-2">Job</h3>
                            <p className="text-sm text-alloy-midnight">
                                {jobId ? (
                                    <Link href={`/admin/jobs/${jobId}`} className="text-alloy-blue hover:underline">
                                        {schedule._job_title ?? jobId}
                                    </Link>
                                ) : (
                                    "—"
                                )}
                            </p>
                        </div>
                        <div>
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#59678b] mb-2">Customer</h3>
                            <p className="text-sm text-alloy-midnight">{(schedule._customer_name as string) ?? "—"}</p>
                        </div>
                        <div>
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#59678b] mb-2">Assigned vendor</h3>
                            <p className="text-sm text-alloy-midnight">{vendorName ?? "Unassigned"}</p>
                        </div>
                        <div>
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#59678b] mb-3">Payments (job)</h3>
                            {loadingPayments ? (
                                <p className="text-sm text-alloy-midnight/60">Loading…</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-alloy-stone/30 text-left text-alloy-midnight/70">
                                                <th className="pb-2 pr-4">Amount</th>
                                                <th className="pb-2 pr-4">Status</th>
                                                <th className="pb-2 pr-4">Paid at</th>
                                                <th className="pb-2 pr-4">Created</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {payments.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="py-4 text-alloy-midnight/60">
                                                        No payments.
                                                    </td>
                                                </tr>
                                            ) : (
                                                payments.map((p) => (
                                                    <tr key={p.id} className="border-b border-alloy-stone/20 hover:bg-alloy-stone/10">
                                                        <td className="py-2 pr-4">{formatMoneyFromCents(p.amount_cents)}</td>
                                                        <td className="py-2 pr-4">
                                                            <StatusBadge label={p.payment_status ?? "—"} variant="neutral" />
                                                        </td>
                                                        <td className="py-2 pr-4">{p.paid_at ? formatDateTime(p.paid_at) : "—"}</td>
                                                        <td className="py-2 pr-4">{formatDateTime(p.created_at)}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {tab === "activity" && <p className="text-sm text-alloy-midnight/60">No activity yet.</p>}
            </SectionCard>

            <Drawer isOpen={rescheduleOpen} onClose={() => setRescheduleOpen(false)} title="Reschedule" zIndexBackdrop={60} zIndexPanel={70}>
                <div className="space-y-4">
                    {rescheduleError && (
                        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{rescheduleError}</p>
                    )}
                    <div>
                        <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Start (required)</label>
                        <input
                            type="datetime-local"
                            value={rescheduleForm.start_at}
                            onChange={(e) => setRescheduleForm((f) => ({ ...f, start_at: e.target.value }))}
                            className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">End (required)</label>
                        <input
                            type="datetime-local"
                            value={rescheduleForm.end_at}
                            onChange={(e) => setRescheduleForm((f) => ({ ...f, end_at: e.target.value }))}
                            className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-alloy-midnight/70 mb-1">Timezone</label>
                        <input
                            value={rescheduleForm.timezone}
                            onChange={(e) => setRescheduleForm((f) => ({ ...f, timezone: e.target.value }))}
                            className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded"
                        />
                    </div>
                    <div className="flex gap-2 pt-2">
                        <button
                            type="button"
                            onClick={handleReschedule}
                            disabled={rescheduleLoading}
                            className="px-3 py-1.5 text-sm font-medium bg-alloy-midnight text-white rounded-md hover:opacity-90 disabled:opacity-50"
                        >
                            {rescheduleLoading ? "Saving…" : "Update"}
                        </button>
                        <button type="button" onClick={() => setRescheduleOpen(false)} className="px-3 py-1.5 text-sm border border-alloy-stone/40 rounded hover:bg-alloy-stone/20">
                            Cancel
                        </button>
                    </div>
                </div>
            </Drawer>

            {cancelOpen && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50" role="dialog" aria-modal="true">
                    <div className="bg-white rounded-lg shadow-lg border border-alloy-stone/30 p-6 max-w-md w-full mx-4">
                        <h3 className="text-lg font-semibold text-alloy-midnight mb-2">Cancel schedule</h3>
                        <p className="text-sm text-alloy-midnight/80 mb-2">
                            Start: {schedule.start_at ? formatDateTime(schedule.start_at as string) : "—"}
                        </p>
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
                            <button
                                type="button"
                                onClick={() => { setCancelOpen(false); setCancelReason(""); }}
                                disabled={cancelLoading}
                                className="px-3 py-1.5 text-sm border border-alloy-stone/40 rounded hover:bg-alloy-stone/20 disabled:opacity-50"
                            >
                                Back
                            </button>
                            <button
                                type="button"
                                onClick={handleCancel}
                                disabled={cancelLoading}
                                className="px-3 py-1.5 text-sm font-medium bg-amber-600 text-white rounded hover:opacity-90 disabled:opacity-50"
                            >
                                {cancelLoading ? "Canceling…" : "Cancel schedule"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
