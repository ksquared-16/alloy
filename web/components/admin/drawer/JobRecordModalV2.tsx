"use client";

import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from "react";
import { neutral, derived, brand } from "@/styles/tokens/colors";
import { formatDateTime, formatMoneyFromCents } from "@/lib/adminFormatters";
import {
    getEntityPresentation,
    getJobOverviewBillingSummarySection,
    getJobPricingBreakdownSection,
    type EntityDrawerFieldConfig,
    type EntityDrawerSectionConfig,
    type EntityPresentationType,
} from "@/lib/entityPresentation";
import EntityDrawerOverview from "@/components/admin/entity/EntityDrawerOverview";
import type { StatusDefOption } from "@/components/admin/entity/EntityDrawerOverview";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";

const shell: CSSProperties = {
    color: neutral.textPrimary,
    ["--d-muted" as string]: derived.textSecondary,
    ["--d-border" as string]: derived.border,
    ["--d-surface" as string]: neutral.surface,
    ["--d-brand" as string]: brand.primary,
};

function formatServiceFrequencyReadLabel(k: unknown): string {
    if (k == null || String(k).trim() === "") return "—";
    return String(k).replace(/_/g, " ");
}

/** Flagship cleaning vertical — service_key / vertical slug from API. */
export function isCleaningJobRecord(record: Record<string, unknown> | null | undefined): boolean {
    if (!record) return false;
    const sk = String(record.service_key ?? "").trim().toLowerCase();
    if (sk === "cleaning") return true;
    const vs = String((record as { _vertical_slug?: string | null })._vertical_slug ?? "")
        .trim()
        .toLowerCase();
    if (vs === "cleaning") return true;
    return false;
}

function buildJobRecordModalV2OverviewSections(): EntityDrawerSectionConfig[] {
    const pres = getEntityPresentation("jobs").drawer?.overviewSections ?? [];
    const ps = pres.find((s) => s.key === "property_service");
    const sched = pres.find((s) => s.key === "scheduling");
    const notes = pres.find((s) => s.key === "notes");
    const rec = pres.find((s) => s.key === "record_info");
    const propertyFields: EntityDrawerFieldConfig[] = [
        { key: "title", label: "Title", span: 1, renderHint: "text", editable: true },
        { key: "service_key", label: "Service", span: 1, renderHint: "text", editable: true },
        { key: "job_type", label: "Job type", span: 1, renderHint: "text", editable: true },
        ...(ps?.fields ?? []),
    ];
    const schedFields = (sched?.fields ?? []).filter((f) => f.key !== "_next_schedule");
    const pb = getJobPricingBreakdownSection();
    const bill = getJobOverviewBillingSummarySection();
    const peoplePlacesFields: EntityDrawerFieldConfig[] = [
        {
            key: "customer_id",
            label: "Customer",
            span: 1,
            renderHint: "link",
            editable: true,
            linkTarget: { idField: "customer_id", entityType: "customers" },
        },
        {
            key: "opportunity_id",
            label: "Opportunity",
            span: 1,
            renderHint: "link",
            editable: true,
            linkTarget: { idField: "opportunity_id", entityType: "opportunities" },
        },
        { key: "work_unit_id", label: "Work unit", span: 1, renderHint: "text", editable: true },
    ];
    return [
        {
            key: "property_service_v2",
            title: "Property & service details",
            defaultExpanded: true,
            collapsible: true,
            gridCols: 2,
            fields: propertyFields,
            locked: true,
        },
        {
            key: "scheduling_v2",
            title: "Scheduling",
            defaultExpanded: false,
            collapsible: true,
            gridCols: 2,
            fields: schedFields,
            locked: true,
        },
        { ...pb, key: "job_pricing_breakdown", title: "Pricing", defaultExpanded: false },
        { ...bill, defaultExpanded: false },
        {
            key: "people_places_v2",
            title: "People & places",
            defaultExpanded: false,
            collapsible: true,
            gridCols: 2,
            fields: peoplePlacesFields,
            locked: true,
        },
        {
            key: "internal_notes_record_v2",
            title: "Internal notes & record details",
            defaultExpanded: false,
            collapsible: true,
            gridCols: 2,
            fields: [...(notes?.fields ?? []), ...(rec?.fields ?? [])],
            locked: true,
        },
    ];
}

export const JOB_RECORD_MODAL_V2_OVERVIEW_SECTIONS = buildJobRecordModalV2OverviewSections();

const inputClass =
    "adminv2-job-record-primary-input adminv2-job-record-modal-v2-input w-full rounded-lg border px-2 py-1 text-sm text-alloy-forge transition-colors duration-150 focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20 disabled:opacity-60";
const labelClass = "block text-[10px] font-semibold uppercase tracking-wide mb-0.5";
const readClass = "text-sm font-medium leading-snug break-words tabular-nums";

export interface JobRecordModalV2Props {
    record: Record<string, unknown> | null;
    formData: Record<string, unknown>;
    setFormData: Dispatch<SetStateAction<Record<string, unknown>>>;
    canMutate: boolean;
    statusDefs: StatusDefOption[];
    onBlurSave: () => void;
    jobVendorOptions: { id: string; label: string }[];
    jobContactOptions: { id: string; label: string }[];
    jobLocationOptions: { id: string; label: string }[];
    primaryContactDisabled: boolean;
    firstSchedule: { id: string; start_at: string; end_at: string; timezone: string } | null;
    rescheduleFormActive: boolean;
    openReschedule: (s: { id: string; start_at: string; end_at: string; timezone: string }) => void;
    openJobLocationChange: () => void;
    openDrawer: (type: AdminDrawerEntityType, id: string) => void;
    presentationType: EntityPresentationType;
    entityDrawerOverviewData: Record<string, unknown> | null;
    customSectionContent: Record<string, ReactNode>;
    selectOptionsByFieldKey: Record<string, { value: string; label: string }[]>;
    getStatusLabel: (key: string) => string | null;
    /** Mirrors AdminEntityDrawer overview edit toggle (jobs are typically inline-edit). */
    isEditing: boolean;
}

/**
 * Purpose-built Admin V2 cleaning job record body (modal “Record” tab).
 * Owns top summary + curated lower sections; does not use the generic primary panel + field-deck composition.
 */
export default function JobRecordModalV2(props: JobRecordModalV2Props) {
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
        r.is_recurring === true || r.is_recurring === "true"
            ? "Yes"
            : r.is_recurring === false || r.is_recurring === "false"
              ? "No"
              : "—";
    const statusOptions = props.statusDefs.filter((s) => s.is_active !== false).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const sk = String(props.formData.status_key ?? r.status_key ?? "").trim();
    if (sk && !statusOptions.some((s) => s.status_key === sk)) {
        statusOptions.push({ status_key: sk, status_label: sk, sort_order: 9999, is_active: true });
    }
    const vid = String(props.formData.assigned_vendor_id ?? "").trim();
    const customerName = String((r as { _customer_name?: string | null })._customer_name ?? "").trim();
    const customerId = String(props.formData.customer_id ?? "").trim();

    const fieldStyle = { borderColor: derived.border, backgroundColor: neutral.surface } as CSSProperties;

    return (
        <div
            data-adminv2-job-record-modal-v2="true"
            className="adminv2-jrm-root space-y-2.5"
            style={{ ...shell, marginTop: -4 }}
        >
            <div
                data-jrm-strip="account"
                className="adminv2-jrm-account-strip flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-solid px-2.5 py-1.5"
            >
                <span className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: brand.secondary }}>
                    Account
                </span>
                <span className="text-sm font-semibold" style={{ color: neutral.textPrimary }}>
                    {customerName || "—"}
                </span>
                {customerId ? (
                    <button
                        type="button"
                        onClick={() => props.openDrawer("customers", customerId)}
                        className="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border transition-colors"
                        style={{ borderColor: derived.border, color: brand.primary }}
                    >
                        Open
                    </button>
                ) : (
                    <span className="text-xs" style={{ color: derived.textSecondary }}>
                        No customer linked
                    </span>
                )}
            </div>

            <div
                className="adminv2-jrm-snapshot-card rounded-[10px] border border-solid p-2.5 sm:p-3"
                data-adminv2-job-record-modal-v2-top="true"
                style={shell}
            >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.07em]" style={{ color: brand.secondary }}>
                        Job snapshot
                    </p>
                </div>
                <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(200px,260px)] lg:gap-4 lg:items-start">
                    <div className="min-w-0 grid grid-cols-1 gap-x-2 gap-y-1.5 sm:grid-cols-2">
                        <div className="sm:col-span-1">
                            <label htmlFor="job-modal-v2-status" className={labelClass} style={{ color: derived.textSecondary }}>
                                Status
                            </label>
                            <select
                                id="job-modal-v2-status"
                                value={sk}
                                onChange={(e) => props.setFormData((f) => ({ ...f, status_key: e.target.value || null }))}
                                onBlur={props.onBlurSave}
                                disabled={!props.canMutate}
                                className={inputClass}
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
                        <div className="sm:col-span-1" id="job-assign-vendor-section">
                            <span className={labelClass} style={{ color: derived.textSecondary }}>
                                Assigned vendor
                            </span>
                            <div className="flex flex-wrap items-center gap-1">
                                <select
                                    value={String(props.formData.assigned_vendor_id ?? "")}
                                    onChange={(e) => props.setFormData((f) => ({ ...f, assigned_vendor_id: e.target.value || null }))}
                                    onBlur={props.onBlurSave}
                                    disabled={!props.canMutate}
                                    className={`${inputClass} min-w-[120px] flex-1`}
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
                                        className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border shrink-0"
                                        style={{ borderColor: derived.border, color: brand.primary }}
                                    >
                                        Open
                                    </button>
                                ) : null}
                            </div>
                        </div>
                        <div className="sm:col-span-2">
                            <label htmlFor="job-modal-v2-contact" className={labelClass} style={{ color: derived.textSecondary }}>
                                Primary person
                            </label>
                            <select
                                id="job-modal-v2-contact"
                                value={String(props.formData.primary_contact_id ?? "")}
                                onChange={(e) => props.setFormData((f) => ({ ...f, primary_contact_id: e.target.value }))}
                                onBlur={props.onBlurSave}
                                disabled={!props.canMutate || props.primaryContactDisabled}
                                className={inputClass}
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
                            <label htmlFor="job-modal-v2-location" className={labelClass} style={{ color: derived.textSecondary }}>
                                Service location
                            </label>
                            <div className="flex flex-wrap items-center gap-1">
                                <select
                                    id="job-modal-v2-location"
                                    value={String(props.formData.location_id ?? "")}
                                    onChange={(e) => props.setFormData((f) => ({ ...f, location_id: e.target.value || null }))}
                                    onBlur={props.onBlurSave}
                                    disabled={!props.canMutate}
                                    className={`${inputClass} min-w-[140px] flex-1`}
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
                                        className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border shrink-0"
                                        style={{ borderColor: derived.border, color: brand.primary }}
                                    >
                                        Open
                                    </button>
                                ) : null}
                                {props.canMutate ? (
                                    <button
                                        type="button"
                                        onClick={props.openJobLocationChange}
                                        className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border shrink-0"
                                        style={{ borderColor: derived.border, color: derived.textSecondary }}
                                    >
                                        Change
                                    </button>
                                ) : null}
                            </div>
                        </div>
                        <div className="sm:col-span-2">
                            <span className={labelClass} style={{ color: derived.textSecondary }}>
                                Next visit
                            </span>
                            <div className="flex flex-wrap items-center gap-2 pt-0.5">
                                <span className={readClass} style={{ color: neutral.textPrimary }}>
                                    {nextLabel}
                                </span>
                                {props.firstSchedule && !props.rescheduleFormActive ? (
                                    <button
                                        type="button"
                                        onClick={() => props.openReschedule(props.firstSchedule!)}
                                        className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border"
                                        style={{ borderColor: derived.border, color: brand.primary }}
                                    >
                                        Reschedule
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    </div>
                    <div
                        data-jrm-block="money-plan"
                        className="adminv2-jrm-money-plan min-w-0 space-y-1 rounded-lg border border-solid px-2.5 py-2"
                        style={{ borderColor: derived.border }}
                    >
                        <p className="text-[10px] font-bold uppercase tracking-[0.06em] mb-1" style={{ color: brand.secondary }}>
                            Money & plan
                        </p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                            <div>
                                <span className="text-[10px] font-semibold uppercase block" style={{ color: derived.textSecondary }}>
                                    Total
                                </span>
                                <span className="font-semibold tabular-nums" style={{ color: neutral.textPrimary }}>
                                    {Number.isFinite(totalCents) ? formatMoneyFromCents(totalCents) : "—"}
                                </span>
                            </div>
                            <div>
                                <span className="text-[10px] font-semibold uppercase block" style={{ color: derived.textSecondary }}>
                                    Outstanding
                                </span>
                                <span className="font-semibold tabular-nums" style={{ color: neutral.textPrimary }}>
                                    {Number.isFinite(balCents) ? formatMoneyFromCents(balCents) : "—"}
                                </span>
                            </div>
                        </div>
                        <p className="text-xs leading-snug pt-1 border-t" style={{ borderColor: derived.border, color: neutral.textPrimary }}>
                            <span className="font-medium">{serviceType}</span>
                            <span style={{ color: derived.textSecondary }}> · </span>
                            <span>{formatServiceFrequencyReadLabel(r.service_frequency_key)}</span>
                            <span style={{ color: derived.textSecondary }}> · </span>
                            <span>Recurring {recurring}</span>
                        </p>
                    </div>
                </div>
            </div>

            <div className="adminv2-job-record-fielddeck" data-adminv2-job-record-overview="true">
                <EntityDrawerOverview
                    entityType={props.presentationType}
                    data={props.entityDrawerOverviewData}
                    customSectionContent={props.customSectionContent}
                    overviewSectionsOverride={JOB_RECORD_MODAL_V2_OVERVIEW_SECTIONS}
                    selectOptionsByFieldKey={props.selectOptionsByFieldKey}
                    isEditing={props.isEditing}
                    formData={props.formData}
                    onFieldChange={(key, value) => {
                        props.setFormData((prev) => ({ ...prev, [key]: value }));
                    }}
                    onBlur={props.onBlurSave}
                    canEdit={props.canMutate}
                    statusDefs={props.statusDefs}
                    getStatusLabel={props.getStatusLabel}
                    onOpenDrawer={(type, id) => props.openDrawer(type as AdminDrawerEntityType, id)}
                />
            </div>
        </div>
    );
}
