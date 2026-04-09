"use client";

import type { ComponentProps, CSSProperties, Dispatch, ReactNode, SetStateAction } from "react";
import { neutral, derived, brand } from "@/styles/tokens/colors";
import { formatDateTime, formatMoneyFromCents } from "@/lib/adminFormatters";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import { StatusBadge } from "@/components/admin/StatusBadge";
import type { JobPaymentsSummaryFromApi } from "@/lib/admin/jobPaymentSummary";
import type { StatusDefOption } from "@/components/admin/entity/EntityDrawerOverview";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";

const shell: CSSProperties = {
    color: neutral.textPrimary,
    ["--d-muted" as string]: derived.textSecondary,
    ["--d-border" as string]: derived.border,
    ["--d-surface" as string]: neutral.surface,
    ["--d-brand" as string]: brand.primary,
};

export function JobDrawerV2TabBar(props: {
    tabs: DrawerTabKey[];
    tabLabels: Record<string, string>;
    active: DrawerTabKey;
    onSelect: (tab: DrawerTabKey) => void;
}) {
    const { tabs, tabLabels, active, onSelect } = props;
    return (
        <div
            data-adminv2-job-record-nav="true"
            className="flex flex-wrap gap-1 rounded-xl p-1"
            style={{
                backgroundColor: derived.maskOverlay,
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: derived.border,
            }}
            role="tablist"
            aria-label="Record sections"
        >
            {tabs.map((tab) => {
                const isOn = active === tab;
                return (
                    <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={isOn}
                        onClick={() => onSelect(tab)}
                        className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                        style={
                            isOn
                                ? {
                                      backgroundColor: neutral.surface,
                                      color: brand.primary,
                                      boxShadow: derived.cardShadow,
                                  }
                                : { color: derived.textSecondary }
                        }
                    >
                        {tabLabels[tab] ?? tab}
                    </button>
                );
            })}
        </div>
    );
}

function signalTone(tone: "neutral" | "info" | "warning" | "critical"): { bg: string; border: string } {
    switch (tone) {
        case "critical":
            return { bg: "rgba(188, 67, 0, 0.08)", border: "rgba(188, 67, 0, 0.35)" };
        case "warning":
            return { bg: "rgba(0, 69, 140, 0.06)", border: "rgba(0, 69, 140, 0.22)" };
        case "info":
            return { bg: "rgba(0, 162, 131, 0.06)", border: "rgba(0, 162, 131, 0.22)" };
        default:
            return { bg: neutral.surface, border: derived.border };
    }
}

export function JobDrawerV2SignalsStrip(props: {
    paymentLabel: string;
    paymentTone: "neutral" | "info" | "warning" | "critical";
    scheduleLabel: string;
    scheduleTone: "neutral" | "info" | "warning" | "critical";
    assignmentLabel: string;
    assignmentTone: "neutral" | "info" | "warning" | "critical";
}) {
    const cards = [
        { kicker: "Payment", label: props.paymentLabel, tone: props.paymentTone },
        { kicker: "Schedule", label: props.scheduleLabel, tone: props.scheduleTone },
        { kicker: "Assignment", label: props.assignmentLabel, tone: props.assignmentTone },
    ] as const;
    return (
        <div className="adminv2-job-drawer-signals flex flex-wrap gap-2" style={shell}>
            {cards.map((c) => {
                const t = signalTone(c.tone);
                return (
                    <div
                        key={c.kicker}
                        className="min-w-[140px] flex-1 rounded-lg px-3 py-2"
                        style={{
                            backgroundColor: t.bg,
                            borderWidth: 1,
                            borderStyle: "solid",
                            borderColor: t.border,
                        }}
                    >
                        <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: derived.textSecondary }}>
                            {c.kicker}
                        </div>
                        <div className="mt-0.5 text-sm font-medium leading-snug" style={{ color: neutral.textPrimary }}>
                            {c.label}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export function deriveJobDrawerSignalLines(
    job: Record<string, unknown>,
    schedules: { start_at?: string }[],
    paymentLabel: string,
    paymentIsPaid: boolean,
    paymentFailed: boolean
): {
    paymentLabel: string;
    paymentTone: "neutral" | "info" | "warning" | "critical";
    scheduleLabel: string;
    scheduleTone: "neutral" | "info" | "warning" | "critical";
    assignmentLabel: string;
    assignmentTone: "neutral" | "info" | "warning" | "critical";
} {
    const nextRaw = job._next_schedule != null ? String(job._next_schedule) : "";
    const nextFromSched = schedules[0]?.start_at;
    const refIso = nextRaw || nextFromSched || "";
    let scheduleLabel = "No upcoming visit";
    let scheduleTone: "neutral" | "info" | "warning" | "critical" = "warning";
    if (refIso) {
        const t = new Date(refIso).getTime();
        if (!Number.isNaN(t)) {
            const now = Date.now();
            if (t < now) {
                scheduleLabel = "Overdue visit";
                scheduleTone = "critical";
            } else {
                const days = (t - now) / 86400000;
                scheduleLabel = days <= 1 ? "Visit soon" : "Scheduled";
                scheduleTone = days <= 1 ? "warning" : "info";
            }
        }
    }

    const vendorId = job.assigned_vendor_id != null ? String(job.assigned_vendor_id).trim() : "";
    const vendorName = String((job as { _vendor_name?: string | null })._vendor_name ?? "").trim();
    const wu = String((job as { _work_unit_label?: string | null })._work_unit_label ?? "").trim();
    let assignmentLabel = "Unassigned";
    let assignmentTone: "neutral" | "info" | "warning" | "critical" = "warning";
    if (vendorId) {
        assignmentLabel = vendorName ? `Cleaner: ${vendorName}` : "Cleaner assigned";
        assignmentTone = "info";
    } else if (wu) {
        assignmentLabel = `Queue: ${wu}`;
        assignmentTone = "info";
    }

    let payTone: "neutral" | "info" | "warning" | "critical" = "neutral";
    if (paymentFailed) payTone = "critical";
    else if (paymentIsPaid) payTone = "info";
    else payTone = "warning";

    return {
        paymentLabel,
        paymentTone: payTone,
        scheduleLabel,
        scheduleTone,
        assignmentLabel,
        assignmentTone,
    };
}

function formatServiceFrequencyReadLabel(k: unknown): string {
    if (k == null || String(k).trim() === "") return "—";
    return String(k).replace(/_/g, " ");
}

const primaryPanelFieldClass =
    "w-full rounded border px-2 py-1.5 text-sm text-alloy-forge focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20 disabled:opacity-60";
const primaryPanelLabelClass = "block text-[11px] font-semibold uppercase tracking-wide mb-0.5";
const primaryPanelReadClass = "text-sm font-medium leading-snug break-words";

/** High-signal editable block + read-only financial/service summary (Admin V2 job Record tab). */
export function JobRecordPrimaryPanel(props: {
    record: Record<string, unknown> | null;
    formData: Record<string, unknown>;
    setFormData: Dispatch<SetStateAction<Record<string, unknown>>>;
    canMutate: boolean;
    statusDefs: StatusDefOption[];
    onBlur: () => void;
    jobCustomerOptions: { id: string; name: string | null }[];
    jobVendorOptions: { id: string; label: string }[];
    jobWorkUnitOptions: { id: string; label: string }[];
    firstSchedule: { id: string; start_at: string; end_at: string; timezone: string } | null;
    rescheduleFormActive: boolean;
    openReschedule: (s: { id: string; start_at: string; end_at: string; timezone: string }) => void;
    openDrawer: (params: { type: AdminDrawerEntityType; id: string }) => void;
}) {
    const r = props.record ?? {};
    const totalRaw = r.display_total_cents ?? r.total_cents ?? r.gross_price_cents ?? r.estimated_total_cents;
    const totalCents = typeof totalRaw === "number" ? totalRaw : typeof totalRaw === "string" ? parseFloat(totalRaw) : NaN;
    const balRaw = r._job_payment_balance_cents;
    const balCents = typeof balRaw === "number" ? balRaw : typeof balRaw === "string" ? parseFloat(balRaw) : NaN;
    const nextIso =
        r._next_schedule != null && String(r._next_schedule).trim() !== ""
            ? String(r._next_schedule)
            : props.firstSchedule?.start_at ?? "";
    let nextLabel = "—";
    if (nextIso) {
        try {
            nextLabel = formatDateTime(nextIso);
        } catch {
            nextLabel = nextIso;
        }
    }
    const serviceType =
        String((r.service_key as string | undefined) ?? "").trim() ||
        String((r.job_type as string | undefined) ?? "").trim() ||
        "—";
    const statusOptions = props.statusDefs.filter((s) => s.is_active !== false).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const sk = String(props.formData.status_key ?? r.status_key ?? "").trim();
    if (sk && !statusOptions.some((s) => s.status_key === sk)) {
        statusOptions.push({ status_key: sk, status_label: sk, sort_order: 9999, is_active: true });
    }

    return (
        <div
            className="rounded-[10px] border border-solid p-3 sm:p-4 shadow-sm"
            style={{ borderColor: derived.border, backgroundColor: neutral.surface, ...shell }}
            data-adminv2-job-primary-panel="true"
        >
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-3" style={{ color: derived.textSecondary }}>
                Primary actions
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
                <div className="min-w-0 space-y-3">
                    <div>
                        <label htmlFor="job-primary-status" className={primaryPanelLabelClass} style={{ color: derived.textSecondary }}>
                            Status
                        </label>
                        <select
                            id="job-primary-status"
                            value={sk}
                            onChange={(e) => props.setFormData((f) => ({ ...f, status_key: e.target.value || null }))}
                            onBlur={props.onBlur}
                            disabled={!props.canMutate}
                            className={primaryPanelFieldClass}
                            style={{ borderColor: derived.border, backgroundColor: neutral.surface }}
                        >
                            <option value="">— None —</option>
                            {statusOptions.map((s) => (
                                <option key={s.status_key} value={s.status_key}>
                                    {s.status_label ?? s.status_key}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div id="job-assign-vendor-section">
                        <span className={primaryPanelLabelClass} style={{ color: derived.textSecondary }}>
                            Assignment · vendor
                        </span>
                        <select
                            value={String(props.formData.assigned_vendor_id ?? "")}
                            onChange={(e) => props.setFormData((f) => ({ ...f, assigned_vendor_id: e.target.value || null }))}
                            onBlur={props.onBlur}
                            disabled={!props.canMutate}
                            className={primaryPanelFieldClass}
                            style={{ borderColor: derived.border, backgroundColor: neutral.surface }}
                        >
                            <option value="">(none)</option>
                            {props.jobVendorOptions.map((v) => (
                                <option key={v.id} value={v.id}>
                                    {v.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="job-primary-wu" className={primaryPanelLabelClass} style={{ color: derived.textSecondary }}>
                            Work unit
                        </label>
                        <select
                            id="job-primary-wu"
                            value={String(props.formData.work_unit_id ?? "")}
                            onChange={(e) => props.setFormData((f) => ({ ...f, work_unit_id: e.target.value || null }))}
                            onBlur={props.onBlur}
                            disabled={!props.canMutate}
                            className={primaryPanelFieldClass}
                            style={{ borderColor: derived.border, backgroundColor: neutral.surface }}
                        >
                            <option value="">Unassigned</option>
                            {props.jobWorkUnitOptions.map((o) => (
                                <option key={o.id} value={o.id}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <span className={primaryPanelLabelClass} style={{ color: derived.textSecondary }}>
                            Next schedule
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={primaryPanelReadClass} style={{ color: neutral.textPrimary }}>
                                {nextLabel}
                            </span>
                            {props.firstSchedule && !props.rescheduleFormActive ? (
                                <button
                                    type="button"
                                    onClick={() => props.openReschedule(props.firstSchedule!)}
                                    className="text-xs font-medium px-2 py-1 rounded-md border"
                                    style={{ borderColor: derived.border, color: brand.primary }}
                                >
                                    Reschedule
                                </button>
                            ) : null}
                        </div>
                    </div>
                    <div>
                        <label htmlFor="job-primary-customer" className={primaryPanelLabelClass} style={{ color: derived.textSecondary }}>
                            Customer
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                id="job-primary-customer"
                                value={String(props.formData.customer_id ?? "")}
                                onChange={(e) =>
                                    props.setFormData((f) => ({
                                        ...f,
                                        customer_id: e.target.value,
                                        primary_contact_id: "",
                                        opportunity_id: "",
                                    }))
                                }
                                onBlur={props.onBlur}
                                disabled={!props.canMutate}
                                className={`${primaryPanelFieldClass} flex-1 min-w-[160px]`}
                                style={{ borderColor: derived.border, backgroundColor: neutral.surface }}
                            >
                                <option value="">(none)</option>
                                {props.jobCustomerOptions.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name ?? c.id}
                                    </option>
                                ))}
                            </select>
                            {String(props.formData.customer_id ?? "").trim() ? (
                                <button
                                    type="button"
                                    onClick={() => props.openDrawer({ type: "customers", id: String(props.formData.customer_id) })}
                                    className="text-xs px-2 py-1 border rounded-md shrink-0"
                                    style={{ borderColor: derived.border }}
                                >
                                    Open
                                </button>
                            ) : null}
                        </div>
                    </div>
                </div>
                <div
                    className="min-w-0 space-y-3 rounded-lg px-3 py-3"
                    style={{ backgroundColor: derived.maskOverlay, borderWidth: 1, borderStyle: "solid", borderColor: derived.border }}
                >
                    <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: derived.textSecondary }}>
                        Summary
                    </p>
                    <div>
                        <div className={primaryPanelLabelClass} style={{ color: derived.textSecondary }}>
                            Total price
                        </div>
                        <div className={primaryPanelReadClass} style={{ color: neutral.textPrimary }}>
                            {Number.isFinite(totalCents) ? formatMoneyFromCents(totalCents) : "—"}
                        </div>
                    </div>
                    <div>
                        <div className={primaryPanelLabelClass} style={{ color: derived.textSecondary }}>
                            Outstanding balance
                        </div>
                        <div className={primaryPanelReadClass} style={{ color: neutral.textPrimary }}>
                            {Number.isFinite(balCents) ? formatMoneyFromCents(balCents) : "—"}
                        </div>
                    </div>
                    <div>
                        <div className={primaryPanelLabelClass} style={{ color: derived.textSecondary }}>
                            Service type
                        </div>
                        <div className={primaryPanelReadClass} style={{ color: neutral.textPrimary }}>
                            {serviceType}
                        </div>
                    </div>
                    <div>
                        <div className={primaryPanelLabelClass} style={{ color: derived.textSecondary }}>
                            Frequency
                        </div>
                        <div className={primaryPanelReadClass} style={{ color: neutral.textPrimary }}>
                            {formatServiceFrequencyReadLabel(r.service_frequency_key)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function JobDrawerV2PrimaryActions(props: {
    canMutate: boolean;
    jobId: string;
    vendorSingular: string;
    jobActionLoading: string | null;
    setJobActionLoading: (v: string | null) => void;
    hasServerJobPaymentSummary: boolean;
    jobPaymentSummaryFromApi: JobPaymentsSummaryFromApi | null;
    jobSchedulesLength: number;
    openCollectPayment: () => void;
    clearPaymentToast: () => void;
    setJobExpandedSections: Dispatch<
        SetStateAction<{ relationships: boolean; financials: boolean; scheduling: boolean; ledger: boolean }>
    >;
    openReschedule: (s: { id: string; start_at: string; end_at: string; timezone: string }) => void;
    firstSchedule: { id: string; start_at: string; end_at: string; timezone: string } | null;
    rescheduleFormActive: boolean;
    setData: Dispatch<SetStateAction<Record<string, unknown> | null>>;
    refetch: () => void;
    router: { refresh: () => void };
}) {
    const btnBase: CSSProperties = {
        fontSize: 13,
        padding: "6px 12px",
        borderRadius: 8,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: derived.border,
        backgroundColor: neutral.surface,
        color: neutral.textPrimary,
    };
    const primaryBtn: CSSProperties = {
        ...btnBase,
        backgroundColor: brand.primary,
        borderColor: brand.primary,
        color: "#fff",
    };
    const p = props;
    return (
        <div className="flex flex-wrap items-center gap-2" data-adminv2-job-record-primary-actions="true">
            <button
                type="button"
                disabled={!p.canMutate}
                onClick={() => {
                    p.clearPaymentToast();
                    p.openCollectPayment();
                }}
                style={primaryBtn}
                className="min-h-[36px] font-semibold shadow-sm disabled:opacity-50"
            >
                Add payment
            </button>
            {p.hasServerJobPaymentSummary && p.jobPaymentSummaryFromApi?.payment_status_key === "failed" && (
                <button
                    type="button"
                    disabled={!p.canMutate}
                    onClick={() => {
                        p.clearPaymentToast();
                        p.openCollectPayment();
                    }}
                    style={{
                        ...btnBase,
                        borderColor: "rgba(188, 67, 0, 0.45)",
                        color: brand.accent,
                        backgroundColor: "rgba(188, 67, 0, 0.06)",
                    }}
                    className="min-h-[36px] font-semibold shadow-sm disabled:opacity-50"
                >
                    Retry payment
                </button>
            )}
            <button
                type="button"
                disabled={!!p.jobActionLoading}
                onClick={async () => {
                    if (!p.jobId) return;
                    p.setJobActionLoading("mark_completed");
                    try {
                        const res = await fetch(`/api/admin/jobs/${p.jobId}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "mark_completed" }),
                        });
                        const json = await res.json().catch(() => ({}));
                        if (!res.ok) throw new Error((json.error as string) || "Failed");
                        p.setData((prev) => (prev ? { ...prev, ...json } : prev));
                        p.refetch();
                        p.router.refresh();
                    } catch (e) {
                        console.error("Mark completed failed", e);
                    } finally {
                        p.setJobActionLoading(null);
                    }
                }}
                style={{ ...primaryBtn, backgroundColor: brand.secondary, borderColor: brand.secondary }}
                className="min-h-[36px] font-semibold shadow-sm disabled:opacity-50"
            >
                {p.jobActionLoading === "mark_completed" ? "…" : "Mark complete"}
            </button>
            {p.canMutate && (
                <button
                    type="button"
                    onClick={() => {
                        p.setJobExpandedSections((s) => ({ ...s, relationships: true }));
                        requestAnimationFrame(() => {
                            document.getElementById("job-assign-vendor-section")?.scrollIntoView({
                                behavior: "smooth",
                                block: "nearest",
                            });
                        });
                    }}
                    style={btnBase}
                    className="min-h-[36px] font-medium shadow-sm"
                >
                    Assign {p.vendorSingular}
                </button>
            )}
            {p.jobSchedulesLength > 0 && !p.rescheduleFormActive && p.firstSchedule ? (
                <button
                    type="button"
                    onClick={() => p.openReschedule(p.firstSchedule!)}
                    style={btnBase}
                    className="min-h-[36px] font-medium shadow-sm"
                >
                    Reschedule
                </button>
            ) : null}
        </div>
    );
}

export function JobDrawerV2OverviewShell(props: { primary: ReactNode; rail: ReactNode }) {
    return (
        <div
            className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,260px)] lg:items-start lg:gap-5"
            style={shell}
        >
            <div className="min-w-0 space-y-4">{props.primary}</div>
            <aside className="min-w-0 space-y-3 lg:sticky lg:top-2" aria-label="Record meta">
                {props.rail}
            </aside>
        </div>
    );
}

export function JobDrawerV2TimelineCard(props: { data: Record<string, unknown> | null }) {
    const d = props.data;
    if (!d) return null;
    const rows: { label: string; value: string }[] = [];
    if (d.created_at) rows.push({ label: "Created", value: formatDateTime(String(d.created_at)) });
    if (d.updated_at) rows.push({ label: "Updated", value: formatDateTime(String(d.updated_at)) });
    return (
        <section
            className="rounded-[10px] px-3 py-3"
            style={{
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: derived.border,
                backgroundColor: neutral.surface,
                boxShadow: derived.cardShadow,
            }}
        >
            <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: derived.textSecondary }}>
                Timeline
            </h3>
            {rows.length === 0 ? (
                <p className="mt-2 text-sm" style={{ color: derived.textSecondary }}>
                    No timestamps on record.
                </p>
            ) : (
                <ul className="mt-2 list-none space-y-1.5 p-0 m-0 text-sm" style={{ color: neutral.textPrimary }}>
                    {rows.map((r) => (
                        <li key={r.label} className="flex justify-between gap-3">
                            <span style={{ color: derived.textSecondary }}>{r.label}</span>
                            <span className="text-right font-medium">{r.value}</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

export function JobDrawerV2StatusHeader(props: { statusLabel: string; statusVariant: ComponentProps<typeof StatusBadge>["variant"] }) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={props.statusLabel} variant={props.statusVariant} />
        </div>
    );
}
