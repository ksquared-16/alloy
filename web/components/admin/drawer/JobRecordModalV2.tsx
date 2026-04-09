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

/**
 * Per-section column density for the cleaning job record modal.
 * Maps 1:1 to `EntityDrawerSectionConfig.gridCols` — intended as the template hook for future configurable section presentation.
 */
export const JOB_RECORD_MODAL_V2_SECTION_GRID = {
    property_service_v2: 2,
    /** Paired date fields — reads well at 2 columns from `md` up (EntityDrawerSection). */
    scheduling_v2: 2,
    job_pricing_breakdown: 1,
    /** Subsections (Plan / Totals) — 2 columns balances density vs. scanability. */
    pricing: 2,
    people_places_v2: 2,
    internal_notes_record_v2: 1,
} as const satisfies Record<string, 1 | 2>;

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
    const g = JOB_RECORD_MODAL_V2_SECTION_GRID;
    return [
        {
            key: "property_service_v2",
            title: "Property & service details",
            defaultExpanded: true,
            collapsible: true,
            gridCols: g.property_service_v2,
            fields: propertyFields,
            locked: true,
        },
        {
            key: "scheduling_v2",
            title: "Scheduling",
            defaultExpanded: false,
            collapsible: true,
            gridCols: g.scheduling_v2,
            fields: schedFields,
            locked: true,
        },
        { ...pb, key: "job_pricing_breakdown", title: "Pricing", defaultExpanded: false, gridCols: g.job_pricing_breakdown },
        { ...bill, defaultExpanded: false, gridCols: g.pricing },
        {
            key: "people_places_v2",
            title: "People & places",
            defaultExpanded: false,
            collapsible: true,
            gridCols: g.people_places_v2,
            fields: peoplePlacesFields,
            locked: true,
        },
        {
            key: "internal_notes_record_v2",
            title: "Internal notes & record details",
            defaultExpanded: false,
            collapsible: true,
            gridCols: g.internal_notes_record_v2,
            fields: [...(notes?.fields ?? []), ...(rec?.fields ?? [])],
            locked: true,
        },
    ];
}

export const JOB_RECORD_MODAL_V2_OVERVIEW_SECTIONS = buildJobRecordModalV2OverviewSections();

/** Minimal record controls — chrome from `.adminv2-jrm-record-select` (workspace.css) */
const recordSelectClass =
    "adminv2-job-record-primary-input adminv2-job-record-modal-v2-input adminv2-jrm-record-select w-full min-w-0 max-w-full text-sm font-medium text-alloy-forge disabled:opacity-60";
const textActionClass =
    "adminv2-jrm-text-action text-[11px] font-medium text-alloy-blue hover:underline underline-offset-2 decoration-alloy-blue/40 bg-transparent border-0 p-0 cursor-pointer shrink-0";
const textActionMutedClass =
    "adminv2-jrm-text-action text-[11px] font-medium text-alloy-midnight/55 hover:text-alloy-midnight/80 hover:underline underline-offset-2 bg-transparent border-0 p-0 cursor-pointer shrink-0";

function JrmRecordRow(props: {
    label: string;
    children: React.ReactNode;
    id?: string;
    withDivider?: boolean;
}) {
    const { label, children, id, withDivider = true } = props;
    return (
        <div
            id={id}
            className={`adminv2-jrm-record-row flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-6 ${withDivider ? "border-b border-solid border-[rgba(39,63,82,0.07)]" : ""}`}
        >
            <span
                className="text-[10px] font-semibold uppercase tracking-[0.09em] shrink-0 pt-0.5 sm:w-[7.25rem]"
                style={{ color: derived.textSecondary }}
            >
                {label}
            </span>
            <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-1 sm:justify-end">{children}</div>
        </div>
    );
}

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

    return (
        <div
            data-adminv2-job-record-modal-v2="true"
            className="adminv2-jrm-root w-full max-w-none space-y-2"
            style={{ ...shell, marginTop: -4 }}
        >
            <div
                data-jrm-strip="account"
                className="adminv2-jrm-account-strip flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl px-3 py-1.5"
            >
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: derived.textSecondary }}>
                    Account
                </span>
                <span className="text-sm font-medium" style={{ color: neutral.textPrimary }}>
                    {customerName || "—"}
                </span>
                {customerId ? (
                    <button type="button" onClick={() => props.openDrawer("customers", customerId)} className={textActionClass}>
                        Open
                    </button>
                ) : (
                    <span className="text-xs" style={{ color: derived.textSecondary }}>
                        No customer linked
                    </span>
                )}
            </div>

            <div
                className="adminv2-jrm-snapshot-card rounded-2xl px-1 py-1 sm:px-2 sm:py-2"
                data-adminv2-job-record-modal-v2-top="true"
                style={shell}
            >
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] px-0.5 pb-2" style={{ color: derived.textSecondary }}>
                    Record snapshot
                </p>
                <div className="adminv2-jrm-snapshot-rows px-0.5">
                    <JrmRecordRow label="Status">
                        <select
                            id="job-modal-v2-status"
                            value={sk}
                            onChange={(e) => props.setFormData((f) => ({ ...f, status_key: e.target.value || null }))}
                            onBlur={props.onBlurSave}
                            disabled={!props.canMutate}
                            className={recordSelectClass}
                        >
                            <option value="">— None —</option>
                            {statusOptions.map((s) => (
                                <option key={s.status_key} value={s.status_key}>
                                    {s.status_label ?? s.status_key}
                                </option>
                            ))}
                        </select>
                    </JrmRecordRow>
                    <JrmRecordRow label="Assigned vendor" id="job-assign-vendor-section">
                        <select
                            value={String(props.formData.assigned_vendor_id ?? "")}
                            onChange={(e) => props.setFormData((f) => ({ ...f, assigned_vendor_id: e.target.value || null }))}
                            onBlur={props.onBlurSave}
                            disabled={!props.canMutate}
                            className={recordSelectClass}
                            aria-label="Assigned vendor"
                        >
                            <option value="">(none)</option>
                            {props.jobVendorOptions.map((v) => (
                                <option key={v.id} value={v.id}>
                                    {v.label}
                                </option>
                            ))}
                        </select>
                        {vid ? (
                            <button type="button" onClick={() => props.openDrawer("vendors", vid)} className={textActionClass}>
                                Open
                            </button>
                        ) : null}
                    </JrmRecordRow>
                    <JrmRecordRow label="Primary person">
                        <select
                            id="job-modal-v2-contact"
                            value={String(props.formData.primary_contact_id ?? "")}
                            onChange={(e) => props.setFormData((f) => ({ ...f, primary_contact_id: e.target.value }))}
                            onBlur={props.onBlurSave}
                            disabled={!props.canMutate || props.primaryContactDisabled}
                            className={recordSelectClass}
                        >
                            <option value="">(none)</option>
                            {props.jobContactOptions.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.label}
                                </option>
                            ))}
                        </select>
                    </JrmRecordRow>
                    <JrmRecordRow label="Service location">
                        <select
                            id="job-modal-v2-location"
                            value={String(props.formData.location_id ?? "")}
                            onChange={(e) => props.setFormData((f) => ({ ...f, location_id: e.target.value || null }))}
                            onBlur={props.onBlurSave}
                            disabled={!props.canMutate}
                            className={recordSelectClass}
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
                                className={textActionClass}
                            >
                                Open
                            </button>
                        ) : null}
                        {props.canMutate ? (
                            <button type="button" onClick={props.openJobLocationChange} className={textActionMutedClass}>
                                Change
                            </button>
                        ) : null}
                    </JrmRecordRow>
                    <JrmRecordRow label="Next visit" withDivider={false}>
                        <span className="text-sm font-medium leading-snug tabular-nums" style={{ color: neutral.textPrimary }}>
                            {nextLabel}
                        </span>
                        {props.firstSchedule && !props.rescheduleFormActive ? (
                            <button type="button" onClick={() => props.openReschedule(props.firstSchedule!)} className={textActionClass}>
                                Reschedule
                            </button>
                        ) : null}
                    </JrmRecordRow>
                </div>

                <div
                    data-jrm-metadata-band="true"
                    className="adminv2-jrm-metadata-band mt-2 border-t border-solid border-[rgba(39,63,82,0.08)] px-0.5 pt-3"
                >
                    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
                        <span style={{ color: neutral.textPrimary }}>
                            <span className="mr-1.5 text-[11px] font-medium uppercase tracking-wide opacity-60">Total</span>
                            <span className="font-semibold tabular-nums">
                                {Number.isFinite(totalCents) ? formatMoneyFromCents(totalCents) : "—"}
                            </span>
                        </span>
                        <span style={{ color: neutral.textPrimary }}>
                            <span className="mr-1.5 text-[11px] font-medium uppercase tracking-wide opacity-60">Outstanding</span>
                            <span className="font-semibold tabular-nums">
                                {Number.isFinite(balCents) ? formatMoneyFromCents(balCents) : "—"}
                            </span>
                        </span>
                    </div>
                    <p className="mt-2 text-[13px] leading-relaxed" style={{ color: derived.textSecondary }}>
                        <span className="font-medium" style={{ color: neutral.textPrimary }}>
                            {serviceType}
                        </span>
                        <span className="opacity-50"> · </span>
                        {formatServiceFrequencyReadLabel(r.service_frequency_key)}
                        <span className="opacity-50"> · </span>
                        Recurring {recurring}
                    </p>
                </div>
            </div>

            <div
                className="adminv2-job-record-fielddeck adminv2-jrm-fielddeck-chapters"
                data-adminv2-job-record-overview="true"
                data-jrm-chapters="true"
            >
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
