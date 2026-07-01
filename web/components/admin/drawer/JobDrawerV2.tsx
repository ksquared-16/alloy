"use client";

import type { ComponentProps, CSSProperties, Dispatch, ReactNode, SetStateAction } from "react";
import { neutral, derived, brand, palette } from "@/styles/tokens/colors";
import { formatDateTime, formatMoneyFromCents } from "@/lib/adminFormatters";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import { StatusBadge } from "@/components/admin/StatusBadge";
import type { JobPaymentsSummaryFromApi } from "@/lib/admin/jobPaymentSummary";
import type { StatusDefOption } from "@/components/admin/entity/EntityDrawerOverview";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import type { RecordActionRow } from "@/lib/recordChrome/types";

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
    /** Drawer record JSON not ready — preserve tab strip footprint without switching panes */
    tabButtonsDisabled?: boolean;
}) {
    const { tabs, tabLabels, active, onSelect, tabButtonsDisabled } = props;
    return (
        <div
            data-adminv2-job-record-nav="true"
            className={`flex min-h-[2.875rem] flex-wrap gap-1 rounded-xl p-1 ${tabButtonsDisabled ? "opacity-90" : ""}`}
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
                        disabled={tabButtonsDisabled}
                        role="tab"
                        aria-selected={isOn}
                        aria-busy={tabButtonsDisabled}
                        onClick={() => {
                            if (!tabButtonsDisabled) onSelect(tab);
                        }}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tabButtonsDisabled ? "cursor-default" : ""}`}
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

/** Cleaning flagship modal: meaning-first tints (payment / schedule / assignment families). */
function signalToneCleaningModal(
    kicker: "Payment" | "Schedule" | "Assignment",
    urgency: "neutral" | "info" | "warning" | "critical"
): { bg: string; border: string; kickerColor: string } {
    if (kicker === "Payment") {
        if (urgency === "critical") {
            return {
                bg: "color-mix(in srgb, #ffffff 86%, rgba(188, 67, 0, 0.12))",
                border: "color-mix(in srgb, rgba(188, 67, 0, 0.45) 70%, rgba(39, 63, 82, 0.2))",
                kickerColor: "rgba(188, 67, 0, 0.92)",
            };
        }
        if (urgency === "warning") {
            return {
                bg: "color-mix(in srgb, #ffffff 88%, rgba(0, 69, 140, 0.09))",
                border: "color-mix(in srgb, rgba(0, 69, 140, 0.38) 65%, rgba(39, 63, 82, 0.15))",
                kickerColor: palette.alloyBlue,
            };
        }
        if (urgency === "info") {
            return {
                bg: "color-mix(in srgb, #ffffff 88%, rgba(0, 162, 131, 0.1))",
                border: "color-mix(in srgb, rgba(0, 162, 131, 0.38) 60%, rgba(39, 63, 82, 0.12))",
                kickerColor: palette.bendPine,
            };
        }
        return {
            bg: "color-mix(in srgb, #ffffff 90%, rgba(0, 69, 140, 0.06))",
            border: "color-mix(in srgb, rgba(0, 69, 140, 0.22) 70%, rgba(39, 63, 82, 0.12))",
            kickerColor: derived.textSecondary,
        };
    }
    if (kicker === "Schedule") {
        if (urgency === "critical") {
            return {
                bg: "color-mix(in srgb, #ffffff 85%, rgba(188, 67, 0, 0.11))",
                border: "color-mix(in srgb, rgba(188, 67, 0, 0.4) 65%, rgba(39, 63, 82, 0.18))",
                kickerColor: "rgba(188, 67, 0, 0.92)",
            };
        }
        if (urgency === "warning") {
            return {
                bg: "color-mix(in srgb, #ffffff 88%, rgba(0, 69, 140, 0.075))",
                border: "color-mix(in srgb, rgba(0, 69, 140, 0.28) 60%, rgba(0, 162, 131, 0.2))",
                kickerColor: palette.alloyBlue,
            };
        }
        return {
            bg: "color-mix(in srgb, #ffffff 88%, rgba(0, 162, 131, 0.085))",
            border: "color-mix(in srgb, rgba(0, 162, 131, 0.32) 55%, rgba(39, 63, 82, 0.14))",
            kickerColor: palette.bendPine,
        };
    }
    // Assignment
    if (urgency === "warning") {
        return {
            bg: "color-mix(in srgb, #ffffff 90%, rgba(0, 69, 140, 0.065))",
            border: "color-mix(in srgb, rgba(0, 69, 140, 0.26) 55%, rgba(39, 63, 82, 0.16))",
            kickerColor: palette.alloyBlue,
        };
    }
    return {
        bg: "color-mix(in srgb, #ffffff 91%, rgba(39, 63, 82, 0.055))",
        border: "color-mix(in srgb, rgba(39, 63, 82, 0.2) 70%, rgba(0, 69, 140, 0.12))",
        kickerColor: derived.textSecondary,
    };
}

export function JobDrawerV2SignalsStrip(props: {
    paymentLabel: string;
    paymentTone: "neutral" | "info" | "warning" | "critical";
    scheduleLabel: string;
    scheduleTone: "neutral" | "info" | "warning" | "critical";
    assignmentLabel: string;
    assignmentTone: "neutral" | "info" | "warning" | "critical";
    /** Visual-only: richer tonal cards for cleaning job record modal. */
    presentation?: "default" | "cleaningRecordModal";
}) {
    const cards = [
        { kicker: "Payment" as const, label: props.paymentLabel, tone: props.paymentTone },
        { kicker: "Schedule" as const, label: props.scheduleLabel, tone: props.scheduleTone },
        { kicker: "Assignment" as const, label: props.assignmentLabel, tone: props.assignmentTone },
    ];
    const cleaning = props.presentation === "cleaningRecordModal";
    const signalShadow =
        "0 1px 2px rgba(39, 63, 82, 0.04), 0 4px 14px rgba(39, 63, 82, 0.05)";
    return (
        <div className="adminv2-job-drawer-signals flex flex-wrap gap-2" style={shell}>
            {cards.map((c) => {
                const t = cleaning ? signalToneCleaningModal(c.kicker, c.tone) : { ...signalTone(c.tone), kickerColor: derived.textSecondary };
                return (
                    <div
                        key={c.kicker}
                        className={`min-w-[140px] flex-1 rounded-xl px-3 py-2 ${cleaning ? "backdrop-blur-[2px]" : ""}`}
                        style={{
                            backgroundColor: t.bg,
                            borderWidth: cleaning ? 0 : 1,
                            borderStyle: "solid",
                            borderColor: cleaning ? "transparent" : t.border,
                            boxShadow: cleaning ? signalShadow : undefined,
                        }}
                    >
                        <div className="text-[10px] font-semibold tracking-wide" style={{ color: t.kickerColor }}>
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

export { deriveJobDrawerSignalLines } from "@/lib/admin/drawer/jobDrawerSignalLines";

function formatServiceFrequencyReadLabel(k: unknown): string {
    if (k == null || String(k).trim() === "") return "—";
    return String(k).replace(/_/g, " ");
}

const primaryPanelFieldClass =
    "adminv2-job-record-primary-input w-full rounded-lg border px-2 py-1.5 text-sm text-alloy-forge transition-colors duration-150 focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20 disabled:opacity-60";
const primaryPanelLabelClass = "block text-[10px] font-semibold tracking-wide mb-0.5";
const primaryPanelReadClass = "text-sm font-medium leading-snug break-words tabular-nums";

/** Top curated panel: editable ownership + read-only plan/pricing summary (Admin V2 cleaning job Record tab). */
export function JobRecordPrimaryPanel(props: {
    record: Record<string, unknown> | null;
    formData: Record<string, unknown>;
    setFormData: Dispatch<SetStateAction<Record<string, unknown>>>;
    canMutate: boolean;
    statusDefs: StatusDefOption[];
    onBlur: () => void;
    jobCustomerOptions: { id: string; name: string | null }[];
    jobVendorOptions: { id: string; label: string }[];
    jobContactOptions: { id: string; label: string }[];
    jobLocationOptions: { id: string; label: string }[];
    primaryContactDisabled: boolean;
    firstSchedule: { id: string; start_at: string; end_at: string; timezone: string } | null;
    rescheduleFormActive: boolean;
    openReschedule: (s: { id: string; start_at: string; end_at: string; timezone: string }) => void;
    openJobLocationChange: () => void;
    /** Opens linked entity; nested views use Admin V2 modal stack when on /adminV2. */
    openDrawer: (type: AdminDrawerEntityType, id: string) => void;
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
    const recurring =
        r.is_recurring === true || r.is_recurring === "true" ? "Yes" : r.is_recurring === false || r.is_recurring === "false" ? "No" : "—";
    const statusOptions = props.statusDefs.filter((s) => s.is_active !== false).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const sk = String(props.formData.status_key ?? r.status_key ?? "").trim();
    if (sk && !statusOptions.some((s) => s.status_key === sk)) {
        statusOptions.push({ status_key: sk, status_label: sk, sort_order: 9999, is_active: true });
    }
    const vid = String(props.formData.assigned_vendor_id ?? "").trim();

    const fieldStyle = { borderColor: derived.border, backgroundColor: neutral.surface } as CSSProperties;

    return (
        <div
            className="adminv2-job-record-primary-panel rounded-[10px] border border-solid p-3 shadow-sm sm:p-3.5"
            style={{ borderColor: derived.border, backgroundColor: neutral.surface, boxShadow: derived.cardShadow, ...shell }}
            data-adminv2-job-primary-panel="true"
        >
            <p className="text-[10px] font-semibold tracking-wide mb-2" style={{ color: derived.textSecondary }}>
                Job summary
            </p>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(240px,300px)] lg:gap-5">
                <div className="min-w-0 grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-2">
                    <div className="sm:col-span-2">
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
                            style={fieldStyle}
                        >
                            <option value="">— None —</option>
                            {statusOptions.map((s) => (
                                <option key={s.status_key} value={s.status_key}>
                                    {s.status_label ?? s.status_key}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="sm:col-span-2" id="job-assign-vendor-section">
                        <span className={primaryPanelLabelClass} style={{ color: derived.textSecondary }}>
                            Assigned vendor
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <select
                                value={String(props.formData.assigned_vendor_id ?? "")}
                                onChange={(e) => props.setFormData((f) => ({ ...f, assigned_vendor_id: e.target.value || null }))}
                                onBlur={props.onBlur}
                                disabled={!props.canMutate}
                                className={`${primaryPanelFieldClass} min-w-[140px] flex-1`}
                                style={fieldStyle}
                            >
                                <option value="">(none)</option>
                                {props.jobVendorOptions.map((v) => (
                                    <option key={v.id} value={v.id}>
                                        {v.label}
                                    </option>
                                ))}
                            </select>
                            {vid ? (
                                <button
                                    type="button"
                                    onClick={() => props.openDrawer("vendors", vid)}
                                    className="text-[11px] font-medium px-2 py-1 rounded-md border transition-colors shrink-0"
                                    style={{ borderColor: derived.border, color: brand.primary }}
                                >
                                    Open
                                </button>
                            ) : null}
                        </div>
                    </div>
                    <div className="sm:col-span-2">
                        <label htmlFor="job-primary-customer" className={primaryPanelLabelClass} style={{ color: derived.textSecondary }}>
                            Customer
                        </label>
                        <div className="flex flex-wrap items-center gap-1.5">
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
                                className={`${primaryPanelFieldClass} min-w-[160px] flex-1`}
                                style={fieldStyle}
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
                                    onClick={() => props.openDrawer("customers", String(props.formData.customer_id))}
                                    className="text-[11px] font-medium px-2 py-1 rounded-md border shrink-0 transition-colors"
                                    style={{ borderColor: derived.border, color: brand.primary }}
                                >
                                    Open
                                </button>
                            ) : null}
                        </div>
                    </div>
                    <div className="sm:col-span-2">
                        <label htmlFor="job-primary-contact" className={primaryPanelLabelClass} style={{ color: derived.textSecondary }}>
                            Primary person
                        </label>
                        <select
                            id="job-primary-contact"
                            value={String(props.formData.primary_contact_id ?? "")}
                            onChange={(e) => props.setFormData((f) => ({ ...f, primary_contact_id: e.target.value }))}
                            onBlur={props.onBlur}
                            disabled={!props.canMutate || props.primaryContactDisabled}
                            className={primaryPanelFieldClass}
                            style={fieldStyle}
                        >
                            <option value="">(none)</option>
                            {props.jobContactOptions.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="sm:col-span-2">
                        <label htmlFor="job-primary-location" className={primaryPanelLabelClass} style={{ color: derived.textSecondary }}>
                            Service location
                        </label>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <select
                                id="job-primary-location"
                                value={String(props.formData.location_id ?? "")}
                                onChange={(e) => props.setFormData((f) => ({ ...f, location_id: e.target.value || null }))}
                                onBlur={props.onBlur}
                                disabled={!props.canMutate}
                                className={`${primaryPanelFieldClass} min-w-[160px] flex-1`}
                                style={fieldStyle}
                            >
                                <option value="">(none)</option>
                                {props.jobLocationOptions.map((loc) => (
                                    <option key={loc.id} value={loc.id}>
                                        {loc.label}
                                    </option>
                                ))}
                            </select>
                            {String(props.formData.location_id ?? "").trim() ? (
                                <button
                                    type="button"
                                    onClick={() => props.openDrawer("locations", String(props.formData.location_id))}
                                    className="text-[11px] font-medium px-2 py-1 rounded-md border shrink-0 transition-colors"
                                    style={{ borderColor: derived.border, color: brand.primary }}
                                >
                                    Open
                                </button>
                            ) : null}
                            {props.canMutate ? (
                                <button
                                    type="button"
                                    onClick={props.openJobLocationChange}
                                    className="text-[11px] font-medium px-2 py-1 rounded-md border shrink-0 transition-colors"
                                    style={{ borderColor: derived.border, color: derived.textSecondary }}
                                >
                                    Change
                                </button>
                            ) : null}
                        </div>
                    </div>
                    <div className="sm:col-span-2">
                        <span className={primaryPanelLabelClass} style={{ color: derived.textSecondary }}>
                            Next visit
                        </span>
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            <span className={primaryPanelReadClass} style={{ color: neutral.textPrimary }}>
                                {nextLabel}
                            </span>
                            {props.firstSchedule && !props.rescheduleFormActive ? (
                                <button
                                    type="button"
                                    onClick={() => props.openReschedule(props.firstSchedule!)}
                                    className="text-[11px] font-medium px-2 py-1 rounded-md border transition-colors"
                                    style={{ borderColor: derived.border, color: brand.primary }}
                                >
                                    Reschedule
                                </button>
                            ) : null}
                        </div>
                    </div>
                </div>
                <div
                    className="min-w-0 space-y-2 rounded-lg px-3 py-2.5"
                    style={{
                        backgroundColor: derived.maskOverlay,
                        borderWidth: 1,
                        borderStyle: "solid",
                        borderColor: derived.border,
                    }}
                >
                    <p className="text-[10px] font-semibold tracking-wide mb-0.5" style={{ color: derived.textSecondary }}>
                        Summary
                    </p>
                    <div className="grid grid-cols-1 gap-y-1.5">
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
                                Service
                            </div>
                            <div className={`${primaryPanelReadClass} font-normal`} style={{ color: neutral.textPrimary }}>
                                {serviceType}
                            </div>
                        </div>
                        <div>
                            <div className={primaryPanelLabelClass} style={{ color: derived.textSecondary }}>
                                Frequency
                            </div>
                            <div className={`${primaryPanelReadClass} font-normal`} style={{ color: neutral.textPrimary }}>
                                {formatServiceFrequencyReadLabel(r.service_frequency_key)}
                            </div>
                        </div>
                        <div>
                            <div className={primaryPanelLabelClass} style={{ color: derived.textSecondary }}>
                                Recurring
                            </div>
                            <div className={`${primaryPanelReadClass} font-normal`} style={{ color: neutral.textPrimary }}>
                                {recurring}
                            </div>
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
    /** When set, primary/secondary actions come from record chrome (above RRS); legacy payment/assign row is omitted. */
    recordChromeActions?: RecordActionRow[] | null;
    onRecordChromeAction?: (eventKey: string) => void;
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
    const useChrome = (p.recordChromeActions?.length ?? 0) > 0 && p.onRecordChromeAction;
    const chromePrimary = (p.recordChromeActions ?? []).filter((a) => a.placement === "primary");
    const chromeSecondary = (p.recordChromeActions ?? []).filter((a) => a.placement === "secondary");
    return (
        <div className="flex flex-wrap items-center gap-2" data-adminv2-job-record-primary-actions="true">
            {useChrome ? (
                <>
                    {chromePrimary.map((a) => (
                        <button
                            key={a.id}
                            type="button"
                            disabled={!p.canMutate && a.event_key === "collect_payment"}
                            onClick={() => p.onRecordChromeAction?.(a.event_key)}
                            style={primaryBtn}
                            className="min-h-[36px] font-semibold shadow-sm disabled:opacity-50"
                        >
                            {a.label}
                        </button>
                    ))}
                    {chromeSecondary.map((a) => (
                        <button
                            key={a.id}
                            type="button"
                            onClick={() => p.onRecordChromeAction?.(a.event_key)}
                            style={btnBase}
                            className="min-h-[36px] font-medium shadow-sm"
                        >
                            {a.label}
                        </button>
                    ))}
                </>
            ) : (
                <>
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
                </>
            )}
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
            {!useChrome && p.canMutate && (
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
            <h3 className="text-xs font-semibold tracking-wide" style={{ color: derived.textSecondary }}>
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
