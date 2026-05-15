"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import "@/app/adminV2/components/workspace/workspace.css";
import Drawer from "@/components/admin/Drawer";
import {
    useAdminDrawer,
    type AdminDrawerEntityType,
    type JobRecordSurfaceParam,
    type SchedulePrefill,
    type JobPrefill,
} from "@/contexts/AdminDrawerContext";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";
import { useEntityLabels, getEntityLabel } from "@/contexts/EntityLabelsContext";
import { alloyPerfSet } from "@/lib/perf/alloyPerfGlobal";
import RelatedRecordsTabs from "@/components/admin/RelatedRecordsTabs";
import EntityDocumentsSection from "@/components/admin/EntityDocumentsSection";
import CommunicationsDrawerSection from "@/components/admin/communications/CommunicationsDrawerSection";
import TaskAssistOpportunityLauncher from "@/components/admin/taskAssist/TaskAssistOpportunityLauncher";
import { isTaskAssistV1UiEnabled } from "@/lib/agent/taskAssist/taskAssistV1UiGate";
import {
    scheduleDeferredCommunicationsDrawerPrefetch,
    invalidateCommunicationsDrawerPrefetch,
} from "@/lib/admin/communications/communicationsDrawerPrefetch";
import {
    formatMoneyFromCents,
    formatMoneyFromDollars,
    formatDate,
    formatDateTime,
    formatDateForUserDisplay,
    formatDateTimeForUserDisplay,
    formatPhoneUS,
    formatPayoutPercent,
    personDisplayName,
    formatScheduleDrawerHeaderTitle,
} from "@/lib/adminFormatters";
import { AssignmentStatusBadge, StatusBadge, getStatusVariant } from "@/components/admin/StatusBadge";
import { OpportunityTourScheduleActionModal } from "@/components/admin/opportunity/tours/OpportunityTourScheduleActionModal";
import { ContactAttemptedModal } from "@/components/admin/opportunity/actions/ContactAttemptedModal";
import { UpdateStatusAddNoteModal } from "@/components/admin/opportunity/actions/UpdateStatusAddNoteModal";
import { AddRelatedPersonModal } from "@/components/admin/opportunity/actions/AddRelatedPersonModal";
import { AddFamilyMemberModal } from "@/components/admin/opportunity/actions/AddFamilyMemberModal";
import { AddInquiryChildModal } from "@/components/admin/opportunity/actions/AddInquiryChildModal";
import {
    WORKFLOW_ENTITY_TYPES,
    WORKFLOW_EVENT_TYPES,
    WORKFLOW_ENTITY_ID_QUICK_FILL,
} from "@/lib/workflowVocab";
import {
    getEntityPresentation,
    getJobOverviewBillingSummarySection,
    getJobPricingBreakdownSection,
    toPresentationType,
    type DrawerTabKey,
    type EntityDrawerSectionConfig,
    type EntityDrawerFieldConfig,
} from "@/lib/entityPresentation";
import EntityDrawerOverview from "@/components/admin/entity/EntityDrawerOverview";
import OpportunityRecordSectionRegistryActions from "@/components/admin/opportunity/OpportunityRecordSectionRegistryActions";
import { OpportunityHouseholdPeoplePanel } from "@/components/admin/opportunity/OpportunityHouseholdPeoplePanel";
import { useOpportunityActiveTourBookings } from "@/lib/tours/hooks/useOpportunityActiveTourBookings";
import { OpportunityInquiryTourDateBlock } from "@/components/admin/opportunity/tours/OpportunityInquiryTourDateBlock";
import { FamilyContactsPanel, OppInquiryContactChannelsRow } from "@/components/admin/opportunity/FamilyContactsPanel";
import EntityDrawerSection from "@/components/admin/entity/EntityDrawerSection";
import JobPricingBreakdown from "@/components/admin/JobPricingBreakdown";
import JobRrsOverviewTab from "@/components/admin/JobRrsOverviewTab";
import { AdminDeleteConfirmModal } from "@/components/admin/AdminDeleteConfirmModal";
import { getDeleteApiPath, canHardDeleteEntityType } from "@/lib/admin/deleteConfig";
import {
    computeJobDiscountOptionPreviewCents,
    inferOpportunityDiscountSelectionToken,
    type JobDiscountOptionDto,
} from "@/lib/admin/jobDiscountSelection";
import { opportunityOverviewStatusBadgeLabel } from "@/lib/admin/opportunityOverviewLabels";
import { formatVendorOptionLabel, type AdminVendorSelectOption } from "@/lib/admin/vendorOptionLabel";
import { mergeUnifiedStatusIntoConfigOverview } from "@/lib/admin/unifiedDrawerStatus";
import { recordSurfaceContextStyle } from "@/lib/visualContext";
import OpportunityInquiryChildrenSection, { type InquiryChildRow } from "@/components/admin/entity/OpportunityInquiryChildrenSection";
import { OpportunityInquiryChildrenRegistryActions } from "@/components/admin/opportunity/OpportunityInquiryChildrenRegistryActions";
import { OpportunityPacketReviewOverview } from "@/components/admin/opportunity/OpportunityPacketReviewOverview";
import { formatTourDateTime } from "@/lib/enrollment/formatTourDateTime";
import { deriveTourMetadataMirrorFromBooking, TOUR_BOOKING_OPPORTUNITY_STATUS } from "@/lib/tours/opportunity/tourBookingOpportunityIntegration";
import { validateQueueDefinition, type QueueDefinitionV1, type QueueFilter } from "@/lib/config/queueDefinitionSchema";
import {
    JobDrawerV2TabBar,
    JobDrawerV2SignalsStrip,
    deriveJobDrawerSignalLines,
    JobDrawerV2PrimaryActions,
    JobRecordPrimaryPanel,
    JobDrawerV2TimelineCard,
} from "@/components/admin/drawer/JobDrawerV2";
import JobRecordModalV2, { isCleaningJobRecord } from "@/components/admin/drawer/JobRecordModalV2";
import ScheduleRecordModalV2 from "@/components/admin/drawer/ScheduleRecordModalV2";
import OperationalAttentionHeaderStrip from "@/components/admin/drawer/OperationalAttentionHeaderStrip";
import OperationalAttentionDrawerSection from "@/components/admin/drawer/OperationalAttentionDrawerSection";
import { isScheduleCanceledStatusKey } from "@/lib/admin/scheduleCanceledStatus";
import { AdminCollectPaymentModal, type AdminCollectPaymentModalContext } from "@/components/admin/AdminCollectPaymentModal";
import { JobReceivableChargesPanel, jobTotalSummaryLabel } from "@/components/admin/JobReceivableChargesPanel";
import { JobManualChargeForm } from "@/components/admin/JobManualChargeForm";
import {
    effectivePaymentRowStatusKey,
    jobPaymentStatusKeyLabel,
    paymentRowStatusBadgeProps,
    paymentRowStatusDisplayLabel,
    type JobPaymentsSummaryFromApi,
    type PaymentRowLike,
} from "@/lib/admin/jobPaymentSummary";
import { useRecordChromeConfig } from "@/hooks/useRecordChromeConfig";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { prefetchWorkspaceChildcareInquiryOptionSets } from "@/lib/workspace/workspaceChildcareInquiryOptionSets";
import { adminEntityRefetchShouldBlockDrawerShell } from "@/lib/ui-v2/adminV2EntityDrawerLoading";
import { fetchAdminWorkUnitDrawerJson } from "@/lib/admin/adminWorkUnitDrawerFetch";
import { getSectionOrderFromScheduleLayoutBlocks } from "@/lib/recordChrome/scheduleLayoutConfig";
import {
    applyOverviewSectionOrder,
    recordOpportunityDrawerLayoutIncludesSection,
    type RecordLayoutConfigJson,
} from "@/lib/recordChrome/types";
import { executeOpportunityRecordAction } from "@/lib/recordChrome/executeOpportunityRecordAction";
import { OPPORTUNITY_WORKFLOW_V1_LEGACY_OVERVIEW_SECTION_KEYS } from "@/lib/admin/opportunityDrawerLayoutPolicy";
import {
    OPPORTUNITY_DRAWER_HIDE_PRICING_FIELD_KEYS,
    OPPORTUNITY_INQUIRY_HEADER_BODY_FIELD_KEYS,
    isOpportunityTourFollowUpSection,
    isOpportunityWorkflowStandaloneExternalDuplicate,
} from "@/lib/recordChrome/opportunityDrawerOverviewFilters";
import {
    oppInqDisplayName,
    oppInqEyebrow,
    oppInqFieldInput,
    oppInqInnerCard,
    oppInqMutedEmpty,
    oppInqNameLink,
    oppInqReadonlyField,
} from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import type { ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { applyRegistryResolvedActionClient } from "@/lib/admin/actions/applyRegistryResolvedActionClient";
import { formatActivityRelativeShort, type ActivitySignalResult } from "@/lib/admin/activitySignals";
import { formatOpportunityActivityTimelineEvent } from "@/lib/admin/opportunityActivityTimelineFormat";
import OpportunityQuoteIntakeSection from "@/components/admin/quoteIntake/OpportunityQuoteIntakeSection";
import OpportunityEnrollmentPacketModal from "@/components/admin/opportunity/OpportunityEnrollmentPacketModal";

function dispatchAfterPaymentRun(jobId: string, scheduleId: string | null) {
    window.dispatchEvent(new CustomEvent("admin-entity-saved", { detail: { type: "jobs", id: jobId } }));
    window.dispatchEvent(new CustomEvent("admin-entity-saved", { detail: { type: "payments", id: "*" } }));
    if (scheduleId) {
        window.dispatchEvent(new CustomEvent("admin-entity-saved", { detail: { type: "schedules", id: scheduleId } }));
    }
}

const OPPORTUNITY_INQUIRY_WORKFLOW_TAB_STRIP: DrawerTabKey[] = [
    "overview",
    "communications",
    "notes",
    "documents",
    "activity",
];

type FieldCatalogEntry = { key: string; label: string; data_type: string; operators: string[]; source: string };

function opportunityInquiryIdentityInquiryTitle(data: Record<string, unknown>): string {
    const ident = (data._identity as { inquiry?: { title?: string | null } | null } | null) ?? null;
    return String(ident?.inquiry?.title ?? "").trim();
}

function isOpportunityFollowUpOverdue(nextFollowUpAt: unknown): boolean {
    if (nextFollowUpAt == null || nextFollowUpAt === "") return false;
    const t = Date.parse(String(nextFollowUpAt).trim());
    return Number.isFinite(t) && t < Date.now();
}

function toDateInputValue(v: unknown): string {
    if (v == null || v === "") return "";
    const s = String(v).trim();
    if (!s) return "";
    return s.length >= 10 ? s.slice(0, 10) : s;
}

type FieldDefRow = {
    field_key: string;
    field_type: string;
    is_system: boolean;
    is_visible_in_drawer?: boolean;
};

/** Hydrate form state for every drawer-visible field_definition from the entity GET (system columns + merged field_values). */
function drawerValueFromRecord(fieldKey: string, fieldType: string, record: Record<string, unknown>): unknown {
    const raw = record[fieldKey];
    if (raw === null || raw === undefined) return "";
    const t = (fieldType || "text").toLowerCase();
    if (t === "boolean") {
        if (raw === true || raw === "true") return "true";
        if (raw === false || raw === "false") return "false";
        return "";
    }
    if (t === "number") {
        if (typeof raw === "number" && !Number.isNaN(raw)) return raw;
        const n = parseFloat(String(raw).replace(/,/g, ""));
        return Number.isFinite(n) ? n : "";
    }
    return raw;
}

function mergeConfiguredFieldFormValues(
    initial: Record<string, unknown>,
    record: Record<string, unknown>,
    defs: FieldDefRow[] | undefined
): void {
    if (!defs?.length) return;
    for (const d of defs) {
        if (d.is_visible_in_drawer === false) continue;
        initial[d.field_key] = drawerValueFromRecord(d.field_key, d.field_type, record);
    }
}

function isDrawerFieldValueBlank(v: unknown): boolean {
    if (v === undefined || v === null) return true;
    if (typeof v === "string") return v.trim() === "";
    if (typeof v === "number") return Number.isNaN(v);
    return false;
}

/** Custom defs that mirror canonical location / job / schedule API fields; hide when hydrated canonical should win (incl. non-blank UUID defs that duplicate native columns). */
const LOCATION_CUSTOM_DEF_KEYS_SHADOWED_BY_CANONICAL = new Set([
    "access_method_id",
    "access_method_key",
    "gate_code",
    "home_type",
    "square_footage",
    "square_footage_tier",
    "bedrooms",
    "beds",
    "bathrooms",
    "baths",
    "pets",
]);

const JOB_OR_SCHEDULE_SERVICE_SHADOW_DEF_KEYS = new Set([
    "gate_code",
    "home_type",
    "square_footage",
    "square_footage_tier",
    "bedrooms",
    "beds",
    "bathrooms",
    "baths",
    "pets",
]);

function locationCustomDefShadowedByCanonical(fieldKey: string, record: Record<string, unknown>): boolean {
    if (!LOCATION_CUSTOM_DEF_KEYS_SHADOWED_BY_CANONICAL.has(fieldKey)) return false;
    switch (fieldKey) {
        case "access_method_id":
            return !!String(record._access_method_label ?? "").trim() || !isDrawerFieldValueBlank(record.access_method_key);
        case "access_method_key":
            return !isDrawerFieldValueBlank(record.access_method_key) || !!String(record._access_method_label ?? "").trim();
        case "gate_code":
            if (!isDrawerFieldValueBlank(record.access_code)) return true;
            if (!isDrawerFieldValueBlank(record[fieldKey])) return false;
            return !!String(record._access_method_label ?? "").trim();
        case "home_type":
            return !isDrawerFieldValueBlank(record.home_type_key) || !!String(record._service_home_type_label ?? "").trim();
        case "square_footage":
        case "square_footage_tier":
            return (
                !isDrawerFieldValueBlank(record.square_footage_tier_key) ||
                !!String(record._service_square_footage_display ?? "").trim()
            );
        case "bedrooms":
        case "beds": {
            const n = record.beds ?? record._service_bedrooms;
            return n != null && n !== "" && !Number.isNaN(Number(n));
        }
        case "bathrooms":
        case "baths": {
            const n = record.baths ?? record._service_bathrooms;
            return n != null && n !== "" && !Number.isNaN(Number(n));
        }
        case "pets":
            return typeof record.has_pets === "boolean";
        default:
            return false;
    }
}

function jobOrScheduleServiceDefShadowedByCanonical(fieldKey: string, record: Record<string, unknown>): boolean {
    if (!JOB_OR_SCHEDULE_SERVICE_SHADOW_DEF_KEYS.has(fieldKey)) return false;
    switch (fieldKey) {
        case "gate_code":
            return false;
        case "home_type":
            return !!String(record._service_home_type_label ?? "").trim();
        case "square_footage":
        case "square_footage_tier":
            return !!String(record._service_square_footage_display ?? "").trim();
        case "bedrooms":
        case "beds": {
            const n = record._service_bedrooms;
            return n != null && n !== "" && !Number.isNaN(Number(n));
        }
        case "bathrooms":
        case "baths": {
            const n = record._service_bathrooms;
            return n != null && n !== "" && !Number.isNaN(Number(n));
        }
        case "pets":
            return false;
        default:
            return false;
    }
}

const EDITABLE_TYPES = ["opportunities", "jobs", "contacts", "customers", "customer_members", "schedules", "workflows", "vendors", "locations", "payments", "service_offerings", "service_plan_templates", "addons", "persons", "subscriptions", "documents"] as const;

type VendorFormData = {
    vendor_status_id?: string | null;
    primary_person_id?: string | null;
    status_key?: string | null;
    name?: string;
    company_name?: string;
    phone?: string;
    email?: string;
    address_line1?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    days_available?: string;
    operating_hours_open?: string;
    operating_hours_close?: string;
    owns_supplies?: boolean;
    max_daily_jobs?: number | "";
    payout_percent?: number | "";
    service_area_zip_codes?: string;
    external_source?: string;
    external_id?: string;
    w9_received?: boolean;
    ach_verified?: boolean;
    consent_contractor_agreement?: boolean;
    consent_legal?: boolean;
    consent_marketing?: boolean;
    payout_override_type?: string;
    payout_override_value?: number | "";
};

/** Contact drawer: vendor linked via contacts.vendor_id (from entity GET _contact_vendor). */
type ContactVendorShape = { id: string; name: string | null; vendor_status_id: string | null; created_at: string };

/** Vendor drawer: job row (entity GET _vendor_jobs). */
type VendorDrawerJob = {
    id: string;
    title: string;
    scheduled_at: string;
    job_status_id: string;
    _job_status_label?: string | null;
    gross_price_cents: number;
    recurring_total_cents: number;
    opportunity_id: string;
    display_total_cents?: number | null;
};

function canEditInDrawer(type: string): type is (typeof EDITABLE_TYPES)[number] {
    return EDITABLE_TYPES.includes(type as (typeof EDITABLE_TYPES)[number]);
}

/** Shared spacing: 24px container (drawer body has p-6), 16px between rows, section title with divider */
const DRAWER_SECTION_HEADER_CLASS = "text-xs font-semibold tracking-wider text-[#59678b] border-b border-[#e6e8ec] pb-2 mb-4";
const DRAWER_ROW_SPACING = "space-y-4";

/** Curated collapsible sections for Admin V2 cleaning job Record tab (no RRS section; People & places = opportunity + work unit only). */
function buildJobDrawerV2OverviewSections(): EntityDrawerSectionConfig[] {
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
            key: "communications_canonical_embed",
            title: "Communication",
            defaultExpanded: false,
            collapsible: true,
            gridCols: 1,
            fields: [],
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

const JOB_DRAWER_V2_OVERVIEW_SECTIONS = buildJobDrawerV2OverviewSections();

/** Entity types that use inline-edit; always show inputs, save on blur or Save (no overview read/edit toggle). */
const INLINE_EDIT_ENTITY_TYPES = ["contacts", "customers", "vendors", "opportunities", "schedules", "customer_members", "payments", "service_offerings", "service_plan_templates", "addons", "persons"] as const;

/** Subtle input styling: looks like text until hover/focus. */
const INLINE_EDIT_INPUT_CLASS = "w-full px-1.5 py-1 text-sm border border-transparent rounded bg-transparent hover:border-alloy-stone/30 hover:bg-alloy-stone/5 focus:border-alloy-blue focus:bg-white focus:outline-none disabled:opacity-60";

/** Brand accent colors for drawer left border by entity type (Alloy palette). */
const DRAWER_ACCENT_COLORS: Partial<Record<AdminDrawerEntityType, string>> = {
    jobs: "rgb(0,69,140)",
    schedules: "rgb(0,162,131)",
    customers: "rgb(0,162,131)",
    vendors: "rgb(188,67,0)",
    opportunities: "rgb(0,162,131)",
    contacts: "rgb(39,63,82)",
    customer_members: "rgb(39,63,82)",
    locations: "rgb(0,69,140)",
    documents: "rgb(39,63,82)",
    subscriptions: "rgb(0,162,131)",
};

/** Native record number column per rollout drawer entity (Batch 1). */
const ROLLOUT_DRAWER_RECORD_NUMBER_KEY: Partial<Record<AdminDrawerEntityType, string>> = {
    customers: "customer_number",
    jobs: "job_number",
    schedules: "schedule_number",
    vendors: "vendor_number",
    persons: "person_number",
    opportunities: "opportunity_number",
    locations: "location_number",
};

const ROLLOUT_DRAWER_RECORD_NUMBER_LABEL: Partial<Record<AdminDrawerEntityType, string>> = {
    customers: "Customer",
    jobs: "Job",
    schedules: "Schedule",
    vendors: "Vendor",
    persons: "Person",
    opportunities: "Opportunity",
    locations: "Location",
};

function drawerRecordNumberSubtitle(type: AdminDrawerEntityType | null | undefined, data: Record<string, unknown>): string | null {
    if (!type) return null;
    const col = ROLLOUT_DRAWER_RECORD_NUMBER_KEY[type];
    if (!col) return null;
    const raw = data[col];
    if (raw == null || raw === "") return null;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) return null;
    const entityLabel = ROLLOUT_DRAWER_RECORD_NUMBER_LABEL[type] ?? "Record";
    return `${entityLabel} #${n}`;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="py-1.5">
            <strong className="text-[#45506c] text-sm">{label}:</strong>
            <span className="ml-2 text-[#31394d]">{value ?? "—"}</span>
        </div>
    );
}

function getJobTitleFromData(job: unknown): string | null {
    if (job != null && typeof job === "object" && "title" in job) {
        const t = (job as Record<string, unknown>).title;
        return t != null ? String(t) : null;
    }
    return null;
}

function getMetaString(meta: unknown, key: string): string {
    if (meta != null && typeof meta === "object" && key in meta) {
        const v = (meta as Record<string, unknown>)[key];
        return v != null ? String(v) : "";
    }
    return "";
}

function SubscriptionGenerateNextButton({ subscriptionId, onDone }: { subscriptionId: string; onDone: () => void }) {
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const handleClick = async () => {
        setLoading(true);
        setErr(null);
        try {
            const res = await fetch(`/api/admin/subscriptions/${subscriptionId}/generate-next`, { method: "POST" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setErr((json as { error?: string }).error ?? "Failed");
                return;
            }
            onDone();
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setLoading(false);
        }
    };
    return (
        <div className="pt-4 border-t border-[#e6e8ec]">
            <button type="button" onClick={handleClick} disabled={loading} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50">
                {loading ? "Generating…" : "Generate next occurrence"}
            </button>
            {err && <p className="text-red-600 text-sm mt-2">{err}</p>}
        </div>
    );
}

function ScheduleCashEventButtons({ scheduleId, onSuccess }: { scheduleId: string; onSuccess: () => void }) {
    const [customerPaymentLoading, setCustomerPaymentLoading] = useState(false);
    const [vendorPayoutLoading, setVendorPayoutLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const postCustomerPayment = async () => {
        setCustomerPaymentLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/schedules/${scheduleId}/post-customer-payment`, { method: "POST" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError((json as { error?: string }).error ?? "Failed to post customer payment");
                return;
            }
            onSuccess();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setCustomerPaymentLoading(false);
        }
    };
    const postVendorPayout = async () => {
        setVendorPayoutLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/schedules/${scheduleId}/post-vendor-payout`, { method: "POST" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError((json as { error?: string }).error ?? "Failed to post vendor payout");
                return;
            }
            onSuccess();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setVendorPayoutLoading(false);
        }
    };
    return (
        <div className="flex flex-wrap items-center gap-2 pt-2">
            <button type="button" onClick={postCustomerPayment} disabled={customerPaymentLoading} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50">
                {customerPaymentLoading ? "Posting…" : "Post customer payment"}
            </button>
            <button type="button" onClick={postVendorPayout} disabled={vendorPayoutLoading} className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30 disabled:opacity-50">
                {vendorPayoutLoading ? "Posting…" : "Post vendor payout"}
            </button>
            {error && <p className="text-red-600 text-sm w-full">{error}</p>}
        </div>
    );
}

function DrawerLinkWithName({
    label,
    id,
    type,
    displayName,
}: {
    label: string;
    id: string | null;
    type: "contacts" | "customers" | "customer_members" | "opportunities" | "jobs" | "vendors" | "locations" | "persons";
    displayName: string | null | undefined;
}) {
    const { openDrawer } = useAdminDrawer();
    if (!id) return <Field label={label} value="-" />;
    const name = (displayName && displayName.trim()) ? displayName.trim() : null;
    return (
        <div>
            <strong className="text-alloy-midnight/70">{label}:</strong>{" "}
            <button
                type="button"
                onClick={() => openDrawer({ type, id })}
                className="text-alloy-blue hover:underline"
            >
                {name ?? `${id.slice(0, 8)}…`}
            </button>
            {name && <p className="text-xs text-alloy-midnight/50 mt-0.5 ml-0">{id}</p>}
        </div>
    );
}

/** Single row: label, value, and optional "open" button to open linked record. */
function LinkedRow({
    label,
    value,
    onOpen,
    disabled,
    action,
}: {
    label: string;
    value: string | null;
    onOpen?: () => void;
    disabled?: boolean;
    action?: React.ReactNode;
}) {
    const display = (value && value.trim()) ? value.trim() : "—";
    const canOpen = !disabled && onOpen && display !== "—";
    return (
        <div className="py-1.5 flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0">
                <strong className="text-[#45506c] text-sm">{label}:</strong>
                <span className="ml-2 text-[#31394d]">{display}</span>
            </div>
            {(canOpen || action) && (
                <div className="flex items-center gap-1 shrink-0">
                    {action}
                    {canOpen && (
                        <button
                            type="button"
                            onClick={onOpen}
                            className="text-xs px-2 py-1 border border-alloy-stone/50 rounded hover:bg-alloy-stone/20 text-alloy-midnight/80"
                        >
                            Open
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

/** Job drawer: Relationships collapsible section (Customer, Primary contact, Location, Opportunity, Work unit, Default vendor). */
function JobDrawerRelationshipsSection(props: {
    /** Admin V2 Record tab: status/customer/vendor/WU live in the primary panel — only contact, location, opportunity here. */
    omitPrimaryAssignments?: boolean;
    /** Admin V2 drawer — token borders and typography (same behavior). */
    uiVariant?: "legacy" | "adminV2";
    formData: Record<string, unknown>;
    setFormData: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
    canMutate: boolean;
    jobExpandedSections: { relationships: boolean; financials: boolean; scheduling: boolean; ledger: boolean };
    setJobExpandedSections: React.Dispatch<React.SetStateAction<{ relationships: boolean; financials: boolean; scheduling: boolean; ledger: boolean }>>;
    jobCustomerOptions: { id: string; name: string | null }[];
    jobContactOptions: { id: string; label: string }[];
    primaryContactDisabled: boolean;
    jobLocationOptions: { id: string; label: string }[];
    jobWorkUnitOptions: { id: string; label: string }[];
    jobOpportunityOptions: { id: string; label: string }[];
    jobVendorOptions: AdminVendorSelectOption[];
    jobAssignedVendorId: string | null;
    setJobAssignedVendorId: (v: string | null) => void;
    jobAssignedVendorSaving: boolean;
    applyVendorToUpcoming: boolean;
    setApplyVendorToUpcoming: (v: boolean) => void;
    customerSingular: string;
    contactSingular: string;
    opportunitySingular: string;
    vendorSingular: string;
    openDrawer: (params: { type: AdminDrawerEntityType; id: string; defaultWorkflowEntityType?: string; defaultCustomerId?: string; defaultVendorId?: string; defaultSchedulePrefill?: SchedulePrefill; defaultJobPrefill?: JobPrefill }) => void;
    openJobLocationChange: () => void;
    saveJobAssignedVendor: () => void;
}) {
    const p = props;
    const v2 = p.uiVariant === "adminV2";
    const omit = p.omitPrimaryAssignments === true;
    const sectionTitle =
        v2 && omit ? "Contact & location" : v2 ? "Customer & assignments" : "Relationships";
    return (
        <div
            className={v2 ? "rounded-[10px] border border-solid pb-1" : "border-b border-[#e6e8ec]"}
            style={v2 ? { borderColor: "rgba(39, 63, 82, 0.18)", backgroundColor: "#FFFFFF" } : undefined}
        >
            <button
                type="button"
                onClick={() => p.setJobExpandedSections((s) => ({ ...s, relationships: !s.relationships }))}
                className={
                    v2
                        ? "w-full flex items-center justify-between px-3 py-2.5 text-left text-sm font-semibold"
                        : "w-full flex items-center justify-between py-2 text-left text-xs font-semibold tracking-wider text-[#59678b]"
                }
                style={v2 ? { color: "rgba(39, 63, 82, 0.65)" } : undefined}
            >
                {sectionTitle}
                <span className={v2 ? "text-alloy-midnight/50" : "text-alloy-midnight opacity-60"}>
                    {p.jobExpandedSections.relationships ? "▼" : "▶"}
                </span>
            </button>
            {p.jobExpandedSections.relationships && (
                <div className={`space-y-3 pb-3 ${v2 ? "px-3" : ""}`}>
                    {!omit && (
                        <>
                            <div id="job-assign-vendor-section">
                                <strong className="text-alloy-midnight/70 block mb-2">Default {p.vendorSingular}</strong>
                                <div className="flex flex-wrap items-center gap-2">
                                    <select value={p.jobAssignedVendorId ?? ""} onChange={(e) => p.setJobAssignedVendorId(e.target.value || null)} className="px-2 py-1.5 border rounded text-sm min-w-[140px]">
                                        <option value="">(none)</option>
                                        {p.jobVendorOptions.map((v) => (
                                            <option key={v.id} value={v.id}>
                                                {v.label}
                                            </option>
                                        ))}
                                    </select>
                                    {p.jobAssignedVendorId ? (
                                        <button type="button" onClick={() => p.openDrawer({ type: "vendors", id: p.jobAssignedVendorId as string })} className="text-xs px-2 py-1 border border-alloy-stone/50 rounded hover:bg-alloy-stone/20">
                                            Open
                                        </button>
                                    ) : null}
                                    <button type="button" disabled={p.jobAssignedVendorSaving} onClick={p.saveJobAssignedVendor} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50">
                                        {p.jobAssignedVendorSaving ? "Saving…" : "Save"}
                                    </button>
                                </div>
                                {p.canMutate && (
                                    <label className="flex items-center gap-2 mt-2 text-sm text-alloy-midnight/70">
                                        <input type="checkbox" checked={p.applyVendorToUpcoming} onChange={(e) => p.setApplyVendorToUpcoming(e.target.checked)} />
                                        Apply to all upcoming schedules
                                    </label>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm text-alloy-midnight/70 mb-0.5">{p.customerSingular}</label>
                                <div className="flex gap-2 items-center flex-wrap">
                                    <select value={String(p.formData.customer_id ?? "")} onChange={(e) => p.setFormData((f) => ({ ...f, customer_id: e.target.value, primary_contact_id: "", opportunity_id: "" }))} disabled={!p.canMutate} className="flex-1 min-w-[140px] px-2 py-1.5 border rounded text-sm disabled:opacity-60">
                                        <option value="">(none)</option>
                                        {p.jobCustomerOptions.map((c) => <option key={c.id} value={c.id}>{c.name ?? c.id}</option>)}
                                    </select>
                                    {String(p.formData.customer_id ?? "").trim() ? <button type="button" onClick={() => p.openDrawer({ type: "customers", id: String(p.formData.customer_id) })} className="text-xs px-2 py-1 border border-alloy-stone/50 rounded hover:bg-alloy-stone/20">Open</button> : null}
                                </div>
                            </div>
                        </>
                    )}
                    <div>
                        <label className="block text-sm text-alloy-midnight/70 mb-0.5">Primary {p.contactSingular}</label>
                        <select value={String(p.formData.primary_contact_id ?? "")} onChange={(e) => p.setFormData((f) => ({ ...f, primary_contact_id: e.target.value }))} disabled={!p.canMutate || p.primaryContactDisabled} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60">
                            <option value="">(none)</option>
                            {p.jobContactOptions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-alloy-midnight/70 mb-0.5">Location</label>
                        <div className="flex gap-2 items-center flex-wrap">
                            <select value={String(p.formData.location_id ?? "")} onChange={(e) => p.setFormData((f) => ({ ...f, location_id: e.target.value || null }))} disabled={!p.canMutate} className="flex-1 min-w-[140px] px-2 py-1.5 border rounded text-sm disabled:opacity-60">
                                <option value="">(none)</option>
                                {p.jobLocationOptions.map((loc) => <option key={loc.id} value={loc.id}>{loc.label}</option>)}
                            </select>
                            {String(p.formData.location_id ?? "").trim() ? <button type="button" onClick={() => p.openDrawer({ type: "locations", id: String(p.formData.location_id) })} className="text-xs px-2 py-1 border border-alloy-stone/50 rounded hover:bg-alloy-stone/20">Open</button> : null}
                            {p.canMutate && <button type="button" onClick={p.openJobLocationChange} className="text-xs px-2 py-1 border border-alloy-stone/50 rounded hover:bg-alloy-stone/20">Change</button>}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm text-alloy-midnight/70 mb-0.5">{p.opportunitySingular}</label>
                        <div className="flex gap-2 items-center flex-wrap">
                            <select value={String(p.formData.opportunity_id ?? "")} onChange={(e) => p.setFormData((f) => ({ ...f, opportunity_id: e.target.value || null }))} disabled={!p.canMutate} className="flex-1 min-w-[140px] px-2 py-1.5 border rounded text-sm disabled:opacity-60">
                                <option value="">(none)</option>
                                {p.jobOpportunityOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                            </select>
                            {String(p.formData.opportunity_id ?? "").trim() ? <button type="button" onClick={() => p.openDrawer({ type: "opportunities", id: String(p.formData.opportunity_id) })} className="text-xs px-2 py-1 border border-alloy-stone/50 rounded hover:bg-alloy-stone/20">Open</button> : null}
                        </div>
                    </div>
                    {!omit && (
                        <div>
                            <label className="block text-sm text-alloy-midnight/70 mb-0.5">Work unit</label>
                            <p className="text-xs text-alloy-midnight/50 mb-1">Optional hierarchy queue (department · work unit).</p>
                            <select
                                value={String(p.formData.work_unit_id ?? "")}
                                onChange={(e) => p.setFormData((f) => ({ ...f, work_unit_id: e.target.value || null }))}
                                disabled={!p.canMutate}
                                className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60"
                            >
                                <option value="">Unassigned</option>
                                {p.jobWorkUnitOptions.map((o) => (
                                    <option key={o.id} value={o.id}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/** Quiet block placeholder — avoids spinners inside the drawer after the shell mounts. */
function DrawerQuietSkeletonBar({ className = "" }: { className?: string }) {
    return <div className={`skeleton-pulse rounded-md bg-alloy-stone/15 ${className}`.trim()} aria-hidden />;
}

function DrawerSubtitleGateSkeleton({ lines = 2 }: { lines?: number }) {
    return (
        <div className="mt-0.5 space-y-2 min-h-[2.75rem]" aria-busy="true">
            <DrawerQuietSkeletonBar className="h-4 w-[min(18rem,100%)]" />
            {lines > 1 ? <DrawerQuietSkeletonBar className="h-3 w-[min(14rem,100%)]" /> : null}
        </div>
    );
}

function DrawerOpportunityWorkflowSubtitleGateSkeleton() {
    return (
        <div className="mt-0.5 space-y-2 min-h-[52px]" aria-busy="true">
            <div className="flex flex-wrap items-center gap-2">
                <DrawerQuietSkeletonBar className="h-6 w-20 rounded-full" />
                <DrawerQuietSkeletonBar className="h-9 flex-1 min-w-[10rem] max-w-[240px] rounded-full" />
                <DrawerQuietSkeletonBar className="h-6 w-40 rounded-full" />
            </div>
            <DrawerQuietSkeletonBar className="h-3 w-[min(20rem,100%)]" />
        </div>
    );
}

function DrawerOpportunityWorkflowTimelineGateSkeleton() {
    return (
        <div
            data-opportunity-workflow-timeline-skeleton="true"
            className="min-h-[52px] rounded-xl border border-alloy-stone/12 bg-white/60 px-2.5 py-2 shadow-sm ring-1 ring-alloy-stone/10"
            aria-busy="true"
        >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex min-w-0 items-center gap-1.5">
                        <DrawerQuietSkeletonBar className="h-5 w-5 shrink-0 rounded-full" />
                        <DrawerQuietSkeletonBar className="h-3 w-16" />
                        {i < 3 ? <DrawerQuietSkeletonBar className="mx-0.5 h-[2px] w-5 rounded-full opacity-70" /> : null}
                    </div>
                ))}
            </div>
        </div>
    );
}

function DrawerWorkflowHeaderQuickActionsSkeleton() {
    return (
        <div className="flex flex-wrap items-start justify-end gap-2 min-h-[2.375rem]" aria-busy="true">
            <DrawerQuietSkeletonBar className="h-9 w-[5.25rem]" />
            <DrawerQuietSkeletonBar className="h-9 w-24" />
            <DrawerQuietSkeletonBar className="h-9 w-28" />
        </div>
    );
}

/** Record body shown while waiting for first entity JSON — same outer spacing intent as hydrated overview. */
function DrawerRecordGateSkeleton(props: {
    modalJob: boolean;
    modalSchedule: boolean;
    modalOpportunityWorkflow: boolean;
    modalOpportunityClassic: boolean;
    /** Non-modal opportunity drawer: same workflow-shaped skeleton while record chrome resolves. */
    recordGateOpportunityWorkflowShape: boolean;
}) {
    const { modalJob, modalSchedule, modalOpportunityWorkflow, modalOpportunityClassic, recordGateOpportunityWorkflowShape } =
        props;

    if (modalOpportunityWorkflow || recordGateOpportunityWorkflowShape) {
        return (
            <div className="space-y-3">
                <div className="mb-3 min-h-[132px] space-y-2 rounded-xl border border-alloy-stone/15 bg-white/80 px-2.5 py-2 shadow-sm">
                    <DrawerQuietSkeletonBar className="h-3 w-28" />
                    <DrawerQuietSkeletonBar className="h-6 w-[min(100%,24rem)]" />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <DrawerQuietSkeletonBar className="h-10 rounded-lg" />
                        <DrawerQuietSkeletonBar className="min-h-[2.875rem] flex-1 rounded-lg sm:col-span-1" />
                        <div className="col-span-1 sm:col-span-2 rounded-lg border border-alloy-stone/10 bg-alloy-stone/[0.04] p-2">
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr,minmax(0,1fr)]">
                                <div className="space-y-2">
                                    <DrawerQuietSkeletonBar className="h-3 w-32" />
                                    <DrawerQuietSkeletonBar className="h-14 rounded-md" />
                                </div>
                                <div className="space-y-2">
                                    <DrawerQuietSkeletonBar className="h-3 w-28" />
                                    <DrawerQuietSkeletonBar className="h-28 rounded-lg" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <DrawerQuietSkeletonBar className="min-h-[18rem] w-full rounded-xl border border-alloy-stone/10 bg-white/40" />
            </div>
        );
    }

    if (modalOpportunityClassic || modalSchedule || modalJob) {
        return (
            <div className="space-y-3 pt-1">
                <DrawerQuietSkeletonBar className="h-[5.25rem] w-full rounded-xl border border-alloy-stone/10 bg-white/60" />
                <DrawerQuietSkeletonBar className="min-h-[16rem] w-full rounded-xl border border-alloy-stone/10 bg-white/60" />
            </div>
        );
    }

    return (
        <div className="space-y-4 pt-2">
            <DrawerQuietSkeletonBar className="h-7 w-[min(320px,100%)]" />
            <DrawerQuietSkeletonBar className="min-h-[12rem] w-full rounded-lg border border-alloy-stone/10 bg-white/50" />
            <DrawerQuietSkeletonBar className="min-h-[8rem] w-full rounded-lg border border-alloy-stone/10 bg-white/50" />
        </div>
    );
}

/** Opportunities: `drawer_visible` shell → `full` hydrate; deferred member-linked person rows → `relationship_member_persons` overlay (Pass 6). */
type OpportunityEntitySurface = "full" | "drawer_visible" | "relationship_member_persons";

/** Merge full opportunity hydrate without clobbering visible fields with null/empty from partial responses. */
function mergeOpportunityFullHydrate(prev: Record<string, unknown>, full: Record<string, unknown>): Record<string, unknown> {
    const o: Record<string, unknown> = { ...prev };
    for (const [k, v] of Object.entries(full)) {
        if (v === undefined) continue;
        if ((v === null || v === "") && o[k] != null && o[k] !== "") continue;
        o[k] = v;
    }
    return o;
}

function appendOpportunityRecordHeaderHints(qs: URLSearchParams, data: Record<string, unknown> | null | undefined, drawerId: string): void {
    if (!data || typeof data !== "object") return;
    if (String((data as { id?: unknown }).id ?? "") !== String(drawerId)) return;
    const sk = (data as { status_key?: unknown }).status_key;
    if (typeof sk === "string" && sk.trim()) qs.set("hint_opportunity_status_key", sk.trim());
    const meta = (data as { metadata?: unknown }).metadata;
    if (meta && typeof meta === "object") {
        try {
            qs.set("hint_opportunity_metadata", JSON.stringify(meta));
        } catch {
            /* ignore */
        }
    }
}

function logOpportunityEnrichHeaderFromResponse(res: Response): void {
    const surface = res.headers.get("X-Alloy-Entity-Surface") ?? "";
    const h = res.headers.get("X-Alloy-Opp-Enrich");
    if (!h) return;
    try {
        const ph = JSON.parse(h) as { total_ms?: number; phases_ms?: Record<string, number> };
        console.info("[timing][drawer][opportunity-api]", { surface, ...ph });
    } catch {
        /* ignore malformed */
    }
}

/** Opportunity entity GET only: uses `X-Alloy-Entity-Surface` to split visible vs full hydrate overlay marks. */
function captureDrawerEntityResponsePerf(res: Response): void {
    if (typeof window === "undefined" || typeof performance === "undefined") return;
    const surface = (res.headers.get("X-Alloy-Entity-Surface") ?? "").trim().toLowerCase();
    if (!surface) return;
    const srv = res.headers.get("X-Alloy-Server-Duration");
    const enr = res.headers.get("X-Alloy-Opp-Enrich");
    const now = performance.now();

    const applySrvEnr = (srvKey: string, enrKey: string) => {
        if (srv != null && srv.trim() !== "") {
            const n = Number(srv);
            if (!Number.isNaN(n)) alloyPerfSet(srvKey, n);
        }
        if (enr) {
            try {
                const p = JSON.parse(enr) as { total_ms?: number };
                if (typeof p.total_ms === "number") alloyPerfSet(enrKey, p.total_ms);
            } catch {
                /* ignore */
            }
        }
    };

    if (surface === "drawer_visible") {
        applySrvEnr(
            "drawer_opportunity_visible_x_alloy_server_duration_ms",
            "drawer_opportunity_visible_x_alloy_opp_enrich_ms"
        );
        alloyPerfSet("drawer_opportunity_visible_resp", now);
        if (srv != null && srv.trim() !== "") {
            const n = Number(srv);
            if (!Number.isNaN(n)) alloyPerfSet("drawer_entity_x_alloy_server_duration_ms", n);
        }
        if (enr) {
            try {
                const p = JSON.parse(enr) as { total_ms?: number };
                if (typeof p.total_ms === "number") alloyPerfSet("drawer_entity_x_alloy_opp_enrich_ms", p.total_ms);
            } catch {
                /* ignore */
            }
        }
    } else if (surface === "full" || surface === "drawer_initial") {
        applySrvEnr("drawer_opportunity_full_x_alloy_server_duration_ms", "drawer_opportunity_full_x_alloy_opp_enrich_ms");
        alloyPerfSet("drawer_opportunity_full_resp", now);
    } else if (surface === "relationship_member_persons") {
        applySrvEnr(
            "drawer_opportunity_member_graph_overlay_x_alloy_server_duration_ms",
            "drawer_opportunity_member_graph_overlay_x_alloy_opp_enrich_ms",
        );
        alloyPerfSet("drawer_opportunity_member_graph_overlay_resp", now);
    }
}

function buildAdminEntityFetchUrl(
    type: AdminDrawerEntityType | null,
    id: string | null,
    jobRecordSurface: JobRecordSurfaceParam | undefined,
    opportunityEntitySurface?: OpportunityEntitySurface
): string | null {
    if (!type || !id) return null;
    if (type === "jobs" && id !== "new") {
        const surface = jobRecordSurface ?? "full";
        return `/api/admin/entity/jobs/${encodeURIComponent(id)}?surface=${encodeURIComponent(surface)}`;
    }
    if (type === "opportunities" && id !== "new") {
        const s = opportunityEntitySurface ?? "drawer_visible";
        return `/api/admin/entity/opportunities/${encodeURIComponent(id)}?surface=${encodeURIComponent(s)}`;
    }
    return `/api/admin/entity/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
}

function entityDataMatchesDrawer(
    data: Record<string, unknown> | null,
    drawerId: string | null | undefined
): boolean {
    return (
        !data ||
        !drawerId ||
        drawerId === "new" ||
        (data as { id?: string }).id == null ||
        String((data as { id: string }).id) === String(drawerId)
    );
}

function opportunityActivityStaleBadgeClass(severity: "low" | "medium" | "high"): string {
    if (severity === "high") {
        return "border border-alloy-ember/35 bg-alloy-ember/10 text-alloy-ember font-semibold";
    }
    if (severity === "medium") {
        return "border border-amber-300/80 bg-amber-50 text-amber-950 font-semibold";
    }
    return "border border-alloy-stone/25 bg-alloy-stone/15 text-alloy-forge/80 font-medium";
}

export default function AdminEntityDrawer() {
    const { drawer, openDrawer, closeDrawer, canGoBack, goBack, previousDrawer, stack } = useAdminDrawer();
    const { canMutate, role: adminRole } = useAdminAuth();
    const { orgId: workspaceOrgId } = useWorkspaceOrg();
    const recordChromeOrgScope = workspaceOrgId?.trim() || null;
    const { labels } = useEntityLabels();
    const memberSingular = labels.customer_members?.singular ?? "Member";
    const memberPlural = labels.customer_members?.plural ?? "Members";
    const contactSingular = labels.contacts?.singular ?? "Contact";
    const customerSingular = labels.customers?.singular ?? "Customer";
    const opportunitySingular = labels.opportunities?.singular ?? "Opportunity";
    const jobSingular = labels.jobs?.singular ?? "Job";
    const scheduleSingular = labels.schedules?.singular ?? "Schedule";
    const workflowSingular = labels.workflows?.singular ?? "Workflow";
    const vendorSingular = getEntityLabel(labels, "vendors", "singular");
    const vendorPlural = getEntityLabel(labels, "vendors", "plural");
    const jobPlural = getEntityLabel(labels, "jobs", "plural");
    const subscriptionSingular = labels.subscriptions?.singular ?? "Subscription";
    const router = useRouter();
    const pathname = usePathname();
    const viewerTz = useAdminViewerTimezone();
    const displayDateTime = useCallback(
        (v: string | number | Date | null | undefined) => formatDateTimeForUserDisplay(v, viewerTz),
        [viewerTz]
    );
    const displayDate = useCallback(
        (v: string | number | Date | null | undefined) => formatDateForUserDisplay(v, viewerTz),
        [viewerTz]
    );
    /** `/admin/workspace` uses the same V2 record surfaces as `/adminV2/workspace` (modal + schedule/job chrome). */
    const drawerShellVariant =
        pathname?.startsWith("/adminV2") || pathname?.startsWith("/admin/workspace") ? "adminV2" : "legacy";
    const [data, setData] = useState<Record<string, unknown> | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const entityRowReady = useMemo(() => {
        if (!drawer.type || !drawer.id || drawer.id === "new") return false;
        if (!data || typeof data !== "object") return false;
        if ((data as { _create?: boolean })._create) return false;
        const rid = (data as { id?: unknown }).id;
        return String(rid ?? "") === String(drawer.id);
    }, [data, drawer.id, drawer.type]);
    /** Staged `drawer_visible` → `full` hydrates inquiry/defs/relationships without a second loading shell. */
    const opportunityRecordHydrationPending = useMemo(() => {
        if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") return false;
        if (!data || typeof data !== "object") return false;
        if (String((data as { id?: unknown }).id ?? "") !== String(drawer.id)) return false;
        return (data as { _record_surface?: string })._record_surface === "drawer_visible";
    }, [data, drawer.id, drawer.type]);
    const [opportunityFullHydrateFailed, setOpportunityFullHydrateFailed] = useState(false);
    const opportunityFullHydrateApplied = useMemo(() => {
        if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") return false;
        if (!data || typeof data !== "object") return false;
        if (String((data as { id?: unknown }).id ?? "") !== String(drawer.id)) return false;
        const s = String((data as { _record_surface?: string })._record_surface ?? "").trim();
        return s === "full" || s === "drawer_initial";
    }, [data, drawer.id, drawer.type]);
    /** Relationship-heavy UI: show placeholders while `drawer_visible` until full merge (or until hydrate fails). */
    const opportunityFullHydratePending = useMemo(() => {
        return opportunityRecordHydrationPending && !opportunityFullHydrateFailed;
    }, [opportunityRecordHydrationPending, opportunityFullHydrateFailed]);
    const [isEditing, setIsEditing] = useState(false);
    const [initialInlineFormSnapshot, setInitialInlineFormSnapshot] = useState<string | null>(null);
    const [formData, setFormData] = useState<Record<string, unknown>>({});
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [saving, setSaving] = useState(false);
    const [jobSchedules, setJobSchedules] = useState<{ id: string; job_id: string; start_at: string; end_at: string; timezone: string }[]>([]);
    type JobRelatedPayload = {
        schedules: { id: string; start_at?: string; end_at?: string; status_key?: string | null; price_cents?: number | null; _visit_label?: string; _vendor_name?: string | null }[];
        opportunity: { id: string; name?: string | null; created_at?: string; status_key?: string | null; quote_total?: number | null } | null;
        messages: unknown[];
        discounts: { id: string; created_at?: string; _code?: string | null }[];
        documents: { id: string; name?: string | null; original_filename?: string | null; document_type?: string | null; status?: string | null; uploaded_at?: string | null; created_at?: string }[];
    };
    const [jobRelatedData, setJobRelatedData] = useState<JobRelatedPayload | null>(null);
    const [jobRelatedLoading, setJobRelatedLoading] = useState(false);
    const [rescheduleForm, setRescheduleForm] = useState<{ start_at: string; end_at: string; timezone: string } | null>(null);
    const [rescheduleScheduleId, setRescheduleScheduleId] = useState<string | null>(null);
    const [rescheduleSaving, setRescheduleSaving] = useState(false);
    const [rescheduleError, setRescheduleError] = useState<string | null>(null);
    const [oppVerticalOptions, setOppVerticalOptions] = useState<{ id: string; name: string }[]>([]);
    /** Opportunity drawer: labeled selects for relationship field_keys from field_definitions. */
    const [oppRefFieldSelectOptions, setOppRefFieldSelectOptions] = useState<Record<string, { value: string; label: string }[]>>({});
    /** Pipeline stages for opportunity `pipeline_stage_id` overview select (full list + immediate label). */
    const [oppPipelineStageOptions, setOppPipelineStageOptions] = useState<{ value: string; label: string }[]>([]);
    const [workflowConditions, setWorkflowConditions] = useState<{ target_entity?: string; field_path: string; operator: string; value: string }[]>([]);
    const [workflowActions, setWorkflowActions] = useState<{ action_type: string; target_entity?: string; payload?: Record<string, unknown> }[]>([]);
    const [runModalOpen, setRunModalOpen] = useState(false);
    const [runPayload, setRunPayload] = useState("{}");
    const [runResult, setRunResult] = useState<{ status: string; workflow_run_id: string; error?: string; logs?: string[] } | null>(null);
    const [runLoading, setRunLoading] = useState(false);
    const [runJsonError, setRunJsonError] = useState<string | null>(null);
    const [createSaving, setCreateSaving] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [workflowActionAdvanced, setWorkflowActionAdvanced] = useState<Record<number, boolean>>({});
    const [jobActionLoading, setJobActionLoading] = useState<string | null>(null);
    const [opportunityActionLoading, setOpportunityActionLoading] = useState<string | null>(null);
    const [opportunityResolvedHeaderActions, setOpportunityResolvedHeaderActions] = useState<ResolvedActionsBySlot | null>(null);
    const [opportunityResolvedHeaderLoading, setOpportunityResolvedHeaderLoading] = useState(false);
    const opportunityRecordHeaderTourOpportunityId =
        drawer.type === "opportunities" && drawer.id && drawer.id !== "new" ? drawer.id : null;
    const { activeBookings: opportunityRecordHeaderActiveTours } = useOpportunityActiveTourBookings(
        opportunityRecordHeaderTourOpportunityId
    );
    const opportunityRecordHeaderActionsForUi = useMemo(() => {
        const base = opportunityResolvedHeaderActions;
        if (!base || !opportunityRecordHeaderActiveTours.length) return base;
        const relabel = (arr: ResolvedActionForClient[]) =>
            arr.map((a) => (a.key === "schedule_tour" ? { ...a, label: "Reschedule tour" } : a));
        return {
            ...base,
            primary: relabel(base.primary ?? []),
            secondary: relabel(base.secondary ?? []),
            overflow: relabel(base.overflow ?? []),
            right_rail: relabel(base.right_rail ?? []),
            row_inline: relabel(base.row_inline ?? []),
            header: relabel(base.header ?? []),
        };
    }, [opportunityResolvedHeaderActions, opportunityRecordHeaderActiveTours]);
    /** After `drawer_visible_ready` + two animation frames — defer non-critical fetches (activity-signal, deletion check). */
    const [postDrawerVisibleKey, setPostDrawerVisibleKey] = useState<string | null>(null);
    /** Background `surface=full` after `drawer_visible` — avoids second loading shell; cleared on new entity fetch / drawer close. */
    const opportunityFullHydrateInFlightRef = useRef<string | null>(null);
    const opportunityFullHydrateDoneRef = useRef<string | null>(null);
    /** Lazy `surface=relationship_member_persons` after `full` when `_member_person_graph_pending`; no loader. */
    const memberPersonGraphOverlayInFlightRef = useRef<string | null>(null);
    const memberPersonGraphOverlayDoneRef = useRef<string | null>(null);

    /** Coherent shell: entity row loaded (header actions may still resolve in parallel). */
    const drawerReady = useMemo(() => {
        const dm = entityDataMatchesDrawer(data, drawer.id);
        const overview = dm ? data : null;
        const isDrawerCreateFlow =
            !drawer.id ||
            drawer.id === "new" ||
            Boolean(overview && (overview as { _create?: boolean })._create);
        const existingEntityDrawerTarget =
            !!drawer.id &&
            drawer.id !== "new" &&
            !(overview && (overview as { _create?: boolean })._create);
        const entityFetchReady =
            existingEntityDrawerTarget && !loading && !error && data != null && dm;
        if (isDrawerCreateFlow) return !loading && !error && data != null && dm;
        return entityFetchReady;
    }, [data, drawer.id, drawer.type, loading, error]);

    const drawerGateLoading = useMemo(() => {
        const dm = entityDataMatchesDrawer(data, drawer.id);
        const overview = dm ? data : null;
        const existingEntityDrawerTarget =
            !!drawer.id &&
            drawer.id !== "new" &&
            !(overview && (overview as { _create?: boolean })._create);
        return existingEntityDrawerTarget && !error && !drawerReady;
    }, [data, drawer.id, error, drawerReady]);

    useEffect(() => {
        setPostDrawerVisibleKey(null);
        opportunityFullHydrateInFlightRef.current = null;
        opportunityFullHydrateDoneRef.current = null;
        memberPersonGraphOverlayInFlightRef.current = null;
        memberPersonGraphOverlayDoneRef.current = null;
    }, [drawer.type, drawer.id]);

    /** Deferred comms prefetch: reserve slot in layout phase (before child effects) — rAF+idle starts HTTP. */
    useLayoutEffect(() => {
        if (!drawer.id || drawer.id === "new") return;
        if (!drawerReady) return;
        if (!data || typeof data !== "object") return;
        if (!entityDataMatchesDrawer(data, drawer.id)) return;

        if (drawer.type === "opportunities") {
            scheduleDeferredCommunicationsDrawerPrefetch("opportunities", drawer.id);
        } else if (drawer.type === "jobs") {
            scheduleDeferredCommunicationsDrawerPrefetch("jobs", drawer.id);
        }
    }, [drawer.type, drawer.id, drawerReady, data]);

    useEffect(() => {
        const t = drawer.type;
        const eid = drawer.id;
        return () => {
            if (!eid || eid === "new") return;
            if (t === "opportunities") invalidateCommunicationsDrawerPrefetch("opportunities", eid);
            if (t === "jobs") invalidateCommunicationsDrawerPrefetch("jobs", eid);
        };
    }, [drawer.type, drawer.id]);

    const [oppQuoteIntakeOpen, setOppQuoteIntakeOpen] = useState(false);
    const [oppLaunchPacketOpen, setOppLaunchPacketOpen] = useState(false);
    const [oppDiscountOptions, setOppDiscountOptions] = useState<{ value: string; label: string }[] | null>(null);
    const [oppDiscountLoading, setOppDiscountLoading] = useState(false);
    const [oppDiscountSelection, setOppDiscountSelection] = useState<string>("");
    const [oppPromoCode, setOppPromoCode] = useState("");
    /** Childcare inquiry header: option-set labels for opportunity-level program / schedule type selects. */
    const [oppOverrideOpen, setOppOverrideOpen] = useState(false);
    const [oppOverrideAmount, setOppOverrideAmount] = useState("");
    const [oppOverrideReason, setOppOverrideReason] = useState("");
    const [oppQuoteActionError, setOppQuoteActionError] = useState<string | null>(null);
    const [oppQuoteActionLoading, setOppQuoteActionLoading] = useState(false);
    const [fieldCatalogByEntity, setFieldCatalogByEntity] = useState<Record<string, FieldCatalogEntry[]>>({});
    const [vendorStatuses, setVendorStatuses] = useState<{ id: string; key: string; label: string }[]>([]);
    const [setLocationOpen, setSetLocationOpen] = useState(false);
    const [setLocationEntity, setSetLocationEntity] = useState<"job" | "schedule" | null>(null);
    const [setLocationSelectedId, setSetLocationSelectedId] = useState<string | null>(null);
    const [setLocationSaving, setSetLocationSaving] = useState(false);
    const [setLocationError, setSetLocationError] = useState<string | null>(null);
    const [setLocationList, setSetLocationList] = useState<{ id: string; label: string | null; address1: string | null; city: string | null; state: string | null; postal_code: string | null }[]>([]);
    const [locationTypes, setLocationTypes] = useState<{ id: string; key: string; label: string; position: number; is_active: boolean }[]>([]);
    const [locationCustomerOptions, setLocationCustomerOptions] = useState<{ id: string; name: string | null }[]>([]);
    const [initialJobFormData, setInitialJobFormData] = useState<Record<string, unknown> | null>(null);
    const [vendorPayout, setVendorPayout] = useState<{ policy: { mode: string; value?: number }; source: string; completed_occurrences: number; payout_percent: number } | null>(null);
    const [vendorPayoutJobId, setVendorPayoutJobId] = useState("");
    const [vendorPayoutJobIdInput, setVendorPayoutJobIdInput] = useState("");
    const [vendorPayoutJobOptions, setVendorPayoutJobOptions] = useState<{ id: string; title: string | null }[]>([]);
    const [vendorPayoutJobPayout, setVendorPayoutJobPayout] = useState<{ job: { completed_occurrences_total: number; current_payout_percent: number; completed_payout_cents_total?: number } } | null>(null);
    const [vendorPayoutLoading, setVendorPayoutLoading] = useState(false);
    type VendorPayoutOverridePolicy = { mode: "flat" | "tiered"; value?: number; basis?: string; completed_status_key?: string; tiers?: { from: number; to: number | null; value: number }[] };
    const [vendorPayoutOverrideEnabled, setVendorPayoutOverrideEnabled] = useState(false);
    const [vendorPayoutOverrideForm, setVendorPayoutOverrideForm] = useState<VendorPayoutOverridePolicy>({ mode: "flat", value: 80, completed_status_key: "completed", tiers: [{ from: 1, to: null, value: 80 }] });
    const [vendorPayoutOverrideSaving, setVendorPayoutOverrideSaving] = useState(false);
    const [workflowVerticals, setWorkflowVerticals] = useState<{ id: string; name: string; slug: string }[]>([]);
    const [scheduleVendors, setScheduleVendors] = useState<AdminVendorSelectOption[]>([]);
    const [scheduleAssignLoading, setScheduleAssignLoading] = useState(false);
    const [scheduleCancelReason, setScheduleCancelReason] = useState("");
    const [scheduleCancelPrompt, setScheduleCancelPrompt] = useState(false);
    const [scheduleRescheduleForm, setScheduleRescheduleForm] = useState<{ start_at: string; end_at: string; copy_assignment: boolean } | null>(null);
    const [scheduleRescheduleSaving, setScheduleRescheduleSaving] = useState(false);
    const [jobVendorsForAssign, setJobVendorsForAssign] = useState<AdminVendorSelectOption[]>([]);
    const [vendorPrimaryPersonOptions, setVendorPrimaryPersonOptions] = useState<{ value: string; label: string }[]>([]);
    const [jobAssignedVendorSaving, setJobAssignedVendorSaving] = useState(false);
    const [jobAssignedVendorId, setJobAssignedVendorId] = useState<string | null>(null);
    const [applyVendorToUpcoming, setApplyVendorToUpcoming] = useState(false);
    const [jobLocationOptions, setJobLocationOptions] = useState<{ id: string; label: string }[]>([]);
    const [jobWorkUnitOptions, setJobWorkUnitOptions] = useState<{ id: string; label: string }[]>([]);
    const [jobOpportunityOptions, setJobOpportunityOptions] = useState<{ id: string; label: string }[]>([]);
    const [jobPersonOptions, setJobPersonOptions] = useState<{ id: string; label: string }[]>([]);
    const [jobExpandedSections, setJobExpandedSections] = useState<{ relationships: boolean; financials: boolean; scheduling: boolean; ledger: boolean }>({ relationships: true, financials: false, scheduling: false, ledger: false });
    const [jobDiscountOptions, setJobDiscountOptions] = useState<JobDiscountOptionDto[]>([]);
    const [scheduleCreateForm, setScheduleCreateForm] = useState<{ start_at: string; end_at: string; timezone: string }>({ start_at: "", end_at: "", timezone: "" });
    const [scheduleCreateSaving, setScheduleCreateSaving] = useState(false);

    useEffect(() => {
        setSaveError(null);
        if (drawer.type === "schedules" && drawer.id === "new") setScheduleCreateForm({ start_at: "", end_at: "", timezone: "" });
    }, [drawer.type, drawer.id]);
    type JobPaymentRowUi = {
        id: string;
        created_at: string;
        amount_cents: number;
        status?: string | null;
        received_at?: string | null;
        posted_at?: string | null;
        processor?: string | null;
        processor_transaction_id?: string | null;
        allocated_amount_cents?: number | null;
        unallocated_amount_cents?: number | null;
        allocation_state?: string | null;
        paid_at?: string | null;
        provider_payment_id?: string | null;
        payment_status_id?: string | null;
        status_key?: string | null;
        payment_statuses?: { key: string; label?: string | null } | null;
    };
    const [jobPayments, setJobPayments] = useState<JobPaymentRowUi[]>([]);
    const [jobPaymentsLoading, setJobPaymentsLoading] = useState(false);
    const [jobPaymentSummaryFromApi, setJobPaymentSummaryFromApi] = useState<JobPaymentsSummaryFromApi | null>(null);
    const [jobPaymentsFetchError, setJobPaymentsFetchError] = useState<string | null>(null);
    const [paymentToast, setPaymentToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
    const [registryActionFeedback, setRegistryActionFeedback] = useState<{
        type: "success" | "error";
        message: string;
        workflow_run_id?: string | null;
    } | null>(null);
    const [actionFormState, setActionFormState] = useState<{
        form_key: string;
        action: ResolvedActionForClient;
        /** Surfaces POST /api/admin/actions/execute audit context (registry placement). */
        executeContext?: { surface: string; section_key?: string | null };
    } | null>(null);
    const [relatedPeopleRefreshKey, setRelatedPeopleRefreshKey] = useState(0);
    const [opportunityQueueDefinition, setOpportunityQueueDefinition] = useState<QueueDefinitionV1 | null>(null);
    const [opportunityWorkUnitDepartmentId, setOpportunityWorkUnitDepartmentId] = useState<string | null>(null);
    /** Fire `interactive` timing once per opportunity open (relaxed vs waiting on header fetch). */
    const opportunityInteractiveMarkedRef = useRef<string | null>(null);
    /** Dedupes identical `record_header` resolutions on refetch. */
    const opportunityHeaderResolvedSigRef = useRef<string | null>(null);
    const drawerLoadStartRef = useRef<{ key: string; at: number } | null>(null);
    const drawerReadyLoggedKeyRef = useRef<string | null>(null);
    const [addInquiryChildState, setAddInquiryChildState] = useState<{ mode: "child" | "sibling" } | null>(null);
    const [collectPaymentOpen, setCollectPaymentOpen] = useState(false);
    const [collectPaymentContext, setCollectPaymentContext] = useState<AdminCollectPaymentModalContext | null>(null);
    const [collectPaymentContextRefresh, setCollectPaymentContextRefresh] = useState(0);
    type JobPayoutSchedule = { schedule_id: string; assigned_vendor_id: string | null; status_key: string | null; scheduled_at: string | null; completed_at: string | null; occurrence_number: number | null; payout_percent: number | null; price_cents?: number; payout_cents?: number | null; alloy_fee_cents?: number | null };
    type JobPayoutResponse = {
        policy: { mode: string; type?: string; basis?: string | null; completed_status_key?: string | null; value?: number | null; tiers?: unknown[] | null };
        source: string;
        job: { id: string; assigned_vendor_id: string | null; completed_occurrences_total: number; current_payout_percent: number; completed_revenue_cents_total?: number; completed_payout_cents_total?: number; completed_alloy_fee_cents_total?: number };
        schedules: JobPayoutSchedule[];
    };
    const [jobPayout, setJobPayout] = useState<JobPayoutResponse | null>(null);
    const [jobPayoutLoading, setJobPayoutLoading] = useState(false);
    const [scheduleFinancials, setScheduleFinancials] = useState<{
        schedule: { id: string; job_id: string | null; status_key: string | null; start_at: string | null; assigned_vendor_id: string | null; price_cents: number | null };
        job: { id: string; customer_id: string | null; gross_price_cents: number | null; discount_code: string | null; discount_amount: number | string | null } | null;
        journal_entry: { id: string; status: string | null; entry_date: string | null; description: string | null; created_at: string | null; lines: { line_no: number; account_id: string; account_code: string | null; account_name: string | null; debit_cents: number; credit_cents: number }[] } | null;
        customer_payment_posted?: boolean;
        vendor_payout_posted?: boolean;
        computed: { gross_cents: number; discount_cents: number; net_cents: number; payout_percent: number; payout_cents: number; alloy_fee_cents: number };
    } | null>(null);
    const [scheduleFinancialsLoading, setScheduleFinancialsLoading] = useState(false);
    const [scheduleRelatedDocuments, setScheduleRelatedDocuments] = useState<JobRelatedPayload["documents"]>([]);
    const [scheduleRelatedDocumentsLoading, setScheduleRelatedDocumentsLoading] = useState(false);
    const [jobFinancials, setJobFinancials] = useState<{
        job: {
            id: string;
            customer_id: string | null;
            assigned_vendor_id: string | null;
            gross_price_cents: number | null;
            estimated_total_cents?: number | null;
            recurring_total_cents?: number | null;
            discounted?: boolean | null;
            discount_code: string | null;
            discount_amount: number | string | null;
            is_recurring?: boolean | null;
            service_frequency_key?: string | null;
        };
        booking_economics?: {
            first_visit_gross_cents: number | null;
            discount_cents: number | null;
            first_visit_net_cents: number | null;
            recurring_visit_cents: number | null;
        };
        schedules: {
            id: string;
            status_key: string | null;
            start_at: string | null;
            assigned_vendor_id: string | null;
            price_cents: number | null;
            subscription_sequence?: number | null;
            visit_kind?: "first" | "recurring";
            posted: boolean;
        }[];
        totals: { total_revenue_credits: number; total_discount_debits: number; total_vendor_payout_debits: number; total_cash_debits: number; total_vendor_payable_credits: number };
        posted_entries_count: number;
    } | null>(null);
    const [jobFinancialsLoading, setJobFinancialsLoading] = useState(false);
    const [jobCustomerOptions, setJobCustomerOptions] = useState<{ id: string; name: string | null; status_key?: string | null }[]>([]);
    const [jobFrequencyOptions, setJobFrequencyOptions] = useState<{ key: string; label: string; is_recurring: boolean }[]>([]);
    const [jobContactOptions, setJobContactOptions] = useState<{ id: string; label: string }[]>([]);
    const [jobContactOptionsLoading, setJobContactOptionsLoading] = useState(false);
    const [jobCreateSaving, setJobCreateSaving] = useState(false);
    const [drawerTab, setDrawerTab] = useState<DrawerTabKey>("overview");
    /** Set default tab once per open; avoids resetting tab when pathname changes while drawer stays open. */
    const entityDrawerTabInitKeyRef = useRef<string>("");
    type WorkflowRunPreviewRow = {
        id: string;
        workflow_id: string;
        workflow_name: string | null;
        status: string;
        started_at: string;
        completed_at: string | null;
        has_failed_action?: boolean;
    };
    type OpportunityActivityEventRow = {
        id: string;
        occurred_at: string;
        event_type: string | null;
        entity_type: string | null;
        entity_id: string | null;
        action_type: string | null;
        payload: Record<string, unknown>;
    };
    const [opportunityWorkflowRuns, setOpportunityWorkflowRuns] = useState<WorkflowRunPreviewRow[] | null>(null);
    const [opportunityWorkflowRunsLoading, setOpportunityWorkflowRunsLoading] = useState(false);
    const [opportunityWorkflowRunsError, setOpportunityWorkflowRunsError] = useState<string | null>(null);
    const [opportunityActivityEvents, setOpportunityActivityEvents] = useState<OpportunityActivityEventRow[] | null>(null);
    const [opportunityActivityLoading, setOpportunityActivityLoading] = useState(false);
    const [opportunityActivityError, setOpportunityActivityError] = useState<string | null>(null);
    const [opportunityActivitySignal, setOpportunityActivitySignal] = useState<ActivitySignalResult | null>(null);
    const [opportunityActivitySignalLoading, setOpportunityActivitySignalLoading] = useState(false);
    const [opportunityActivitySignalNonce, setOpportunityActivitySignalNonce] = useState(0);
    const [memberCustomers, setMemberCustomers] = useState<{ id: string; name: string | null }[]>([]);
    const [memberCreateSaving, setMemberCreateSaving] = useState(false);
    const [memberCreateError, setMemberCreateError] = useState<string | null>(null);
    const [memberDeleteConfirm, setMemberDeleteConfirm] = useState(false);
    const [memberDeleting, setMemberDeleting] = useState(false);
    const [memberRelatedContacts, setMemberRelatedContacts] = useState<{ id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; created_at?: string }[]>([]);
    const [memberRelatedLoading, setMemberRelatedLoading] = useState(false);
    const [memberRelatedError, setMemberRelatedError] = useState<string | null>(null);
    type MemberLink = { id: string; customer_member_id: string; contact_id: string; role_key: string; is_active: boolean; contact: { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null };
    const [memberRelatedLinks, setMemberRelatedLinks] = useState<MemberLink[]>([]);
    const [memberRelatedLinksLoading, setMemberRelatedLinksLoading] = useState(false);
    const [memberRelatedRoles, setMemberRelatedRoles] = useState<{ id: string; role_key: string; role_label: string; sort_order: number }[]>([]);
    const [memberLinkModalOpen, setMemberLinkModalOpen] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deleteSaving, setDeleteSaving] = useState(false);
    type DeletionEligibility = { allowed: boolean; reason: string; recommended_action: string };
    const [deletionEligibility, setDeletionEligibility] = useState<DeletionEligibility | null>(null);
    const [deletionEligibilityLoading, setDeletionEligibilityLoading] = useState(false);
    const [memberLinkRoleKey, setMemberLinkRoleKey] = useState("");
    const [memberLinkContactId, setMemberLinkContactId] = useState("");
    const [memberLinkSaving, setMemberLinkSaving] = useState(false);
    const [memberLinkError, setMemberLinkError] = useState<string | null>(null);
    const [memberLinkContactOptions, setMemberLinkContactOptions] = useState<{ id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null }[]>([]);
    const [memberUnlinkingId, setMemberUnlinkingId] = useState<string | null>(null);
    const [memberRelationshipOptions, setMemberRelationshipOptions] = useState<{ key: string; label: string }[]>([]);
    type MemberRelatedPayload = {
        linkedContacts: { id: string; contact_id: string; contact_name: string | null; email: string | null; phone: string | null; role_key: string | null; role_label: string | null; is_active: boolean }[];
        customer: { id: string; name: string | null } | null;
        documents: { id: string; name?: string | null; original_filename?: string | null; document_type?: string | null; status?: string | null; uploaded_at?: string | null; created_at?: string }[];
    };
    const [memberRelatedData, setMemberRelatedData] = useState<MemberRelatedPayload | null>(null);
    const [memberRelatedDataLoading, setMemberRelatedDataLoading] = useState(false);
    const [contactCreateSaving, setContactCreateSaving] = useState(false);
    const [contactCreateError, setContactCreateError] = useState<string | null>(null);
    const [personCreateSaving, setPersonCreateSaving] = useState(false);
    const [personCreateError, setPersonCreateError] = useState<string | null>(null);
    const [personCreateForm, setPersonCreateForm] = useState<{ first_name?: string; last_name?: string; email?: string; phone?: string }>({});
    type StatusDefOption = { status_key: string; status_label: string | null; sort_order: number; is_active: boolean };
    const [statusDefsForDrawer, setStatusDefsForDrawer] = useState<StatusDefOption[]>([]);
    const [statusDefsLoading, setStatusDefsLoading] = useState(false);
    type ContactRelatedPayload = {
        linkedCustomer: { id: string; name: string | null } | null;
        linkedVendor: { id: string; name: string | null } | null;
        opportunities: { id: string; created_at?: string; name?: string | null; status?: string | null; job_date?: string | null; quote_total?: number | null }[];
        jobs: { id: string; created_at?: string; title?: string | null; scheduled_at?: string | null; opportunity_id?: string | null }[];
        customer_subscriptions: { id: string; created_at?: string; customer_id?: string; status?: string; start_date?: string | null }[];
        customer_member_contacts: { id: string; customer_member_id?: string; contact_id?: string }[];
        vendor_contacts: { id: string; vendor_id?: string; contact_id?: string; role?: string | null }[];
        messages: { id: string; created_at?: string; to_phone?: string | null; status?: string | null }[];
        documents: { id: string; name: string | null; document_type?: string | null; uploaded_at?: string | null }[];
        discount_redemptions: { id: string; created_at?: string; discount_code_id?: string; customer_id?: string }[];
        contact_tags: unknown[];
    };
    const [contactRelatedData, setContactRelatedData] = useState<ContactRelatedPayload | null>(null);
    const [contactRelatedLoading, setContactRelatedLoading] = useState(false);
    type CustomerRelatedPayload = {
        people?: {
            person_id: string;
            role_type?: string | null;
            _person_name?: string | null;
            role_label?: string | null;
            _person_email?: string | null;
            _person_phone?: string | null;
            created_at?: string;
        }[];
        contacts: { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null; status_key?: string | null }[];
        opportunities: { id: string; name?: string | null; status?: string | null; job_date?: string | null; quote_total?: number | null }[];
        jobs: { id: string; title?: string | null; scheduled_at?: string | null; opportunity_id?: string | null }[];
        schedules: { id: string; job_id?: string; start_at?: string; end_at?: string; timezone?: string }[];
        locations: { id: string; label?: string | null; address1?: string | null; location_type?: string | null; city?: string | null; state?: string | null }[];
        customer_members: { id: string; display_name?: string | null; relationship?: string | null; first_name?: string | null; last_name?: string | null }[];
        payments: { id: string; amount_cents?: number; status_key?: string | null; paid_at?: string | null; created_at?: string; provider_payment_id?: string | null }[];
        customer_subscriptions: { id: string; status?: string; start_date?: string | null; created_at?: string }[];
        discount_redemptions: { id: string; created_at?: string; discount_code_id?: string }[];
        documents: { id: string; name?: string | null; document_type?: string | null; uploaded_at?: string | null; status?: string | null }[];
        messages: { id: string; created_at?: string; to_phone?: string | null; status?: string | null; body?: string | null }[];
        customer_tags: { id: string; name?: string | null }[];
        _primary_contact_id?: string | null;
    };
    const [customerRelatedData, setCustomerRelatedData] = useState<CustomerRelatedPayload | null>(null);
    const [customerRelatedLoading, setCustomerRelatedLoading] = useState(false);
    type PaymentRelatedPayload = {
        customer: { id: string; name: string | null; created_at?: string } | null;
        job: ({ id: string; title?: string | null; service_key?: string | null; job_number_for_customer?: string | null; created_at?: string; _job_label?: string | null } & Record<string, unknown>) | null;
        ledger_transactions: { id: string; occurred_at?: string; type?: string; direction?: string; amount_cents?: number; currency?: string; provider?: string; provider_ref?: string }[];
        gl_journal_lines: { id: string; entry_id: string; line_no?: number; amount_cents?: number; created_at?: string }[];
    };
    const [paymentRelatedData, setPaymentRelatedData] = useState<PaymentRelatedPayload | null>(null);
    const [paymentRelatedLoading, setPaymentRelatedLoading] = useState(false);
    type DiscountRedemptionRelatedPayload = {
        customer: { id: string; name: string | null; created_at?: string } | null;
        contact: { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null; created_at?: string } | null;
        opportunity: { id: string; name?: string | null; created_at?: string; status_key?: string | null; quote_total?: number | null } | null;
        job: ({ id: string; title?: string | null; service_key?: string | null; job_number_for_customer?: string | null; created_at?: string; _job_label?: string | null } & Record<string, unknown>) | null;
        discount_code: { id: string; code?: string | null; is_active?: boolean | null; discount_type?: string | null; discount_value?: number | null; first_job_only?: boolean | null; starts_at?: string | null; ends_at?: string | null } | null;
    };
    const [redemptionRelatedData, setRedemptionRelatedData] = useState<DiscountRedemptionRelatedPayload | null>(null);
    const [redemptionRelatedLoading, setRedemptionRelatedLoading] = useState(false);
    type VendorRelatedPayload = {
        people: { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null; _is_primary?: boolean }[];
        jobs: {
            id: string;
            created_at?: string;
            title?: string | null;
            scheduled_at?: string | null;
            job_status_id?: string | null;
            gross_price_cents?: number | null;
            recurring_total_cents?: number | null;
            opportunity_id?: string;
            display_total_cents?: number | null;
        }[];
        schedules: { id: string; job_id?: string; start_at?: string; end_at?: string; timezone?: string; status_key?: string | null; price_cents?: number | null }[];
        assignments: { id: string; schedule_id?: string; vendor_id?: string; assignment_status_id?: string | null; created_at?: string }[];
        documents: { id: string; name?: string | null; original_filename?: string | null; document_type?: string | null; status?: string | null; uploaded_at?: string | null; created_at?: string }[];
        financials_summary?: { job_count: number; total_gross_cents: number; total_display_cents?: number };
    };
    const [vendorRelatedData, setVendorRelatedData] = useState<VendorRelatedPayload | null>(null);
    const [vendorRelatedLoading, setVendorRelatedLoading] = useState(false);
    type LocationDocumentsRow = {
        id: string;
        name?: string | null;
        original_filename?: string | null;
        document_type?: string | null;
        status?: string | null;
        uploaded_at?: string | null;
        created_at?: string | null;
    };
    const [locationDocuments, setLocationDocuments] = useState<LocationDocumentsRow[]>([]);
    const [locationDocumentsLoading, setLocationDocumentsLoading] = useState(false);
    type OpportunityRelatedPayload = {
        jobs: { id: string; created_at?: string; title?: string | null; scheduled_at?: string | null; job_status_id?: string | null; customer_id?: string | null }[];
        schedules: { id: string; job_id?: string; start_at?: string; end_at?: string; timezone?: string }[];
        documents: { id: string; name?: string | null; original_filename?: string | null; document_type?: string | null; status?: string | null; uploaded_at?: string | null; created_at?: string }[];
        discount_redemptions: { id: string; created_at?: string; discount_code_id?: string; customer_id?: string; job_id?: string }[];
        quotes: { id: string; created_at?: string }[];
        messages: unknown[];
        opportunity_tags: unknown[];
    };
    const [opportunityRelatedData, setOpportunityRelatedData] = useState<OpportunityRelatedPayload | null>(null);
    const [opportunityRelatedLoading, setOpportunityRelatedLoading] = useState(false);
    type ServiceOfferingRelatedPayload = { pricing_services: Record<string, unknown>[] };
    const [offeringRelatedData, setOfferingRelatedData] = useState<ServiceOfferingRelatedPayload | null>(null);
    const [offeringRelatedLoading, setOfferingRelatedLoading] = useState(false);
    type ServicePlanTemplateRelatedPayload = { pricing_frequencies: Record<string, unknown>[] };
    const [planTemplateRelatedData, setPlanTemplateRelatedData] = useState<ServicePlanTemplateRelatedPayload | null>(null);
    const [planTemplateRelatedLoading, setPlanTemplateRelatedLoading] = useState(false);
    type AddonRelatedPayload = { jobs: unknown[]; quotes: unknown[] };
    const [addonRelatedData, setAddonRelatedData] = useState<AddonRelatedPayload | null>(null);
    const [addonRelatedLoading, setAddonRelatedLoading] = useState(false);
    type PersonRelatedPayload = {
        customer_persons: { id: string; customer_id: string; role_type?: string | null; _customer_name?: string | null; _role_label?: string | null }[];
        person_relationships: { id: string; _other_person_id: string; _other_person_name?: string | null; relationship_type?: string | null }[];
        compatibility_contacts: unknown[];
        compatibility_members: unknown[];
        linked_locations?: { location_id: string; _location_label?: string | null; is_primary?: boolean; relationship_type?: string | null }[];
        opportunities?: { id: string; name?: string | null; status_key?: string | null; job_date?: string | null; quote_total?: number | null; created_at?: string }[];
        documents?: JobRelatedPayload["documents"];
    };
    const [personRelatedData, setPersonRelatedData] = useState<PersonRelatedPayload | null>(null);
    const [personRelatedLoading, setPersonRelatedLoading] = useState(false);

    const timingEnabled =
        typeof window === "undefined"
            ? process.env.NODE_ENV !== "production"
            : process.env.NODE_ENV !== "production" || /staging|localhost|127\\.0\\.0\\.1/i.test(window.location.hostname);
    const drawerTimingStartRef = useRef<{ key: string; at: number } | null>(null);
    const drawerTimingMarksRef = useRef<Record<string, number>>({});

    const markTiming = useCallback(
        (phase: string, meta?: Record<string, unknown>) => {
            if (!timingEnabled) return;
            const start = drawerTimingStartRef.current;
            if (!start) return;
            const t = performance.now();
            drawerTimingMarksRef.current[phase] = t;
            console.info("[timing][drawer]", {
                key: start.key,
                phase,
                ms_since_open: Math.round((t - start.at) * 10) / 10,
                ...(meta ?? {}),
            });
        },
        [timingEnabled]
    );
    const STATUS_ENTITY_TYPES = [
        "customers",
        "contacts",
        "customer_members",
        "vendors",
        "opportunities",
        "jobs",
        "schedules",
        "payments",
        "persons",
        "service_plan_templates",
        "locations",
        "documents",
        "subscriptions",
    ];
    const refetch = useCallback((): Promise<void> | undefined => {
        if (!drawer.type || !drawer.id) return Promise.resolve();
        const url = buildAdminEntityFetchUrl(
            drawer.type,
            drawer.id,
            drawer.jobRecordSurface,
            drawer.type === "opportunities" ? "full" : undefined
        );
        if (!url) return Promise.resolve();
        if (adminEntityRefetchShouldBlockDrawerShell(error, data, drawer.id)) {
            setLoading(true);
        }
        const t0 = timingEnabled ? performance.now() : 0;
        if (typeof window !== "undefined" && typeof performance !== "undefined") {
            const now = performance.now();
            alloyPerfSet("drawer_entity_request_start", now);
            if (drawer.type === "opportunities") {
                alloyPerfSet("drawer_opportunity_full_req", now);
            }
        }
        return fetch(url)
            .then((res) => {
                captureDrawerEntityResponsePerf(res);
                if (!res.ok) throw new Error(res.status === 404 ? "Not found" : "Failed to load");
                if (drawer.type === "opportunities") logOpportunityEnrichHeaderFromResponse(res);
                return res.json();
            })
            .then((json) => {
                if (typeof window !== "undefined" && typeof performance !== "undefined") {
                    alloyPerfSet("drawer_entity_response", performance.now());
                }
                if (timingEnabled) {
                    const dt = performance.now() - t0;
                    console.info("[timing][drawer]", {
                        key: `${drawer.type}:${drawer.id}`,
                        phase: "record_fetch",
                        url,
                        ms: Math.round(dt * 10) / 10,
                    });
                }
                if (drawer.type === "opportunities") {
                    setOpportunityFullHydrateFailed(false);
                }
                setData(json);
                if (typeof window !== "undefined" && typeof performance !== "undefined") {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            const tap = performance.now();
                            alloyPerfSet("drawer_entity_applied", tap);
                            if (drawer.type === "opportunities") {
                                alloyPerfSet("drawer_opportunity_full_applied", tap);
                            }
                        });
                    });
                }
                if (timingEnabled && drawer.type === "opportunities" && drawer.id && drawer.id !== "new") {
                    markTiming("record_fetch_json_applied", { url });
                }
            })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [data, drawer.type, drawer.id, drawer.jobRecordSurface, error, timingEnabled, markTiming]);

    useEffect(() => {
        if (!timingEnabled) return;
        if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") {
            drawerTimingStartRef.current = null;
            drawerTimingMarksRef.current = {};
            return;
        }
        const key = `${drawer.type}:${drawer.id}`;
        drawerTimingStartRef.current = { key, at: performance.now() };
        drawerTimingMarksRef.current = {};
        console.info("[timing][drawer]", { key, phase: "open", ms_since_open: 0 });
    }, [drawer.type, drawer.id, timingEnabled]);

    useEffect(() => {
        if (!drawer.type || !drawer.id) {
            drawerReadyLoggedKeyRef.current = null;
            drawerLoadStartRef.current = null;
            return;
        }
        drawerReadyLoggedKeyRef.current = null;
        drawerLoadStartRef.current = { key: `${drawer.type}:${drawer.id}`, at: performance.now() };
        if (typeof window !== "undefined" && typeof performance !== "undefined") {
            alloyPerfSet("drawer_open_start", performance.now());
        }
    }, [drawer.type, drawer.id]);

    useEffect(() => {
        if (!drawer.type || !drawer.id || !drawerReady) return;
        const dm = entityDataMatchesDrawer(data, drawer.id);
        const overview = dm ? data : null;
        const existing =
            !!drawer.id &&
            drawer.id !== "new" &&
            !(overview && (overview as { _create?: boolean })._create);
        if (!existing) return;
        const key = `${drawer.type}:${drawer.id}`;
        if (drawerReadyLoggedKeyRef.current === key) return;
        drawerReadyLoggedKeyRef.current = key;
        if (typeof window !== "undefined" && typeof performance !== "undefined") {
            alloyPerfSet("drawer_visible_ready", performance.now());
        }
        let cancelled = false;
        const raf1 = window.requestAnimationFrame(() => {
            if (cancelled) return;
            window.requestAnimationFrame(() => {
                if (!cancelled) setPostDrawerVisibleKey(key);
            });
        });
        return () => {
            cancelled = true;
            window.cancelAnimationFrame(raf1);
        };
    }, [drawer.type, drawer.id, drawerReady, data]);

    const patchOpportunityQuote = useCallback(
        async (payload: Record<string, unknown>) => {
            if (!drawer.id || drawer.id === "new") return;
            setOppQuoteActionError(null);
            setOppQuoteActionLoading(true);
            try {
                const res = await fetch(`/api/admin/opportunities/${drawer.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                const json = (await res.json().catch(() => ({}))) as { error?: string };
                if (!res.ok) throw new Error(json.error ?? "Update failed");
                setData((prev) => (prev ? { ...prev, ...json } : prev));
                refetch();
                window.dispatchEvent(
                    new CustomEvent("adminv2:opportunity-updated", { detail: { id: drawer.id, action_key: "patch_opportunity_quote" } })
                );
            } catch (e) {
                setOppQuoteActionError(e instanceof Error ? e.message : "Update failed");
            } finally {
                setOppQuoteActionLoading(false);
            }
        },
        [drawer.id, setData, refetch, router]
    );

    useEffect(() => {
        if (drawer.type !== "opportunities") return;
        setOppPromoCode("");
        setOppQuoteActionError(null);
        setOppOverrideOpen(false);
        setOppOverrideAmount("");
        setOppOverrideReason("");
        if (!data || (data as { _create?: boolean })._create) {
            setOppDiscountSelection("");
            return;
        }
        const opp = data as { discount_program_id?: string | null; discount_code_id?: string | null };
        setOppDiscountSelection(inferOpportunityDiscountSelectionToken(opp));
    }, [
        drawer.type,
        (data as { id?: string } | null)?.id,
        (data as { discount_program_id?: string | null } | null)?.discount_program_id,
        (data as { discount_code_id?: string | null } | null)?.discount_code_id,
    ]);

    useEffect(() => {
        if (!drawer.type || !drawer.id) {
            entityDrawerTabInitKeyRef.current = "";
            opportunityFullHydrateInFlightRef.current = null;
            opportunityFullHydrateDoneRef.current = null;
            memberPersonGraphOverlayInFlightRef.current = null;
            memberPersonGraphOverlayDoneRef.current = null;
            setData(null);
            setError(null);
            setIsEditing(false);
            setDrawerTab("overview");
            setMemberDeleteConfirm(false);
            setMemberDeleting(false);
            setMemberCreateError(null);
            setMemberRelatedContacts([]);
            setMemberRelatedLoading(false);
            setMemberRelatedError(null);
            setMemberRelatedLinks([]);
            setMemberRelatedLinksLoading(false);
            setMemberRelatedRoles([]);
            setMemberLinkModalOpen(false);
            setMemberLinkRoleKey("");
            setMemberLinkContactId("");
            setMemberLinkError(null);
            setDeleteConfirmOpen(false);
            setDeletionEligibility(null);
            setMemberLinkContactOptions([]);
            setMemberUnlinkingId(null);
            setMemberRelationshipOptions([]);
            setMemberRelatedData(null);
            setMemberRelatedDataLoading(false);
            setContactCreateSaving(false);
            setContactCreateError(null);
            setPersonCreateSaving(false);
            setPersonCreateError(null);
            setPersonCreateForm({});
            setContactRelatedData(null);
        setCustomerRelatedData(null);
        setVendorRelatedData(null);
        setLocationDocuments([]);
        setOpportunityRelatedData(null);
        setPaymentRelatedData(null);
        setRedemptionRelatedData(null);
        setPersonRelatedData(null);
            setOpportunityWorkflowRuns(null);
            setOpportunityWorkflowRunsLoading(false);
            setOpportunityWorkflowRunsError(null);
            setOpportunityFullHydrateFailed(false);
            return;
        }
        const entityOpenKey = `${drawer.type}:${drawer.id}`;
        if (entityDrawerTabInitKeyRef.current !== entityOpenKey) {
            entityDrawerTabInitKeyRef.current = entityOpenKey;
            setDrawerTab("overview");
        }
        setContactRelatedData(null);
        setCustomerRelatedData(null);
        setVendorRelatedData(null);
        setLocationDocuments([]);
        setOpportunityRelatedData(null);
        setLoading(true);
        setError(null);
        setIsEditing(false);
        if (drawer.type === "opportunities" && drawer.id !== "new") {
            opportunityFullHydrateInFlightRef.current = null;
            opportunityFullHydrateDoneRef.current = null;
            memberPersonGraphOverlayInFlightRef.current = null;
            memberPersonGraphOverlayDoneRef.current = null;
            setOpportunityFullHydrateFailed(false);
        }
        if ((drawer.type === "locations" || drawer.type === "customers" || drawer.type === "opportunities" || drawer.type === "vendors" || drawer.type === "jobs" || drawer.type === "persons") && drawer.id === "new") {
            setData({ _create: true });
            setLoading(false);
            setIsEditing(true);
            return;
        }
        const url = buildAdminEntityFetchUrl(drawer.type, drawer.id, drawer.jobRecordSurface);
        if (!url) return;
        if (typeof window !== "undefined" && typeof performance !== "undefined") {
            const now = performance.now();
            alloyPerfSet("drawer_entity_request_start", now);
            if (drawer.type === "opportunities") alloyPerfSet("drawer_opportunity_visible_req", now);
        }
        fetch(url)
            .then((res) => {
                captureDrawerEntityResponsePerf(res);
                if (!res.ok) throw new Error(res.status === 404 ? "Not found" : "Failed to load");
                if (drawer.type === "opportunities") logOpportunityEnrichHeaderFromResponse(res);
                return res.json();
            })
            .then((json) => {
                if (typeof window !== "undefined" && typeof performance !== "undefined") {
                    alloyPerfSet("drawer_entity_response", performance.now());
                }
                setData(json);
                if (typeof window !== "undefined" && typeof performance !== "undefined") {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            const t = performance.now();
                            alloyPerfSet("drawer_entity_applied", t);
                            if (
                                drawer.type === "opportunities" &&
                                (json as { _record_surface?: string })._record_surface === "drawer_visible"
                            ) {
                                alloyPerfSet("drawer_opportunity_visible_applied", t);
                            }
                        });
                    });
                }
            })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    // pathname read only when entity identity changes (see entityDrawerTabInitKeyRef); omit from deps so tab is not reset on SPA navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drawer.type, drawer.id, drawer.jobRecordSurface]);

    useEffect(() => {
        if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") return;
        if (!opportunityRecordHydrationPending) return;
        if (opportunityFullHydrateDoneRef.current === drawer.id) return;
        if (opportunityFullHydrateInFlightRef.current === drawer.id) return;
        const url = buildAdminEntityFetchUrl(drawer.type, drawer.id, drawer.jobRecordSurface, "full");
        if (!url) return;
        opportunityFullHydrateInFlightRef.current = drawer.id;
        const ac = new AbortController();
        if (typeof window !== "undefined" && typeof performance !== "undefined") {
            alloyPerfSet("drawer_opportunity_full_req", performance.now());
        }
        fetch(url, { signal: ac.signal })
            .then((res) => {
                captureDrawerEntityResponsePerf(res);
                if (!res.ok) throw new Error(res.status === 404 ? "Not found" : "Failed to load");
                logOpportunityEnrichHeaderFromResponse(res);
                return res.json();
            })
            .then((json) => {
                if (String((json as { id?: unknown }).id ?? "") !== String(drawer.id)) return;
                opportunityFullHydrateInFlightRef.current = null;
                opportunityFullHydrateDoneRef.current = drawer.id;
                setOpportunityFullHydrateFailed(false);
                setData((prev) => {
                    if (!prev || String((prev as { id?: unknown }).id ?? "") !== String(drawer.id)) {
                        const fresh = { ...(json as Record<string, unknown>) };
                        fresh._record_surface = "full";
                        return fresh;
                    }
                    const merged = mergeOpportunityFullHydrate(prev as Record<string, unknown>, json as Record<string, unknown>);
                    merged._record_surface = "full";
                    return merged;
                });
                if (typeof window !== "undefined" && typeof performance !== "undefined") {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            alloyPerfSet("drawer_opportunity_full_applied", performance.now());
                        });
                    });
                }
            })
            .catch((e) => {
                opportunityFullHydrateInFlightRef.current = null;
                if (e instanceof Error && e.name === "AbortError") return;
                opportunityFullHydrateDoneRef.current = drawer.id;
                setOpportunityFullHydrateFailed(true);
            });
        return () => {
            ac.abort();
            if (opportunityFullHydrateInFlightRef.current === drawer.id) {
                opportunityFullHydrateInFlightRef.current = null;
            }
        };
    }, [drawer.type, drawer.id, drawer.jobRecordSurface, opportunityRecordHydrationPending]);

    useEffect(() => {
        if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") return;
        if (!data || typeof data !== "object") return;
        if (String((data as { id?: unknown }).id ?? "") !== String(drawer.id)) return;
        const s = String((data as { _record_surface?: string })._record_surface ?? "").trim();
        if (!(s === "full" || s === "drawer_initial")) return;
        if ((data as { _member_person_graph_pending?: unknown })._member_person_graph_pending !== true) return;
        if (memberPersonGraphOverlayDoneRef.current === drawer.id) return;
        if (memberPersonGraphOverlayInFlightRef.current === drawer.id) return;
        const url = buildAdminEntityFetchUrl(drawer.type, drawer.id, drawer.jobRecordSurface, "relationship_member_persons");
        if (!url) return;
        memberPersonGraphOverlayInFlightRef.current = drawer.id;
        const ac = new AbortController();
        fetch(url, { signal: ac.signal })
            .then((res) => {
                captureDrawerEntityResponsePerf(res);
                if (!res.ok) throw new Error(String(res.status));
                logOpportunityEnrichHeaderFromResponse(res);
                return res.json();
            })
            .then((json) => {
                if (String((json as { id?: unknown }).id ?? "") !== String(drawer.id)) {
                    memberPersonGraphOverlayInFlightRef.current = null;
                    return;
                }
                memberPersonGraphOverlayInFlightRef.current = null;
                memberPersonGraphOverlayDoneRef.current = drawer.id;
                setData((prev) => {
                    if (!prev || String((prev as { id?: unknown }).id ?? "") !== String(drawer.id)) {
                        return prev;
                    }
                    const merged = mergeOpportunityFullHydrate(prev as Record<string, unknown>, json as Record<string, unknown>);
                    const prevSurf = String((prev as { _record_surface?: string })._record_surface ?? "full").trim();
                    merged._record_surface = prevSurf || "full";
                    return merged;
                });
            })
            .catch((e) => {
                memberPersonGraphOverlayInFlightRef.current = null;
                if (e instanceof Error && e.name === "AbortError") return;
            });
        return () => {
            ac.abort();
            if (memberPersonGraphOverlayInFlightRef.current === drawer.id) {
                memberPersonGraphOverlayInFlightRef.current = null;
            }
        };
        // Depends on merged opportunity record (full + pending gate); refs prevent duplicate overlays.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- gate on hydrated record blob, not unrelated drawer state.
    }, [drawer.type, drawer.id, drawer.jobRecordSurface, data]);

    useEffect(() => {
        if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") return;
        const visKey = `${drawer.type}:${drawer.id}`;
        if (postDrawerVisibleKey !== visKey) return;
        prefetchWorkspaceChildcareInquiryOptionSets();
    }, [drawer.type, drawer.id, postDrawerVisibleKey]);

    useEffect(() => {
        if (drawerTab !== "activity") return;
        if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") return;
        let cancelled = false;
        (async () => {
            try {
                setOpportunityWorkflowRunsLoading(true);
                setOpportunityWorkflowRunsError(null);
                setOpportunityActivityLoading(true);
                setOpportunityActivityError(null);
                const qsRuns = new URLSearchParams({
                    entity_type: "opportunity",
                    entity_id: String(drawer.id),
                    limit: "10",
                    range: "30d",
                });
                const qsAct = new URLSearchParams({
                    entity_type: "opportunities",
                    entity_id: String(drawer.id),
                    limit: "100",
                });
                const [resRuns, resAct] = await Promise.all([
                    fetch(`/api/admin/workflow-runs?${qsRuns.toString()}`, { credentials: "include" }),
                    fetch(`/api/admin/activity?${qsAct.toString()}`, { credentials: "include" }),
                ]);
                const jRuns = (await resRuns.json().catch(() => ({}))) as { runs?: WorkflowRunPreviewRow[]; error?: string };
                const jAct = (await resAct.json().catch(() => ({}))) as {
                    events?: OpportunityActivityEventRow[];
                    error?: string;
                };
                if (!resRuns.ok && !cancelled) {
                    setOpportunityWorkflowRuns(null);
                    setOpportunityWorkflowRunsError(jRuns.error ?? "Failed to load workflow runs");
                } else if (!cancelled) {
                    setOpportunityWorkflowRuns(Array.isArray(jRuns.runs) ? jRuns.runs : []);
                }
                if (!resAct.ok && !cancelled) {
                    setOpportunityActivityEvents(null);
                    setOpportunityActivityError(jAct.error ?? "Failed to load activity");
                } else if (!cancelled) {
                    setOpportunityActivityEvents(Array.isArray(jAct.events) ? jAct.events : []);
                }
            } catch (e) {
                if (!cancelled) {
                    setOpportunityWorkflowRuns(null);
                    setOpportunityWorkflowRunsError(e instanceof Error ? e.message : "Failed to load workflow runs");
                    setOpportunityActivityEvents(null);
                    setOpportunityActivityError(e instanceof Error ? e.message : "Failed to load activity");
                }
            } finally {
                if (!cancelled) {
                    setOpportunityWorkflowRunsLoading(false);
                    setOpportunityActivityLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [drawer.id, drawer.type, drawerTab, opportunityActivitySignalNonce]);

    useEffect(() => {
        if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") {
            setOpportunityActivitySignal(null);
            setOpportunityActivitySignalLoading(false);
            return;
        }
        const visKey = `${drawer.type}:${drawer.id}`;
        if (postDrawerVisibleKey !== visKey) {
            setOpportunityActivitySignal(null);
            setOpportunityActivitySignalLoading(false);
            return;
        }
        let cancelled = false;
        setOpportunityActivitySignalLoading(true);
        const run = () => {
            if (cancelled) return;
            fetch(`/api/admin/opportunities/${encodeURIComponent(String(drawer.id))}/activity-signal`, {
                credentials: "include",
            })
                .then((res) => (res.ok ? res.json() : null))
                .then((json: ActivitySignalResult | null) => {
                    if (cancelled || !json || typeof json !== "object") {
                        if (!cancelled) setOpportunityActivitySignal(null);
                        return;
                    }
                    setOpportunityActivitySignal(json);
                })
                .catch(() => {
                    if (!cancelled) setOpportunityActivitySignal(null);
                })
                .finally(() => {
                    if (!cancelled) setOpportunityActivitySignalLoading(false);
                });
        };
        const useIdle = typeof requestIdleCallback !== "undefined";
        const idleHandle = useIdle ? requestIdleCallback(run, { timeout: 2500 }) : 0;
        const timeoutHandle = useIdle ? null : window.setTimeout(run, 0);
        return () => {
            cancelled = true;
            if (useIdle && typeof cancelIdleCallback !== "undefined") {
                cancelIdleCallback(idleHandle);
            } else if (timeoutHandle != null) {
                window.clearTimeout(timeoutHandle);
            }
        };
    }, [drawer.type, drawer.id, opportunityActivitySignalNonce, postDrawerVisibleKey]);

    useEffect(() => {
        if (!drawer.type || !drawer.id || drawer.id === "new" || !canHardDeleteEntityType(drawer.type)) {
            setDeletionEligibility(null);
            setDeletionEligibilityLoading(false);
            return;
        }
        const visKey = `${drawer.type}:${drawer.id}`;
        if (postDrawerVisibleKey !== visKey) {
            setDeletionEligibility(null);
            setDeletionEligibilityLoading(false);
            return;
        }
        setDeletionEligibilityLoading(true);
        const params = new URLSearchParams({ entity_type: drawer.type, id: drawer.id });
        fetch(`/api/admin/deletion-eligibility?${params.toString()}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((json: DeletionEligibility | null) => {
                setDeletionEligibility(json ?? null);
            })
            .catch(() => setDeletionEligibility(null))
            .finally(() => setDeletionEligibilityLoading(false));
    }, [drawer.type, drawer.id, postDrawerVisibleKey]);

    useEffect(() => {
        if (drawer.type !== "contacts" || !drawer.id || drawer.id === "new") {
            setContactRelatedData(null);
            return;
        }
        if ((drawerTab === "related" || drawerTab === "documents" || drawerTab === "activity") && !contactRelatedData) {
            setContactRelatedLoading(true);
            fetch(`/api/admin/related/contact/${drawer.id}`)
                .then((r) => (r.ok ? r.json() : null))
                .then((json: ContactRelatedPayload | null) => setContactRelatedData(json ?? null))
                .catch(() => setContactRelatedData(null))
                .finally(() => setContactRelatedLoading(false));
        }
    }, [drawer.type, drawer.id, drawerTab, contactRelatedData]);

    useEffect(() => {
        if (drawer.type !== "persons" || !drawer.id || drawer.id === "new") {
            setPersonRelatedData(null);
            return;
        }
        if ((drawerTab === "related" || drawerTab === "documents") && !personRelatedData) {
            setPersonRelatedLoading(true);
            fetch(`/api/admin/related/person/${drawer.id}`)
                .then((r) => (r.ok ? r.json() : null))
                .then((json: PersonRelatedPayload | null) => setPersonRelatedData(json ?? null))
                .catch(() => setPersonRelatedData(null))
                .finally(() => setPersonRelatedLoading(false));
        }
    }, [drawer.type, drawer.id, drawerTab, personRelatedData]);

    useEffect(() => {
        if (drawer.type !== "customers" || !drawer.id) {
            setCustomerRelatedData(null);
            return;
        }
        if ((drawerTab === "related" || drawerTab === "payments" || drawerTab === "documents") && !customerRelatedData) {
            setCustomerRelatedLoading(true);
            fetch(`/api/admin/related/customer/${drawer.id}`)
                .then((r) => (r.ok ? r.json() : null))
                .then((json: CustomerRelatedPayload | null) => setCustomerRelatedData(json ?? null))
                .catch(() => setCustomerRelatedData(null))
                .finally(() => setCustomerRelatedLoading(false));
        }
    }, [drawer.type, drawer.id, drawerTab, customerRelatedData]);

    useEffect(() => {
        if (drawer.type !== "payments" || !drawer.id) {
            setPaymentRelatedData(null);
            return;
        }
        if ((drawerTab === "related" || drawerTab === "activity" || drawerTab === "ledger") && !paymentRelatedData) {
            setPaymentRelatedLoading(true);
            fetch(`/api/admin/related/payment/${drawer.id}`)
                .then((r) => (r.ok ? r.json() : null))
                .then((json: PaymentRelatedPayload | null) => setPaymentRelatedData(json ?? null))
                .catch(() => setPaymentRelatedData(null))
                .finally(() => setPaymentRelatedLoading(false));
        }
    }, [drawer.type, drawer.id, drawerTab, paymentRelatedData]);

    useEffect(() => {
        if (drawer.type !== "discount_redemptions" || !drawer.id) {
            setRedemptionRelatedData(null);
            return;
        }
        if ((drawerTab === "related" || drawerTab === "activity") && !redemptionRelatedData) {
            setRedemptionRelatedLoading(true);
            fetch(`/api/admin/related/discount_redemption/${drawer.id}`)
                .then((r) => (r.ok ? r.json() : null))
                .then((json: DiscountRedemptionRelatedPayload | null) => setRedemptionRelatedData(json ?? null))
                .catch(() => setRedemptionRelatedData(null))
                .finally(() => setRedemptionRelatedLoading(false));
        }
    }, [drawer.type, drawer.id, drawerTab, redemptionRelatedData]);

    useEffect(() => {
        if (drawer.type !== "vendors" || !drawer.id) {
            setVendorRelatedData(null);
            return;
        }
        if ((drawerTab === "related" || drawerTab === "documents" || drawerTab === "financials") && !vendorRelatedData) {
            setVendorRelatedLoading(true);
            fetch(`/api/admin/related/vendor/${drawer.id}`)
                .then((r) => (r.ok ? r.json() : null))
                .then((json: VendorRelatedPayload | null) =>
                    setVendorRelatedData(json ? { ...json, documents: json.documents ?? [] } : null)
                )
                .catch(() => setVendorRelatedData(null))
                .finally(() => setVendorRelatedLoading(false));
        }
    }, [drawer.type, drawer.id, drawerTab, vendorRelatedData]);

    const refetchVendorRelated = useCallback(() => {
        if (drawer.type !== "vendors" || !drawer.id || drawer.id === "new") return;
        setVendorRelatedLoading(true);
        fetch(`/api/admin/related/vendor/${drawer.id}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((json: VendorRelatedPayload | null) =>
                setVendorRelatedData(json ? { ...json, documents: json.documents ?? [] } : null)
            )
            .catch(() => setVendorRelatedData(null))
            .finally(() => setVendorRelatedLoading(false));
    }, [drawer.type, drawer.id]);

    useEffect(() => {
        if (drawer.type !== "locations" || !drawer.id || drawer.id === "new") {
            setLocationDocuments([]);
            return;
        }
        if (drawerTab !== "documents") return;
        let cancelled = false;
        setLocationDocumentsLoading(true);
        fetch(`/api/admin/related/location/${drawer.id}`)
            .then((r) => (r.ok ? r.json() : { documents: [] }))
            .then((json: { documents?: LocationDocumentsRow[] }) => {
                if (!cancelled) setLocationDocuments(json.documents ?? []);
            })
            .catch(() => {
                if (!cancelled) setLocationDocuments([]);
            })
            .finally(() => {
                if (!cancelled) setLocationDocumentsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [drawer.type, drawer.id, drawerTab]);

    useEffect(() => {
        if (drawer.type !== "opportunities" || !drawer.id) {
            setOpportunityRelatedData(null);
            return;
        }
        if ((drawerTab === "related" || drawerTab === "documents") && !opportunityRelatedData) {
            setOpportunityRelatedLoading(true);
            fetch(`/api/admin/related/opportunity/${drawer.id}`)
                .then((r) => (r.ok ? r.json() : null))
                .then((json: OpportunityRelatedPayload | null) => setOpportunityRelatedData(json ?? null))
                .catch(() => setOpportunityRelatedData(null))
                .finally(() => setOpportunityRelatedLoading(false));
        }
    }, [drawer.type, drawer.id, drawerTab, opportunityRelatedData]);

    useEffect(() => {
        if (drawer.type !== "opportunities" || !data || (data as { _create?: boolean })._create || drawer.id === "new") {
            setOppRefFieldSelectOptions({});
            return;
        }
        const visKey = `${drawer.type}:${drawer.id}`;
        if (postDrawerVisibleKey !== visKey) {
            setOppRefFieldSelectOptions({});
            return;
        }
        if (!entityRowReady) {
            setOppRefFieldSelectOptions({});
            return;
        }
        let cancelled = false;
        const d = data as Record<string, unknown>;
        const customerId = typeof d.customer_id === "string" && d.customer_id.trim() ? d.customer_id.trim() : null;
        const personQs = customerId ? `?customer_id=${encodeURIComponent(customerId)}` : "";
        const init = workspaceDataFetchInit();
        (async () => {
            try {
                const [locRes, personRes] = await Promise.all([
                    dedupeAdminFetchWithTtl("/api/admin/location-options", init, 1500),
                    dedupeAdminFetchWithTtl(`/api/admin/person-options${personQs}`, init, 1500),
                ]);
                const locJ = (await locRes.json().catch(() => ({}))) as { locations?: { id: string; label: string }[] };
                const personJ = (await personRes.json().catch(() => ({}))) as { persons?: { id: string; label: string }[] };
                if (cancelled) return;
                const out: Record<string, { value: string; label: string }[]> = {};
                const locOpts = ((locJ.locations ?? []) as { id: string; label: string }[]).map((x) => ({
                    value: x.id,
                    label: (x.label && String(x.label).trim()) || `${x.id.slice(0, 8)}…`,
                }));
                const locId = String(d.location_id ?? "").trim();
                if (locId && !locOpts.some((o) => o.value === locId)) {
                    const nm = String(d._location_name ?? "").trim();
                    locOpts.unshift({ value: locId, label: nm || `${locId.slice(0, 8)}…` });
                }
                out.location_id = locOpts;

                const pOpts = ((personJ.persons ?? []) as { id: string; label: string }[]).map((x) => ({
                    value: x.id,
                    label: (x.label && String(x.label).trim()) || `${x.id.slice(0, 8)}…`,
                }));
                const pid = String(d.primary_person_id ?? "").trim();
                if (pid && !pOpts.some((o) => o.value === pid)) {
                    const nm = String(d._primary_person_name ?? "").trim();
                    pOpts.unshift({ value: pid, label: nm || `${pid.slice(0, 8)}…` });
                }
                out.primary_person_id = pOpts;

                const [coRes, custRes] = await Promise.all([
                    customerId
                        ? dedupeAdminFetchWithTtl(
                              `/api/admin/contact-options?customer_id=${encodeURIComponent(customerId)}`,
                              init,
                              1500
                          )
                        : Promise.resolve(new Response(JSON.stringify({ contacts: [] }), { status: 200 })),
                    dedupeAdminFetchWithTtl("/api/admin/customer-options", init, 1500),
                ]);
                const coJ = (await coRes.json().catch(() => ({}))) as { contacts?: { id: string; label: string }[] };
                const custJ = (await custRes.json().catch(() => ({}))) as { customers?: { id: string; name?: string | null }[] };
                if (cancelled) return;
                const cOpts = ((coJ.contacts ?? []) as { id: string; label: string }[]).map((x) => ({
                    value: x.id,
                    label: (x.label && String(x.label).trim()) || `${x.id.slice(0, 8)}…`,
                }));
                const ctid = String(d.primary_contact_id ?? "").trim();
                if (ctid && !cOpts.some((o) => o.value === ctid)) {
                    const nm = String(d._primary_contact_name ?? d._contact_name ?? "").trim();
                    cOpts.unshift({ value: ctid, label: nm || `${ctid.slice(0, 8)}…` });
                }
                out.primary_contact_id = cOpts;

                const custOpts = ((custJ.customers ?? []) as { id: string; name?: string | null }[]).map((x) => ({
                    value: x.id,
                    label: (x.name && String(x.name).trim()) || `${x.id.slice(0, 8)}…`,
                }));
                const curCust = String(d.customer_id ?? "").trim();
                if (curCust && !custOpts.some((o) => o.value === curCust)) {
                    const nm = String(d._customer_name ?? "").trim();
                    custOpts.unshift({ value: curCust, label: nm || `${curCust.slice(0, 8)}…` });
                }
                out.customer_id = custOpts;

                setOppRefFieldSelectOptions(out);
            } catch {
                if (!cancelled) setOppRefFieldSelectOptions({});
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [drawer.type, drawer.id, data, entityRowReady, postDrawerVisibleKey]);

    useEffect(() => {
        if (drawer.type !== "opportunities" || !data || (data as { _create?: boolean })._create || drawer.id === "new") {
            setOppPipelineStageOptions([]);
            return;
        }
        const visKey = `${drawer.type}:${drawer.id}`;
        if (postDrawerVisibleKey !== visKey) {
            setOppPipelineStageOptions([]);
            return;
        }
        if (!entityRowReady) {
            setOppPipelineStageOptions([]);
            return;
        }
        const pipelineId = (data as { pipeline_id?: string | null }).pipeline_id;
        if (!pipelineId || typeof pipelineId !== "string" || !pipelineId.trim()) {
            setOppPipelineStageOptions([]);
            return;
        }
        let cancelled = false;
        const init = workspaceDataFetchInit();
        dedupeAdminFetchWithTtl(
            `/api/admin/pipeline-stages?pipeline_id=${encodeURIComponent(pipelineId.trim())}`,
            init,
            1500
        )
            .then((r) => (r.ok ? r.json() : []))
            .then((rows: { id: string; name?: string | null }[]) => {
                if (cancelled) return;
                setOppPipelineStageOptions(
                    (Array.isArray(rows) ? rows : []).map((s) => ({
                        value: s.id,
                        label: (s.name && String(s.name).trim()) || `${s.id.slice(0, 8)}…`,
                    }))
                );
            })
            .catch(() => {
                if (!cancelled) setOppPipelineStageOptions([]);
            });
        return () => {
            cancelled = true;
        };
    }, [drawer.type, drawer.id, data, entityRowReady, postDrawerVisibleKey]);

    useEffect(() => {
        if (drawer.type !== "service_offerings" || !drawer.id) {
            setOfferingRelatedData(null);
            return;
        }
        if (drawerTab === "related" && !offeringRelatedData) {
            setOfferingRelatedLoading(true);
            fetch(`/api/admin/related/service_offering/${drawer.id}`)
                .then((r) => (r.ok ? r.json() : null))
                .then((json: ServiceOfferingRelatedPayload | null) => setOfferingRelatedData(json ?? null))
                .catch(() => setOfferingRelatedData(null))
                .finally(() => setOfferingRelatedLoading(false));
        }
    }, [drawer.type, drawer.id, drawerTab, offeringRelatedData]);

    useEffect(() => {
        if (drawer.type !== "service_plan_templates" || !drawer.id) {
            setPlanTemplateRelatedData(null);
            return;
        }
        if (drawerTab === "related" && !planTemplateRelatedData) {
            setPlanTemplateRelatedLoading(true);
            fetch(`/api/admin/related/service_plan_template/${drawer.id}`)
                .then((r) => (r.ok ? r.json() : null))
                .then((json: ServicePlanTemplateRelatedPayload | null) => setPlanTemplateRelatedData(json ?? null))
                .catch(() => setPlanTemplateRelatedData(null))
                .finally(() => setPlanTemplateRelatedLoading(false));
        }
    }, [drawer.type, drawer.id, drawerTab, planTemplateRelatedData]);

    useEffect(() => {
        if (drawer.type !== "addons" || !drawer.id) {
            setAddonRelatedData(null);
            return;
        }
        if (drawerTab === "related" && !addonRelatedData) {
            setAddonRelatedLoading(true);
            fetch(`/api/admin/related/addon/${drawer.id}`)
                .then((r) => (r.ok ? r.json() : null))
                .then((json: AddonRelatedPayload | null) => setAddonRelatedData(json ?? null))
                .catch(() => setAddonRelatedData(null))
                .finally(() => setAddonRelatedLoading(false));
        }
    }, [drawer.type, drawer.id, drawerTab, addonRelatedData]);

    useEffect(() => {
        if (drawer.type !== "jobs" || !drawer.id || drawer.id === "new") {
            setJobSchedules([]);
            setJobRelatedData(null);
            setRescheduleForm(null);
            setJobVendorsForAssign([]);
            setJobAssignedVendorId(null);
            setJobPayments([]);
            return;
        }
        if (!entityRowReady) {
            setJobSchedules([]);
            setJobRelatedData(null);
            setRescheduleForm(null);
            setJobVendorsForAssign([]);
            setJobRelatedLoading(true);
            return;
        }
        setJobRelatedLoading(true);
        fetch(`/api/admin/related/job/${drawer.id}`)
            .then((res) => res.ok ? res.json() : { schedules: [], opportunity: null, messages: [], discounts: [], documents: [] })
            .then((json: { schedules?: { id: string; job_id?: string; start_at: string; end_at: string; timezone: string }[]; opportunity?: { id: string; name?: string | null; created_at?: string; status_key?: string | null; quote_total?: number | null } | null; messages?: unknown[]; discounts?: { id: string; created_at?: string; _code?: string | null }[]; documents?: { id: string; name?: string | null; original_filename?: string | null; document_type?: string | null; status?: string | null; uploaded_at?: string | null; created_at?: string }[] }) => {
                const opp = json.opportunity && typeof (json.opportunity as { id?: string }).id === "string" ? json.opportunity : null;
                setJobRelatedData({
                    schedules: json.schedules ?? [],
                    opportunity: opp,
                    messages: json.messages ?? [],
                    discounts: (json.discounts ?? []) as JobRelatedPayload["discounts"],
                    documents: (json.documents ?? []) as JobRelatedPayload["documents"],
                });
                setJobSchedules((json.schedules ?? []) as { id: string; job_id: string; start_at: string; end_at: string; timezone: string }[]);
            })
            .catch(() => { setJobSchedules([]); setJobRelatedData(null); })
            .finally(() => setJobRelatedLoading(false));
        const normalizeVendorOptions = (list: AdminVendorSelectOption[]): AdminVendorSelectOption[] =>
            list.map((v) => ({
                ...v,
                label: v.label ?? formatVendorOptionLabel({ id: v.id, name: v.name }),
            }));
        fetch(`/api/admin/jobs/${drawer.id}/vendors-for-assign`)
            .then((res) => (res.ok ? res.json() : { vendors: [] }))
            .then((json: { vendors?: AdminVendorSelectOption[] }) => setJobVendorsForAssign(normalizeVendorOptions(json.vendors ?? [])))
            .catch(() => setJobVendorsForAssign([]));
    }, [drawer.type, drawer.id, entityRowReady]);

    useEffect(() => {
        if (drawer.type !== "vendors" || !drawer.id || drawer.id === "new") {
            setVendorPrimaryPersonOptions([]);
            return;
        }
        fetch("/api/admin/persons?limit=500")
            .then((r) => (r.ok ? r.json() : { persons: [] }))
            .then((j: { persons?: { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; _person_name?: string | null }[] }) => {
                const persons = j.persons ?? [];
                setVendorPrimaryPersonOptions(
                    persons.map((p) => ({
                        value: p.id,
                        label: (p._person_name?.trim() || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || p.id.slice(0, 8)).trim(),
                    }))
                );
            })
            .catch(() => setVendorPrimaryPersonOptions([]));
    }, [drawer.type, drawer.id]);

    const refetchJobRelatedData = useCallback(() => {
        if (drawer.type !== "jobs" || !drawer.id || drawer.id === "new") return;
        setJobRelatedLoading(true);
        fetch(`/api/admin/related/job/${drawer.id}`)
            .then((res) => (res.ok ? res.json() : { schedules: [], opportunity: null, messages: [], discounts: [], documents: [] }))
            .then((json: { schedules?: { id: string; job_id?: string; start_at: string; end_at: string; timezone: string }[]; opportunity?: { id: string; name?: string | null; created_at?: string; status_key?: string | null; quote_total?: number | null } | null; messages?: unknown[]; discounts?: { id: string; created_at?: string; _code?: string | null }[]; documents?: { id: string; name?: string | null; original_filename?: string | null; document_type?: string | null; status?: string | null; uploaded_at?: string | null; created_at?: string }[] }) => {
                const opp = json.opportunity && typeof (json.opportunity as { id?: string }).id === "string" ? json.opportunity : null;
                setJobRelatedData({
                    schedules: json.schedules ?? [],
                    opportunity: opp,
                    messages: json.messages ?? [],
                    discounts: (json.discounts ?? []) as JobRelatedPayload["discounts"],
                    documents: (json.documents ?? []) as JobRelatedPayload["documents"],
                });
                setJobSchedules((json.schedules ?? []) as { id: string; job_id: string; start_at: string; end_at: string; timezone: string }[]);
            })
            .catch(() => {
                setJobSchedules([]);
                setJobRelatedData(null);
            })
            .finally(() => setJobRelatedLoading(false));
    }, [drawer.type, drawer.id]);

    const paymentParentJobId = useMemo(() => {
        if (!drawer.id || drawer.id === "new") return null;
        if (drawer.type === "jobs") return drawer.id;
        if (drawer.type === "schedules" && data && !(data as { _create?: boolean })._create) {
            const jid = (data as { job_id?: string | null }).job_id;
            return jid && String(jid).trim() ? String(jid).trim() : null;
        }
        return null;
    }, [drawer.type, drawer.id, data]);

    const refetchJobPayments = useCallback(() => {
        if (!paymentParentJobId) return;
        setJobPaymentsLoading(true);
        setJobPaymentsFetchError(null);
        fetch(`/api/admin/jobs/${paymentParentJobId}/payments`)
            .then(async (res) => {
                const raw = await res.text();
                let json: { payments?: JobPaymentRowUi[]; payment_summary?: JobPaymentsSummaryFromApi; error?: string } = {};
                try {
                    json = raw ? (JSON.parse(raw) as typeof json) : {};
                } catch {
                    setJobPayments([]);
                    setJobPaymentSummaryFromApi(null);
                    setJobPaymentsFetchError("Invalid response from payments API.");
                    return;
                }
                if (!res.ok) {
                    setJobPayments([]);
                    setJobPaymentSummaryFromApi(null);
                    setJobPaymentsFetchError(json.error ?? `Payments unavailable (${res.status}).`);
                    return;
                }
                if (json.payment_summary == null || typeof json.payment_summary !== "object") {
                    setJobPayments([]);
                    setJobPaymentSummaryFromApi(null);
                    setJobPaymentsFetchError("Payment summary missing from server response.");
                    return;
                }
                setJobPayments(json.payments ?? []);
                setJobPaymentSummaryFromApi(json.payment_summary);
            })
            .catch(() => {
                setJobPayments([]);
                setJobPaymentSummaryFromApi(null);
                setJobPaymentsFetchError("Could not load payments.");
            })
            .finally(() => setJobPaymentsLoading(false));
    }, [paymentParentJobId]);

    useEffect(() => {
        if (!paymentParentJobId) {
            setJobPayments([]);
            setJobPaymentSummaryFromApi(null);
            setJobPaymentsFetchError(null);
            return;
        }
        refetchJobPayments();
    }, [paymentParentJobId, refetchJobPayments]);

    const openCollectPayment = useCallback(() => {
        if (drawer.type === "jobs" && drawer.id && drawer.id !== "new" && data && !(data as { _create?: boolean })._create) {
            const d = data as { title?: string | null };
            setCollectPaymentContext({
                jobId: drawer.id,
                jobLabel: String(d.title ?? "").trim() || undefined,
            });
            setCollectPaymentOpen(true);
            return;
        }
        if (
            drawer.type === "schedules" &&
            paymentParentJobId &&
            drawer.id &&
            drawer.id !== "new" &&
            data &&
            !(data as { _create?: boolean })._create
        ) {
            const d = data as { start_at?: string | null; _job_title?: string | null };
            setCollectPaymentContext({
                jobId: paymentParentJobId,
                scheduleId: drawer.id,
                scheduleLabel: d.start_at ? displayDateTime(d.start_at) : undefined,
                jobLabel: String(d._job_title ?? "").trim() || undefined,
            });
            setCollectPaymentOpen(true);
        }
    }, [drawer.type, drawer.id, data, paymentParentJobId, displayDateTime]);

    const handleRecordChromeJobAction = useCallback(
        (eventKey: string) => {
            if (eventKey === "collect_payment") {
                setPaymentToast(null);
                openCollectPayment();
                return;
            }
            if (eventKey === "assign_vendor") {
                setJobExpandedSections((s) => ({ ...s, relationships: true }));
                requestAnimationFrame(() => {
                    document.getElementById("job-assign-vendor-section")?.scrollIntoView({
                        behavior: "smooth",
                        block: "nearest",
                    });
                });
            }
        },
        [openCollectPayment]
    );

    const handleOpportunityRecordChromeAction = useCallback(
        async (eventKey: string) => {
            if (!drawer.id || drawer.id === "new" || drawer.type !== "opportunities") return;
            if (eventKey === "start_quote") {
                setSaveError(null);
                setOppQuoteIntakeOpen(true);
                return;
            }
            setOpportunityActionLoading(eventKey);
            setSaveError(null);
            try {
                const result = await executeOpportunityRecordAction({ opportunityId: drawer.id, eventKey });
                if (!result.ok) {
                    setSaveError(result.error);
                    return;
                }
                setData((prev) =>
                    prev && typeof prev === "object" ? { ...prev, ...(result.data as Record<string, unknown>) } : prev
                );
                refetch();
                window.dispatchEvent(
                    new CustomEvent("adminv2:opportunity-updated", { detail: { id: drawer.id, action_key: eventKey } })
                );
            } catch (e) {
                setSaveError(e instanceof Error ? e.message : "Action failed");
            } finally {
                setOpportunityActionLoading(null);
            }
        },
        [drawer.id, drawer.type, refetch, router]
    );

    const handleResolvedOpportunityHeaderAction = useCallback(
        async (a: ResolvedActionForClient) => {
            if (!drawer.id || drawer.id === "new" || drawer.type !== "opportunities") return;
            if (a.action_type === "open_form") {
                const formKey = a.payload?.form_key != null ? String(a.payload.form_key).trim() : "";
                if (formKey) setActionFormState({ form_key: formKey, action: a, executeContext: { surface: "record_header" } });
                return;
            }
            if (a.action_type === "navigate") {
                const href = a.payload?.href != null ? String(a.payload.href) : "";
                if (href) router.push(href);
                return;
            }
            if (a.action_type === "external_link") {
                const href = a.payload?.href != null ? String(a.payload.href) : "";
                if (href) window.open(href, "_blank", "noopener,noreferrer");
                return;
            }
            if (a.action_type === "open_drawer") {
                const d =
                    a.payload?.drawer && typeof a.payload.drawer === "object"
                        ? (a.payload.drawer as Record<string, unknown>)
                        : {};
                const defSurf = d.defaultSurface != null ? String(d.defaultSurface) : null;
                if (defSurf === "quote_intake" || a.key === "start_quote") {
                    setSaveError(null);
                    setOppQuoteIntakeOpen(true);
                    return;
                }
                openDrawer({ type: "opportunities", id: drawer.id });
                return;
            }
            if (a.action_type === "ui_intent") {
                const workUnitIdForCtx =
                    data && typeof data === "object" && (data as { work_unit_id?: unknown }).work_unit_id != null
                        ? String((data as { work_unit_id?: unknown }).work_unit_id)
                        : null;
                const departmentIdForCtx =
                    (drawer.opportunityWorkspaceContext?.department_id ?? "").trim() ||
                    (opportunityWorkUnitDepartmentId?.trim() ?? "") ||
                    (data && typeof data === "object" && String((data as { id?: unknown }).id ?? "") === String(drawer.id)
                        ? String((data as { _work_unit_department_id?: unknown })._work_unit_department_id ?? "").trim()
                        : "") ||
                    null;
                await applyRegistryResolvedActionClient(a, {
                    router,
                    openDrawer,
                    openForm: (opts) =>
                        setActionFormState({
                            form_key: opts.form_key,
                            action: opts.action,
                            executeContext: { surface: "record_header" },
                        }),
                    entityId: drawer.id,
                    context: {
                        surface: "record_header",
                        work_unit_id: workUnitIdForCtx,
                        department_id: departmentIdForCtx || null,
                    },
                });
                return;
            }
            setOpportunityActionLoading(a.key);
            setSaveError(null);
            try {
                const workUnitId =
                    data && typeof data === "object" && (data as { work_unit_id?: unknown }).work_unit_id != null
                        ? String((data as { work_unit_id?: unknown }).work_unit_id)
                        : null;
                const res = await fetch("/api/admin/actions/execute", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action_key: a.key,
                        entity_type: "opportunity",
                        entity_id: drawer.id,
                        context: { surface: "record_header", work_unit_id: workUnitId },
                    }),
                });
                const json = (await res.json().catch(() => ({}))) as {
                    ok?: boolean;
                    error?: string;
                    execution_result?: Record<string, unknown> & {
                        row?: Record<string, unknown>;
                        kind?: string;
                        workflow_run_id?: string;
                    };
                };
                if (!res.ok || !json.ok) {
                    setSaveError(json.error ?? "Action failed");
                    return;
                }
                const er = json.execution_result;
                if (er?.kind === "start_workflow" && typeof er.workflow_run_id === "string" && er.workflow_run_id.trim()) {
                    const rid = er.workflow_run_id.trim();
                    setRegistryActionFeedback({
                        type: "success",
                        message: `Workflow run completed (${rid.slice(0, 8)}…).`,
                        workflow_run_id: rid,
                    });
                }
                const row = er?.row;
                if (row && typeof row === "object") {
                    setData((prev) => (prev && typeof prev === "object" ? { ...prev, ...row } : prev));
                } else {
                    refetch();
                }
                // Avoid `router.refresh()` here: it remounts client providers and closes the drawer.
                window.dispatchEvent(
                    new CustomEvent("adminv2:opportunity-updated", { detail: { id: drawer.id, action_key: a.key } })
                );
            } catch (e) {
                setSaveError(e instanceof Error ? e.message : "Action failed");
            } finally {
                setOpportunityActionLoading(null);
            }
        },
        [
            drawer.id,
            drawer.type,
            drawer.opportunityWorkspaceContext?.department_id,
            openDrawer,
            opportunityWorkUnitDepartmentId,
            refetch,
            router,
            data,
        ]
    );

    const opportunityWorkUnitId = useMemo(() => {
        if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") return "";
        const ctxWu = (drawer.opportunityWorkspaceContext?.work_unit_id ?? "").trim();
        if (ctxWu) return ctxWu;
        const wuid =
            data && typeof data === "object" && (data as { work_unit_id?: unknown }).work_unit_id != null
                ? String((data as { work_unit_id?: unknown }).work_unit_id).trim()
                : "";
        return wuid;
    }, [drawer.type, drawer.id, drawer.opportunityWorkspaceContext?.work_unit_id, data]);

    const opportunityDrawerDepartmentId = useMemo(() => {
        const ctxDept = (drawer.opportunityWorkspaceContext?.department_id ?? "").trim();
        if (ctxDept) return ctxDept;
        const fromState = opportunityWorkUnitDepartmentId?.trim() ?? "";
        if (fromState) return fromState;
        if (drawer.type !== "opportunities" || !data || typeof data !== "object") return "";
        if (String((data as { id?: unknown }).id ?? "") !== String(drawer.id)) return "";
        return String((data as { _work_unit_department_id?: unknown })._work_unit_department_id ?? "").trim();
    }, [drawer.type, drawer.opportunityWorkspaceContext?.department_id, opportunityWorkUnitDepartmentId, data, drawer.id]);

    useEffect(() => {
        const onFocusComms = (ev: Event) => {
            const ce = ev as CustomEvent<{ opportunity_id?: string }>;
            const id = typeof ce.detail?.opportunity_id === "string" ? ce.detail.opportunity_id.trim() : "";
            if (!id || drawer.type !== "opportunities" || drawer.id !== id) return;
            setDrawerTab("communications");
            requestAnimationFrame(() => {
                document.querySelector("[data-admin-opportunity-comms-panel]")?.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                });
            });
        };
        window.addEventListener("adminv2:opportunity-focus-comms", onFocusComms as EventListener);
        return () => window.removeEventListener("adminv2:opportunity-focus-comms", onFocusComms as EventListener);
    }, [drawer.type, drawer.id]);

    useEffect(() => {
        if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") {
            opportunityInteractiveMarkedRef.current = null;
            opportunityHeaderResolvedSigRef.current = null;
        }
    }, [drawer.type, drawer.id]);

    useEffect(() => {
        if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") return;
        if (!data || typeof data !== "object") return;
        if (String((data as { id?: unknown }).id ?? "") !== String(drawer.id)) return;
        const dept = String((data as { _work_unit_department_id?: unknown })._work_unit_department_id ?? "").trim();
        if (dept) setOpportunityWorkUnitDepartmentId(dept);
    }, [drawer.type, drawer.id, data]);

    useEffect(() => {
        if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") {
            setOpportunityResolvedHeaderActions(null);
            setOpportunityResolvedHeaderLoading(false);
            opportunityHeaderResolvedSigRef.current = null;
            return;
        }
        const ctxWu = (drawer.opportunityWorkspaceContext?.work_unit_id ?? "").trim();
        const ctxDept = (drawer.opportunityWorkspaceContext?.department_id ?? "").trim();
        const dataIdMatchesDrawer =
            !!data && typeof data === "object" && String((data as { id?: unknown }).id ?? "") === String(drawer.id);
        const departmentIdFromRecord = dataIdMatchesDrawer
            ? String((data as { _work_unit_department_id?: unknown })._work_unit_department_id ?? "").trim()
            : "";
        const dataWu =
            dataIdMatchesDrawer && (data as { work_unit_id?: unknown }).work_unit_id != null
                ? String((data as { work_unit_id?: unknown }).work_unit_id).trim()
                : "";
        const workUnitId = ctxWu || dataWu;
        const departmentId = ctxDept || departmentIdFromRecord || (opportunityWorkUnitDepartmentId?.trim() ?? "");

        if (!workUnitId) {
            if (!entityRowReady && !ctxWu) {
                setOpportunityResolvedHeaderLoading(false);
                return;
            }
            setOpportunityResolvedHeaderLoading(false);
            return;
        }
        if (!departmentId) {
            setOpportunityResolvedHeaderLoading(true);
            return;
        }

        const qs = new URLSearchParams({
            surface: "record_header",
            entity_type: "opportunity",
            entity_id: drawer.id,
        });
        qs.set("work_unit_id", workUnitId);
        qs.set("department_id", departmentId);
        appendOpportunityRecordHeaderHints(qs, data as Record<string, unknown> | undefined, drawer.id);
        const actionsUrl = `/api/admin/actions?${qs.toString()}`;
        if (opportunityHeaderResolvedSigRef.current === actionsUrl) {
            setOpportunityResolvedHeaderLoading(false);
            return;
        }

        let cancelled = false;
        setOpportunityResolvedHeaderLoading(true);
        const t0 = timingEnabled ? performance.now() : 0;
        if (typeof window !== "undefined" && typeof performance !== "undefined") {
            alloyPerfSet("drawer_header_actions_request_start", performance.now());
        }
        dedupeAdminFetchWithTtl(actionsUrl, workspaceDataFetchInit(), 1500)
            .then((r) => r.json())
            .then((j: { actions?: ResolvedActionsBySlot }) => {
                if (cancelled) return;
                if (typeof window !== "undefined" && typeof performance !== "undefined") {
                    alloyPerfSet("drawer_header_actions_response", performance.now());
                }
                setOpportunityResolvedHeaderActions(j.actions ?? null);
                opportunityHeaderResolvedSigRef.current = actionsUrl;
                if (timingEnabled) {
                    console.info("[timing][drawer]", {
                        key: `opportunities:${drawer.id}`,
                        phase: "record_header_actions_fetch",
                        url: actionsUrl,
                        ms: Math.round((performance.now() - t0) * 10) / 10,
                    });
                }
            })
            .catch(() => {
                if (!cancelled) setOpportunityResolvedHeaderActions(null);
            })
            .finally(() => {
                if (!cancelled) {
                    setOpportunityResolvedHeaderLoading(false);
                    if (typeof window !== "undefined" && typeof performance !== "undefined") {
                        alloyPerfSet("drawer_header_actions_ready", performance.now());
                    }
                }
            });
        return () => {
            cancelled = true;
        };
    }, [
        drawer.type,
        drawer.id,
        drawer.opportunityWorkspaceContext?.department_id,
        drawer.opportunityWorkspaceContext?.work_unit_id,
        entityRowReady,
        opportunityWorkUnitId,
        opportunityWorkUnitDepartmentId,
        data,
        timingEnabled,
    ]);

    // Keep drawer state, but refresh record + header actions when actions mutate the opportunity.
    useEffect(() => {
        if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") return;
        const onUpdated = (ev: Event) => {
            const ce = ev as CustomEvent<{ id?: string; action_key?: string }>;
            const id = typeof ce.detail?.id === "string" ? ce.detail.id : "";
            if (!id || id !== drawer.id) return;
            if (process.env.NODE_ENV === "development") {
                console.info("[drawer] opportunity updated", { id, action_key: ce.detail?.action_key ?? null });
            }
            refetch();
            setOpportunityActivitySignalNonce((n) => n + 1);
            setOpportunityRelatedData(null);
            // Also refetch resolved header actions so conditional actions swap (schedule ↔ reschedule).
            const ctxWu = (drawer.opportunityWorkspaceContext?.work_unit_id ?? "").trim();
            const ctxDept = (drawer.opportunityWorkspaceContext?.department_id ?? "").trim();
            const dataIdMatchesDrawer =
                !!data && typeof data === "object" && String((data as { id?: unknown }).id ?? "") === String(drawer.id);
            const departmentIdFromRecord = dataIdMatchesDrawer
                ? String((data as { _work_unit_department_id?: unknown })._work_unit_department_id ?? "").trim()
                : "";
            const dataWu =
                dataIdMatchesDrawer && (data as { work_unit_id?: unknown }).work_unit_id != null
                    ? String((data as { work_unit_id?: unknown }).work_unit_id).trim()
                    : "";
            const workUnitId = (ctxWu || dataWu || opportunityWorkUnitId.trim()).trim();
            const departmentId = (ctxDept || departmentIdFromRecord || (opportunityWorkUnitDepartmentId?.trim() ?? "")).trim();
            if (!workUnitId || !departmentId) return;
            opportunityHeaderResolvedSigRef.current = null;
            setOpportunityResolvedHeaderLoading(true);
            const t0 = timingEnabled ? performance.now() : 0;
            const qs = new URLSearchParams({
                surface: "record_header",
                entity_type: "opportunity",
                entity_id: drawer.id,
            });
            qs.set("work_unit_id", workUnitId);
            qs.set("department_id", departmentId);
            appendOpportunityRecordHeaderHints(qs, data as Record<string, unknown> | undefined, drawer.id);
            const actionsUrl = `/api/admin/actions?${qs.toString()}`;
            if (typeof window !== "undefined" && typeof performance !== "undefined") {
                alloyPerfSet("drawer_header_actions_request_start", performance.now());
            }
            dedupeAdminFetchWithTtl(actionsUrl, workspaceDataFetchInit(), 1500)
                .then((r) => r.json())
                .then((j: { actions?: ResolvedActionsBySlot }) => {
                    if (typeof window !== "undefined" && typeof performance !== "undefined") {
                        alloyPerfSet("drawer_header_actions_response", performance.now());
                    }
                    setOpportunityResolvedHeaderActions(j.actions ?? null);
                    opportunityHeaderResolvedSigRef.current = actionsUrl;
                    if (timingEnabled) {
                        console.info("[timing][drawer]", {
                            key: `opportunities:${drawer.id}`,
                            phase: "record_header_actions_refetch",
                            url: actionsUrl,
                            ms: Math.round((performance.now() - t0) * 10) / 10,
                        });
                    }
                })
                .catch(() => setOpportunityResolvedHeaderActions(null))
                .finally(() => {
                    setOpportunityResolvedHeaderLoading(false);
                    if (typeof window !== "undefined" && typeof performance !== "undefined") {
                        alloyPerfSet("drawer_header_actions_ready", performance.now());
                    }
                });
        };
        window.addEventListener("adminv2:opportunity-updated", onUpdated as EventListener);
        return () => window.removeEventListener("adminv2:opportunity-updated", onUpdated as EventListener);
    }, [
        drawer.type,
        drawer.id,
        drawer.opportunityWorkspaceContext?.department_id,
        drawer.opportunityWorkspaceContext?.work_unit_id,
        refetch,
        opportunityWorkUnitId,
        opportunityWorkUnitDepartmentId,
        data,
        timingEnabled,
    ]);

    // If a caller opened the drawer with a surface hint, respect it once.
    useEffect(() => {
        if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") return;
        if (drawer.defaultOpportunitySurface !== "quote_intake") return;
        setOppQuoteIntakeOpen(true);
        // clear hint by re-opening same drawer without it (keeps stack semantics identical)
        openDrawer({ type: "opportunities", id: drawer.id });
    }, [drawer.type, drawer.id, drawer.defaultOpportunitySurface, openDrawer]);

    useEffect(() => {
        if (drawer.type !== "opportunities") {
            setOppQuoteIntakeOpen(false);
        }
    }, [drawer.type]);

    // Queue definition drives the opportunity inquiry timeline (bucket grouping), not hardcoded stages.
    useEffect(() => {
        if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") {
            setOpportunityQueueDefinition(null);
            setOpportunityWorkUnitDepartmentId(null);
            return;
        }
        const ctxWu = (drawer.opportunityWorkspaceContext?.work_unit_id ?? "").trim();
        const wuidFromData =
            data && typeof data === "object" && (data as { work_unit_id?: unknown }).work_unit_id != null
                ? String((data as { work_unit_id?: unknown }).work_unit_id).trim()
                : "";
        const wuid = ctxWu || wuidFromData;
        if (!wuid) {
            setOpportunityQueueDefinition(null);
            setOpportunityWorkUnitDepartmentId(null);
            return;
        }
        const canProceed = entityRowReady || Boolean(ctxWu);
        if (!canProceed) {
            if (loading) {
                setOpportunityQueueDefinition(null);
                setOpportunityWorkUnitDepartmentId(null);
            }
            return;
        }
        const stampedDeptRaw =
            data && typeof data === "object"
                ? String((data as { _work_unit_department_id?: unknown })._work_unit_department_id ?? "").trim()
                : "";
        const entityWuMatchesStamp =
            wuidFromData.length > 0 && stampedDeptRaw.length > 0 && wuidFromData === wuid;
        if (entityWuMatchesStamp) {
            setOpportunityWorkUnitDepartmentId(stampedDeptRaw);
        }

        let cancelled = false;
        const run = async () => {
            try {
                const t0 = timingEnabled ? performance.now() : 0;
                const json = await fetchAdminWorkUnitDrawerJson(wuid);
                if (cancelled) return;
                if (timingEnabled) {
                    console.info("[timing][drawer]", {
                        key: `opportunities:${drawer.id}`,
                        phase: "work_unit_fetch",
                        url: `/api/admin/work-units/${encodeURIComponent(wuid)}`,
                        ms: Math.round((performance.now() - t0) * 10) / 10,
                    });
                }
                const deptJson =
                    typeof json.department_id === "string" && json.department_id.trim()
                        ? json.department_id.trim()
                        : null;
                setOpportunityWorkUnitDepartmentId(deptJson ?? (entityWuMatchesStamp ? stampedDeptRaw : null));
                const qd = json.queue_definition;
                if (!qd || typeof qd !== "object") {
                    setOpportunityQueueDefinition(null);
                    return;
                }
                const parsed = validateQueueDefinition(qd);
                setOpportunityQueueDefinition(parsed);
            } catch {
                if (!cancelled) {
                    setOpportunityQueueDefinition(null);
                    setOpportunityWorkUnitDepartmentId(entityWuMatchesStamp ? stampedDeptRaw : null);
                }
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [drawer.type, drawer.id, drawer.opportunityWorkspaceContext?.work_unit_id, data, entityRowReady, loading, timingEnabled]);

    useEffect(() => {
        if (!paymentToast) return;
        const t = setTimeout(() => setPaymentToast(null), 8000);
        return () => clearTimeout(t);
    }, [paymentToast]);

    useEffect(() => {
        if (!registryActionFeedback) return;
        const t = setTimeout(() => setRegistryActionFeedback(null), 12000);
        return () => clearTimeout(t);
    }, [registryActionFeedback]);

    useEffect(() => {
        setRegistryActionFeedback(null);
    }, [drawer.type, drawer.id]);

    useEffect(() => {
        if (drawer.type === "jobs" && data) {
            const vid = (data.assigned_vendor_id as string) ?? null;
            setJobAssignedVendorId(vid);
        } else {
            setJobAssignedVendorId(null);
        }
    }, [drawer.type, data]);

    useEffect(() => {
        if (drawer.type !== "jobs") return;
        const raw = formData.assigned_vendor_id;
        if (raw === undefined) return;
        const s = typeof raw === "string" ? raw.trim() : "";
        setJobAssignedVendorId(s ? s : null);
    }, [drawer.type, formData.assigned_vendor_id]);

    useEffect(() => {
        if (drawer.type !== "opportunities") {
            setOppVerticalOptions([]);
            return;
        }
        if (!drawer.id || drawer.id === "new") {
            setOppVerticalOptions([]);
            return;
        }
        const visKey = `${drawer.type}:${drawer.id}`;
        if (postDrawerVisibleKey !== visKey) {
            setOppVerticalOptions([]);
            return;
        }
        const init = workspaceDataFetchInit();
        dedupeAdminFetchWithTtl("/api/admin/verticals", init, 1500)
            .then((r) => (r.ok ? r.json() : []))
            .then((verts) => {
                const vlist = Array.isArray(verts) ? (verts as { id: string; name?: string | null }[]) : [];
                setOppVerticalOptions(vlist.map((v) => ({ id: v.id, name: (v.name ?? v.id).trim() || v.id })));
            })
            .catch(() => setOppVerticalOptions([]));
    }, [drawer.type, drawer.id, postDrawerVisibleKey]);

    useEffect(() => {
        if (drawer.type !== "locations") {
            setLocationTypes([]);
            return;
        }
        const init = workspaceDataFetchInit();
        dedupeAdminFetchWithTtl("/api/admin/location-types", init, 1500)
            .then((r) => (r.ok ? r.json() : { location_types: [] }))
            .then((json: { location_types?: { id: string; key: string; label: string; position: number; is_active: boolean }[] }) => setLocationTypes(json.location_types ?? []))
            .catch(() => setLocationTypes([]));
    }, [drawer.type]);

    useEffect(() => {
        if (drawer.type !== "locations") {
            setLocationCustomerOptions([]);
            return;
        }
        const init = workspaceDataFetchInit();
        dedupeAdminFetchWithTtl("/api/admin/customers", init, 1500)
            .then((r) => (r.ok ? r.json() : []))
            .then((json: unknown) => {
                const list = Array.isArray(json) ? json : (json as { customers?: { id: string; name?: string | null }[] }).customers ?? [];
                setLocationCustomerOptions(list.map((c: { id: string; name?: string | null }) => ({ id: c.id, name: c.name ?? null })));
            })
            .catch(() => setLocationCustomerOptions([]));
    }, [drawer.type]);

    useEffect(() => {
        if (drawer.type !== "workflows") return;
        const entityTypes = new Set<string>();
        if ((formData.entity_type as string)?.trim()) entityTypes.add((formData.entity_type as string).trim());
        workflowConditions.forEach((c) => {
            const t = (c.target_entity ?? "").trim();
            if (t) entityTypes.add(t);
        });
        entityTypes.forEach((entityType) => {
            if (fieldCatalogByEntity[entityType] != null) return;
            fetch(`/api/admin/workflows/field-catalog?entity_type=${encodeURIComponent(entityType)}`)
                .then((r) => (r.ok ? r.json() : { fields: [] }))
                .then((json: { fields?: FieldCatalogEntry[] }) => {
                    const fields = Array.isArray(json.fields) ? json.fields : [];
                    setFieldCatalogByEntity((prev) => ({ ...prev, [entityType]: fields }));
                })
                .catch(() => setFieldCatalogByEntity((prev) => ({ ...prev, [entityType]: [] })));
        });
    }, [drawer.type, formData.entity_type, workflowConditions, fieldCatalogByEntity]);

    useEffect(() => {
        if (drawer.type !== "workflows") return;
        const init = workspaceDataFetchInit();
        Promise.all([
            dedupeAdminFetchWithTtl("/api/admin/status-definitions?entity_type=vendors", init, 1500)
                .then((r) => (r.ok ? r.json() : { statuses: [] }))
                .then((j: { statuses?: { id: string; status_key: string; status_label: string | null }[] }) =>
                    (j.statuses ?? []).map((s) => ({
                        id: s.id,
                        key: s.status_key,
                        label: (s.status_label?.trim() || s.status_key) as string,
                    }))
                ),
            dedupeAdminFetchWithTtl("/api/admin/verticals", init, 1500).then((r) => (r.ok ? r.json() : [])),
        ])
            .then(([statuses, verts]) => {
                setVendorStatuses(Array.isArray(statuses) ? statuses : []);
                setWorkflowVerticals(Array.isArray(verts) ? verts : []);
            })
            .catch(() => {
                setVendorStatuses([]);
                setWorkflowVerticals([]);
            });
    }, [drawer.type]);

    useEffect(() => {
        if (drawer.type !== "customer_members") {
            setMemberCustomers([]);
            return;
        }
        const init = workspaceDataFetchInit();
        dedupeAdminFetchWithTtl("/api/admin/customers", init, 1500)
            .then((r) => (r.ok ? r.json() : []))
            .then((json) => {
                const list = Array.isArray(json) ? json : (json as { customers?: { id: string; name: string | null }[] }).customers ?? [];
                setMemberCustomers(list.map((c: { id: string; name?: string | null }) => ({ id: c.id, name: c.name ?? null })));
            })
            .catch(() => setMemberCustomers([]));
    }, [drawer.type]);

    useEffect(() => {
        if (drawer.type !== "customer_members" || !data || (data as { _create?: boolean })._create) {
            setMemberRelatedContacts([]);
            setMemberRelatedLoading(false);
            setMemberRelatedError(null);
            return;
        }
        const customerId = data.customer_id as string | undefined;
        if (!customerId) {
            setMemberRelatedContacts([]);
            return;
        }
        setMemberRelatedLoading(true);
        setMemberRelatedError(null);
        fetch(`/api/admin/related/customer/${customerId}`)
            .then((r) => {
                if (!r.ok) throw new Error("Failed to load related");
                return r.json();
            })
            .then((json: { contacts?: { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null; created_at?: string }[] }) => {
                const list = (json.contacts ?? []).map((c) => ({
                    id: c.id,
                    first_name: c.first_name ?? null,
                    last_name: c.last_name ?? null,
                    email: c.email ?? null,
                    phone: c.phone ?? null,
                    created_at: c.created_at,
                }));
                setMemberRelatedContacts(list);
            })
            .catch((e: Error) => {
                setMemberRelatedError(e.message);
                setMemberRelatedContacts([]);
            })
            .finally(() => setMemberRelatedLoading(false));
    }, [drawer.type, data?.customer_id, (data as { _create?: boolean })?._create]);

    const refetchMemberLinks = useCallback(() => {
        if (drawer.type !== "customer_members" || !drawer.id || drawer.id === "new") return;
        setMemberRelatedLinksLoading(true);
        fetch(`/api/admin/customer-member-contacts?customer_member_id=${encodeURIComponent(drawer.id)}`)
            .then((r) => (r.ok ? r.json() : { links: [] }))
            .then((json: { links?: MemberLink[] }) => setMemberRelatedLinks(json.links ?? []))
            .catch(() => setMemberRelatedLinks([]))
            .finally(() => setMemberRelatedLinksLoading(false));
    }, [drawer.type, drawer.id]);

    useEffect(() => {
        if (drawer.type !== "customer_members") {
            setMemberRelatedRoles([]);
            setMemberRelatedLinks([]);
            setMemberRelationshipOptions([]);
            return;
        }
        fetch("/api/admin/customer-member-contact-roles")
            .then((r) => (r.ok ? r.json() : { roles: [] }))
            .then((json: { roles?: { id: string; role_key: string; role_label: string; sort_order: number }[] }) => setMemberRelatedRoles(json.roles ?? []))
            .catch(() => setMemberRelatedRoles([]));
        fetch("/api/admin/customer-member-relationship-types")
            .then((r) => (r.ok ? r.json() : { options: [] }))
            .then((json: { options?: { key: string; label: string }[] }) => setMemberRelationshipOptions(json.options ?? []))
            .catch(() => setMemberRelationshipOptions([]));
    }, [drawer.type]);

    useEffect(() => {
        if (drawer.type !== "customer_members" || drawer.id === "new" || !drawer.id) {
            setMemberRelatedLinks([]);
            return;
        }
        refetchMemberLinks();
    }, [drawer.type, drawer.id, refetchMemberLinks]);

    const refetchMemberRelated = useCallback(() => {
        if (drawer.type !== "customer_members") return;
        if (!drawer.id || drawer.id === "new") return;
        setMemberRelatedDataLoading(true);
        fetch(`/api/admin/related/customer_member/${drawer.id}`)
            .then((r) => (r.ok ? r.json() : { linkedContacts: [], customer: null, documents: [] }))
            .then((json: MemberRelatedPayload) => setMemberRelatedData(json))
            .catch(() => setMemberRelatedData(null))
            .finally(() => setMemberRelatedDataLoading(false));
    }, [drawer.type, drawer.id]);

    useEffect(() => {
        if (drawer.type !== "customer_members" || !drawer.id || drawer.id === "new") {
            setMemberRelatedData(null);
            return;
        }
        setMemberRelatedDataLoading(true);
        fetch(`/api/admin/related/customer_member/${drawer.id}`)
            .then((r) => (r.ok ? r.json() : { linkedContacts: [], customer: null, documents: [] }))
            .then((json: MemberRelatedPayload) => setMemberRelatedData(json))
            .catch(() => setMemberRelatedData(null))
            .finally(() => setMemberRelatedDataLoading(false));
    }, [drawer.type, drawer.id]);

    useEffect(() => {
        if (drawer.type !== "customer_members" || !data) return;
        if ((data as { _create?: boolean })._create) {
            const defaultId = drawer.defaultCustomerId ?? "";
            setFormData({
                customer_id: defaultId,
                display_name: "",
                relationship: "",
                relationship_custom: "",
                first_name: "",
                last_name: "",
                dob: "",
                is_active: true,
            });
        }
    }, [drawer.type, drawer.defaultCustomerId, data]);

    useEffect(() => {
        if (!drawer.type || !STATUS_ENTITY_TYPES.includes(drawer.type)) {
            setStatusDefsForDrawer([]);
            return;
        }
        setStatusDefsLoading(true);
        /** Effective defs (org + industry merge) — matches resolveStatusLabel / list badges; avoids org-only legacy gaps. */
        const init = workspaceDataFetchInit();
        dedupeAdminFetchWithTtl(
            `/api/admin/status-options?entity_type=${encodeURIComponent(drawer.type)}`,
            init,
            1500
        )
            .then((r) => (r.ok ? r.json() : { options: [] }))
            .then((json: { options?: { value: string; label: string; sort_order?: number }[] }) => {
                const opts = json.options ?? [];
                setStatusDefsForDrawer(
                    opts.map((o) => ({
                        status_key: o.value,
                        status_label: o.label,
                        sort_order: o.sort_order ?? 0,
                        is_active: true,
                        is_system: false,
                    }))
                );
            })
            .catch(() => setStatusDefsForDrawer([]))
            .finally(() => setStatusDefsLoading(false));
    }, [drawer.type, drawer.id]);

    const getStatusLabel = useCallback((statusKey: string | null | undefined) => {
        if (!statusKey) return null;
        const opt = statusDefsForDrawer.find((s) => s.status_key === statusKey);
        return opt?.status_label ?? null;
    }, [statusDefsForDrawer]);

    const defaultStatusKeyForCreate = useMemo(() => {
        const active = statusDefsForDrawer.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order);
        return active[0]?.status_key ?? statusDefsForDrawer[0]?.status_key ?? "";
    }, [statusDefsForDrawer]);

    useEffect(() => {
        if (drawer.type !== "contacts" || !data || !(data as { _create?: boolean })._create) return;
        setFormData({
            first_name: "",
            last_name: "",
            email: "",
            phone: "",
            company_name: "",
            notes: "",
            status: "active",
            customer_id: drawer.defaultCustomerId ?? "",
            vendor_id: drawer.defaultVendorId ?? "",
            vendor_contact_role: "",
        });
    }, [drawer.type, data, drawer.defaultCustomerId, drawer.defaultVendorId]);

    useEffect(() => {
        if (drawer.type !== "schedules" || !drawer.id) {
            setScheduleVendors([]);
            setScheduleRescheduleForm(null);
            setScheduleCancelPrompt(false);
            return;
        }
        fetch(`/api/admin/schedules/${drawer.id}/vendors-for-assign`)
            .then((r) => (r.ok ? r.json() : { vendors: [] }))
            .then((json: { vendors?: AdminVendorSelectOption[] }) => {
                const list = Array.isArray(json.vendors) ? json.vendors : [];
                setScheduleVendors(
                    list.map((v) => ({
                        ...v,
                        label: v.label ?? formatVendorOptionLabel({ id: v.id, name: v.name }),
                    }))
                );
            })
            .catch(() => setScheduleVendors([]));
    }, [drawer.type, drawer.id]);

    const hydrateWorkflowEditorFromData = useCallback((raw: Record<string, unknown>) => {
        if ((raw as { _create?: boolean })._create) return;
        setFormData((prev) => ({
            ...prev,
            name: (raw.name as string) ?? "",
            description: (raw.description as string) ?? "",
            enabled: (raw as { enabled?: boolean }).enabled !== false,
            event_type: (raw.event_type as string) ?? "",
            entity_type: (raw.entity_type as string) ?? "",
        }));
        if (raw._conditions) {
            const cond = (raw._conditions as { target_entity?: string; field_path?: string; field?: string; operator?: string; value?: string; value_jsonb?: unknown }[]).map((c) => {
                let fieldPath = (c.field_path ?? c.field ?? "").toString().trim();
                const entityType = (c.target_entity ?? "").toString().trim();
                if ((entityType === "vendor" || entityType === "vendors") && fieldPath.startsWith("vendor.")) {
                    fieldPath = fieldPath.slice("vendor.".length).trim() || fieldPath;
                }
                return {
                    target_entity: entityType,
                    field_path: fieldPath,
                    operator: c.operator ?? "eq",
                    value: c.value ?? (c.value_jsonb != null ? (typeof c.value_jsonb === "string" ? c.value_jsonb : JSON.stringify(c.value_jsonb)) : ""),
                };
            });
            setWorkflowConditions(cond);
        } else {
            setWorkflowConditions([]);
        }
        if (raw._actions) {
            const acts = (raw._actions as { action_type?: string; target_entity?: string; payload?: unknown }[]).map((a) => ({
                action_type: a.action_type ?? "log",
                target_entity: a.target_entity ?? undefined,
                payload: a.payload && typeof a.payload === "object" ? (a.payload as Record<string, unknown>) : {},
            }));
            setWorkflowActions(acts);
        } else {
            setWorkflowActions([]);
        }
    }, []);

    useEffect(() => {
        if (drawer.type !== "workflows" || !data) return;
        if ((data as { _create?: boolean })._create) {
            setWorkflowConditions([]);
            setWorkflowActions([]);
            const defaultEntity = drawer.defaultWorkflowEntityType ?? "";
            setFormData({ name: "", description: "", enabled: true, event_type: "", entity_type: defaultEntity });
            return;
        }
        hydrateWorkflowEditorFromData(data as Record<string, unknown>);
    }, [drawer.type, drawer.defaultWorkflowEntityType, data, hydrateWorkflowEditorFromData]);

    /** Existing records: open drawer already in edit mode when the user can mutate (Save still required to persist). */
    useEffect(() => {
        if (!drawer.type || !drawer.id || drawer.id === "new" || loading) return;
        if (!data || (data as { _create?: boolean })._create) return;
        if (!canEditInDrawer(drawer.type) || !canMutate) {
            setIsEditing(false);
            return;
        }
        setIsEditing(true);
    }, [drawer.type, drawer.id, loading, data, canMutate]);

    const openReschedule = useCallback((s: { id: string; start_at: string; end_at: string; timezone: string }) => {
        setRescheduleScheduleId(s.id);
        setRescheduleForm({
            start_at: s.start_at ? new Date(s.start_at).toISOString().slice(0, 16) : "",
            end_at: s.end_at ? new Date(s.end_at).toISOString().slice(0, 16) : "",
            timezone: s.timezone ?? "",
        });
        setRescheduleError(null);
    }, []);
    const cancelReschedule = useCallback(() => {
        setRescheduleScheduleId(null);
        setRescheduleForm(null);
        setRescheduleError(null);
    }, []);
    const saveReschedule = useCallback(async () => {
        if (!rescheduleForm || !rescheduleScheduleId) return;
        setRescheduleSaving(true);
        setRescheduleError(null);
        try {
            const payload = {
                start_at: rescheduleForm.start_at ? new Date(rescheduleForm.start_at).toISOString() : undefined,
                end_at: rescheduleForm.end_at ? new Date(rescheduleForm.end_at).toISOString() : undefined,
                timezone: rescheduleForm.timezone || undefined,
            };
            const res = await fetch(`/api/admin/schedules/${rescheduleScheduleId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json.error as string) || "Reschedule failed");
            setRescheduleScheduleId(null);
            setRescheduleForm(null);
            refetch();
            router.refresh();
            setJobSchedules((prev) => prev.map((s) => (s.id === rescheduleScheduleId ? { ...s, start_at: payload.start_at ?? s.start_at, end_at: payload.end_at ?? s.end_at, timezone: payload.timezone ?? s.timezone } : s)));
        } catch (e: unknown) {
            setRescheduleError((e as Error).message);
        } finally {
            setRescheduleSaving(false);
        }
    }, [rescheduleForm, rescheduleScheduleId, refetch, router]);

    const startEdit = useCallback(() => {
        if (!data) return;
        if (drawer.type === "opportunities") {
            const meta = (data.metadata as Record<string, unknown>) || {};
            const opp = data as Record<string, unknown>;
            const quoteTotal =
                opp.quote_total != null && !Number.isNaN(Number(opp.quote_total))
                    ? Number(opp.quote_total)
                    : opp.estimated_price_cents != null && !Number.isNaN(Number(opp.estimated_price_cents))
                        ? Number(opp.estimated_price_cents) / 100
                        : opp.monetary_value_cents != null && !Number.isNaN(Number(opp.monetary_value_cents))
                            ? Number(opp.monetary_value_cents) / 100
                            : "";
            const initial: Record<string, unknown> = {
                name: (opp.name as string) ?? "",
                job_date: (opp.job_date as string)?.slice(0, 10) ?? "",
                job_time_window: (opp.job_time_window as string) ?? "",
                status_key: (opp.status_key as string) ?? "",
                vertical_id: (opp.vertical_id as string) ?? "",
                quote_total: quoteTotal,
                quote_subtotal: opp.quote_subtotal ?? "",
                discount_amount: opp.discount_amount ?? "",
                discount_code: (opp.discount_code as string) ?? "",
                estimated_price_cents: opp.estimated_price_cents ?? "",
                monetary_value_cents: opp.monetary_value_cents ?? "",
                recurring_price_cents: opp.recurring_price_cents ?? "",
                source: (opp.source as string) ?? "",
                assigned_to: (opp.assigned_to as string) ?? "",
                lost_reason: (opp.lost_reason as string) ?? "",
                appointment_id: (opp.appointment_id as string) ?? "",
                external_source: (opp.external_source as string) ?? "",
                external_id: (opp.external_id as string) ?? "",
                notes: (meta.notes as string) ?? "",
                customer_notes: (meta.notes as string) ?? "",
            };
            mergeConfiguredFieldFormValues(initial, opp, (data._field_definitions as FieldDefRow[] | undefined) ?? []);
            if (quoteTotal !== "" && quoteTotal != null) initial.quote_total = quoteTotal;
            setFormData(initial);
        } else if (drawer.type === "jobs") {
            const meta = (data.metadata as Record<string, unknown>) || {};
            setFormData({
                title: (data.title as string) ?? "",
                service_key: (data.service_key as string) ?? "",
                job_type: (data.job_type as string) ?? "",
                description: (data.description as string) ?? "",
                scheduled_at: data.scheduled_at ? new Date(data.scheduled_at as string).toISOString().slice(0, 16) : "",
                completed_at: data.completed_at ? new Date(data.completed_at as string).toISOString().slice(0, 16) : "",
                service_frequency_key: (data.service_frequency_key as string) ?? "",
                is_recurring: data.is_recurring ?? false,
                status_key: (data.status_key as string) ?? "",
                internal_notes: (meta.internal_notes as string) ?? "",
                assigned_vendor_id: (data.assigned_vendor_id as string) ?? "",
                gross_price_cents: data.gross_price_cents ?? null,
                discount_amount: data.discount_amount ?? null,
                display_total_cents: (data as { display_total_cents?: number | null }).display_total_cents ?? null,
                _discount_amount_cents: (data as { _discount_amount_cents?: number | null })._discount_amount_cents ?? null,
                customer_id: (data.customer_id as string) ?? "",
                opportunity_id: (data.opportunity_id as string) ?? "",
                location_id: (data.location_id as string) ?? "",
                primary_contact_id: (data.primary_contact_id as string) ?? "",
            });
        } else if (drawer.type === "contacts") {
            setFormData({
                first_name: data.first_name ?? "",
                last_name: data.last_name ?? "",
                email: data.email ?? "",
                phone: data.phone ?? "",
                company_name: (data.company_name as string) ?? "",
                notes: (data.notes as string) ?? "",
                status: data.status ?? "active",
                status_key: (data.status_key as string) ?? "",
                contact_type: (data.contact_type as string) ?? "",
                customer_id: (data.customer_id as string) ?? "",
                vendor_id: (data.vendor_id as string) ?? "",
                vendor_contact_role: (data.vendor_contact_role as string) ?? "",
            });
        } else if (drawer.type === "customers") {
            setFormData({
                name: data.name ?? "",
                status: data.status ?? "",
                status_key: (data.status_key as string) ?? "",
            });
        } else if (drawer.type === "vendors") {
            const vendorData = data as {
                vendor_status_id?: string | null;
                name?: string | null;
                company_name?: string | null;
                phone?: string | null;
                email?: string | null;
                address_line1?: string | null;
                city?: string | null;
                state?: string | null;
                postal_code?: string | null;
                service_area_zip_codes?: string[] | null;
                days_available?: string[] | null;
                operating_hours_open?: string | null;
                operating_hours_close?: string | null;
                owns_supplies?: boolean | null;
                max_daily_jobs?: number | null;
                payout_percent?: number | null;
                external_source?: string | null;
                external_id?: string | null;
                w9_received?: boolean | null;
                ach_verified?: boolean | null;
                consent_contractor_agreement?: boolean | null;
                consent_legal?: boolean | null;
                consent_marketing?: boolean | null;
                payout_override_type?: string | null;
                payout_override_value?: number | null;
            };
            const vendorForm: VendorFormData = {
                primary_person_id: (vendorData as { primary_person_id?: string | null }).primary_person_id ?? "",
                status_key: (data.status_key ?? (data as { status?: string | null }).status) as string ?? "",
                name: vendorData.name ?? "",
                company_name: vendorData.company_name ?? "",
                phone: vendorData.phone ?? "",
                email: vendorData.email ?? "",
                address_line1: vendorData.address_line1 ?? "",
                city: vendorData.city ?? "",
                state: vendorData.state ?? "",
                postal_code: vendorData.postal_code ?? "",
                days_available: Array.isArray(vendorData.days_available) ? vendorData.days_available.join(", ") : "",
                operating_hours_open: vendorData.operating_hours_open ?? "",
                operating_hours_close: vendorData.operating_hours_close ?? "",
                owns_supplies: !!vendorData.owns_supplies,
                max_daily_jobs: typeof vendorData.max_daily_jobs === "number" ? vendorData.max_daily_jobs : "",
                payout_percent: typeof vendorData.payout_percent === "number" ? vendorData.payout_percent : "",
                service_area_zip_codes: Array.isArray(vendorData.service_area_zip_codes) ? vendorData.service_area_zip_codes.join(", ") : "",
                external_source: vendorData.external_source ?? "",
                external_id: vendorData.external_id ?? "",
                w9_received: !!vendorData.w9_received,
                ach_verified: !!vendorData.ach_verified,
                consent_contractor_agreement: !!vendorData.consent_contractor_agreement,
                consent_legal: !!vendorData.consent_legal,
                consent_marketing: !!vendorData.consent_marketing,
                payout_override_type: vendorData.payout_override_type ?? "",
                payout_override_value: typeof vendorData.payout_override_value === "number" ? vendorData.payout_override_value : "",
            };
            setFormData(vendorForm);
        } else if (drawer.type === "schedules") {
            setFormData({
                start_at: data.start_at ? new Date(data.start_at as string).toISOString().slice(0, 16) : "",
                end_at: data.end_at ? new Date(data.end_at as string).toISOString().slice(0, 16) : "",
                timezone: data.timezone ?? "",
                status_key: (data.status_key as string) ?? "",
            });
        } else if (drawer.type === "workflows" && !(data as { _create?: boolean })._create) {
            setFormData({
                name: data.name ?? "",
                description: data.description ?? "",
                enabled: data.enabled ?? true,
                event_type: data.event_type ?? "",
                entity_type: data.entity_type ?? "",
            });
        } else if (drawer.type === "locations") {
            const locData = data as Record<string, unknown>;
            const locBase: Record<string, unknown> = {
                label: locData.label ?? "",
                customer_id: (locData.customer_id as string) ?? "",
                location_type_id: (locData.location_type_id as string) ?? "",
                location_type: (locData.location_type as string) ?? "",
                is_active: locData.is_active ?? true,
                is_primary: locData.is_primary ?? false,
                address1: locData.address1 ?? "",
                address2: locData.address2 ?? "",
                city: locData.city ?? "",
                state: locData.state ?? "",
                postal_code: locData.postal_code ?? "",
                country: locData.country ?? "",
                access_notes: locData.access_notes ?? "",
                access_code: locData.access_code ?? "",
                access_method_key: (locData.access_method_key as string) ?? "",
                beds: locData.beds ?? "",
                baths: locData.baths ?? "",
                home_type_key: (locData.home_type_key as string) ?? "",
                square_footage_tier_key: (locData.square_footage_tier_key as string) ?? "",
                status_key: (locData.status_key as string) ?? "",
            };
            mergeConfiguredFieldFormValues(locBase, locData, (data._field_definitions as FieldDefRow[] | undefined) ?? []);
            for (const k of LOCATION_CUSTOM_DEF_KEYS_SHADOWED_BY_CANONICAL) {
                if (locationCustomDefShadowedByCanonical(k, locData)) {
                    delete locBase[k];
                }
            }
            setFormData(locBase);
        } else if (drawer.type === "customer_members") {
            const rel = (data.relationship as string) ?? "";
            const meta = (data.metadata as Record<string, unknown>) || {};
            const custom = (meta.relationship_custom as string) ?? "";
            const opts = memberRelationshipOptions;
            const inOpts = opts.some((o) => o.key === rel);
            setFormData({
                customer_id: data.customer_id ?? "",
                display_name: data.display_name ?? "",
                relationship: inOpts ? rel : "other",
                relationship_custom: inOpts ? custom : (custom || rel),
                first_name: data.first_name ?? "",
                last_name: data.last_name ?? "",
                dob: data.dob ?? "",
                is_active: data.is_active ?? true,
                status_key: (data.status_key as string) ?? "",
                external_source: (data.external_source as string) ?? "",
                external_id: (data.external_id as string) ?? "",
            });
        } else if (drawer.type === "subscriptions") {
            setFormData({
                status: (data.status as string) ?? "",
            });
        } else if (drawer.type === "documents") {
            setFormData({
                status_key: (data.status_key as string) ?? "",
            });
        }
        setSaveError(null);
        setIsEditing(true);
    }, [data, drawer.type, memberRelationshipOptions]);

    useEffect(() => {
        if (drawer.type !== "locations" || !(data as { _create?: boolean })?._create || !drawer.defaultCustomerId) return;
        setFormData((prev) => ({ ...prev, customer_id: drawer.defaultCustomerId ?? "" }));
    }, [drawer.type, (data as { _create?: boolean })?._create, drawer.defaultCustomerId]);

    useEffect(() => {
        if (!drawer.type || !STATUS_ENTITY_TYPES.includes(drawer.type) || !(data as { _create?: boolean })?._create) return;
        if (statusDefsForDrawer.length === 0) return;
        const def = defaultStatusKeyForCreate;
        if (!def) return;
        setFormData((prev) => (prev.status_key === undefined || prev.status_key === "" ? { ...prev, status_key: def } : prev));
    }, [drawer.type, data, statusDefsForDrawer.length, defaultStatusKeyForCreate]);

    useEffect(() => {
        if (drawer.type !== "jobs" || !data || !(data as { _create?: boolean })._create) return;
        const prefill = drawer.defaultJobPrefill;
        setFormData((prev) => ({
            ...prev,
            customer_id: prefill?.customer_id ?? "",
            primary_contact_id: prefill?.primary_contact_id ?? "",
            opportunity_id: prefill?.opportunity_id ?? "",
            discount_code_id: "",
        }));
    }, [drawer.type, data?.id, (data as { _create?: boolean })?._create, drawer.defaultJobPrefill?.opportunity_id, drawer.defaultJobPrefill?.customer_id, drawer.defaultJobPrefill?.primary_contact_id]);

    useEffect(() => {
        if (drawer.type !== "jobs") {
            setJobDiscountOptions([]);
            return;
        }
        const verticalSlug = (data as { _vertical_slug?: string | null } | null)?._vertical_slug ?? null;
        const params = new URLSearchParams();
        if (verticalSlug) params.set("vertical_slug", verticalSlug);
        fetch(`/api/admin/discount-code-options?${params.toString()}`)
            .then((r) => (r.ok ? r.json() : { discount_options: [] }))
            .then((j: { discount_options?: JobDiscountOptionDto[] }) => setJobDiscountOptions(Array.isArray(j.discount_options) ? j.discount_options : []))
            .catch(() => setJobDiscountOptions([]));
    }, [drawer.type, (data as { _vertical_slug?: string | null } | null)?._vertical_slug]);

    const JOB_FORM_KEYS = ["title", "service_key", "job_type", "description", "scheduled_at", "completed_at", "service_frequency_key", "is_recurring", "status_key", "internal_notes", "gross_price_cents", "discount_amount", "primary_contact_id", "customer_id", "opportunity_id", "location_id", "work_unit_id", "discount_code_id", "assigned_vendor_id"] as const;
    useEffect(() => {
        if (drawer.type !== "vendors" || !drawer.id) {
            setVendorPayout(null);
            setVendorPayoutJobId("");
            setVendorPayoutJobIdInput("");
            setVendorPayoutJobOptions([]);
            return;
        }
        setVendorPayoutLoading(true);
        const params = new URLSearchParams();
        if (vendorPayoutJobId.trim()) params.set("job_id", vendorPayoutJobId.trim());
        fetch(`/api/admin/vendors/${drawer.id}/payout?${params.toString()}`)
            .then((r) => r.ok ? r.json() : null)
            .then((j: { policy?: { mode: string; value?: number }; source?: string; completed_occurrences?: number; payout_percent?: number } | null) => {
                if (j?.policy) setVendorPayout({ policy: j.policy, source: j.source ?? "legacy", completed_occurrences: j.completed_occurrences ?? 0, payout_percent: j.payout_percent ?? 80 });
                else setVendorPayout(null);
            })
            .catch(() => setVendorPayout(null))
            .finally(() => setVendorPayoutLoading(false));
    }, [drawer.type, drawer.id, vendorPayoutJobId]);

    useEffect(() => {
        if (drawer.type !== "vendors" || !vendorPayoutJobId.trim()) {
            setVendorPayoutJobPayout(null);
            return;
        }
        setVendorPayoutJobPayout(null);
        fetch(`/api/admin/jobs/${vendorPayoutJobId.trim()}/payout`)
            .then((r) => (r.ok ? r.json() : null))
            .then((j: { job?: { completed_occurrences_total: number; current_payout_percent: number; completed_payout_cents_total?: number } } | null) => {
                if (j?.job) setVendorPayoutJobPayout({ job: j.job });
                else setVendorPayoutJobPayout(null);
            })
            .catch(() => setVendorPayoutJobPayout(null));
    }, [drawer.type, vendorPayoutJobId]);

    useEffect(() => {
        if (drawer.type !== "vendors" || !drawer.id) {
            setVendorPayoutJobOptions([]);
            return;
        }
        fetch(`/api/admin/jobs?assigned_vendor_id=${encodeURIComponent(drawer.id)}&limit=100`)
            .then((r) => (r.ok ? r.json() : { jobs: [] }))
            .then((j: { jobs?: { id: string; title: string | null }[] }) => setVendorPayoutJobOptions(j.jobs ?? []))
            .catch(() => setVendorPayoutJobOptions([]));
    }, [drawer.type, drawer.id]);

    useEffect(() => {
        if (drawer.type !== "vendors" || !data) return;
        const meta = data.metadata as { vendor_payout_policy?: VendorPayoutOverridePolicy } | undefined;
        const p = meta?.vendor_payout_policy;
        if (p && typeof p === "object" && (p.mode === "flat" || p.mode === "tiered")) {
            setVendorPayoutOverrideEnabled(true);
            setVendorPayoutOverrideForm({
                mode: p.mode ?? "flat",
                value: typeof p.value === "number" ? p.value : 80,
                basis: p.basis ?? "job_completed_occurrences",
                completed_status_key: p.completed_status_key ?? "completed",
                tiers: Array.isArray(p.tiers) && p.tiers.length ? p.tiers : [{ from: 1, to: null, value: 80 }],
            });
        } else {
            setVendorPayoutOverrideEnabled(false);
            setVendorPayoutOverrideForm({ mode: "flat", value: 80, completed_status_key: "completed", tiers: [{ from: 1, to: null, value: 80 }] });
        }
    }, [drawer.type, data?.id, (data as { metadata?: unknown })?.metadata]);

    useEffect(() => {
        if (drawer.type !== "jobs") {
            setJobCustomerOptions([]);
            setJobFrequencyOptions([]);
            setJobContactOptions([]);
            setJobContactOptionsLoading(false);
            return;
        }
        const init = workspaceDataFetchInit();
        dedupeAdminFetchWithTtl("/api/admin/customer-options", init, 1500)
            .then((r) => (r.ok ? r.json() : { customers: [] }))
            .then((j: { customers?: { id: string; name: string | null; status_key?: string | null }[] }) =>
                setJobCustomerOptions(j.customers ?? [])
            )
            .catch(() => setJobCustomerOptions([]));
        dedupeAdminFetchWithTtl("/api/admin/service-frequency-options", init, 1500)
            .then((r) => (r.ok ? r.json() : { frequencies: [] }))
            .then((j: { frequencies?: { key: string; label: string; is_recurring: boolean }[] }) =>
                setJobFrequencyOptions(j.frequencies ?? [])
            )
            .catch(() => setJobFrequencyOptions([]));
    }, [drawer.type]);

    useEffect(() => {
        if (drawer.type !== "jobs") return;
        const cid = typeof formData.customer_id === "string" ? formData.customer_id.trim() : "";
        if (!cid) {
            setJobContactOptions([]);
            setJobContactOptionsLoading(false);
            return;
        }
        setJobContactOptionsLoading(true);
        const init = workspaceDataFetchInit();
        dedupeAdminFetchWithTtl(`/api/admin/contact-options?customer_id=${encodeURIComponent(cid)}`, init, 1500)
            .then((r) => (r.ok ? r.json() : { contacts: [] }))
            .then((j: { contacts?: { id: string; label: string }[] }) => setJobContactOptions(j.contacts ?? []))
            .catch(() => setJobContactOptions([]))
            .finally(() => setJobContactOptionsLoading(false));
    }, [drawer.type, formData.customer_id]);

    useEffect(() => {
        if (drawer.type !== "jobs") {
            setJobLocationOptions([]);
            return;
        }
        const init = workspaceDataFetchInit();
        dedupeAdminFetchWithTtl("/api/admin/location-options", init, 1500)
            .then((r) => (r.ok ? r.json() : { locations: [] }))
            .then((j: { locations?: { id: string; label: string }[] }) => setJobLocationOptions(j.locations ?? []))
            .catch(() => setJobLocationOptions([]));
    }, [drawer.type]);

    useEffect(() => {
        if (drawer.type !== "jobs") {
            setJobWorkUnitOptions([]);
            return;
        }
        let cancelled = false;
        Promise.all([fetch("/api/admin/departments"), fetch("/api/admin/work-units")])
            .then(async ([dRes, wRes]) => {
                if (!dRes.ok || !wRes.ok) {
                    if (!cancelled) setJobWorkUnitOptions([]);
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
                const wuid = data?.work_unit_id ? String(data.work_unit_id) : "";
                const wuLbl = String((data as { _work_unit_label?: string | null } | null)?._work_unit_label ?? "").trim();
                if (wuid && !opts.some((o) => o.id === wuid)) {
                    opts = [...opts, { id: wuid, label: wuLbl || `${wuid.slice(0, 8)}…` }];
                }
                if (!cancelled) setJobWorkUnitOptions(opts);
            })
            .catch(() => {
                if (!cancelled) setJobWorkUnitOptions([]);
            });
        return () => {
            cancelled = true;
        };
    }, [drawer.type, data?.id, data?.work_unit_id, (data as { _work_unit_label?: string | null } | null)?._work_unit_label]);

    useEffect(() => {
        if (drawer.type !== "jobs") {
            setJobOpportunityOptions([]);
            return;
        }
        const cid = typeof formData.customer_id === "string" ? formData.customer_id.trim() : "";
        if (!cid) {
            setJobOpportunityOptions([]);
            return;
        }
        const init = workspaceDataFetchInit();
        dedupeAdminFetchWithTtl(`/api/admin/opportunity-options?customer_id=${encodeURIComponent(cid)}`, init, 1500)
            .then((r) => (r.ok ? r.json() : { opportunities: [] }))
            .then((j: { opportunities?: { id: string; label: string }[] }) => setJobOpportunityOptions(j.opportunities ?? []))
            .catch(() => setJobOpportunityOptions([]));
    }, [drawer.type, formData.customer_id]);

    useEffect(() => {
        if (drawer.type !== "jobs" || !(data as { _create?: boolean } | null)?._create || statusDefsForDrawer.length === 0) return;
        setFormData((prev) => {
            if (String(prev.status_key ?? "").trim()) return prev;
            const active = statusDefsForDrawer.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order);
            const first = active[0]?.status_key ?? statusDefsForDrawer[0]?.status_key;
            return first ? { ...prev, status_key: first } : prev;
        });
    }, [drawer.type, data, statusDefsForDrawer]);

    useEffect(() => {
        if (drawer.type !== "jobs") {
            setJobPersonOptions([]);
            return;
        }
        const cid = typeof formData.customer_id === "string" ? formData.customer_id.trim() : "";
        if (!cid) {
            setJobPersonOptions([]);
            return;
        }
        const init = workspaceDataFetchInit();
        dedupeAdminFetchWithTtl(`/api/admin/person-options?customer_id=${encodeURIComponent(cid)}`, init, 1500)
            .then((r) => (r.ok ? r.json() : { persons: [] }))
            .then((j: { persons?: { id: string; label: string }[] }) => setJobPersonOptions(j.persons ?? []))
            .catch(() => setJobPersonOptions([]));
    }, [drawer.type, formData.customer_id]);

    const refetchJobPayout = useCallback(() => {
        if (drawer.type !== "jobs" || !drawer.id || drawer.id === "new") return Promise.resolve();
        setJobPayoutLoading(true);
        return fetch(`/api/admin/jobs/${drawer.id}/payout`)
            .then((r) => (r.ok ? r.json() : null))
            .then((j: JobPayoutResponse | null) => setJobPayout(j))
            .catch(() => setJobPayout(null))
            .finally(() => setJobPayoutLoading(false));
    }, [drawer.type, drawer.id]);

    useEffect(() => {
        if (drawer.type !== "jobs" || !drawer.id || drawer.id === "new") {
            setJobPayout(null);
            return;
        }
        void refetchJobPayout();
    }, [drawer.type, drawer.id, refetchJobPayout]);

    const refetchJobFinancials = useCallback(() => {
        if (drawer.type !== "jobs" || !drawer.id || drawer.id === "new") return Promise.resolve();
        setJobFinancialsLoading(true);
        return fetch(`/api/admin/financials/job/${drawer.id}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => setJobFinancials(j))
            .catch(() => setJobFinancials(null))
            .finally(() => setJobFinancialsLoading(false));
    }, [drawer.type, drawer.id]);

    const refetchScheduleFinancials = useCallback(() => {
        if (drawer.type !== "schedules" || !drawer.id || drawer.id === "new") return Promise.resolve();
        setScheduleFinancialsLoading(true);
        return fetch(`/api/admin/financials/schedule/${drawer.id}`)
            .then((r) => (r.ok ? r.json() : null))
            .then(setScheduleFinancials)
            .catch(() => setScheduleFinancials(null))
            .finally(() => setScheduleFinancialsLoading(false));
    }, [drawer.type, drawer.id]);

    useEffect(() => {
        if (drawer.type !== "schedules" || !drawer.id || drawer.id === "new") {
            setScheduleFinancials(null);
            return;
        }
        void refetchScheduleFinancials();
    }, [drawer.type, drawer.id, refetchScheduleFinancials]);

    const refetchScheduleRelatedDocuments = useCallback(() => {
        if (drawer.type !== "schedules" || !drawer.id || drawer.id === "new") return;
        setScheduleRelatedDocumentsLoading(true);
        fetch(`/api/admin/related/schedule/${drawer.id}`)
            .then((r) => (r.ok ? r.json() : { documents: [] }))
            .then((json: { documents?: JobRelatedPayload["documents"] }) => setScheduleRelatedDocuments(json.documents ?? []))
            .catch(() => setScheduleRelatedDocuments([]))
            .finally(() => setScheduleRelatedDocumentsLoading(false));
    }, [drawer.type, drawer.id]);

    useEffect(() => {
        if (drawer.type !== "schedules" || !drawer.id || drawer.id === "new") {
            setScheduleRelatedDocuments([]);
            return;
        }
        refetchScheduleRelatedDocuments();
    }, [drawer.type, drawer.id, refetchScheduleRelatedDocuments]);

    useEffect(() => {
        if (drawer.type !== "jobs" || !drawer.id || drawer.id === "new") {
            setJobFinancials(null);
            return;
        }
        void refetchJobFinancials();
    }, [drawer.type, drawer.id, refetchJobFinancials]);

    useEffect(() => {
        const onScheduleSavedRefreshJob = (ev: Event) => {
            const e = ev as CustomEvent<{ type?: string; job_id?: string }>;
            if (e.detail?.type !== "schedules" || !e.detail.job_id) return;
            if (drawer.type !== "jobs" || drawer.id !== e.detail.job_id) return;
            void refetchJobFinancials();
            void refetchJobPayout();
            void refetchJobRelatedData();
            void refetchJobPayments();
        };
        window.addEventListener("admin-entity-saved", onScheduleSavedRefreshJob);
        return () => window.removeEventListener("admin-entity-saved", onScheduleSavedRefreshJob);
    }, [drawer.type, drawer.id, refetchJobFinancials, refetchJobPayout, refetchJobRelatedData, refetchJobPayments]);

    useEffect(() => {
        if (drawer.type !== "jobs" || !data || (data as { _create?: boolean })._create) {
            setInitialJobFormData(null);
            return;
        }
        const meta = (data.metadata as Record<string, unknown>) || {};
        const snapshot = {
            title: (data.title as string) ?? "",
            service_key: (data.service_key as string) ?? "",
            job_type: (data.job_type as string) ?? "",
            description: (data.description as string) ?? "",
            customer_id: (data.customer_id as string) ?? "",
            opportunity_id: (data.opportunity_id as string) ?? "",
            location_id: (data.location_id as string) ?? "",
            scheduled_at: data.scheduled_at ? new Date(data.scheduled_at as string).toISOString().slice(0, 16) : "",
            completed_at: data.completed_at ? new Date(data.completed_at as string).toISOString().slice(0, 16) : "",
            service_frequency_key: (data.service_frequency_key as string) ?? "",
            is_recurring: data.is_recurring ?? false,
            status_key: (data.status_key as string) ?? "",
            internal_notes: (meta.internal_notes as string) ?? "",
            gross_price_cents: data.gross_price_cents ?? null,
            discount_amount: data.discount_amount ?? null,
            display_total_cents: (data as { display_total_cents?: number | null }).display_total_cents ?? null,
            _discount_amount_cents: (data as { _discount_amount_cents?: number | null })._discount_amount_cents ?? null,
            primary_contact_id: (data.primary_contact_id as string) ?? "",
            discount_code_id:
                (data as { _discount_selection?: string })._discount_selection ??
                ((data as { discount_code_id?: string | null }).discount_code_id
                    ? `code:${(data as { discount_code_id: string }).discount_code_id}`
                    : ""),
            assigned_vendor_id: (data.assigned_vendor_id as string) ?? "",
            work_unit_id: (data.work_unit_id as string) ?? "",
        };
        const jobDefs = (data._field_definitions as { field_key: string; is_system: boolean }[] | undefined) ?? [];
        for (const d of jobDefs) { if (!d.is_system) (snapshot as Record<string, unknown>)[d.field_key] = (data as Record<string, unknown>)[d.field_key] ?? ""; }
        setFormData((prev) => ({ ...prev, ...snapshot }));
        setInitialJobFormData(snapshot);
    }, [drawer.type, drawer.id, data?.id]);

    /** Keep formData aligned with server row when switching drawers (subscriptions/documents/locations are not in INLINE_EDIT_ENTITY_TYPES). */
    useEffect(() => {
        if (!drawer.id || drawer.id === "new" || !data || (data as { _create?: boolean })._create) return;
        if (String((data as { id?: string }).id) !== String(drawer.id)) return;

        if (drawer.type === "subscriptions") {
            setFormData((prev) => ({ ...prev, status: (data.status as string) ?? "" }));
            return;
        }
        if (drawer.type === "documents") {
            setFormData((prev) => ({ ...prev, status_key: (data.status_key as string) ?? "" }));
            return;
        }
        if (drawer.type === "locations") {
            const locData = data as Record<string, unknown>;
            const next: Record<string, unknown> = {
                label: (locData.label as string) ?? "",
                customer_id: (locData.customer_id as string) ?? "",
                location_type_id: (locData.location_type_id as string) ?? "",
                location_type: (locData.location_type as string) ?? "",
                is_active: locData.is_active ?? true,
                is_primary: locData.is_primary ?? false,
                address1: (locData.address1 as string) ?? "",
                address2: (locData.address2 as string) ?? "",
                city: (locData.city as string) ?? "",
                state: (locData.state as string) ?? "",
                postal_code: (locData.postal_code as string) ?? "",
                country: (locData.country as string) ?? "",
                access_notes: (locData.access_notes as string) ?? "",
                access_code: (locData.access_code as string) ?? "",
                access_method_key: (locData.access_method_key as string) ?? "",
                beds: locData.beds ?? "",
                baths: locData.baths ?? "",
                home_type_key: (locData.home_type_key as string) ?? "",
                square_footage_tier_key: (locData.square_footage_tier_key as string) ?? "",
                status_key: (locData.status_key as string) ?? "",
            };
            const locDefs = (data._field_definitions as FieldDefRow[] | undefined) ?? [];
            mergeConfiguredFieldFormValues(next, locData, locDefs);
            setFormData((prev) => ({ ...prev, ...next }));
        }
    }, [drawer.type, drawer.id, data]);

    const jobFormDirty = useMemo(() => {
        if (drawer.type !== "jobs" || !initialJobFormData) return false;
        if (JOB_FORM_KEYS.some((k) => {
            const a = formData[k];
            const b = initialJobFormData[k];
            if (a === b) return false;
            if (typeof a === "number" && typeof b === "number") return a !== b;
            return String(a ?? "") !== String(b ?? "");
        })) return true;
        const jobDefs = (data?._field_definitions as { field_key: string; is_system: boolean }[] | undefined) ?? [];
        return jobDefs.some((d) => !d.is_system && String((formData as Record<string, unknown>)[d.field_key] ?? "") !== String((data as Record<string, unknown>)?.[d.field_key] ?? ""));
    }, [drawer.type, initialJobFormData, data, formData]);

    useEffect(() => {
        if (!data || !drawer.type || !INLINE_EDIT_ENTITY_TYPES.includes(drawer.type as (typeof INLINE_EDIT_ENTITY_TYPES)[number]) || (data as { _create?: boolean })?._create) {
            if (drawer.type && !INLINE_EDIT_ENTITY_TYPES.includes(drawer.type as (typeof INLINE_EDIT_ENTITY_TYPES)[number])) setInitialInlineFormSnapshot(null);
            return;
        }
        let initial: Record<string, unknown>;
        if (drawer.type === "contacts") {
            initial = {
                first_name: data.first_name ?? "",
                last_name: data.last_name ?? "",
                email: data.email ?? "",
                phone: data.phone ?? "",
                company_name: (data.company_name as string) ?? "",
                notes: (data.notes as string) ?? "",
                status_key: (data.status_key as string) ?? "",
                contact_type: (data.contact_type as string) ?? "",
                customer_id: (data.customer_id as string) ?? "",
                vendor_id: (data.vendor_id as string) ?? "",
                vendor_contact_role: (data.vendor_contact_role as string) ?? "",
            };
        } else if (drawer.type === "customers") {
            initial = {
                name: data.name ?? "",
                status_key: (data.status_key as string) ?? "",
                customer_type: (data.customer_type as string) ?? "",
                external_source: (data.external_source as string) ?? "",
                external_id: (data.external_id as string) ?? "",
            };
            const custDefs = (data._field_definitions as { field_key: string; is_system: boolean }[] | undefined) ?? [];
            for (const d of custDefs) { if (!d.is_system) (initial as Record<string, unknown>)[d.field_key] = (data[d.field_key] as string) ?? ""; }
        } else if (drawer.type === "vendors") {
            const v = data as { vendor_status_id?: string | null; primary_person_id?: string | null; name?: string | null; company_name?: string | null; phone?: string | null; email?: string | null; address_line1?: string | null; city?: string | null; state?: string | null; postal_code?: string | null; days_available?: string[] | null; operating_hours_open?: string | null; operating_hours_close?: string | null; owns_supplies?: boolean | null; max_daily_jobs?: number | null; payout_percent?: number | null; service_area_zip_codes?: string[] | null; external_source?: string | null; external_id?: string | null; w9_received?: boolean | null; ach_verified?: boolean | null; consent_contractor_agreement?: boolean | null; consent_legal?: boolean | null; consent_marketing?: boolean | null; payout_override_type?: string | null; payout_override_value?: number | null };
            initial = {
                primary_person_id: v.primary_person_id ?? "",
                status_key: ((data.status_key ?? (data as { status?: string | null }).status) as string) ?? "",
                name: v.name ?? "",
                company_name: v.company_name ?? "",
                phone: v.phone ?? "",
                email: v.email ?? "",
                address_line1: v.address_line1 ?? "",
                city: v.city ?? "",
                state: v.state ?? "",
                postal_code: v.postal_code ?? "",
                days_available: Array.isArray(v.days_available) ? v.days_available.join(", ") : "",
                operating_hours_open: v.operating_hours_open ?? "",
                operating_hours_close: v.operating_hours_close ?? "",
                owns_supplies: !!v.owns_supplies,
                max_daily_jobs: typeof v.max_daily_jobs === "number" ? v.max_daily_jobs : "",
                payout_percent: typeof v.payout_percent === "number" ? v.payout_percent : "",
                service_area_zip_codes: Array.isArray(v.service_area_zip_codes) ? v.service_area_zip_codes.join(", ") : "",
                external_source: v.external_source ?? "",
                external_id: v.external_id ?? "",
                w9_received: !!v.w9_received,
                ach_verified: !!v.ach_verified,
                consent_contractor_agreement: !!v.consent_contractor_agreement,
                consent_legal: !!v.consent_legal,
                consent_marketing: !!v.consent_marketing,
                payout_override_type: v.payout_override_type ?? "",
                payout_override_value: typeof v.payout_override_value === "number" ? v.payout_override_value : "",
            };
            const vendorDefs = (data._field_definitions as { field_key: string; is_system: boolean }[] | undefined) ?? [];
            for (const d of vendorDefs) {
                if (d.is_system || d.field_key === "status_key" || d.field_key === "status") continue;
                (initial as Record<string, unknown>)[d.field_key] = (data[d.field_key] as string) ?? "";
            }
        } else if (drawer.type === "opportunities") {
            const meta = (data.metadata as Record<string, unknown>) || {};
            const opp = data as Record<string, unknown>;
            const quoteTotal =
                opp.quote_total != null && !Number.isNaN(Number(opp.quote_total))
                    ? Number(opp.quote_total)
                    : opp.estimated_price_cents != null && !Number.isNaN(Number(opp.estimated_price_cents))
                        ? Number(opp.estimated_price_cents) / 100
                        : opp.monetary_value_cents != null && !Number.isNaN(Number(opp.monetary_value_cents))
                            ? Number(opp.monetary_value_cents) / 100
                            : "";
            initial = {
                name: (opp.name as string) ?? "",
                job_date: (opp.job_date as string)?.slice(0, 10) ?? "",
                job_time_window: (opp.job_time_window as string) ?? "",
                status_key: (opp.status_key as string) ?? "",
                vertical_id: (opp.vertical_id as string) ?? "",
                quote_total: quoteTotal,
                quote_subtotal: opp.quote_subtotal ?? "",
                discount_amount: opp.discount_amount ?? "",
                discount_code: (opp.discount_code as string) ?? "",
                estimated_price_cents: opp.estimated_price_cents ?? "",
                monetary_value_cents: opp.monetary_value_cents ?? "",
                recurring_price_cents: opp.recurring_price_cents ?? "",
                source: (opp.source as string) ?? "",
                assigned_to: (opp.assigned_to as string) ?? "",
                lost_reason: (opp.lost_reason as string) ?? "",
                appointment_id: (opp.appointment_id as string) ?? "",
                external_source: (opp.external_source as string) ?? "",
                external_id: (opp.external_id as string) ?? "",
                notes: (meta.notes as string) ?? "",
                customer_notes: (meta.notes as string) ?? "",
            };
            const oppDefs = (data._field_definitions as FieldDefRow[] | undefined) ?? [];
            mergeConfiguredFieldFormValues(initial as Record<string, unknown>, opp, oppDefs);
            if (quoteTotal !== "" && quoteTotal != null) (initial as Record<string, unknown>).quote_total = quoteTotal;
        } else if (drawer.type === "schedules") {
            initial = {
                start_at: data.start_at ? new Date(data.start_at as string).toISOString().slice(0, 16) : "",
                end_at: data.end_at ? new Date(data.end_at as string).toISOString().slice(0, 16) : "",
                timezone: data.timezone ?? "",
                status_key: (data.status_key as string) ?? "",
            };
            const schedDefs = (data._field_definitions as { field_key: string; is_system: boolean }[] | undefined) ?? [];
            for (const d of schedDefs) { if (!d.is_system) (initial as Record<string, unknown>)[d.field_key] = (data[d.field_key] as string) ?? ""; }
        } else if (drawer.type === "customer_members") {
            const rel = (data.relationship as string) ?? "";
            const meta = (data.metadata as Record<string, unknown>) || {};
            const custom = (meta.relationship_custom as string) ?? "";
            initial = {
                customer_id: data.customer_id ?? "",
                display_name: data.display_name ?? "",
                relationship: rel,
                relationship_custom: custom || rel,
                first_name: data.first_name ?? "",
                last_name: data.last_name ?? "",
                dob: data.dob ?? "",
                is_active: data.is_active ?? true,
                status_key: (data.status_key as string) ?? "",
                external_source: (data.external_source as string) ?? "",
                external_id: (data.external_id as string) ?? "",
            };
        } else if (drawer.type === "payments") {
            initial = {
                status_key: (data.status_key as string) ?? "",
                paid_at: data.paid_at ? new Date(data.paid_at as string).toISOString().slice(0, 16) : "",
                notes: (data.notes as string) ?? "",
            };
        } else if (drawer.type === "service_offerings") {
            initial = {
                offering_name: (data.offering_name as string) ?? "",
                offering_key: (data.offering_key as string) ?? "",
                is_active: !!data.is_active,
                description: (data.description as string) ?? "",
            };
        } else if (drawer.type === "service_plan_templates") {
            initial = {
                plan_name: (data.plan_name as string) ?? "",
                plan_key: (data.plan_key as string) ?? "",
                is_recurring: !!data.is_recurring,
                recurrence_unit: (data.recurrence_unit as string) ?? "",
                recurrence_interval: data.recurrence_interval != null ? Number(data.recurrence_interval) : 1,
                is_active: !!data.is_active,
                status_key: (data.status_key as string) ?? "",
            };
        } else if (drawer.type === "addons") {
            initial = {
                addon_name: (data.addon_name as string) ?? "",
                addon_key: (data.addon_key as string) ?? "",
                amount_cents: data.amount_cents != null ? Number(data.amount_cents) : 0,
                sort_order: data.sort_order != null ? Number(data.sort_order) : 0,
                is_active: !!data.is_active,
            };
        } else if (drawer.type === "persons") {
            initial = {
                full_name: (data.full_name as string) ?? "",
                first_name: (data.first_name as string) ?? "",
                last_name: (data.last_name as string) ?? "",
                email: (data.email as string) ?? "",
                phone: (data.phone as string) ?? "",
                status_key: (data.status_key as string) ?? "",
                created_at: (data.created_at as string) ?? "",
                updated_at: (data.updated_at as string) ?? "",
            };
            const defs = (data._field_definitions as { field_key: string; is_system: boolean }[] | undefined) ?? [];
            for (const d of defs) {
                if (!d.is_system) (initial as Record<string, unknown>)[d.field_key] = (data as Record<string, unknown>)[d.field_key] ?? "";
            }
        } else {
            return;
        }
        setFormData((prev) => ({ ...prev, ...initial }));
        setInitialInlineFormSnapshot(JSON.stringify(initial));
    }, [data, drawer.type, drawer.id]);

    const nonJobFormDirty = useMemo(() => {
        if (!initialInlineFormSnapshot || !INLINE_EDIT_ENTITY_TYPES.includes(drawer.type as (typeof INLINE_EDIT_ENTITY_TYPES)[number])) return false;
        try {
            const initial = JSON.parse(initialInlineFormSnapshot) as Record<string, unknown>;
            for (const k of Object.keys(initial)) {
                if (JSON.stringify(formData[k as keyof typeof formData]) !== JSON.stringify(initial[k])) return true;
            }
            return false;
        } catch {
            return false;
        }
    }, [drawer.type, initialInlineFormSnapshot, formData]);

    const saveEdit = useCallback(async () => {
        if (!drawer.type || !drawer.id) return;
        if (drawer.id === "new" && (drawer.type === "customers" || drawer.type === "opportunities" || drawer.type === "vendors")) {
            setSaveError("Create from this drawer is not yet available. Use the main list or another flow.");
            return;
        }
        setSaving(true);
        setSaveError(null);
        try {
            /** Locations: handle first so this path never shares payload/url logic with vendors or other entities. */
            if (drawer.type === "locations") {
                const locPayload: Record<string, unknown> = {};
                const keys = [
                    "label",
                    "customer_id",
                    "location_type_id",
                    "location_type",
                    "is_active",
                    "is_primary",
                    "address1",
                    "address2",
                    "city",
                    "state",
                    "postal_code",
                    "country",
                    "access_notes",
                    "access_code",
                    "access_method_key",
                    "beds",
                    "baths",
                    "home_type_key",
                    "square_footage_tier_key",
                    "status_key",
                ] as const;
                for (const k of keys) {
                    if (formData[k] === undefined) continue;
                    if (k === "customer_id") {
                        const v = formData[k];
                        locPayload[k] = (typeof v === "string" && (v as string).trim()) ? (v as string).trim() : null;
                        continue;
                    }
                    if (k === "status_key") {
                        const v = formData.status_key;
                        locPayload.status_key = typeof v === "string" && v.trim() ? v.trim() : null;
                        continue;
                    }
                    if (k === "beds" || k === "baths") {
                        const v = formData[k];
                        if (v === "" || v == null) {
                            locPayload[k] = null;
                        } else if (typeof v === "number" && Number.isFinite(v)) {
                            locPayload[k] = v;
                        } else {
                            const n = parseFloat(String(v).replace(/,/g, ""));
                            locPayload[k] = Number.isFinite(n) ? n : null;
                        }
                        continue;
                    }
                    if (
                        k === "access_method_key" ||
                        k === "home_type_key" ||
                        k === "square_footage_tier_key" ||
                        k === "access_code"
                    ) {
                        const v = formData[k];
                        locPayload[k] =
                            typeof v === "string" ? (v as string).trim() || null : v == null ? null : String(v).trim() || null;
                        continue;
                    }
                    if (k === "label" || k === "address1" || k === "address2" || k === "city" || k === "state" || k === "postal_code" || k === "country" || k === "access_notes") {
                        locPayload[k] = typeof formData[k] === "string" ? (formData[k] as string).trim() || null : null;
                    } else if (k === "location_type_id") {
                        const v = formData[k];
                        locPayload[k] = (typeof v === "string" && (v as string).trim()) ? (v as string).trim() : null;
                    } else if (k === "location_type") {
                        locPayload[k] = typeof formData[k] === "string" && (formData[k] as string).trim() ? (formData[k] as string).trim() : null;
                    } else {
                        locPayload[k] = formData[k];
                    }
                }
                if (drawer.id === "new") {
                    const res = await fetch("/api/admin/locations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(locPayload) });
                    const json = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error((json.error as string) || "Create failed");
                    const newId = (json as { id?: string }).id;
                    if (newId) {
                        window.dispatchEvent(new CustomEvent("admin-entity-saved", { detail: { type: "locations", id: newId } }));
                        openDrawer({ type: "locations", id: newId });
                        router.refresh();
                    }
                    return;
                }
                delete locPayload.customer_id;
                const locDefs = (data?._field_definitions as { field_key: string; is_system: boolean }[] | undefined) ?? [];
                for (const d of locDefs) {
                    if (!d.is_system && formData[d.field_key] !== undefined) {
                        (locPayload as Record<string, unknown>)[d.field_key] = formData[d.field_key];
                    }
                }
                // PATCH: do not send null/empty location_type or location_type_id (status-only saves used to null NOT NULL location_type).
                if (locPayload.location_type === null || locPayload.location_type === "") {
                    delete locPayload.location_type;
                }
                if (locPayload.location_type_id === null || locPayload.location_type_id === "") {
                    delete locPayload.location_type_id;
                }
                const res = await fetch(`/api/admin/locations/${drawer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(locPayload) });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((json.error as string) || "Save failed");
                setData((prev) => (prev ? { ...prev, ...json } : prev));
                refetch();
                router.refresh();
                window.dispatchEvent(new CustomEvent("admin-entity-saved", { detail: { type: "locations", id: drawer.id } }));
                return;
            }
            if (drawer.type === "workflows") {
                const wfPayload = {
                    name: formData.name ?? "",
                    description: (formData.description as string) || null,
                    enabled: !!formData.enabled,
                    event_type: (formData.event_type as string) || null,
                    entity_type: (formData.entity_type as string) || null,
                };
                const res = await fetch(`/api/admin/workflows/${drawer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(wfPayload) });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((json.error as string) || "Save workflow failed");
                const condRes = await fetch(`/api/admin/workflows/${drawer.id}/conditions`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conditions: workflowConditions }) });
                const condJson = await condRes.json().catch(() => ({}));
                if (!condRes.ok) throw new Error((condJson.error as string) || "Save conditions failed");
                const actRes = await fetch(`/api/admin/workflows/${drawer.id}/actions`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actions: workflowActions }) });
                const actJson = await actRes.json().catch(() => ({}));
                if (!actRes.ok) throw new Error((actJson.error as string) || "Save actions failed");
                setData((prev) => prev ? { ...prev, ...json, _conditions: workflowConditions, _actions: workflowActions } : prev);
                refetch();
                router.refresh();
                return;
            }
            if (drawer.type === "customer_members") {
                const rel = typeof formData.relationship === "string" ? formData.relationship.trim() || null : null;
                const existingMeta = (data?.metadata as Record<string, unknown>) || {};
                const meta = rel === "other"
                    ? { ...existingMeta, relationship_custom: (formData.relationship_custom as string)?.trim() || null }
                    : existingMeta;
                const status_key = typeof formData.status_key === "string" && formData.status_key.trim() ? formData.status_key.trim() : null;
                const payload = {
                    display_name: typeof formData.display_name === "string" ? formData.display_name.trim() : "",
                    relationship: rel,
                    first_name: typeof formData.first_name === "string" ? formData.first_name.trim() || null : null,
                    last_name: typeof formData.last_name === "string" ? formData.last_name.trim() || null : null,
                    dob: typeof formData.dob === "string" && formData.dob.trim() ? formData.dob.trim() : null,
                    is_active: !!formData.is_active,
                    status_key,
                    external_source: typeof formData.external_source === "string" ? formData.external_source.trim() || null : null,
                    external_id: typeof formData.external_id === "string" ? formData.external_id.trim() || null : null,
                    metadata: Object.keys(meta).length ? meta : undefined,
                };
                const res = await fetch(`/api/admin/customer-members/${drawer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((json.error as string) || "Save failed");
                setData((prev) => (prev ? { ...prev, ...json } : prev));
                refetch();
                router.refresh();
                window.dispatchEvent(
                    new CustomEvent("adminv2:opportunity-updated", { detail: { id: "", action_key: "customer_member_inline_save" } })
                );
                return;
            }
            if (drawer.type === "payments") {
                const payload = {
                    status_key: typeof formData.status_key === "string" && formData.status_key.trim() ? formData.status_key.trim() : null,
                    paid_at: typeof formData.paid_at === "string" && formData.paid_at.trim() ? new Date(formData.paid_at).toISOString() : null,
                    notes: typeof formData.notes === "string" ? (formData.notes.trim() || null) : null,
                };
                const res = await fetch(`/api/admin/payments/${drawer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((json.error as string) || "Save failed");
                setData((prev) => (prev ? { ...prev, ...json } : prev));
                refetch();
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 2000);
                window.dispatchEvent(new CustomEvent("admin-entity-saved", { detail: { type: "payments", id: drawer.id } }));
                return;
            }
            if (drawer.type === "service_offerings") {
                const payload = {
                    offering_name: typeof formData.offering_name === "string" ? (formData.offering_name.trim() || null) : null,
                    offering_key: typeof formData.offering_key === "string" ? (formData.offering_key.trim() || null) : null,
                    is_active: !!formData.is_active,
                    description: typeof formData.description === "string" ? (formData.description.trim() || null) : null,
                };
                const res = await fetch(`/api/admin/service-offerings/${drawer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((json.error as string) || "Save failed");
                setData((prev) => (prev ? { ...prev, ...json } : prev));
                refetch();
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 2000);
                window.dispatchEvent(new CustomEvent("admin-entity-saved", { detail: { type: "service_offerings", id: drawer.id } }));
                return;
            }
            if (drawer.type === "service_plan_templates") {
                const interval = formData.recurrence_interval != null ? Math.max(1, Number(formData.recurrence_interval) || 1) : undefined;
                const payload = {
                    plan_name: typeof formData.plan_name === "string" ? (formData.plan_name.trim() || null) : null,
                    plan_key: typeof formData.plan_key === "string" ? (formData.plan_key.trim() || null) : null,
                    is_recurring: !!formData.is_recurring,
                    recurrence_unit: typeof formData.recurrence_unit === "string" ? (formData.recurrence_unit.trim() || null) : null,
                    recurrence_interval: interval,
                    is_active: !!formData.is_active,
                    status_key:
                        typeof formData.status_key === "string" && formData.status_key.trim() ? formData.status_key.trim() : null,
                };
                const res = await fetch(`/api/admin/service-plan-templates/${drawer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((json.error as string) || "Save failed");
                setData((prev) => (prev ? { ...prev, ...json } : prev));
                refetch();
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 2000);
                window.dispatchEvent(new CustomEvent("admin-entity-saved", { detail: { type: "service_plan_templates", id: drawer.id } }));
                return;
            }
            if (drawer.type === "addons") {
                const amountCents = formData.amount_cents != null ? Math.max(0, Math.round(Number(formData.amount_cents))) : undefined;
                const payload = {
                    addon_name: typeof formData.addon_name === "string" ? (formData.addon_name.trim() || null) : null,
                    addon_key: typeof formData.addon_key === "string" ? (formData.addon_key.trim() || null) : null,
                    amount_cents: amountCents,
                    sort_order: formData.sort_order != null ? Math.max(0, Math.round(Number(formData.sort_order) || 0)) : undefined,
                    is_active: !!formData.is_active,
                };
                const res = await fetch(`/api/admin/addons/${drawer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((json.error as string) || "Save failed");
                setData((prev) => (prev ? { ...prev, ...json } : prev));
                refetch();
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 2000);
                window.dispatchEvent(new CustomEvent("admin-entity-saved", { detail: { type: "addons", id: drawer.id } }));
                return;
            }
            if (drawer.type === "persons") {
                const personPayload: Record<string, unknown> = {
                    first_name: typeof formData.first_name === "string" ? formData.first_name.trim() || null : null,
                    last_name: typeof formData.last_name === "string" ? formData.last_name.trim() || null : null,
                    email: typeof formData.email === "string" ? formData.email.trim() || null : null,
                    phone: typeof formData.phone === "string" ? formData.phone.trim() || null : null,
                    status_key:
                        typeof formData.status_key === "string" && formData.status_key.trim() ? formData.status_key.trim() : null,
                };
                const defs = (data?._field_definitions as { field_key: string; is_system: boolean }[] | undefined) ?? [];
                for (const d of defs) {
                    if (!d.is_system && formData[d.field_key] !== undefined) {
                        personPayload[d.field_key] = formData[d.field_key] == null ? "" : String(formData[d.field_key]);
                    }
                }
                const res = await fetch(`/api/admin/persons/${drawer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(personPayload) });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((json as { error?: string }).error ?? "Save failed");
                setData((prev) => (prev ? { ...prev, ...json, _field_definitions: prev._field_definitions } : prev));
                setFormData((prev) => ({ ...prev, ...json }));
                setInitialInlineFormSnapshot(JSON.stringify({ ...json, ...personPayload }));
                setSaveError(null);
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 2500);
                refetch();
                router.refresh();
                return;
            }
            if (drawer.type === "contacts") {
                const contactPayload: Record<string, unknown> = {
                    first_name: typeof formData.first_name === "string" ? (formData.first_name.trim() || null) : null,
                    last_name: typeof formData.last_name === "string" ? (formData.last_name.trim() || null) : null,
                    email: typeof formData.email === "string" ? (formData.email.trim() || null) : null,
                    phone: typeof formData.phone === "string" ? (formData.phone.trim() || null) : null,
                    company_name: typeof formData.company_name === "string" ? (formData.company_name.trim() || null) : null,
                    notes: typeof formData.notes === "string" ? (formData.notes.trim() || null) : null,
                    status_key: typeof formData.status_key === "string" && formData.status_key.trim() ? formData.status_key.trim() : null,
                    contact_type: typeof formData.contact_type === "string" ? (formData.contact_type.trim() || null) : null,
                    customer_id: typeof formData.customer_id === "string" && formData.customer_id.trim() ? formData.customer_id.trim() : null,
                    vendor_id: typeof formData.vendor_id === "string" && formData.vendor_id.trim() ? formData.vendor_id.trim() : null,
                    vendor_contact_role: typeof formData.vendor_contact_role === "string" ? (formData.vendor_contact_role.trim() || null) : null,
                };
                const res = await fetch(`/api/admin/contacts/${drawer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(contactPayload) });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((json as { error?: string }).error ?? "Save failed");
                setData((prev) => (prev ? { ...prev, ...json } : prev));
                setFormData((prev) => ({ ...prev, ...json }));
                setInitialInlineFormSnapshot(JSON.stringify({
                    first_name: json.first_name ?? "",
                    last_name: json.last_name ?? "",
                    email: json.email ?? "",
                    phone: json.phone ?? "",
                    company_name: (json.company_name as string) ?? "",
                    notes: (json.notes as string) ?? "",
                    status_key: (json.status_key as string) ?? "",
                    contact_type: (json.contact_type as string) ?? "",
                    customer_id: (json.customer_id as string) ?? "",
                    vendor_id: (json.vendor_id as string) ?? "",
                    vendor_contact_role: (json.vendor_contact_role as string) ?? "",
                }));
                setSaveError(null);
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 2500);
                refetch();
                router.refresh();
                return;
            }
            const url = `/api/admin/${drawer.type}/${drawer.id}`;
            const payload: Record<string, unknown> = { ...formData };
            if ("status_label" in payload) delete payload.status_label;
            if (drawer.type === "opportunities") {
                const notes = formData.customer_notes !== undefined ? formData.customer_notes : payload.notes;
                if ("notes" in payload) delete payload.notes;
                if ("customer_notes" in payload) delete payload.customer_notes;
                if (notes !== undefined) payload.notes = (typeof notes === "string" && notes.trim() === "") ? null : notes;
                delete payload.pipeline_stage_id;
                if (payload.status_key === "" || payload.status_key === undefined) payload.status_key = null;
                // Normalize nullable date fields: HTML date inputs emit "" when cleared.
                // Sending job_date: "" causes Postgres "invalid input syntax for type date".
                if (typeof payload.job_date === "string" && payload.job_date.trim() === "") payload.job_date = null;
                for (const dk of ["desired_start_date", "tour_date"] as const) {
                    const tv = payload[dk];
                    if (tv === "" || tv === undefined || (typeof tv === "string" && tv.trim() === "")) {
                        payload[dk] = null;
                    }
                }
            }
            if (drawer.type === "jobs") {
                if ("internal_notes" in payload) {
                    const internal_notes = payload.internal_notes;
                    delete payload.internal_notes;
                    if (internal_notes !== undefined) payload.internal_notes = internal_notes === "" ? null : internal_notes;
                }
                const existingMeta = (data?.metadata as Record<string, unknown>) || {};
                const internalNotes = formData.internal_notes !== undefined ? (formData.internal_notes === "" ? null : formData.internal_notes) : (existingMeta.internal_notes ?? null);
                payload.metadata = { ...existingMeta, internal_notes: internalNotes };
                const grossCents = Number(formData.gross_price_cents ?? 0);
                const discountToken = typeof formData.discount_code_id === "string" && formData.discount_code_id.trim() ? formData.discount_code_id.trim() : null;
                const selectedOpt = discountToken ? jobDiscountOptions.find((o) => o.value === discountToken) ?? null : null;
                const discountCents = selectedOpt ? computeJobDiscountOptionPreviewCents(selectedOpt, grossCents) : 0;
                payload.gross_price_cents = grossCents;
                payload.discount_code_id = discountToken ?? null;
                payload.discount_code = selectedOpt ? selectedOpt.code : null;
                payload.discount_amount = discountCents;
                payload.discounted = !!selectedOpt;
                if (payload.customer_id === "") payload.customer_id = null;
                if (payload.opportunity_id === "") payload.opportunity_id = null;
                if (payload.location_id === "") payload.location_id = null;
                if (payload.work_unit_id === "" || payload.work_unit_id === undefined) payload.work_unit_id = null;
                if (payload.status_key === "" || payload.status_key === undefined) payload.status_key = null;
                delete payload.job_status_id;
                for (const tk of ["scheduled_at", "completed_at"] as const) {
                    const tv = payload[tk];
                    if (tv === "" || tv === undefined || (typeof tv === "string" && tv.trim() === "")) payload[tk] = null;
                }
            }
            if (drawer.type === "schedules") {
                if (payload.start_at) payload.start_at = new Date(payload.start_at as string).toISOString();
                if (payload.end_at) payload.end_at = new Date(payload.end_at as string).toISOString();
                if (payload.status_key === "" || payload.status_key === undefined) payload.status_key = null;
                delete payload.schedule_status_id;
            }
            if (drawer.type === "vendors") {
                if (payload.status_key === "" || payload.status_key === undefined) payload.status_key = null;
                delete payload.vendor_status_id;
                if (payload.primary_person_id === "" || payload.primary_person_id === undefined) payload.primary_person_id = null;
                delete payload.status;
                const daysStr = payload.days_available as string | undefined;
                payload.days_available = daysStr ? String(daysStr).split(",").map((s) => s.trim()).filter(Boolean) : null;
                const zipsStr = payload.service_area_zip_codes as string | undefined;
                payload.service_area_zip_codes = zipsStr ? String(zipsStr).split(",").map((s) => s.trim()).filter(Boolean) : null;
                if (payload.max_daily_jobs === "") payload.max_daily_jobs = null;
                if (payload.payout_percent === "") payload.payout_percent = null;
                if (payload.payout_override_value === "") payload.payout_override_value = null;
            }
            if (drawer.type === "subscriptions") {
                const status =
                    typeof formData.status === "string" && formData.status.trim() ? formData.status.trim() : null;
                const res = await fetch(`/api/admin/subscriptions/${drawer.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status }),
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((json as { error?: string }).error || "Save failed");
                setData((prev) => (prev ? { ...prev, ...json } : prev));
                refetch();
                router.refresh();
                window.dispatchEvent(new CustomEvent("admin-entity-saved", { detail: { type: "subscriptions", id: drawer.id } }));
                return;
            }
            if (drawer.type === "documents") {
                const status_key = typeof formData.status_key === "string" && formData.status_key.trim() ? formData.status_key.trim() : null;
                const res = await fetch(`/api/admin/documents/${drawer.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status_key }),
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((json as { error?: string }).error || "Save failed");
                setData((prev) => (prev ? { ...prev, ...json } : prev));
                refetch();
                router.refresh();
                window.dispatchEvent(new CustomEvent("admin-entity-saved", { detail: { type: "documents", id: drawer.id } }));
                return;
            }
            const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json.error as string) || "Save failed");
            setData((prev) => (prev ? { ...prev, ...json } : prev));
            refetch();
            router.refresh();
            if (drawer.type === "opportunities" && drawer.id && drawer.id !== "new") {
                window.dispatchEvent(
                    new CustomEvent("adminv2:opportunity-updated", { detail: { id: drawer.id, action_key: "inline_save" } })
                );
            }
            if (drawer.type === "schedules" && drawer.id) {
                const jid = (json as { job_id?: string | null }).job_id;
                window.dispatchEvent(
                    new CustomEvent("admin-entity-saved", {
                        detail: { type: "schedules", id: drawer.id, job_id: jid && String(jid).trim() ? String(jid).trim() : undefined },
                    })
                );
            }
            if (drawer.type === "jobs" && drawer.id) {
                window.dispatchEvent(new CustomEvent("admin-entity-saved", { detail: { type: "jobs", id: drawer.id } }));
                setInitialJobFormData(JOB_FORM_KEYS.reduce((acc, k) => ({ ...acc, [k]: formData[k] }), {} as Record<string, unknown>));
            }
        } catch (e: unknown) {
            setSaveError((e as Error).message);
        } finally {
            setSaving(false);
        }
    }, [drawer.type, drawer.id, formData, workflowConditions, workflowActions, refetch, router, jobDiscountOptions, data, openDrawer]);

    const openJobLocationChange = useCallback(() => {
        setSetLocationEntity("job");
        setSetLocationSelectedId((formData.location_id as string) ?? null);
        setSetLocationError(null);
        fetch("/api/admin/locations")
            .then((r) => r.ok ? r.json() : { locations: [] })
            .then((j: { locations?: { id: string; label: string | null; address1: string | null; city: string | null; state: string | null; postal_code: string | null }[] }) => setSetLocationList(j.locations ?? []))
            .catch(() => setSetLocationList([]));
        setSetLocationOpen(true);
    }, [formData.location_id]);

    const saveJobAssignedVendor = useCallback(async () => {
        if (!drawer.id || drawer.type !== "jobs") return;
        setJobAssignedVendorSaving(true);
        try {
            const vendorOption = jobAssignedVendorId ? jobVendorsForAssign.find((v) => v.id === jobAssignedVendorId) ?? null : null;
            if (applyVendorToUpcoming && canMutate) {
                const res = await fetch(`/api/admin/jobs/${drawer.id}/assign-vendor`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ vendor_id: jobAssignedVendorId || null, apply_to_future_schedules: true }),
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((json.error as string) || "Reassign failed");
                const vendorLabel =
                    vendorOption?.label ??
                    (vendorOption ? formatVendorOptionLabel({ id: vendorOption.id, name: vendorOption.name }) : null);
                setData((prev) =>
                    prev
                        ? {
                              ...prev,
                              assigned_vendor_id: jobAssignedVendorId ?? null,
                              _assigned_vendor: vendorOption ? { id: vendorOption.id, name: vendorLabel ?? "" } : null,
                              _assigned_vendor_name: vendorLabel,
                              _vendor_name: vendorLabel,
                          }
                        : prev
                );
            } else {
                const res = await fetch(`/api/admin/jobs/${drawer.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ assigned_vendor_id: jobAssignedVendorId || null }),
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((json.error as string) || "Save failed");
                const vendorLabel =
                    vendorOption?.label ??
                    (vendorOption ? formatVendorOptionLabel({ id: vendorOption.id, name: vendorOption.name }) : null);
                setData((prev) =>
                    prev
                        ? {
                              ...prev,
                              assigned_vendor_id: jobAssignedVendorId ?? null,
                              _assigned_vendor: vendorOption ? { id: vendorOption.id, name: vendorLabel ?? "" } : null,
                              _assigned_vendor_name: vendorLabel,
                              _vendor_name: vendorLabel,
                          }
                        : prev
                );
            }
            const payoutRes = await fetch(`/api/admin/jobs/${drawer.id}/payout`);
            if (payoutRes.ok) setJobPayout(await payoutRes.json());
            refetch();
            router.refresh();
            window.dispatchEvent(new CustomEvent("admin-entity-saved", { detail: { type: "jobs", id: drawer.id } }));
        } catch (e) {
            setSaveError((e as Error).message);
        } finally {
            setJobAssignedVendorSaving(false);
        }
    }, [drawer.id, drawer.type, jobAssignedVendorId, jobVendorsForAssign, applyVendorToUpcoming, canMutate, refetch, router]);

    const handleInlineCancel = useCallback(() => {
        try {
            const initial = JSON.parse(initialInlineFormSnapshot ?? "{}") as Record<string, unknown>;
            setFormData((prev) => ({ ...prev, ...initial }));
            setSaveError(null);
        } catch {
            setSaveError(null);
        }
    }, [initialInlineFormSnapshot]);

    /** Must be declared before any early return — used by job Record links (hook order). */
    const openEntityFromJobRecord = useCallback(
        (entityType: AdminDrawerEntityType, id: string) => {
            openDrawer({
                type: entityType,
                id,
                ...(entityType === "jobs" ? { jobRecordSurface: "full" as const } : {}),
            });
        },
        [openDrawer]
    );

    const hasCustomer = typeof formData.customer_id === "string" && formData.customer_id.trim().length > 0;
    const primaryContactDisabled = !hasCustomer || jobContactOptionsLoading || (hasCustomer && jobContactOptions.length === 0);
    const isJobExistingView = drawer.type === "jobs" && data && typeof data === "object" && !(data as Record<string, unknown>)._create;
    const isJobDrawerV2 = drawerShellVariant === "adminV2" && isJobExistingView;
    const recordChromeJob = useRecordChromeConfig(isJobDrawerV2 ? "job" : null, recordChromeOrgScope);
    const recordChromeSchedule = useRecordChromeConfig(drawer.type === "schedules" ? "schedule" : null, recordChromeOrgScope);
    const recordChromeOpportunity = useRecordChromeConfig(
        drawer.type === "opportunities" && drawer.id && drawer.id !== "new" ? "opportunity" : null,
        recordChromeOrgScope
    );
    const opportunityInquiryWorkflowDrawer =
        drawer.type === "opportunities" &&
        recordChromeOpportunity.configResolved &&
        (recordChromeOpportunity.layout?.config_json as RecordLayoutConfigJson | null)?.inquiry_drawer_mode === "workflow_v1";
    /** While chrome is loading or inquiry workflow v1 is active — never fall back to generic `EntityDrawerOverview` presentation sections. */
    const opportunityRecordGateWorkflowLayout =
        drawer.type === "opportunities" &&
        !!drawer.id &&
        drawer.id !== "new" &&
        (!recordChromeOpportunity.configResolved || opportunityInquiryWorkflowDrawer);
    /** Modal shell for /adminV2 jobs — use before data loads so geometry never flashes sidebar-first. */
    const isJobRecordModalTarget =
        drawerShellVariant === "adminV2" &&
        drawer.type === "jobs" &&
        !!drawer.id &&
        drawer.id !== "new";
    /** Centered record modal for workspace schedules (parity with jobs; avoids sidebar-first legacy chrome). */
    const isScheduleRecordModalTarget =
        drawerShellVariant === "adminV2" &&
        drawer.type === "schedules" &&
        !!drawer.id &&
        drawer.id !== "new";
    /** Centered record modal for opportunities (parity with schedules/jobs on workspace routes). */
    const isOpportunityRecordModalTarget =
        drawerShellVariant === "adminV2" &&
        drawer.type === "opportunities" &&
        !!drawer.id &&
        drawer.id !== "new";
    /** Workflow chrome, or any existing opportunity while record layout fetch is in flight — keep inquiry-shaped header/tabs (no classic subtitle swap). */
    const opportunityInquiryWorkflowDrawerShell =
        opportunityInquiryWorkflowDrawer ||
        (drawer.type === "opportunities" && !!drawer.id && drawer.id !== "new" && !recordChromeOpportunity.configResolved);
    /** Centered record modal for jobs and for linked entities opened from a job (same Admin V2 stack). */
    const useAdminV2RecordModalPresentation =
        drawerShellVariant === "adminV2" &&
        (isJobRecordModalTarget ||
            isScheduleRecordModalTarget ||
            isOpportunityRecordModalTarget ||
            stack.length > 0);
    const hasServerJobPaymentSummary = !!jobPaymentSummaryFromApi;
    const paymentStatusLabel = hasServerJobPaymentSummary
        ? jobPaymentStatusKeyLabel(jobPaymentSummaryFromApi.payment_status_key)
        : jobPaymentsFetchError
          ? "Unavailable"
          : jobPaymentsLoading && paymentParentJobId
            ? "…"
            : "—";
    const paymentStatusVariant = hasServerJobPaymentSummary
        ? jobPaymentSummaryFromApi.payment_status_key === "paid"
            ? "success"
            : jobPaymentSummaryFromApi.payment_status_key === "failed"
              ? "warning"
              : "default"
        : "default";

    const paidInFullKnown =
        hasServerJobPaymentSummary &&
        jobPaymentSummaryFromApi.payment_status_key === "paid" &&
        jobPaymentSummaryFromApi.balance_due_cents !== null &&
        jobPaymentSummaryFromApi.balance_due_cents <= 0;

    const jobQuickActionsNode = isJobExistingView && drawer.id ? (
        <div className="flex flex-wrap gap-2 items-center">
            <button
                type="button"
                disabled={!canMutate}
                onClick={() => {
                    setPaymentToast(null);
                    openCollectPayment();
                }}
                className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50"
            >
                Add payment
            </button>
            {hasServerJobPaymentSummary && jobPaymentSummaryFromApi.payment_status_key === "failed" && (
                <button
                    type="button"
                    disabled={!canMutate}
                    onClick={() => {
                        setPaymentToast(null);
                        openCollectPayment();
                    }}
                    className="px-3 py-1.5 text-sm border border-alloy-ember/50 text-alloy-ember rounded-md hover:bg-alloy-ember/10 disabled:opacity-50"
                >
                    Retry payment
                </button>
            )}
            <button type="button" disabled={!!jobActionLoading} onClick={async () => { if (!drawer.id) return; setJobActionLoading("mark_completed"); try { const res = await fetch(`/api/admin/jobs/${drawer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_completed" }) }); const json = await res.json().catch(() => ({})); if (!res.ok) throw new Error((json.error as string) || "Failed"); setData((prev) => (prev ? { ...prev, ...json } : prev)); refetch(); router.refresh(); } catch (e) { console.error("Mark completed failed", e); } finally { setJobActionLoading(null); } }} className="px-3 py-1.5 text-sm bg-alloy-juniper text-white rounded-md hover:opacity-90 disabled:opacity-50">{jobActionLoading === "mark_completed" ? "…" : "Mark completed"}</button>
            {canMutate && (
                <button
                    type="button"
                    onClick={() => {
                        setJobExpandedSections((s) => ({ ...s, relationships: true }));
                        requestAnimationFrame(() => {
                            document.getElementById("job-assign-vendor-section")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                        });
                    }}
                    className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30"
                >
                    Assign {vendorSingular}
                </button>
            )}
            {jobSchedules.length > 0 && !rescheduleForm && <button type="button" onClick={() => openReschedule(jobSchedules[0])} className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30">Reschedule</button>}
        </div>
    ) : null;

    const isScheduleExistingView = drawer.type === "schedules" && data && !(data as Record<string, unknown>)._create;
    const isOpportunityExistingView = drawer.type === "opportunities" && data && !(data as Record<string, unknown>)._create;
    const schedulePaidInFullKnown =
        hasServerJobPaymentSummary &&
        jobPaymentSummaryFromApi.payment_status_key === "paid" &&
        jobPaymentSummaryFromApi.balance_due_cents !== null &&
        jobPaymentSummaryFromApi.balance_due_cents <= 0;

    const schedulePaymentQuickActionsNode =
        isScheduleExistingView && paymentParentJobId ? (
            <div className="flex flex-wrap gap-2 items-center">
                <button
                    type="button"
                    disabled={!canMutate}
                    onClick={() => {
                        setPaymentToast(null);
                        openCollectPayment();
                    }}
                    className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50"
                >
                    Add payment
                </button>
                {hasServerJobPaymentSummary && jobPaymentSummaryFromApi.payment_status_key === "failed" && (
                    <button
                        type="button"
                        disabled={!canMutate}
                        onClick={() => {
                            setPaymentToast(null);
                            openCollectPayment();
                        }}
                        className="px-3 py-1.5 text-sm border border-alloy-ember/50 text-alloy-ember rounded-md hover:bg-alloy-ember/10 disabled:opacity-50"
                    >
                        Retry payment
                    </button>
                )}
            </div>
        ) : null;

    const scheduleAssignVendorHeaderButton =
        isScheduleExistingView && drawer.id && canMutate && data && !(data as { canceled_at?: string | null }).canceled_at ? (
            <button
                type="button"
                onClick={() => {
                    requestAnimationFrame(() => {
                        document.getElementById("schedule-assign-section")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                    });
                }}
                className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30"
            >
                Assign {vendorSingular}
            </button>
        ) : null;

    const onScheduleRecordChromeAction = useCallback(
        (eventKey: string) => {
            if (!data || (data as { canceled_at?: string | null }).canceled_at) return;
            if (eventKey === "reschedule") {
                setScheduleRescheduleForm({
                    start_at: (data.start_at as string) ? new Date(data.start_at as string).toISOString().slice(0, 16) : "",
                    end_at: (data.end_at as string) ? new Date(data.end_at as string).toISOString().slice(0, 16) : "",
                    copy_assignment: !!((data as { _assignment?: { id?: string } })._assignment?.id),
                });
            }
            if (eventKey === "cancel_schedule") {
                setScheduleCancelPrompt(true);
            }
        },
        [data]
    );

    const scheduleChromePrimary = (recordChromeSchedule.actions ?? []).filter((a) => a.placement === "primary");
    const scheduleChromeSecondary = (recordChromeSchedule.actions ?? []).filter((a) => a.placement === "secondary");
    const hasScheduleChromeActions = scheduleChromePrimary.length + scheduleChromeSecondary.length > 0;

    const scheduleHeaderQuickActionsNode =
        isScheduleExistingView &&
        drawer.id &&
        (schedulePaymentQuickActionsNode != null ||
            scheduleAssignVendorHeaderButton != null ||
            hasScheduleChromeActions) ? (
            <div
                className={`flex flex-wrap gap-2 items-center ${isScheduleRecordModalTarget ? "rounded-lg border border-admin-border/45 bg-white/70 px-2.5 py-1.5 shadow-sm" : ""}`}
                data-schedule-record-actions={isScheduleRecordModalTarget ? "true" : undefined}
            >
                {scheduleChromePrimary.map((a) => (
                    <button
                        key={a.id}
                        type="button"
                        disabled={!canMutate && a.event_key === "reschedule"}
                        onClick={() => onScheduleRecordChromeAction(a.event_key)}
                        className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50"
                    >
                        {a.label}
                    </button>
                ))}
                {schedulePaymentQuickActionsNode}
                {scheduleAssignVendorHeaderButton}
                {scheduleChromeSecondary.map((a) => (
                    <button
                        key={a.id}
                        type="button"
                        onClick={() => onScheduleRecordChromeAction(a.event_key)}
                        className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30"
                    >
                        {a.label}
                    </button>
                ))}
            </div>
        ) : null;

    const opportunityChromePrimary = (recordChromeOpportunity.actions ?? []).filter((a) => a.placement === "primary");
    const opportunityChromeSecondary = (recordChromeOpportunity.actions ?? []).filter((a) => a.placement === "secondary");
    const hasOpportunityChromeActions = opportunityChromePrimary.length + opportunityChromeSecondary.length > 0;

    const resolvedHeader = opportunityResolvedHeaderActions;
    const resolvedHeaderCount =
        (resolvedHeader?.primary.length ?? 0) +
        (resolvedHeader?.secondary.length ?? 0) +
        (resolvedHeader?.overflow.length ?? 0);
    const opportunityRegistryHeaderReady = !opportunityResolvedHeaderLoading && resolvedHeader != null;
    const useOpportunityActionRegistryHeader = opportunityRegistryHeaderReady && resolvedHeaderCount > 0;

    useEffect(() => {
        if (!timingEnabled) return;
        if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") return;
        if (loading) return;
        if (!data) return;
        markTiming("record_loading_cleared", { has_data: true });
    }, [timingEnabled, drawer.type, drawer.id, loading, data, markTiming]);

    useEffect(() => {
        if (!timingEnabled) return;
        if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") return;
        if (loading) return;
        if (!data) return;
        const wuid = opportunityWorkUnitId.trim();
        const deptFromRecord =
            data && typeof data === "object"
                ? String((data as { _work_unit_department_id?: unknown })._work_unit_department_id ?? "").trim()
                : "";
        const deptReady = Boolean(opportunityWorkUnitDepartmentId?.trim() || deptFromRecord);
        if (wuid && !deptReady) return;
        const markKey = drawer.id;
        if (opportunityInteractiveMarkedRef.current === markKey) return;
        opportunityInteractiveMarkedRef.current = markKey;
        // Usable once the record is present and scoped header can resolve (dept known when WU exists). Header/section action fetches may still be in flight.
        markTiming("interactive", {
            record_loaded: true,
            header_actions_resolved: opportunityRegistryHeaderReady,
            header_actions_loading: opportunityResolvedHeaderLoading,
            work_unit_ready: deptReady,
        });
    }, [
        timingEnabled,
        drawer.type,
        drawer.id,
        loading,
        data,
        opportunityWorkUnitId,
        opportunityRegistryHeaderReady,
        opportunityResolvedHeaderLoading,
        opportunityWorkUnitDepartmentId,
        markTiming,
    ]);

    const opportunityRegistryHeaderActionKeys = useMemo(() => {
        const h = opportunityResolvedHeaderActions;
        if (!h) return new Set<string>();
        return new Set([...h.primary, ...h.secondary, ...h.overflow].map((a) => a.key));
    }, [opportunityResolvedHeaderActions]);

    const opportunityHeaderQuickActionsNode =
        isOpportunityExistingView && drawer.id && !loading && data != null && entityRowReady
            ? (
                  <div
                      className={`flex flex-wrap gap-2 items-center ${
                          drawerShellVariant === "adminV2"
                              ? opportunityInquiryWorkflowDrawer
                                  ? "rounded-xl border border-admin-border/45 bg-white/80 px-2.5 py-2 shadow-sm ring-1 ring-alloy-stone/10"
                                  : "rounded-lg border border-admin-border/45 bg-white/70 px-2.5 py-1.5 shadow-sm"
                              : ""
                      }`}
                      data-opportunity-record-actions={drawerShellVariant === "adminV2" ? "true" : undefined}
                  >
                      {(() => {
                          const blueOutline =
                              "border border-alloy-blue/30 bg-alloy-blue/5 text-alloy-blue hover:bg-alloy-blue/10 hover:border-alloy-blue/45";
                          const primaryCls = opportunityInquiryWorkflowDrawer
                              ? `px-4 py-2 text-[12px] font-semibold rounded-full ${blueOutline} disabled:opacity-50`
                              : `px-3 py-1.5 text-sm font-semibold rounded-md ${blueOutline} disabled:opacity-50`;
                          const secondaryCls = opportunityInquiryWorkflowDrawer
                              ? `px-4 py-2 text-[12px] font-semibold rounded-full ${blueOutline} disabled:opacity-50`
                              : `px-3 py-1.5 text-sm font-semibold rounded-md ${blueOutline} disabled:opacity-50`;
                          const overflowCls = opportunityInquiryWorkflowDrawer
                              ? `px-4 py-2 text-[12px] font-semibold rounded-full ${blueOutline} disabled:opacity-50`
                              : `px-3 py-1.5 text-sm font-semibold rounded-md ${blueOutline} disabled:opacity-50`;
                          return (
                              <>
                                  {useOpportunityActionRegistryHeader ?
                                      <>
                                          {((opportunityRecordHeaderActionsForUi ?? opportunityResolvedHeaderActions)?.primary ?? []).map((a) => (
                                              <button
                                                  key={a.key}
                                                  type="button"
                                                  disabled={!canMutate || !!opportunityActionLoading}
                                                  onClick={() => void handleResolvedOpportunityHeaderAction(a)}
                                                  className={primaryCls}
                                              >
                                                  {opportunityActionLoading === a.key ? "…" : a.label}
                                              </button>
                                          ))}
                                          {((opportunityRecordHeaderActionsForUi ?? opportunityResolvedHeaderActions)?.secondary ?? []).map((a) => (
                                              <button
                                                  key={a.key}
                                                  type="button"
                                                  disabled={!canMutate || !!opportunityActionLoading}
                                                  onClick={() => void handleResolvedOpportunityHeaderAction(a)}
                                                  className={secondaryCls}
                                              >
                                                  {opportunityActionLoading === a.key ? "…" : a.label}
                                              </button>
                                          ))}
                                          {((opportunityRecordHeaderActionsForUi ?? opportunityResolvedHeaderActions)?.overflow ?? []).map((a) => (
                                              <button
                                                  key={a.key}
                                                  type="button"
                                                  disabled={!canMutate || !!opportunityActionLoading}
                                                  onClick={() => void handleResolvedOpportunityHeaderAction(a)}
                                                  className={overflowCls}
                                              >
                                                  {opportunityActionLoading === a.key ? "…" : a.label}
                                              </button>
                                          ))}
                                      </>
                                  : null}
                                  {canMutate ? (
                                      <button
                                          type="button"
                                          disabled={!!opportunityActionLoading}
                                          onClick={() => setOppLaunchPacketOpen(true)}
                                          className={overflowCls}
                                      >
                                          Send enrollment packet
                                      </button>
                                  ) : null}
                              </>
                          );
                      })()}
                  </div>
              )
            : null;

    const dataMatchesDrawer = entityDataMatchesDrawer(data, drawer.id);
    const overviewData = dataMatchesDrawer ? data : null;

    const opportunityQuoteIntakeNode =
        drawer.type === "opportunities" && drawer.id && drawer.id !== "new" && oppQuoteIntakeOpen ? (
            <OpportunityQuoteIntakeSection
                opportunityId={drawer.id}
                canMutate={!!canMutate}
                onSaved={(json) => {
                    setData((prev) => (prev ? { ...prev, ...json } : prev));
                    refetch();
                    router.refresh();
                    setOppQuoteIntakeOpen(false);
                }}
                onClose={() => {
                    setOppQuoteIntakeOpen(false);
                }}
            />
        ) : null;

    const opportunityQuoteSummaryNode =
        drawer.type !== "opportunities" || !overviewData || (overviewData as { _create?: boolean })._create
            ? null
            : (() => {
                  const opp = overviewData as {
                      quote_total?: number | string | null;
                      quote_subtotal?: number | string | null;
                      discount_amount?: number | string | null;
                      price_breakdown?: string | null;
                      quote_is_overridden?: boolean | null;
                      quote_override_total?: number | string | null;
                  };
                  const total = opp.quote_total ?? null;
                  const sub = opp.quote_subtotal ?? null;
                  const disc = opp.discount_amount ?? null;
                  const breakdown = opp.price_breakdown ?? null;
                  const isOver = opp.quote_is_overridden === true;
                  const hasNumbers =
                      (total != null && !Number.isNaN(Number(total))) ||
                      (sub != null && !Number.isNaN(Number(sub))) ||
                      (disc != null && !Number.isNaN(Number(disc)));
                  if (!hasNumbers && !breakdown && !isOver) return null;

                  const n = (v: unknown) => {
                      if (v == null || v === "") return null;
                      const x = typeof v === "number" ? v : Number(v);
                      return Number.isFinite(x) ? x : null;
                  };
                  const subNum = n(sub);
                  const discNum = n(disc);
                  const totalNum = n(total);
                  const verticalSlug = String((overviewData as { _vertical_slug?: string | null })._vertical_slug ?? "").trim() || "cleaning";

                  return (
                      <section className="rounded-lg border border-admin-border bg-white/80 p-3">
                          <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                  <h3 className="text-sm font-medium text-alloy-midnight/90">Quote result</h3>
                                  {isOver ? (
                                      <p className="mt-1 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-block">
                                          Manual price override active
                                      </p>
                                  ) : null}
                                  <dl className="mt-2 space-y-1 text-sm text-alloy-midnight/85">
                                      <div className="flex justify-between gap-4">
                                          <dt className="text-alloy-midnight/60">Base</dt>
                                          <dd className="font-medium tabular-nums">
                                              {subNum != null ? formatMoneyFromDollars(subNum) : "—"}
                                          </dd>
                                      </div>
                                      <div className="flex justify-between gap-4">
                                          <dt className="text-alloy-midnight/60">Discount</dt>
                                          <dd className="font-medium tabular-nums">
                                              {discNum != null && discNum > 0 ? `−${formatMoneyFromDollars(discNum)}` : "—"}
                                          </dd>
                                      </div>
                                      <div className="flex justify-between gap-4 border-t border-alloy-stone/20 pt-1">
                                          <dt className="text-alloy-midnight/80">Final</dt>
                                          <dd className="font-semibold tabular-nums text-alloy-midnight/95">
                                              {totalNum != null ? formatMoneyFromDollars(totalNum) : "—"}
                                          </dd>
                                      </div>
                                  </dl>
                              </div>
                              <div className="flex flex-wrap gap-2 items-center justify-end shrink-0">
                                  <button
                                      type="button"
                                      disabled={!canMutate || oppQuoteActionLoading}
                                      onClick={() => {
                                          setOppQuoteActionError(null);
                                          setOppOverrideOpen((o) => !o);
                                          const seed =
                                              n(opp.quote_override_total) ??
                                              totalNum ??
                                              subNum ??
                                              null;
                                          setOppOverrideAmount(seed != null ? String(seed) : "");
                                      }}
                                      className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30 disabled:opacity-50"
                                  >
                                      {oppOverrideOpen ? "Close override" : "Override"}
                                  </button>
                                  {isOver ? (
                                      <button
                                          type="button"
                                          disabled={!canMutate || oppQuoteActionLoading}
                                          onClick={() =>
                                              void patchOpportunityQuote({
                                                  clear_quote_override: true,
                                              })
                                          }
                                          className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30 disabled:opacity-50"
                                      >
                                          Clear override
                                      </button>
                                  ) : null}
                                  <button
                                      type="button"
                                      disabled={oppDiscountLoading}
                                      onClick={async () => {
                                          if (oppDiscountOptions) return;
                                          setOppDiscountLoading(true);
                                          try {
                                              const params = new URLSearchParams();
                                              if (verticalSlug) params.set("vertical_slug", verticalSlug);
                                              const res = await fetch(`/api/admin/discount-code-options?${params.toString()}`);
                                              const json = await res.json().catch(() => ({}));
                                              const opts =
                                                  (json as { discount_options?: { value: string; label: string }[] }).discount_options ?? [];
                                              setOppDiscountOptions(opts);
                                          } finally {
                                              setOppDiscountLoading(false);
                                          }
                                      }}
                                      className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30 disabled:opacity-50"
                                  >
                                      {oppDiscountLoading ? "Loading…" : "Load discounts"}
                                  </button>
                              </div>
                          </div>

                          {oppQuoteActionError ? (
                              <p className="mt-2 text-xs text-red-700">{oppQuoteActionError}</p>
                          ) : null}

                          {oppOverrideOpen ? (
                              <div className="mt-3 rounded-md border border-alloy-stone/30 bg-white/90 p-2.5 space-y-2">
                                  <div className="text-xs font-medium text-alloy-midnight/70">Set manual total</div>
                                  <div className="flex flex-wrap items-end gap-2">
                                      <label className="flex flex-col gap-0.5 text-xs">
                                          <span className="text-alloy-midnight/60">Total ($)</span>
                                          <input
                                              type="number"
                                              min={0}
                                              step="0.01"
                                              value={oppOverrideAmount}
                                              onChange={(e) => setOppOverrideAmount(e.target.value)}
                                              className="min-w-[8rem] rounded border border-alloy-stone/50 px-2 py-1.5 text-sm bg-white"
                                          />
                                      </label>
                                      <label className="flex flex-col gap-0.5 text-xs flex-1 min-w-[12rem]">
                                          <span className="text-alloy-midnight/60">Reason (optional)</span>
                                          <input
                                              type="text"
                                              value={oppOverrideReason}
                                              onChange={(e) => setOppOverrideReason(e.target.value)}
                                              className="rounded border border-alloy-stone/50 px-2 py-1.5 text-sm bg-white"
                                          />
                                      </label>
                                      <button
                                          type="button"
                                          disabled={!canMutate || oppQuoteActionLoading}
                                          onClick={() => {
                                              const raw = parseFloat(oppOverrideAmount);
                                              if (!Number.isFinite(raw) || raw < 0) {
                                                  setOppQuoteActionError("Enter a valid total (0 or more).");
                                                  return;
                                              }
                                              void patchOpportunityQuote({
                                                  quote_is_overridden: true,
                                                  quote_override_total: raw,
                                                  quote_override_reason: oppOverrideReason.trim() || null,
                                              }).then(() => {
                                                  setOppOverrideOpen(false);
                                              });
                                          }}
                                          className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50"
                                      >
                                          Save override
                                      </button>
                                  </div>
                              </div>
                          ) : null}

                          {breakdown ? (
                              <pre className="mt-3 whitespace-pre-wrap rounded-md border border-alloy-stone/20 bg-white px-3 py-2 text-xs text-alloy-midnight/80">
                                  {breakdown}
                              </pre>
                          ) : null}

                          {oppDiscountOptions ? (
                              <div className="mt-3 rounded-md border border-alloy-stone/30 bg-white/70 p-2.5">
                                  <div className="text-xs font-medium text-alloy-midnight/70">Apply discount</div>
                                  <p className="mt-1 text-xs text-alloy-midnight/55">
                                      Pricing is computed on the server; pick a program/code or enter a promo code.
                                  </p>
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                      <select
                                          value={oppDiscountSelection}
                                          onChange={(e) => setOppDiscountSelection(e.target.value)}
                                          className="min-w-[16rem] rounded border border-alloy-stone/50 px-2 py-1.5 text-sm bg-white"
                                      >
                                          <option value="">Select a discount…</option>
                                          {oppDiscountOptions.map((o) => (
                                              <option key={o.value} value={o.value}>
                                                  {o.label}
                                              </option>
                                          ))}
                                      </select>
                                      <input
                                          type="text"
                                          placeholder="Or promo code (e.g. TEST25)"
                                          value={oppPromoCode}
                                          onChange={(e) => setOppPromoCode(e.target.value)}
                                          className="min-w-[12rem] rounded border border-alloy-stone/50 px-2 py-1.5 text-sm bg-white"
                                      />
                                      <button
                                          type="button"
                                          disabled={!canMutate || oppQuoteActionLoading}
                                          onClick={() => {
                                              if (oppDiscountSelection.trim()) {
                                                  void patchOpportunityQuote({
                                                      apply_quote_discount: true,
                                                      quote_discount_selection: oppDiscountSelection.trim(),
                                                  });
                                                  return;
                                              }
                                              const code = oppPromoCode.trim();
                                              if (code) {
                                                  void patchOpportunityQuote({
                                                      apply_quote_discount: true,
                                                      discount_code: code,
                                                  });
                                                  return;
                                              }
                                              setOppQuoteActionError("Select a discount or enter a promo code.");
                                          }}
                                          className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50"
                                      >
                                          Apply
                                      </button>
                                  </div>
                                  <button
                                      type="button"
                                      disabled={!canMutate || oppQuoteActionLoading}
                                      onClick={() => void patchOpportunityQuote({ clear_quote_discount: true })}
                                      className="mt-2 text-xs text-alloy-midnight/70 hover:text-alloy-midnight underline disabled:opacity-50"
                                  >
                                      Clear discount
                                  </button>
                              </div>
                          ) : null}
                      </section>
                  );
              })();

    const showJobRecordModalV2 =
        isJobDrawerV2 &&
        drawer.type === "jobs" &&
        !!overviewData &&
        !(overviewData as { _create?: boolean })._create &&
        isCleaningJobRecord(overviewData as Record<string, unknown>);
    const showScheduleRecordModalV2 =
        isScheduleRecordModalTarget &&
        !!overviewData &&
        !(overviewData as { _create?: boolean })._create;
    const showOpportunityRecordModalV2 =
        isOpportunityRecordModalTarget &&
        !!overviewData &&
        !(overviewData as { _create?: boolean })._create;

    const jobRecordChromePending = isJobRecordModalTarget && !recordChromeJob.configResolved;
    const scheduleRecordChromePending = isScheduleRecordModalTarget && !recordChromeSchedule.configResolved;
    /** Block generic opportunity overview until org record layout is known (all surfaces; avoids presentation fallback flash). */
    const opportunityRecordChromePending =
        drawer.type === "opportunities" && !!drawer.id && drawer.id !== "new" && !recordChromeOpportunity.configResolved;

    /** Workflow-shaped gate for sidebar opportunities while record chrome resolves (modal uses `modalOpportunityWorkflow`). */
    const recordGateOpportunityWorkflowShape =
        drawer.type === "opportunities" &&
        !!drawer.id &&
        drawer.id !== "new" &&
        opportunityRecordChromePending &&
        !isOpportunityRecordModalTarget;
    const recordModalV2ChromePending =
        jobRecordChromePending || scheduleRecordChromePending || opportunityRecordChromePending;
    const drawerBodyGateLoading = drawerGateLoading || recordModalV2ChromePending;

    /** Keep Admin V2 record modal shell geometry during first-byte fetch — prevents min-height accent snap. */
    const scheduleRecordChromeBodyShell =
        isScheduleRecordModalTarget &&
        (drawerGateLoading ||
            scheduleRecordChromePending ||
            !!(overviewData && !(overviewData as { _create?: boolean })._create));
    const opportunityRecordChromeBodyShell =
        isOpportunityRecordModalTarget &&
        (drawerGateLoading ||
            opportunityRecordChromePending ||
            !!(overviewData && !(overviewData as { _create?: boolean })._create));
    /** Matches hydrated record body wrappers so height/width rails stay stable gate → ready. */
    const drawerRecordBodyRootClassName = `${
        isJobRecordModalTarget && drawer.type === "jobs"
            ? "space-y-3 max-w-none"
            : scheduleRecordChromeBodyShell || opportunityRecordChromeBodyShell
              ? "space-y-3 max-w-none"
              : "space-y-6"
    }${opportunityRecordChromeBodyShell ? " pb-24 sm:pb-28" : ""}`;

    const jobDrawerV2SignalsNode = useMemo(() => {
        if (!isJobDrawerV2 || !overviewData) return null;
        const pay = jobPaymentSummaryFromApi;
        const lines = deriveJobDrawerSignalLines(
            overviewData as Record<string, unknown>,
            jobSchedules,
            paymentStatusLabel,
            pay?.payment_status_key === "paid",
            pay?.payment_status_key === "failed"
        );
        return <JobDrawerV2SignalsStrip {...lines} presentation={showJobRecordModalV2 ? "cleaningRecordModal" : "default"} />;
    }, [isJobDrawerV2, overviewData, jobSchedules, paymentStatusLabel, jobPaymentSummaryFromApi, showJobRecordModalV2]);

    const drawerHeaderRecordSubtitle = useMemo(() => {
        if (!overviewData || (overviewData as { _create?: boolean })._create) return null;
        return drawerRecordNumberSubtitle(drawer.type, overviewData as Record<string, unknown>);
    }, [overviewData, drawer.type]);

    const title: React.ReactNode = overviewData
        ? drawer.type === "contacts"
            ? (overviewData as { _create?: boolean })._create
                ? `New ${contactSingular}`
                : `${contactSingular}: ${[overviewData.first_name, overviewData.last_name].filter(Boolean).join(" ") || (drawer.id ?? "")}`
            : drawer.type === "customers"
                ? (overviewData as { _create?: boolean })._create
                    ? `New ${customerSingular}`
                    : `${customerSingular}: ${(overviewData.name as string) || (drawer.id ?? "")}`
                : drawer.type === "customer_members"
                    ? (overviewData as { _create?: boolean })._create
                        ? `New ${memberSingular}`
                        : `${memberSingular}: ${(overviewData.display_name as string) || [overviewData.first_name, overviewData.last_name].filter(Boolean).join(" ") || (drawer.id ?? "")}`
                    : drawer.type === "opportunities"
                        ? (overviewData as { _create?: boolean })._create
                            ? `New ${opportunitySingular}`
                            : `${opportunitySingular}: ${(overviewData.name as string) || (drawer.id ?? "")}`
                        : drawer.type === "jobs"
                            ? (overviewData as { _create?: boolean })._create
                                ? `New ${jobSingular}`
                                : `${(overviewData._customer_name as string) || (overviewData.title as string) || "Job"} · ${((overviewData.title as string) || "Cleaning").trim() || "Cleaning"}`
                            : drawer.type === "schedules"
                                ? (overviewData as { _create?: boolean })._create
                                    ? `New ${scheduleSingular}`
                                    : (() => {
                                          const compact = formatScheduleDrawerHeaderTitle(
                                              (overviewData as { start_at?: string }).start_at,
                                              (overviewData as { timezone?: string | null }).timezone
                                          );
                                          return compact.trim()
                                              ? `${scheduleSingular}: ${compact}`
                                              : `${scheduleSingular}: ${String((overviewData as { _schedule_display_title?: string })._schedule_display_title ?? "").trim() || `${(drawer.id ?? "").slice(0, 8)}…`}`;
                                      })()
                                : drawer.type === "locations"
                                    ? (overviewData as { _create?: boolean })._create
                                        ? "New Location"
                                        : `Location: ${(overviewData.label as string) || (overviewData.address1 as string) || (drawer.id ?? "").slice(0, 8) + "…"}`
                                    : drawer.type === "discount_redemptions"
                                        ? `Redemption: ${(overviewData._code as string) || "Discount"}${(overviewData._customer_name as string) ? ` · ${overviewData._customer_name}` : ""}`
                                        : drawer.type === "workflows"
                                            ? (overviewData as { _create?: boolean })._create
                                                ? `New ${workflowSingular}`
                                                : `${workflowSingular}: ${(overviewData.name as string) || (drawer.id ?? "")}`
                                            : drawer.type === "vendors"
                                                ? (overviewData as { _create?: boolean })._create
                                                    ? `New ${vendorSingular}`
                                                    : `${vendorSingular}: ${String((overviewData.company_name as string) ?? "").trim() || (overviewData.name as string) || (drawer.id ?? "")}`
                                                : drawer.type === "payments"
                                                    ? `Payment: ${(overviewData._payment_label as string) || ("Payment #" + (drawer.id ?? "").slice(-6))}`
                                                    : drawer.type === "service_offerings"
                                                        ? `Offering: ${(overviewData.offering_name as string) || (overviewData.offering_key as string) || (drawer.id ?? "").slice(0, 8) + "…"}`
                                                        : drawer.type === "service_plan_templates"
                                                            ? `Plan: ${(overviewData.plan_name as string) || (overviewData.plan_key as string) || (drawer.id ?? "").slice(0, 8) + "…"}`
                                                            : drawer.type === "addons"
                                                                ? `Add-on: ${(overviewData.addon_name as string) || (overviewData.addon_key as string) || (drawer.id ?? "").slice(0, 8) + "…"}`
                                                                : drawer.type === "persons"
                                                                ? (overviewData as { _create?: boolean })._create
                                                                    ? "New Person"
                                                                    : `Person: ${(overviewData._person_name as string) || [overviewData.first_name, overviewData.last_name].filter(Boolean).join(" ") || (drawer.id ?? "").slice(0, 8) + "…"}`
                                                : drawer.type === "documents"
                                                    ? `Document: ${String((overviewData as { name?: string | null }).name ?? "").trim() || String((overviewData as { original_filename?: string | null }).original_filename ?? "").trim() || `${(drawer.id ?? "").slice(0, 8)}…`}`
                                                    : drawer.type === "subscriptions"
                                                        ? `${subscriptionSingular}: ${(overviewData._customer_name as string) || `${(drawer.id ?? "").slice(0, 8)}…`}`
                                                    : "Details"
        : drawerGateLoading || loading
            ? "Loading…"
            : "Details";

    const presentationType = drawer.type ? toPresentationType(drawer.type) : null;
    const presentationConfig = presentationType ? getEntityPresentation(presentationType) : null;
    const configTabs = presentationConfig?.drawer?.tabs;
    const tabListBase: DrawerTabKey[] = configTabs?.length ? [...configTabs] : ["overview", "related", "activity"];
    const tabList: DrawerTabKey[] =
        drawer.type === "opportunities" && opportunityInquiryWorkflowDrawer
            ? tabListBase.filter((t) => t !== "related")
            : tabListBase;
    const tabLabels: Record<string, string> = {
        overview: "Overview",
        rrs_overview: "RRS overview",
        related: "Related",
        financials: "Financials",
        automation: "Automation",
        activity: "Activity",
        communications: "Communication",
        notes: "Notes",
        payments: "Payments",
        documents: "Documents",
        ledger: "Ledger",
    };

    /** Admin V2 job record modal: Record, Related, Activity, Financials only (no RRS/documents tabs). */
    const jobDrawerV2TabListResolved = useMemo((): DrawerTabKey[] => {
        if (!isJobRecordModalTarget || drawer.type !== "jobs") return tabList;
        const allow = new Set<DrawerTabKey>(["overview", "related", "activity", "financials"]);
        return tabList.filter((t) => allow.has(t));
    }, [isJobRecordModalTarget, drawer.type, tabList]);

    const jobDrawerV2TabLabelsResolved = useMemo(() => {
        if (!isJobRecordModalTarget || drawer.type !== "jobs") return tabLabels;
        return {
            ...tabLabels,
            overview: "Record",
        };
    }, [isJobRecordModalTarget, drawer.type, tabLabels]);

    /** Existing opportunity: until entity row + record chrome both resolve, keep inquiry strip (no generic Related tab flash). */
    const opportunityDrawerShellSettled =
        drawer.type === "opportunities" &&
        !!drawer.id &&
        drawer.id !== "new" &&
        drawerReady &&
        recordChromeOpportunity.configResolved &&
        !!overviewData &&
        !(overviewData as { _create?: boolean })._create;

    /** Inquiry workflow (or record-chrome loading for an existing opportunity): fixed top tabs; no Related. */
    const drawerTabStripKeys = useMemo((): DrawerTabKey[] => {
        if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") {
            return tabList;
        }
        if (overviewData && (overviewData as { _create?: boolean })._create) {
            return tabList;
        }
        if (!opportunityDrawerShellSettled) {
            return OPPORTUNITY_INQUIRY_WORKFLOW_TAB_STRIP;
        }
        if (opportunityRecordGateWorkflowLayout) {
            return OPPORTUNITY_INQUIRY_WORKFLOW_TAB_STRIP;
        }
        return tabList;
    }, [drawer.type, drawer.id, overviewData, opportunityDrawerShellSettled, opportunityRecordGateWorkflowLayout, tabList]);

    useEffect(() => {
        if (!isJobDrawerV2 || drawer.type !== "jobs" || !drawer.id || drawer.id === "new") return;
        setJobExpandedSections({
            relationships: false,
            financials: false,
            scheduling: false,
            ledger: false,
        });
    }, [isJobDrawerV2, drawer.type, drawer.id]);

    /** Removed RRS-only tab in V2 — migrate any stale selection. */
    useEffect(() => {
        if (isJobRecordModalTarget && drawer.type === "jobs" && drawerTab === "rrs_overview") {
            setDrawerTab("overview");
        }
    }, [isJobRecordModalTarget, drawer.type, drawerTab]);

    /** Documents tab removed from V2 tab strip — migrate stale selection. */
    useEffect(() => {
        if (isJobRecordModalTarget && drawer.type === "jobs" && drawerTab === "documents") {
            setDrawerTab("overview");
        }
    }, [isJobRecordModalTarget, drawer.type, drawerTab]);

    /** Communications tab removed for jobs — migrate stale selection. */
    useEffect(() => {
        if (drawer.type === "jobs" && drawerTab === "communications") {
            setDrawerTab("overview");
        }
    }, [drawer.type, drawerTab]);

    useEffect(() => {
        if (drawer.type === "opportunities" && opportunityRecordGateWorkflowLayout && drawerTab === "related") {
            setDrawerTab("overview");
        }
    }, [drawer.type, opportunityRecordGateWorkflowLayout, drawerTab]);

    const hasFieldDefsForOverview = useMemo(() => {
        if (!overviewData || (overviewData as { _create?: boolean })._create) return false;
        const defs = (overviewData._field_definitions as { is_visible_in_drawer?: boolean }[] | undefined) ?? [];
        return defs.some((d) => d.is_visible_in_drawer !== false);
    }, [overviewData]);
    const useConfigDrivenOverview =
        !!presentationType &&
        !(overviewData as { _create?: boolean })?._create &&
        (hasFieldDefsForOverview ||
            (!!presentationConfig?.drawer?.overviewSections?.length &&
                presentationConfig.drawer.overviewSections.some((s) => s.fields && s.fields.length > 0)));

    const entityDrawerOverviewData = useMemo((): Record<string, unknown> => {
        const base = (overviewData ?? {}) as Record<string, unknown>;
        if (drawer.type !== "jobs" || !overviewData || (overviewData as { _create?: boolean })._create) {
            return base;
        }
        const summ = jobPaymentSummaryFromApi;
        if (!summ) return base;
        return {
            ...base,
            _job_payment_original_cents: summ.original_amount_cents ?? undefined,
            _job_payment_paid_cents: summ.paid_amount_cents,
            _job_payment_balance_cents: summ.balance_due_cents ?? undefined,
            _job_payment_status_label: jobPaymentStatusKeyLabel(summ.payment_status_key),
        };
    }, [drawer.type, overviewData, jobPaymentSummaryFromApi]);

    const opportunityCommunicationsComposeContext = useMemo(() => {
        if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") return null;
        if (!overviewData || (overviewData as { _create?: boolean })._create) return null;
        const d = overviewData as Record<string, unknown>;
        const sk = String(formData.status_key ?? d.status_key ?? "").trim() || null;
        const ident = (d._identity as { primary_person?: { label?: string | null } } | null) ?? null;
        const label = String(ident?.primary_person?.label ?? "").trim();
        const first = label.split(/\s+/)[0] || null;
        const md =
            d.metadata && typeof d.metadata === "object" && !Array.isArray(d.metadata)
                ? (d.metadata as Record<string, unknown>)
                : null;
        const tour_date = md && typeof md.tour_date === "string" ? md.tour_date : null;
        const tour_time = md && typeof md.tour_time === "string" ? md.tour_time : null;
        return { status_key: sk, primary_first_name: first, tour_date, tour_time };
    }, [drawer.type, drawer.id, overviewData, formData.status_key]);

    const overviewCustomContent = useMemo(() => {
        if (!overviewData || !drawer.type) return {};
        const d = overviewData as Record<string, unknown>;
        // TS note: parts of this block return early for specific drawer types, which can cause
        // control-flow narrowing weirdness in very large files. Keep a widened local copy.
        const drawerType = drawer.type as AdminDrawerEntityType;
        if (drawer.type === "contacts") {
            const customerId = d.customer_id as string | null | undefined;
            const vendorId = d.vendor_id as string | null | undefined;
            const customerName = d._linked_customer_name as string | null | undefined;
            const vendorName = d._linked_vendor_name as string | null | undefined;
            const primaryFor = d._primary_contact_for as string | null | undefined;
            return {
                association: (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="py-1.5">
                            <span className="text-alloy-slate text-sm font-medium">Linked Customer: </span>
                            {customerId ? (
                                <button type="button" onClick={() => openDrawer({ type: "customers", id: customerId })} className="text-alloy-blue hover:underline text-sm ml-1">
                                    {customerName && customerName !== "—" ? customerName : "Open"}
                                </button>
                            ) : (
                                <span className="text-[#31394d] ml-1">—</span>
                            )}
                    </div>
                        <div className="py-1.5">
                            <span className="text-alloy-slate text-sm font-medium">Linked Vendor: </span>
                            {vendorId ? (
                                <button type="button" onClick={() => openDrawer({ type: "vendors", id: vendorId })} className="text-alloy-blue hover:underline text-sm ml-1">
                                    {vendorName && vendorName !== "—" ? vendorName : "Open"}
                                </button>
                            ) : (
                                <span className="text-[#31394d] ml-1">—</span>
                            )}
                        </div>
                        {(d._person_id as string) && (
                            <div className="py-1.5 sm:col-span-2">
                                <span className="text-alloy-slate text-sm font-medium">Person: </span>
                                <button type="button" onClick={() => openDrawer({ type: "persons", id: d._person_id as string })} className="text-alloy-blue hover:underline text-sm ml-1">
                                    {(d._person_name as string) || "View person"}
                                </button>
                            </div>
                        )}
                        {primaryFor && primaryFor !== "—" && (
                            <div className="py-1.5 sm:col-span-2">
                                <span className="text-alloy-slate text-sm font-medium">Primary for (customer/vendor): </span>
                                <span className="text-[#31394d] ml-1">{primaryFor}</span>
                            </div>
                        )}
                        {((d.source as string) ?? (d.external_source as string) ?? (d.external_id as string)) && (
                            <>
                                {d.source != null && String(d.source).trim() !== "" && (
                                    <div className="py-1.5 sm:col-span-2">
                                        <span className="text-alloy-slate text-sm font-medium">Source: </span>
                                        <span className="text-[#31394d] ml-1">{String(d.source)}</span>
                                    </div>
                                )}
                                {d.external_source != null && String(d.external_source).trim() !== "" && (
                                    <div className="py-1.5 sm:col-span-2">
                                        <span className="text-alloy-slate text-sm font-medium">External source: </span>
                                        <span className="text-[#31394d] ml-1">{String(d.external_source)}</span>
                                    </div>
                                )}
                                {d.external_id != null && String(d.external_id).trim() !== "" && (
                                    <div className="py-1.5 sm:col-span-2">
                                        <span className="text-alloy-slate text-sm font-medium">External ID: </span>
                                        <span className="text-[#31394d] ml-1">{String(d.external_id)}</span>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                ),
            };
        }
        if (drawer.type === "customers") {
            const primaryPersonId = d._primary_person_id as string | null | undefined;
            const primaryPersonName = d._primary_person_name as string | null | undefined;
            const primaryContact = d._primary_contact as { id?: string; first_name?: string; last_name?: string; email?: string; phone?: string } | null | undefined;
            const primaryLocation = d._primary_location as { id?: string; label?: string; address1?: string } | null | undefined;
            const counts = d._counts as { contacts?: number; opportunities?: number; jobs?: number; schedules?: number; locations?: number } | undefined;
            return {
                details: (
                    <div className="space-y-2">
                        {primaryPersonId && (
                            <div className="py-1.5">
                                <span className="text-alloy-slate text-sm font-medium">Primary Person: </span>
                                <button type="button" onClick={() => openDrawer({ type: "persons", id: primaryPersonId })} className="text-alloy-blue hover:underline text-sm ml-1">
                                    {(primaryPersonName || "View person").trim() || "View person"}
                                </button>
                            </div>
                        )}
                        {primaryContact && (
                            <div className="py-1.5">
                                <span className="text-alloy-slate text-sm font-medium">Contact (compatibility): </span>
                                <button type="button" onClick={() => primaryContact.id && openDrawer({ type: "contacts", id: primaryContact.id })} className="text-alloy-blue hover:underline text-sm ml-1">
                                    {personDisplayName(primaryContact) === "—" ? String(primaryContact.id).slice(0, 8) + "…" : personDisplayName(primaryContact)}
                                </button>
                                {(primaryContact.email || primaryContact.phone) && (
                                    <span className="text-alloy-forge/80 text-sm ml-1">
                                        ({[primaryContact.email, primaryContact.phone ? formatPhoneUS(primaryContact.phone) : null].filter(Boolean).join(" · ")})
                                    </span>
                                )}
                            </div>
                        )}
                        {primaryLocation && (
                            <div className="py-1.5">
                                <span className="text-alloy-slate text-sm font-medium">Primary Location: </span>
                                <button type="button" onClick={() => primaryLocation.id && openDrawer({ type: "locations", id: primaryLocation.id })} className="text-alloy-blue hover:underline text-sm ml-1">
                                    {primaryLocation.label || primaryLocation.address1 || String(primaryLocation.id).slice(0, 8) + "…"}
                                </button>
                            </div>
                        )}
                        {counts && (
                            <div className="py-1.5 text-sm text-alloy-muted">
                                <span className="text-alloy-slate font-medium">Counts: </span>
                                Contacts {counts.contacts ?? 0} · Opportunities {counts.opportunities ?? 0} · Jobs {counts.jobs ?? 0} · Schedules {counts.schedules ?? 0} · Locations {counts.locations ?? 0}
                            </div>
                        )}
                    </div>
                ),
            };
        }
        if (drawer.type === "customer_members") {
            const linkedFromData = d._linked_contacts as Array<{ contact_id?: string; contact_name?: string | null; email?: string | null; phone?: string | null; role_label?: string | null; is_active?: boolean }> | undefined;
            const hasLinkedFromData = Array.isArray(linkedFromData) && linkedFromData.length > 0;
            const contactRows = hasLinkedFromData
                ? linkedFromData
                : (memberRelatedLinks as MemberLink[]).map((l) => {
                    const c = l.contact;
                    const name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || null : null;
                    const role = memberRelatedRoles.find((r) => r.role_key === l.role_key);
                    return {
                        contact_id: c?.id ?? l.contact_id,
                        contact_name: name,
                        email: c?.email ?? null,
                        phone: c?.phone ?? null,
                        role_label: role?.role_label ?? l.role_key ?? null,
                        is_active: l.is_active,
                    };
                });
            return {
                basic_info: (
                    <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
                        <div>
                            <label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Display name</label>
                            <input value={String(formData.display_name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, display_name: e.target.value }))} onBlur={() => { if (drawer.type === "customer_members" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Status</label>
                            <select value={String(formData.status_key ?? "")} onChange={(e) => setFormData((f) => ({ ...f, status_key: e.target.value || "" }))} onBlur={() => { if (drawer.type === "customer_members" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS}>
                                <option value="">— None —</option>
                                {statusDefsForDrawer.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order).map((s) => (
                                    <option key={s.status_key} value={s.status_key}>{s.status_label ?? s.status_key}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Relationship</label>
                            <select value={String(formData.relationship ?? "")} onChange={(e) => setFormData((f) => ({ ...f, relationship: e.target.value }))} onBlur={() => { if (drawer.type === "customer_members" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS}>
                                <option value="">— Select —</option>
                                {memberRelationshipOptions.map((o) => (
                                    <option key={o.key} value={o.key}>{o.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Customer</label>
                            {d.customer_id ? (
                                <button type="button" onClick={() => openDrawer({ type: "customers", id: String(d.customer_id) })} className="text-alloy-blue hover:underline text-left">
                                    {d._customer_name ? String(d._customer_name) : "Open"}
                                </button>
                            ) : (
                                <span className="text-alloy-midnight/60">—</span>
                            )}
                        </div>
                        {(d._person_id as string) && (
                            <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Canonical Person</label>
                                <button type="button" onClick={() => openDrawer({ type: "persons", id: d._person_id as string })} className="text-alloy-blue hover:underline text-sm">
                                    {(d._person_name as string) || "View person"}
                                </button>
                            </div>
                        )}
                        <div>
                            <label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">First name</label>
                            <input value={String(formData.first_name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, first_name: e.target.value }))} onBlur={() => { if (drawer.type === "customer_members" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Last name</label>
                            <input value={String(formData.last_name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, last_name: e.target.value }))} onBlur={() => { if (drawer.type === "customer_members" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">DOB</label>
                            <input type="date" value={String(formData.dob ?? "")} onChange={(e) => setFormData((f) => ({ ...f, dob: e.target.value }))} onBlur={() => { if (drawer.type === "customer_members" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Age</label>
                            <span className="text-alloy-midnight/90">{d._age != null ? String(d._age) : "—"}</span>
                        </div>
                    </div>
                ),
                contact_roles: (
                    <div className="space-y-2">
                        {contactRows.length === 0 ? (
                            <p className="text-sm text-alloy-midnight/60">No linked contacts.</p>
                        ) : (
                            <ul className="space-y-2">
                                {contactRows.map((row: { contact_id?: string; contact_name?: string | null; email?: string | null; phone?: string | null; role_label?: string | null; is_active?: boolean }, idx: number) => (
                                    <li key={(row as { contact_id?: string }).contact_id ?? idx} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                                        <button
                                            type="button"
                                            onClick={() => (row as { contact_id?: string }).contact_id && openDrawer({ type: "contacts", id: (row as { contact_id: string }).contact_id })}
                                            className="text-alloy-blue hover:underline text-left font-medium"
                                        >
                                            {(row as { contact_name?: string | null }).contact_name || "Contact"}
                                        </button>
                                        {(row as { role_label?: string | null }).role_label && (
                                            <span className="text-alloy-muted">{(row as { role_label: string }).role_label}</span>
                                        )}
                                        {((row as { email?: string | null }).email || (row as { phone?: string | null }).phone) && (
                                            <span className="text-alloy-midnight/70">
                                                {[(row as { email?: string | null }).email, (row as { phone?: string | null }).phone ? formatPhoneUS((row as { phone: string }).phone) : null].filter(Boolean).join(" · ")}
                                            </span>
                                        )}
                                        {(row as { is_active?: boolean }).is_active === false && (
                                            <span className="text-xs text-alloy-muted">(inactive)</span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                ),
            };
        }
        if (drawer.type === "persons" && data && !(data as { _create?: boolean })._create) {
            const p = data as Record<string, unknown>;
            const linkedLocs =
                (p._linked_locations as {
                    location_id: string;
                    _location_label?: string | null;
                    is_primary?: boolean;
                    relationship_type?: string | null;
                }[]) ?? [];
            const opps =
                (p._linked_opportunities as {
                    id: string;
                    name?: string | null;
                    status_key?: string | null;
                    quote_total?: number | null;
                }[]) ?? [];
            const custRows =
                (p._customer_persons as {
                    id: string;
                    customer_id: string;
                    _customer_name?: string | null;
                    _role_label?: string | null;
                    role_type?: string | null;
                }[]) ?? [];
            const subheading = "text-xs font-semibold tracking-wide text-alloy-midnight/50 mb-2";
            return {
                relationships: (
                    <div className="space-y-5">
                        <div>
                            <h4 className={subheading}>Customers</h4>
                            {custRows.length === 0 ? (
                                <p className="text-sm text-alloy-midnight/60">No customer links.</p>
                            ) : (
                                <ul className="space-y-2 text-sm">
                                    {custRows.map((cp) => (
                                        <li key={cp.id}>
                                            <button
                                                type="button"
                                                onClick={() => openDrawer({ type: "customers", id: cp.customer_id })}
                                                className="text-alloy-blue hover:underline text-left"
                                            >
                                                {cp._customer_name?.trim() || cp.customer_id.slice(0, 8) + "…"}
                                            </button>
                                            {(cp._role_label ?? cp.role_type) ? (
                                                <span className="text-alloy-muted ml-1">· {cp._role_label ?? cp.role_type}</span>
                                            ) : null}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div>
                            <h4 className={subheading}>Locations</h4>
                            {linkedLocs.length === 0 ? (
                                <p className="text-sm text-alloy-midnight/60">No locations linked (person_locations).</p>
                            ) : (
                                <ul className="space-y-2 text-sm">
                                    {linkedLocs.map((row) => (
                                        <li key={row.location_id}>
                                            <button
                                                type="button"
                                                onClick={() => openDrawer({ type: "locations", id: row.location_id })}
                                                className="text-alloy-blue hover:underline text-left"
                                            >
                                                {row._location_label?.trim() || row.location_id.slice(0, 8) + "…"}
                                            </button>
                                            {row.is_primary ? <span className="text-alloy-muted ml-1">· Primary</span> : null}
                                            {row.relationship_type ? (
                                                <span className="text-alloy-muted ml-1">· {row.relationship_type}</span>
                                            ) : null}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div>
                            <h4 className={subheading}>Opportunities</h4>
                            {opps.length === 0 ? (
                                <p className="text-sm text-alloy-midnight/60">No opportunities with this person as primary.</p>
                            ) : (
                                <ul className="space-y-2 text-sm">
                                    {opps.map((o) => (
                                        <li key={o.id}>
                                            <button
                                                type="button"
                                                onClick={() => openDrawer({ type: "opportunities", id: o.id })}
                                                className="text-alloy-blue hover:underline text-left"
                                            >
                                                {o.name?.trim() || o.id.slice(0, 8) + "…"}
                                            </button>
                                            {(o.status_key || o.quote_total != null) && (
                                                <span className="text-alloy-muted ml-1">
                                                    {o.status_key ? `· ${o.status_key}` : ""}
                                                    {o.quote_total != null ? ` · ${formatMoneyFromDollars(Number(o.quote_total))}` : ""}
                                                </span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                ),
            };
        }
        if (drawer.type === "locations" && data && !(data as { _create?: boolean })._create) {
            const locDefs = (
                (data._field_definitions as {
                    field_key: string;
                    field_type: string;
                    label: string | null;
                    is_system: boolean;
                    is_visible_in_drawer?: boolean;
                    sort_order: number;
                }[]) ?? []
            )
                .filter((d) => d.is_visible_in_drawer !== false)
                .filter((d) => !locationCustomDefShadowedByCanonical(d.field_key, data as Record<string, unknown>))
                .sort((a, b) => a.sort_order - b.sort_order);
            const locRec = data as Record<string, unknown>;
            const customerId = locRec.customer_id as string | null | undefined;
            const customerName = (locRec._customer_name as string | null | undefined)?.trim();
            const linkedPersons =
                (locRec._linked_persons as {
                    person_id: string;
                    _person_name?: string | null;
                    is_primary?: boolean;
                    relationship_type?: string | null;
                }[]) ?? [];
            const locSubheading = "text-xs font-semibold tracking-wide text-alloy-midnight/50 mb-2";
            const customPropertyGrid =
                locDefs.length > 0 ? (
                    <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
                        {locDefs.map((f) => {
                            const drec = data as Record<string, unknown>;
                            const mergedVal =
                                isEditing && canMutate
                                    ? (formData[f.field_key] !== undefined && formData[f.field_key] !== ""
                                          ? formData[f.field_key]
                                          : drec[f.field_key])
                                    : drec[f.field_key];
                            const raw = mergedVal ?? "";
                            const str = raw === true || raw === false ? (raw ? "Yes" : "No") : String(raw ?? "");
                            const edit = isEditing && canMutate;
                            return (
                                <div key={f.field_key}>
                                    <label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">
                                        {f.label ?? f.field_key}
                                    </label>
                                    {edit ? (
                                        f.field_type === "boolean" ? (
                                            <select
                                                value={String(formData[f.field_key] ?? drec[f.field_key] ?? "")}
                                                onChange={(e) =>
                                                    setFormData((prev) => ({ ...prev, [f.field_key]: e.target.value }))
                                                }
                                                onBlur={() => {
                                                    if (nonJobFormDirty) saveEdit();
                                                }}
                                                className={INLINE_EDIT_INPUT_CLASS}
                                            >
                                                <option value="">—</option>
                                                <option value="true">Yes</option>
                                                <option value="false">No</option>
                                            </select>
                                        ) : f.field_type === "number" ? (
                                            <input
                                                type="number"
                                                value={
                                                    formData[f.field_key] != null && formData[f.field_key] !== ""
                                                        ? String(formData[f.field_key])
                                                        : drec[f.field_key] != null && drec[f.field_key] !== ""
                                                          ? String(drec[f.field_key])
                                                          : ""
                                                }
                                                onChange={(e) =>
                                                    setFormData((prev) => ({
                                                        ...prev,
                                                        [f.field_key]: e.target.value,
                                                    }))
                                                }
                                                onBlur={() => {
                                                    if (nonJobFormDirty) saveEdit();
                                                }}
                                                className={INLINE_EDIT_INPUT_CLASS}
                                            />
                                        ) : f.field_type === "date" || f.field_type === "datetime" ? (
                                            <input
                                                type={f.field_type === "date" ? "date" : "datetime-local"}
                                                value={String(formData[f.field_key] ?? drec[f.field_key] ?? "").slice(0, 16)}
                                                onChange={(e) =>
                                                    setFormData((prev) => ({
                                                        ...prev,
                                                        [f.field_key]: e.target.value,
                                                    }))
                                                }
                                                onBlur={() => {
                                                    if (nonJobFormDirty) saveEdit();
                                                }}
                                                className={INLINE_EDIT_INPUT_CLASS}
                                            />
                                        ) : (
                                            <input
                                                value={String(formData[f.field_key] ?? drec[f.field_key] ?? "")}
                                                onChange={(e) =>
                                                    setFormData((prev) => ({
                                                        ...prev,
                                                        [f.field_key]: e.target.value,
                                                    }))
                                                }
                                                onBlur={() => {
                                                    if (nonJobFormDirty) saveEdit();
                                                }}
                                                className={INLINE_EDIT_INPUT_CLASS}
                                            />
                                        )
                                    ) : (
                                        <span className="text-sm text-alloy-midnight/90">{str || "—"}</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : null;
            return {
                customer: customerId ? (
                    <div className="py-1">
                        <span className="text-alloy-slate text-sm font-medium">Customer: </span>
                        <button
                            type="button"
                            onClick={() => openDrawer({ type: "customers", id: customerId })}
                            className="text-alloy-blue hover:underline text-sm"
                        >
                            {customerName || "Open customer"}
                        </button>
                    </div>
                ) : (
                    <p className="text-sm text-alloy-midnight/60">No customer on this location.</p>
                ),
                relationships: (
                    <div className="space-y-2">
                        <h4 className={locSubheading}>People (person_locations)</h4>
                        {linkedPersons.length === 0 ? (
                            <p className="text-sm text-alloy-midnight/60">No people linked to this location.</p>
                        ) : (
                            <ul className="space-y-2 text-sm">
                                {linkedPersons.map((row) => (
                                    <li key={row.person_id}>
                                        <button
                                            type="button"
                                            onClick={() => openDrawer({ type: "persons", id: row.person_id })}
                                            className="text-alloy-blue hover:underline text-left"
                                        >
                                            {row._person_name?.trim() || row.person_id.slice(0, 8) + "…"}
                                        </button>
                                        {row.is_primary ? <span className="text-alloy-muted ml-1">· Primary</span> : null}
                                        {row.relationship_type ? (
                                            <span className="text-alloy-muted ml-1">· {row.relationship_type}</span>
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                ),
                ...(customPropertyGrid ? { custom_property_fields: customPropertyGrid } : {}),
            };
        }
        if (drawer.type === "vendors" && drawer.id && drawer.id !== "new") {
            const vid = String(drawer.id);
            const d = data as Record<string, unknown>;
            const insurancePath = typeof d.insurance_doc_path === "string" ? d.insurance_doc_path : null;
            const driversLicensePath = typeof d.drivers_license_doc_path === "string" ? d.drivers_license_doc_path : null;
            return {
                compliance_quick_links: (
                    <div className="space-y-3">
                        <p className="text-xs text-alloy-midnight/60 -mt-1">Quick access to onboarding compliance files. See the Documents tab for the full list.</p>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-alloy-midnight/70 text-sm shrink-0">Insurance</span>
                            {insurancePath ? (
                                <button
                                    type="button"
                                    onClick={async () => {
                                        const res = await fetch(`/api/admin/vendors/${vid}/documents/signed-url?path=${encodeURIComponent(insurancePath)}`);
                                        const json = await res.json().catch(() => ({}));
                                        if ((json as { ok?: boolean }).ok && (json as { signedUrl?: string }).signedUrl) window.open((json as { signedUrl: string }).signedUrl, "_blank");
                                        else alert((json as { error?: string }).error || "Failed to open file");
                                    }}
                                    className="text-xs px-2 py-1 border border-alloy-blue/50 rounded text-alloy-blue hover:bg-alloy-stone/20"
                                >
                                    View
                                </button>
                            ) : (
                                <span className="text-sm text-alloy-midnight/50">Not on file</span>
                            )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-alloy-midnight/70 text-sm shrink-0">Driver&apos;s license</span>
                            {driversLicensePath ? (
                                <button
                                    type="button"
                                    onClick={async () => {
                                        const res = await fetch(`/api/admin/vendors/${vid}/documents/signed-url?path=${encodeURIComponent(driversLicensePath)}`);
                                        const json = await res.json().catch(() => ({}));
                                        if ((json as { ok?: boolean }).ok && (json as { signedUrl?: string }).signedUrl) window.open((json as { signedUrl: string }).signedUrl, "_blank");
                                        else alert((json as { error?: string }).error || "Failed to open file");
                                    }}
                                    className="text-xs px-2 py-1 border border-alloy-blue/50 rounded text-alloy-blue hover:bg-alloy-stone/20"
                                >
                                    View
                                </button>
                            ) : (
                                <span className="text-sm text-alloy-midnight/50">Not on file</span>
                            )}
                        </div>
                    </div>
                ),
            };
        }
        if (drawer.type === "subscriptions" && data && !(data as { _create?: boolean })._create && drawer.id && drawer.id !== "new") {
            const subData = data as {
                customer_id?: string;
                _customer_name?: string | null;
                _schedules?: {
                    id: string;
                    job_id: string;
                    start_at: string;
                    end_at: string;
                    subscription_sequence: number;
                    rescheduled_from_schedule_id: string | null;
                    canceled_at: string | null;
                    canceled_by: string | null;
                    cancel_reason: string | null;
                }[];
            };
            const schedules = subData._schedules ?? [];
            return {
                customer: (
                    <div className="py-1">
                        <DrawerLinkWithName
                            label="Customer"
                            id={subData.customer_id ?? null}
                            type="customers"
                            displayName={subData._customer_name ?? ""}
                        />
                    </div>
                ),
                schedules: (
                    <div className="space-y-3">
                        {schedules.length === 0 ? (
                            <p className="text-sm text-alloy-midnight/60">No occurrences yet.</p>
                        ) : (
                            <ul className="space-y-2">
                                {schedules.map((s) => (
                                    <li key={s.id} className="border border-[#e6e8ec] rounded p-2 text-sm">
                                        <div className="flex items-center justify-between gap-2">
                                            <span>
                                                #{s.subscription_sequence} — {displayDateTime(s.start_at)}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => openDrawer({ type: "schedules", id: s.id })}
                                                className="text-alloy-blue hover:underline text-xs"
                                            >
                                                Open
                                            </button>
                                        </div>
                                        {s.rescheduled_from_schedule_id ? (
                                            <div className="text-alloy-midnight/60 text-xs mt-0.5">Rescheduled from schedule</div>
                                        ) : null}
                                        {s.canceled_at ? (
                                            <div className="text-red-600/80 text-xs mt-0.5">
                                                Canceled {displayDateTime(s.canceled_at)}
                                                {s.canceled_by ? ` by ${s.canceled_by}` : ""}
                                                {s.cancel_reason ? ` — ${s.cancel_reason}` : ""}
                                            </div>
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                        )}
                        <SubscriptionGenerateNextButton subscriptionId={drawer.id} onDone={refetch} />
                    </div>
                ),
            };
        }
        if (drawer.type === "payments" && data && !(data as { _create?: boolean })._create && drawer.id && drawer.id !== "new") {
            const pay = data as Record<string, unknown> & {
                _allocation_summary?: {
                    allocated_amount_cents?: number;
                    unallocated_amount_cents?: number;
                    allocation_state?: string;
                };
                _allocations?: Array<{
                    id: string;
                    target_entity_type?: string | null;
                    target_entity_id?: string | null;
                    allocated_amount_cents?: number | null;
                    status?: string | null;
                    allocation_type?: string | null;
                }>;
            };
            const sum = pay._allocation_summary;
            const allocs = pay._allocations ?? [];
            return {
                payment_allocations: (
                    <div className="space-y-3 text-sm">
                        {sum ? (
                            <div className="rounded-md border border-alloy-stone/30 bg-alloy-stone/5 px-3 py-2 space-y-1">
                                <div className="flex justify-between gap-2">
                                    <span className="text-alloy-midnight/70">Allocated (total)</span>
                                    <span className="font-medium">{formatMoneyFromCents(sum.allocated_amount_cents ?? 0)}</span>
                                </div>
                                <div className="flex justify-between gap-2">
                                    <span className="text-alloy-midnight/70">Unallocated</span>
                                    <span className="font-medium">{formatMoneyFromCents(sum.unallocated_amount_cents ?? 0)}</span>
                                </div>
                                <div className="flex justify-between gap-2">
                                    <span className="text-alloy-midnight/70">Allocation state</span>
                                    <span className="font-medium">{sum.allocation_state ?? "—"}</span>
                                </div>
                            </div>
                        ) : (
                            <p className="text-alloy-midnight/60">No allocation summary.</p>
                        )}
                        {allocs.length > 0 ? (
                            <div>
                                <p className="text-xs font-semibold tracking-wider text-alloy-forge/80 mb-2">Allocation rows</p>
                                <ul className="space-y-0 list-none rounded-md border border-[#e6e8ec] divide-y divide-alloy-stone/20">
                                    {allocs.map((a) => (
                                        <li key={a.id} className="px-3 py-2">
                                            <div className="font-medium text-alloy-forge/90">
                                                {(a.target_entity_type ?? "—").toString()} · {formatMoneyFromCents(a.allocated_amount_cents ?? 0)}
                                            </div>
                                            <div className="text-xs text-alloy-midnight/60 mt-0.5">
                                                Target{" "}
                                                <span className="font-mono">{a.target_entity_id ?? "—"}</span>
                                                {a.status ? ` · ${a.status}` : ""}
                                                {a.allocation_type ? ` · ${a.allocation_type}` : ""}
                                            </div>
                                            {String(a.target_entity_type ?? "").toLowerCase() === "job" && a.target_entity_id ? (
                                                <button
                                                    type="button"
                                                    onClick={() => openDrawer({ type: "jobs", id: String(a.target_entity_id) })}
                                                    className="text-alloy-blue hover:underline text-xs mt-1"
                                                >
                                                    Open job
                                                </button>
                                            ) : null}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <p className="text-alloy-midnight/60">No allocation rows.</p>
                        )}
                    </div>
                ),
            };
        }
        if (drawer.type === "jobs" && data && !(data as { _create?: boolean })._create && drawer.id && drawer.id !== "new") {
            const jobRec = entityDrawerOverviewData as Record<string, unknown>;
            return {
                job_pricing_breakdown: <JobPricingBreakdown record={jobRec} />,
                communications_canonical_embed: (
                    <CommunicationsDrawerSection
                        embedded
                        embeddedHeaderMode="description_only"
                        apiEntityType="jobs"
                        entityId={drawer.id}
                        active
                    />
                ),
            };
        }
        if (drawerType === "opportunities" && overviewData && !(overviewData as { _create?: boolean })._create) {
            const oppCfg = (recordChromeOpportunity.layout?.config_json ?? null) as RecordLayoutConfigJson | null;
            const out: Record<string, React.ReactNode> = {};
            const customerId = (d.customer_id as string | null | undefined) ?? null;
            const includeFamilyContacts =
                !!drawer.id &&
                drawer.id !== "new" &&
                recordOpportunityDrawerLayoutIncludesSection(oppCfg, "family_contacts");
            if (customerId && drawer.id && drawer.id !== "new" && !includeFamilyContacts) {
                out.customer_booking = (
                    <OpportunityHouseholdPeoplePanel
                        opportunityId={drawer.id}
                        customerId={customerId}
                        canMutate={!!canMutate}
                        sectionKey="customer_booking"
                        departmentId={opportunityDrawerDepartmentId || null}
                        workUnitId={String(d.work_unit_id ?? "").trim() || null}
                        router={router}
                        openDrawer={openDrawer}
                        recordHydrationPending={false}
                        opportunityFullHydratePending={opportunityFullHydratePending}
                        opportunityFullHydrateApplied={opportunityFullHydrateApplied}
                        opportunityFullHydrateFailed={opportunityFullHydrateFailed}
                        openForm={({ form_key, action }) => {
                            setActionFormState({
                                form_key,
                                action,
                                executeContext: { surface: "record_section", section_key: "customer_booking" },
                            });
                        }}
                        refreshKey={relatedPeopleRefreshKey}
                    />
                );
            }
            if (oppCfg?.inquiry_drawer_mode === "workflow_v1") {
                out.inquiry_tuition = (
                    <div className="min-w-0 space-y-1.5 text-sm text-alloy-midnight/70">
                        <p className="text-[13px] font-semibold text-alloy-midnight/85">Tuition / pricing</p>
                        <p className="text-xs leading-relaxed text-alloy-midnight/60">
                            Estimated tuition will tie to program, schedule, and discounts from the inquiry header. Billing integration
                            is upcoming.
                        </p>
                    </div>
                );
            }
            const order = oppCfg?.overview_section_order ?? null;
            const allowInquiryChildren =
                oppCfg?.inquiry_drawer_mode === "workflow_v1" ||
                (Array.isArray(order) && order.includes("inquiry_children"));
            if (allowInquiryChildren) {
                const raw = (d._inquiry_children as unknown[]) ?? [];
                const rows: InquiryChildRow[] = Array.isArray(raw)
                    ? raw.map((x) => {
                          const r = x as Record<string, unknown>;
                          return {
                              id: String(r.id ?? ""),
                              customer_member_id: String(r.customer_member_id ?? ""),
                              person_id: r.person_id != null && String(r.person_id).trim() ? String(r.person_id) : null,
                              display_name: r.display_name != null ? String(r.display_name) : null,
                              dob: r.dob != null && String(r.dob).trim() ? String(r.dob) : null,
                              age: r.age != null && String(r.age).trim() ? String(r.age) : null,
                              desired_program_type:
                                  r.desired_program_type != null && String(r.desired_program_type).trim()
                                      ? String(r.desired_program_type)
                                      : null,
                              desired_program_label: r.desired_program_label != null ? String(r.desired_program_label) : null,
                              desired_schedule_type:
                                  r.desired_schedule_type != null && String(r.desired_schedule_type).trim()
                                      ? String(r.desired_schedule_type)
                                      : null,
                              desired_schedule_label: r.desired_schedule_label != null ? String(r.desired_schedule_label) : null,
                              outcome_status_key:
                                  r.outcome_status_key != null && String(r.outcome_status_key).trim()
                                      ? String(r.outcome_status_key)
                                      : null,
                              outcome_status_label: r.outcome_status_label != null ? String(r.outcome_status_label) : null,
                              notes: r.notes != null ? String(r.notes) : null,
                          };
                      })
                    : [];
                const detailPending = d._member_person_graph_pending === true;
                out.inquiry_children = (
                    <OpportunityInquiryChildrenSection
                        rows={rows.filter((r) => r.id && (r.customer_member_id || r.display_name))}
                        canEdit={!!canMutate}
                        embeddedInPremiumSection={oppCfg?.inquiry_drawer_mode === "workflow_v1"}
                        recordDetailPending={detailPending}
                        onOpenChild={(row) => {
                            const cm = row.customer_member_id?.trim() ?? "";
                            if (!cm || cm.startsWith("metadata_child:")) return;
                            if (row.person_id) openDrawer({ type: "persons", id: row.person_id });
                            else openDrawer({ type: "customer_members", id: cm });
                        }}
                    />
                );
            }
            return out;
        }
        return {};
    }, [
        drawer.type,
        drawer.id,
        overviewData,
        data,
        entityDrawerOverviewData,
        openDrawer,
        router,
        relatedPeopleRefreshKey,
        memberRelatedLinks,
        memberRelatedRoles,
        formData,
        setFormData,
        saveEdit,
        nonJobFormDirty,
        canMutate,
        memberRelationshipOptions,
        statusDefsForDrawer,
        isEditing,
        refetch,
        recordChromeOpportunity.layout,
        opportunityWorkUnitDepartmentId,
        opportunityDrawerDepartmentId,
        opportunityFullHydratePending,
        opportunityFullHydrateApplied,
        opportunityFullHydrateFailed,
        getStatusLabel,
        viewerTz,
    ]);

    const overviewSectionHeaderRight = useMemo(() => {
        if (!overviewData || drawer.type !== "opportunities" || (overviewData as { _create?: boolean })._create) return {};
        const d = overviewData as Record<string, unknown>;
        const rawKids = (d._inquiry_children as unknown[]) ?? [];
        const nKids = Array.isArray(rawKids)
            ? rawKids.filter((x) => x && typeof x === "object" && String((x as any).display_name ?? "").trim()).length
            : 0;
        return {
            inquiry_children: (
                <OpportunityInquiryChildrenRegistryActions
                    opportunityId={drawer.id ?? ""}
                    childrenCount={nKids}
                    canMutate={!!canMutate}
                    router={router}
                    openDrawer={openDrawer}
                    openForm={({ form_key, action }) => {
                        if (form_key === "add_inquiry_child") {
                            const mode = action.payload?.mode != null ? String(action.payload.mode).trim() : "";
                            setAddInquiryChildState({ mode: mode === "add_sibling" ? "sibling" : "child" });
                        }
                    }}
                />
            ),
        } as Record<string, unknown>;
    }, [overviewData, drawer.type, drawer.id, canMutate, router, openDrawer]);

    const configDrivenOverviewSections = useMemo((): EntityDrawerSectionConfig[] => {
        if (!overviewData || (overviewData as { _create?: boolean })._create) return [];
        const defs = (overviewData._field_definitions as { field_key: string; field_type: string; label: string | null; section_key: string | null; sort_order: number; is_visible_in_drawer: boolean }[] | undefined) ?? [];
        let visible = defs.filter((d) => d.is_visible_in_drawer !== false);
        if (drawer.type === "vendors") {
            visible = visible.filter((d) => d.field_key !== "status_key" && d.field_key !== "status");
            visible = visible.filter((d) => d.field_key !== "vendor_status_id");
        }
        if (drawer.type === "opportunities") {
            visible = visible.filter((d) => !OPPORTUNITY_DRAWER_HIDE_PRICING_FIELD_KEYS.has(d.field_key));
            // Allow config-driven overview to render inline-editable opportunity status via EntityDrawerOverview.
            // Keep filtering legacy `status` token, but do not remove `status_key`.
            visible = visible.filter((d) => d.field_key !== "status");
            const oppInqLayout = (recordChromeOpportunity.layout?.config_json ?? null) as RecordLayoutConfigJson | null;
            if (oppInqLayout?.inquiry_drawer_mode === "workflow_v1") {
                visible = visible.filter((d) => !OPPORTUNITY_INQUIRY_HEADER_BODY_FIELD_KEYS.has(d.field_key));
            }
        }
        if (drawer.type === "jobs") {
            visible = visible.filter((d) => d.field_key !== "primary_contact_id");
            visible = visible.filter((d) => d.field_key !== "status_key");
            visible = visible.filter((d) => d.field_key !== "job_status_id");
        }
        if (drawer.type === "schedules") {
            visible = visible.filter((d) => d.field_key !== "status_key" && d.field_key !== "status");
            visible = visible.filter((d) => d.field_key !== "schedule_status_id");
        }
        if (drawer.type === "locations" && overviewData) {
            visible = visible.filter(
                (d) => !locationCustomDefShadowedByCanonical(d.field_key, overviewData as Record<string, unknown>)
            );
        }
        if (drawer.type === "jobs" && overviewData) {
            visible = visible.filter(
                (d) => !jobOrScheduleServiceDefShadowedByCanonical(d.field_key, overviewData as Record<string, unknown>)
            );
        }
        if (drawer.type === "schedules" && overviewData) {
            visible = visible.filter(
                (d) => !jobOrScheduleServiceDefShadowedByCanonical(d.field_key, overviewData as Record<string, unknown>)
            );
        }
        /** Unified Pricing section owns these; strip from field_definitions-driven sections to avoid duplicates. */
        const jobDrawerPricingFieldKeys = new Set([
            "estimated_total_cents",
            "gross_price_cents",
            "discount_amount",
            "display_total_cents",
            "_discount_amount_cents",
            "recurring_total_cents",
            "contractor_payout_cents",
            "alloy_fee_cents",
            "discount_code",
            "discount_code_id",
            "discount_program_id",
            "contractor_split_bps",
            "alloy_split_bps",
        ]);
        /** Shown only in Overview "Billing summary" block — omit from field_definitions grid to avoid duplicates. */
        const jobOverviewBillingFieldKeys = new Set([
            "total_cents",
            "display_total_cents",
            "recurring_total_cents",
            "service_frequency_key",
            "is_recurring",
            "_job_payment_paid_cents",
            "_job_payment_balance_cents",
            "_job_payment_status_label",
            "_job_payment_original_cents",
        ]);
        if (drawer.type === "jobs") {
            visible = visible.filter((d) => !jobDrawerPricingFieldKeys.has(d.field_key));
            visible = visible.filter((d) => !jobOverviewBillingFieldKeys.has(d.field_key));
        }
        if (visible.length === 0) {
            const presentationFallback =
                overviewData &&
                !(overviewData as { _create?: boolean })._create &&
                (drawer.type === "jobs" || drawer.type === "locations" || drawer.type === "schedules");
            if (!presentationFallback) {
                return [];
            }
        }
        const bySection = new Map<string, typeof visible>();
        for (const d of visible) {
            const sk = d.section_key ?? "details";
            if (!bySection.has(sk)) bySection.set(sk, []);
            bySection.get(sk)!.push(d);
        }
        const sectionOrder = [...bySection.entries()].sort((a, b) => {
            const aMin = Math.min(...a[1].map((f) => f.sort_order));
            const bMin = Math.min(...b[1].map((f) => f.sort_order));
            return aMin - bMin;
        });
        const hintFromType = (t: string): EntityDrawerFieldConfig["renderHint"] => {
            if (t === "phone") return "phone";
            if (t === "date") return "date";
            if (t === "datetime") return "datetime";
            if (t === "boolean") return "primary_yes_no";
            return "text";
        };
        const relFieldOverride = (fieldKey: string): Partial<EntityDrawerFieldConfig> | null => {
            if (drawer.type === "opportunities") {
                if (fieldKey === "primary_person_id") {
                    return { renderHint: "link", linkTarget: { idField: "primary_person_id", entityType: "persons" } };
                }
                if (fieldKey === "location_id") {
                    return { renderHint: "link", linkTarget: { idField: "location_id", entityType: "locations" } };
                }
                if (fieldKey === "primary_contact_id" || fieldKey === "contact_id") {
                    return { renderHint: "link", linkTarget: { idField: "primary_contact_id", entityType: "contacts" } };
                }
                if (fieldKey === "customer_id") {
                    return { renderHint: "link", linkTarget: { idField: "customer_id", entityType: "customers" } };
                }
                return null;
            }
            if (drawer.type === "contacts") {
                if (fieldKey === "customer_id") {
                    return { renderHint: "link", linkTarget: { idField: "customer_id", entityType: "customers" } };
                }
                if (fieldKey === "vendor_id") {
                    return { renderHint: "link", linkTarget: { idField: "vendor_id", entityType: "vendors" } };
                }
                if (fieldKey === "person_id") {
                    return { renderHint: "link", linkTarget: { idField: "person_id", entityType: "persons" } };
                }
                return null;
            }
            if (drawer.type === "locations") {
                if (fieldKey === "customer_id") {
                    return { renderHint: "link", linkTarget: { idField: "customer_id", entityType: "customers" } };
                }
                return null;
            }
            if (drawer.type === "vendors") {
                if (fieldKey === "primary_contact_id") {
                    return { renderHint: "link", linkTarget: { idField: "primary_contact_id", entityType: "contacts" } };
                }
                if (fieldKey === "primary_person_id") {
                    return { renderHint: "link", linkTarget: { idField: "primary_person_id", entityType: "persons" } };
                }
                return null;
            }
            if (drawer.type === "customer_members") {
                if (fieldKey === "customer_id") {
                    return { renderHint: "link", linkTarget: { idField: "customer_id", entityType: "customers" } };
                }
                if (fieldKey === "person_id") {
                    return { renderHint: "link", linkTarget: { idField: "person_id", entityType: "persons" } };
                }
                return null;
            }
            if (drawer.type === "subscriptions") {
                if (fieldKey === "customer_id") {
                    return { renderHint: "link", linkTarget: { idField: "customer_id", entityType: "customers" } };
                }
                if (fieldKey === "primary_contact_id") {
                    return { renderHint: "link", linkTarget: { idField: "primary_contact_id", entityType: "contacts" } };
                }
                return null;
            }
            if (drawer.type === "discount_redemptions") {
                if (fieldKey === "customer_id") {
                    return { renderHint: "link", linkTarget: { idField: "customer_id", entityType: "customers" } };
                }
                if (fieldKey === "contact_id") {
                    return { renderHint: "link", linkTarget: { idField: "contact_id", entityType: "contacts" } };
                }
                if (fieldKey === "opportunity_id") {
                    return { renderHint: "link", linkTarget: { idField: "opportunity_id", entityType: "opportunities" } };
                }
                if (fieldKey === "job_id") {
                    return { renderHint: "link", linkTarget: { idField: "job_id", entityType: "jobs" } };
                }
                return null;
            }
            if (drawer.type === "jobs") {
                if (fieldKey === "primary_person_id") {
                    return { renderHint: "link", linkTarget: { idField: "primary_person_id", entityType: "persons" } };
                }
                if (fieldKey === "location_id") {
                    return { renderHint: "link", linkTarget: { idField: "location_id", entityType: "locations" } };
                }
                if (fieldKey === "customer_id") {
                    return { renderHint: "link", linkTarget: { idField: "customer_id", entityType: "customers" } };
                }
                if (fieldKey === "opportunity_id") {
                    return { renderHint: "link", linkTarget: { idField: "opportunity_id", entityType: "opportunities" } };
                }
                if (fieldKey === "assigned_vendor_id") {
                    return { renderHint: "link", linkTarget: { idField: "assigned_vendor_id", entityType: "vendors" } };
                }
            }
            if (drawer.type === "schedules") {
                if (fieldKey === "job_id") {
                    return { renderHint: "link", linkTarget: { idField: "job_id", entityType: "jobs" } };
                }
                if (fieldKey === "location_id") {
                    return { renderHint: "link", linkTarget: { idField: "location_id", entityType: "locations" } };
                }
                if (fieldKey === "customer_subscription_id") {
                    return { renderHint: "link", linkTarget: { idField: "customer_subscription_id", entityType: "subscriptions" } };
                }
                if (fieldKey === "assigned_vendor_id") {
                    return { renderHint: "link", linkTarget: { idField: "assigned_vendor_id", entityType: "vendors" } };
                }
            }
            return null;
        };
        const mapOpportunityFieldDefToDrawerField = (f: {
            field_key: string;
            field_type: string;
            label: string | null;
            sort_order: number;
        }): EntityDrawerFieldConfig => {
            const fieldKey = f.field_key;
            const rel = relFieldOverride(f.field_key);
            let baseHint = hintFromType(f.field_type);
            if (fieldKey.endsWith("_cents") || f.field_key === "discount_amount" || f.field_key === "display_total_cents") {
                baseHint = "money";
            }
            return {
                key: fieldKey,
                label: f.label ?? f.field_key,
                span: 1 as const,
                renderHint: (rel?.renderHint ?? baseHint) as EntityDrawerFieldConfig["renderHint"],
                editable: true,
                ...(rel?.linkTarget ? { linkTarget: rel.linkTarget } : {}),
            };
        };
        const sectionTitleByKey = new Map(
            (
                (overviewData?._field_sections ?? []) as {
                    section_key: string;
                    label: string;
                }[]
            ).map((s) => [s.section_key, s.label])
        );
        const defaultSectionTitle = (sectionKey: string) =>
            sectionKey.charAt(0).toUpperCase() + sectionKey.slice(1).replace(/_/g, " ");
        const fromDefs = sectionOrder.map(([sectionKey, fields]) => ({
            key: sectionKey,
            title: sectionTitleByKey.get(sectionKey) ?? defaultSectionTitle(sectionKey),
            defaultExpanded: drawer.type === "opportunities" ? false : true,
            collapsible: true,
            gridCols: 2 as const,
            fields: fields.sort((a, b) => a.sort_order - b.sort_order).map((f) => {
                const fieldKey =
                    drawer.type === "jobs" && f.field_key === "discount_amount" ? "_discount_amount_cents" : f.field_key;
                const rel = relFieldOverride(f.field_key);
                let baseHint = hintFromType(f.field_type);
                if (
                    (drawer.type === "jobs" || drawer.type === "opportunities") &&
                    (fieldKey.endsWith("_cents") ||
                        f.field_key === "discount_amount" ||
                        f.field_key === "display_total_cents")
                ) {
                    baseHint = "money";
                }
                if (drawer.type === "schedules" && (fieldKey === "price_cents" || fieldKey.endsWith("_cents"))) {
                    baseHint = "money";
                }
                const jobReadonlyMoney =
                    drawer.type === "jobs" &&
                    (fieldKey === "display_total_cents" ||
                        fieldKey === "_discount_amount_cents" ||
                        f.field_key === "discount_amount" ||
                        fieldKey.startsWith("_job_payment_"));
                return {
                    key: fieldKey,
                    label: f.label ?? f.field_key,
                    span: 1 as const,
                    renderHint: (rel?.renderHint ?? baseHint) as EntityDrawerFieldConfig["renderHint"],
                    editable: !jobReadonlyMoney,
                    ...(rel?.linkTarget ? { linkTarget: rel.linkTarget } : {}),
                };
            }),
        }));
        let sectionBlocks: EntityDrawerSectionConfig[] = fromDefs;

        if (drawer.type === "locations") {
            /** Canonical sections only; custom defs render once via `overviewCustomContent.custom_property_fields` (not duplicated as config-driven rows). */
            const locCanon = (getEntityPresentation("locations").drawer?.overviewSections ?? []) as EntityDrawerSectionConfig[];
            sectionBlocks = [...locCanon];
        }

        if (drawer.type === "schedules") {
            const schedPres = (getEntityPresentation("schedules").drawer?.overviewSections ?? []) as EntityDrawerSectionConfig[];
            if (fromDefs.length === 0) {
                sectionBlocks = [...schedPres];
            } else {
                const ov = schedPres.find((s) => s.key === "overview");
                const ps = schedPres.find((s) => s.key === "property_service");
                const prefix: EntityDrawerSectionConfig[] = [];
                if (ov && !sectionBlocks.some((s) => s.key === "overview" || s.key === "__schedule_visit_property")) {
                    prefix.push({ ...ov, key: "__schedule_visit_property", title: "Visit & timing" });
                }
                if (ps && !sectionBlocks.some((s) => s.key === "property_service" || s.key === "__schedule_property_service")) {
                    prefix.push({ ...ps, key: "__schedule_property_service", title: "Property / service details" });
                }
                if (prefix.length) sectionBlocks = [...prefix, ...sectionBlocks];
            }
        }

        if (drawer.type === "jobs" && fromDefs.length > 0) {
            const jobPres = (getEntityPresentation("jobs").drawer?.overviewSections ?? []) as EntityDrawerSectionConfig[];
            const ps = jobPres.find((s) => s.key === "property_service");
            if (ps && !sectionBlocks.some((s) => s.key === "property_service")) {
                const ji = sectionBlocks.findIndex((s) => s.key === "job_details");
                const insertAt = ji >= 0 ? ji + 1 : 0;
                sectionBlocks = [...sectionBlocks.slice(0, insertAt), ps, ...sectionBlocks.slice(insertAt)];
            }
        }

        const keys = new Set(sectionBlocks.map((s) => s.key));
        const append: EntityDrawerSectionConfig[] = [];
        if (drawer.type === "persons" && overviewData && !(overviewData as { _create?: boolean })._create && !keys.has("relationships")) {
            append.push({
                key: "relationships",
                title: "Relationships",
                defaultExpanded: false,
                collapsible: true,
                gridCols: 1 as const,
                fields: [],
            });
        }
        if (drawer.type === "locations" && overviewData && !(overviewData as { _create?: boolean })._create) {
            const loc = overviewData as { customer_id?: string | null };
            if (!keys.has("customer") && loc.customer_id) {
                append.push({ key: "customer", title: "Customer", defaultExpanded: false, collapsible: true, gridCols: 1 as const, fields: [] });
            }
            if (!keys.has("relationships")) {
                append.push({
                    key: "relationships",
                    title: "Relationships",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 1 as const,
                    fields: [],
                });
            }
        }
        let result: EntityDrawerSectionConfig[] = [...sectionBlocks, ...append];
        if (drawer.type === "opportunities" && overviewData && !(overviewData as { _create?: boolean })._create) {
            const keys2 = new Set(result.map((s) => s.key));
            if (!keys2.has("inquiry_children")) {
                result = [
                    ...result,
                    {
                        key: "inquiry_children",
                        title: "Inquiry children",
                        defaultExpanded: true,
                        collapsible: true,
                        gridCols: 1,
                        fields: [],
                        locked: true,
                    },
                ];
            }
        }
        if (drawer.type === "opportunities" && overviewData && !(overviewData as { _create?: boolean })._create) {
            const oppLayoutJson = (recordChromeOpportunity.layout?.config_json ?? null) as RecordLayoutConfigJson | null;
            if (oppLayoutJson?.inquiry_drawer_mode === "workflow_v1") {
                const hidden = new Set(oppLayoutJson.overview_hidden_sections ?? []);
                result = result.filter((s) => !hidden.has(s.key));
                result = result.filter((s) => !OPPORTUNITY_WORKFLOW_V1_LEGACY_OVERVIEW_SECTION_KEYS.has(s.key));

                const defByKey = new Map<
                    string,
                    { field_key: string; field_type: string; label: string | null; sort_order: number }
                >();
                for (const fd of visible) {
                    const prev = defByKey.get(fd.field_key);
                    if (!prev || fd.sort_order < prev.sort_order) {
                        defByKey.set(fd.field_key, fd);
                    }
                }
                const virtuals: EntityDrawerSectionConfig[] = [];
                const wfSections = Array.isArray(oppLayoutJson.inquiry_workflow_sections)
                    ? oppLayoutJson.inquiry_workflow_sections
                    : [];
                for (const ws of wfSections) {
                    const allowEmpty = ws.allow_empty === true;
                    const fields = (ws.field_keys ?? [])
                        .filter((k) => !OPPORTUNITY_INQUIRY_HEADER_BODY_FIELD_KEYS.has(k))
                        .map((k) => defByKey.get(k))
                        .filter((x): x is NonNullable<typeof x> => Boolean(x))
                        .map((fd) => mapOpportunityFieldDefToDrawerField(fd));
                    if (!fields.length && !allowEmpty) continue;
                    virtuals.push({
                        key: ws.key,
                        title: ws.title,
                        defaultExpanded: ws.default_expanded !== false,
                        collapsible: true,
                        gridCols: 2,
                        fields,
                        locked: true,
                    });
                }
                const tuitionSection: EntityDrawerSectionConfig = {
                    key: "inquiry_tuition",
                    title: "Tuition / pricing",
                    defaultExpanded: false,
                    collapsible: true,
                    gridCols: 1,
                    fields: [],
                    locked: true,
                };
                const injected = new Set<string>([...virtuals.map((v) => v.key), tuitionSection.key]);
                result = [...virtuals, tuitionSection, ...result.filter((s) => !injected.has(s.key))];
            }
        }
        if (drawer.type === "jobs" && overviewData && !(overviewData as { _create?: boolean })._create) {
            const jobSectionRank: Record<string, number> = {
                job_details: 0,
                property_service: 1,
                customer_location: 2,
                scheduling: 3,
                job_pricing_breakdown: 4,
                pricing: 5,
                notes: 6,
                record_info: 7,
            };
            const rank = (k: string) => (jobSectionRank[k] !== undefined ? jobSectionRank[k]! : 50);
            const overviewBilling = getJobOverviewBillingSummarySection();
            const pricingBreakdown = getJobPricingBreakdownSection();
            if (fromDefs.length === 0 && append.length === 0) {
                const base = (getEntityPresentation("jobs").drawer?.overviewSections ?? []) as EntityDrawerSectionConfig[];
                result = base.map((s) => (s.key === "pricing" ? overviewBilling : s));
            } else {
                result = result
                    .filter((s) => s.key !== "discount" && s.key !== "job_pricing_summary")
                    .map((s) => ({
                        ...s,
                        fields: s.fields.filter(
                            (f) => !jobDrawerPricingFieldKeys.has(f.key) && !jobOverviewBillingFieldKeys.has(f.key)
                        ),
                        subsections: s.subsections
                            ?.map((sub) => ({
                                ...sub,
                                fields: sub.fields.filter(
                                    (f) => !jobDrawerPricingFieldKeys.has(f.key) && !jobOverviewBillingFieldKeys.has(f.key)
                                ),
                            }))
                            .filter((sub) => sub.fields.length > 0),
                    }))
                    .filter((s) => {
                        const sf = s.fields?.length ?? 0;
                        const ss = s.subsections?.length ?? 0;
                        return sf > 0 || ss > 0;
                    });
                const withoutPricing = result.filter((s) => s.key !== "pricing" && s.key !== "job_pricing_breakdown");
                const notesIdx = withoutPricing.findIndex((s) => s.key === "notes");
                const insertAt = notesIdx >= 0 ? notesIdx : withoutPricing.length;
                result = [
                    ...withoutPricing.slice(0, insertAt),
                    pricingBreakdown,
                    overviewBilling,
                    ...withoutPricing.slice(insertAt),
                ];
                result.sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key));
            }
        }
        let overviewSections = presentationType ? mergeUnifiedStatusIntoConfigOverview(presentationType, result) : result;
        if (drawer.type === "schedules" && overviewSections.length > 0) {
            const schedRank = (k: string): number => {
                if (k === "__unified_status") return -1;
                if (k === "overview" || k === "__schedule_visit_property") return 0;
                if (k === "property_service" || k === "__schedule_property_service") return 1;
                return 50;
            };
            overviewSections = [...overviewSections].sort(
                (a, b) => schedRank(a.key) - schedRank(b.key) || a.key.localeCompare(b.key)
            );
        }
        const layoutJson = recordChromeSchedule.layout?.config_json;
        const fromBlocks =
            drawer.type === "schedules" ? getSectionOrderFromScheduleLayoutBlocks(layoutJson?.layout_blocks) : null;
        const scheduleOrder =
            drawer.type === "schedules"
                ? fromBlocks?.length
                    ? fromBlocks
                    : layoutJson?.overview_section_order
                : undefined;
        if (drawer.type === "schedules" && scheduleOrder?.length) {
            overviewSections = applyOverviewSectionOrder(overviewSections, scheduleOrder);
        }
        const oppDrawerCfg = (recordChromeOpportunity.layout?.config_json ?? null) as RecordLayoutConfigJson | null;
        const oppInquiryWorkflowV1 = drawer.type === "opportunities" && oppDrawerCfg?.inquiry_drawer_mode === "workflow_v1";
        const oppOrder = oppDrawerCfg?.overview_section_order;
        if (drawer.type === "opportunities" && oppOrder?.length && !oppInquiryWorkflowV1) {
            overviewSections = applyOverviewSectionOrder(overviewSections, oppOrder);
        }
        if (drawer.type === "opportunities" && (oppDrawerCfg?.suppress_body_status || oppInquiryWorkflowV1)) {
            overviewSections = overviewSections.filter((s) => s.key !== "__unified_status");
        }
        if (oppInquiryWorkflowV1) {
            const savedOrder = oppDrawerCfg?.overview_section_order;
            if (!savedOrder?.length) {
                const icIdx = overviewSections.findIndex((s) => s.key === "inquiry_children");
                if (icIdx > 0) {
                    const ic = overviewSections[icIdx]!;
                    overviewSections = [ic, ...overviewSections.slice(0, icIdx), ...overviewSections.slice(icIdx + 1)];
                }
            }
            overviewSections = overviewSections.map((s) =>
                s.key === "inquiry_children" ? { ...s, defaultExpanded: true } : s
            );
            const stripPricingKeys = new Set(["pricing", "tuition", "tuition_pricing", "fee_schedule"]);
            if (overviewSections.some((s) => s.key === "inquiry_tuition")) {
                overviewSections = overviewSections.filter((s) => !stripPricingKeys.has(s.key));
            }
            overviewSections = overviewSections.filter((s) => !isOpportunityTourFollowUpSection(s));
            overviewSections = overviewSections.filter((s) => !isOpportunityWorkflowStandaloneExternalDuplicate(overviewSections, s));
            overviewSections = overviewSections.filter((s) => !OPPORTUNITY_WORKFLOW_V1_LEGACY_OVERVIEW_SECTION_KEYS.has(s.key));
            if (savedOrder?.length) {
                overviewSections = applyOverviewSectionOrder(overviewSections, savedOrder);
            }
        }
        if (
            drawer.type === "opportunities" &&
            recordOpportunityDrawerLayoutIncludesSection(oppDrawerCfg, "family_contacts")
        ) {
            overviewSections = overviewSections.filter((s) => s.key !== "family_contacts");
        }
        /** Schedule overview tab: snapshot already shows status/timing — keep property + history only (tabs hold the rest). */
        if (drawer.type === "schedules" && overviewSections.length > 0) {
            const keepScheduleOverview = new Set<string>(["property_service", "reschedule_history"]);
            overviewSections = overviewSections.filter((s) => keepScheduleOverview.has(s.key));
        }
        if (drawer.type === "opportunities") {
            overviewSections = overviewSections.filter((s) => s.key !== "operational_attention");
            overviewSections = overviewSections.filter((s) => s.key !== "tour_scheduling");
        }
        return overviewSections;
    }, [drawer.type, overviewData, presentationType, recordChromeSchedule.layout, recordChromeOpportunity.layout]);

    const overviewSelectOptionsByFieldKey = useMemo((): Record<string, { value: string; label: string }[]> => {
        const out: Record<string, { value: string; label: string }[]> = {};
        if (drawer.type === "opportunities" && overviewData) {
            const d = overviewData as Record<string, unknown>;
            const vertOpts = [...oppVerticalOptions.map((v) => ({ value: v.id, label: v.name }))];
            const vid = String(d.vertical_id ?? "");
            if (vid && !vertOpts.some((o) => o.value === vid)) {
                const nm = String(d._vertical_name ?? "").trim();
                vertOpts.push({ value: vid, label: nm || `${vid.slice(0, 8)}…` });
            }
            out.vertical_id = vertOpts;
            const custId = String(d.customer_id ?? "").trim();
            out.customer_id =
                oppRefFieldSelectOptions.customer_id && oppRefFieldSelectOptions.customer_id.length > 0
                    ? oppRefFieldSelectOptions.customer_id
                    : custId
                      ? [{ value: custId, label: String(d._customer_name ?? "").trim() || "—" }]
                      : [];
            const locId = String(d.location_id ?? "").trim();
            out.location_id =
                oppRefFieldSelectOptions.location_id && oppRefFieldSelectOptions.location_id.length > 0
                    ? oppRefFieldSelectOptions.location_id
                    : locId
                      ? [{ value: locId, label: String(d._location_label ?? d._location_name ?? "").trim() || "—" }]
                      : [];
            const ppid = String(d.primary_person_id ?? "").trim();
            out.primary_person_id =
                oppRefFieldSelectOptions.primary_person_id && oppRefFieldSelectOptions.primary_person_id.length > 0
                    ? oppRefFieldSelectOptions.primary_person_id
                    : ppid
                      ? [{ value: ppid, label: String(d._primary_person_name ?? "").trim() || "—" }]
                      : [];
            const pcid = String(d.primary_contact_id ?? "").trim();
            out.primary_contact_id =
                oppRefFieldSelectOptions.primary_contact_id && oppRefFieldSelectOptions.primary_contact_id.length > 0
                    ? oppRefFieldSelectOptions.primary_contact_id
                    : pcid
                      ? [{ value: pcid, label: String(d._primary_contact_name ?? d._contact_name ?? "").trim() || "—" }]
                      : [];
            const psid = String(d.pipeline_stage_id ?? "").trim();
            out.pipeline_stage_id =
                oppPipelineStageOptions.length > 0
                    ? oppPipelineStageOptions
                    : psid
                      ? [{ value: psid, label: String(d._pipeline_stage_name ?? d._stage_name ?? "").trim() || "—" }]
                      : [];
        }
        if (drawer.type === "schedules" && overviewData) {
            const d = overviewData as Record<string, unknown>;
            const jid = String(d.job_id ?? "").trim();
            if (jid) {
                out.job_id = [{ value: jid, label: String(d._job_title ?? "").trim() || "—" }];
            }
            const lid = String(d.location_id ?? d._location_id ?? "").trim();
            if (lid) {
                out.location_id = [{ value: lid, label: String(d._location_label ?? d._location_name ?? "").trim() || "—" }];
            }
            const av = String(d.assigned_vendor_id ?? "").trim();
            if (av) {
                out.assigned_vendor_id = [{ value: av, label: String(d._assigned_vendor_name ?? d._vendor_name ?? "").trim() || "—" }];
            }
            const sub = String(d.customer_subscription_id ?? "").trim();
            if (sub) {
                out.customer_subscription_id = [{ value: sub, label: String(d._customer_subscription_label ?? "").trim() || "—" }];
            }
        }
        if (drawer.type === "jobs" && overviewData) {
            const d = overviewData as Record<string, unknown>;
            const custOpts = jobCustomerOptions.map((c) => ({ value: c.id, label: c.name ?? c.id }));
            const custId = String(d.customer_id ?? "");
            if (custId && !custOpts.some((o) => o.value === custId)) {
                const nm = String(d._customer_name ?? "").trim();
                custOpts.push({ value: custId, label: nm || `${custId.slice(0, 8)}…` });
            }
            out.customer_id = custOpts;

            const locOpts = jobLocationOptions.map((l) => ({ value: l.id, label: l.label ?? l.id }));
            const locId = String(d.location_id ?? "");
            if (locId && !locOpts.some((o) => o.value === locId)) {
                const nm = String(d._location_name ?? d._location_label ?? "").trim();
                locOpts.push({ value: locId, label: nm || `${locId.slice(0, 8)}…` });
            }
            out.location_id = locOpts;

            const personOpts = jobPersonOptions.map((p) => ({ value: p.id, label: p.label ?? p.id }));
            const ppid = String(d.primary_person_id ?? "");
            if (ppid && !personOpts.some((o) => o.value === ppid)) {
                const nm = String(d._primary_person_name ?? "").trim();
                personOpts.push({ value: ppid, label: nm || `${ppid.slice(0, 8)}…` });
            }
            out.primary_person_id = personOpts;

            const contactOpts = jobContactOptions.map((c) => ({ value: c.id, label: c.label ?? c.id }));
            const pcid = String(d.primary_contact_id ?? "");
            if (pcid && !contactOpts.some((o) => o.value === pcid)) {
                const nm = String(d._contact_name ?? d._primary_contact_name ?? "").trim();
                contactOpts.push({ value: pcid, label: nm || `${pcid.slice(0, 8)}…` });
            }
            out.primary_contact_id = contactOpts;

            const oppOpts = jobOpportunityOptions.map((o) => ({ value: o.id, label: o.label ?? o.id }));
            const oid = String(d.opportunity_id ?? "");
            if (oid && !oppOpts.some((o) => o.value === oid)) {
                const nm = String(d._opportunity_name ?? "").trim();
                oppOpts.push({ value: oid, label: nm || `${oid.slice(0, 8)}…` });
            }
            out.opportunity_id = oppOpts;

            const vendorOpts = jobVendorsForAssign.map((v) => ({
                value: v.id,
                label: v.label ?? formatVendorOptionLabel({ id: v.id, name: v.name }),
            }));
            const aid = String((overviewData as { assigned_vendor_id?: string | null }).assigned_vendor_id ?? "");
            if (aid && !vendorOpts.some((o) => o.value === aid)) {
                const nm = String((overviewData as { _assigned_vendor_name?: string | null })._assigned_vendor_name ?? "").trim();
                vendorOpts.push({
                    value: aid,
                    label: nm || formatVendorOptionLabel({ id: aid }),
                });
            }
            out.assigned_vendor_id = vendorOpts;

            const discOpts = jobDiscountOptions.map((o) => ({ value: o.value, label: o.label }));
            const dJob = overviewData as {
                _discount_selection?: string | null;
                discount_code?: string | null;
                _discount_label?: string | null;
                discount_code_id?: string | null;
            };
            const selTok = String(dJob._discount_selection ?? "").trim();
            let discountOpts = discOpts;
            if (selTok && !discountOpts.some((o) => o.value === selTok)) {
                const lbl =
                    String(dJob.discount_code ?? "").trim() ||
                    String(dJob._discount_label ?? "").trim() ||
                    selTok;
                discountOpts = [...discountOpts, { value: selTok, label: lbl }];
            }
            out.discount_code_id = discountOpts;

            const wuOpts = jobWorkUnitOptions.map((o) => ({ value: o.id, label: o.label }));
            const wuid = String(d.work_unit_id ?? "").trim();
            if (wuid && !wuOpts.some((o) => o.value === wuid)) {
                const wl = String(d._work_unit_label ?? "").trim();
                wuOpts.push({ value: wuid, label: wl || `${wuid.slice(0, 8)}…` });
            }
            out.work_unit_id = wuOpts;
        }
        if (drawer.type === "vendors" && overviewData) {
            const d = overviewData as {
                _vendor_status_options?: { id: string; key: string; label: string | null }[];
                vendor_status_id?: string | null;
                _vendor_status_label?: string | null;
                primary_person_id?: string | null;
                _primary_person_name?: string | null;
            };
            const pOpts = [...vendorPrimaryPersonOptions];
            const pid = String(d.primary_person_id ?? "");
            if (pid && !pOpts.some((o) => o.value === pid)) {
                pOpts.push({ value: pid, label: String(d._primary_person_name ?? "").trim() || `${pid.slice(0, 8)}…` });
            }
            out.primary_person_id = pOpts;
        }
        return out;
    }, [
        drawer.type,
        overviewData,
        oppVerticalOptions,
        oppRefFieldSelectOptions,
        oppPipelineStageOptions,
        jobVendorsForAssign,
        vendorPrimaryPersonOptions,
        jobCustomerOptions,
        jobLocationOptions,
        jobPersonOptions,
        jobContactOptions,
        jobOpportunityOptions,
        jobDiscountOptions,
        jobWorkUnitOptions,
    ]);

    const opportunityInquiryWorkflowHeaderStatus = useMemo(() => {
        if (!opportunityInquiryWorkflowDrawer || drawer.type !== "opportunities") return null;
        if (!overviewData || (overviewData as { _create?: boolean })._create) return null;
        const d = overviewData as Record<string, unknown>;
        const currentStatus = String(formData.status_key ?? d.status_key ?? "").trim();
        let statusOptions =
            statusDefsForDrawer
                ?.filter((s) => s.is_active !== false)
                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) ?? [];
        if (currentStatus && !statusOptions.some((s) => s.status_key === currentStatus)) {
            statusOptions = [
                ...statusOptions,
                { status_key: currentStatus, status_label: currentStatus, sort_order: 9999, is_active: true },
            ];
        }
        return (
            <div className="flex min-w-0 max-w-[11rem] shrink flex-col gap-0.5 sm:max-w-[15rem]">
                <span className="sr-only">Opportunity status</span>
                <select
                    value={currentStatus}
                    onChange={(e) =>
                        setFormData((prev) => ({
                            ...prev,
                            status_key: e.target.value || null,
                        }))
                    }
                    onBlur={() => {
                        if (nonJobFormDirty) saveEdit();
                    }}
                    disabled={!canMutate}
                    className="w-full min-w-0 rounded-full border border-alloy-stone/30 bg-white px-3 py-2 text-[12px] font-semibold text-alloy-midnight/90 shadow-md shadow-alloy-stone/10 ring-1 ring-alloy-stone/10 focus:border-alloy-blue focus:outline-none focus:ring-2 focus:ring-alloy-blue/20 disabled:opacity-60"
                    aria-label="Opportunity status"
                >
                    <option value="">— None —</option>
                    {statusOptions.map((s) => (
                        <option key={s.status_key} value={s.status_key}>
                            {s.status_label ?? s.status_key}
                        </option>
                    ))}
                </select>
            </div>
        );
    }, [
        opportunityInquiryWorkflowDrawer,
        drawer.type,
        overviewData,
        formData.status_key,
        statusDefsForDrawer,
        canMutate,
        nonJobFormDirty,
        saveEdit,
        setFormData,
    ]);

    const opportunityInquiryWorkflowHeaderTimeline = useMemo(() => {
        if (!opportunityInquiryWorkflowDrawer || drawer.type !== "opportunities") return undefined;
        if (!overviewData || (overviewData as { _create?: boolean })._create) return undefined;
        const d = overviewData as Record<string, unknown>;
        const currentStatus = String(formData.status_key ?? d.status_key ?? "").trim();
        const qd = opportunityQueueDefinition;
        if (!qd || qd.entity_type !== "opportunity") return undefined;

        const queueByKey = new Map(qd.queues.map((q) => [q.key, q]));
        const pipelineSection =
            qd.ui?.sections?.find((s) => (s.tone ?? "standard") !== "critical") ?? qd.ui?.sections?.[0] ?? null;
        const pipelineKeys = pipelineSection?.queue_keys ?? [];
        const steps = pipelineKeys
            .map((k) => queueByKey.get(k))
            .filter((q): q is QueueDefinitionV1["queues"][number] => !!q);
        if (steps.length === 0) return undefined;

        const statusKeysForQueue = (filters: QueueFilter[]): string[] => {
            const out: string[] = [];
            for (const f of filters ?? []) {
                if (f && f.type === "status" && f.operator === "in") {
                    out.push(...(f.values ?? []));
                }
            }
            return out;
        };

        const currentIdx = currentStatus
            ? steps.findIndex((q) => statusKeysForQueue(q.filters).some((sk) => String(sk).trim() === currentStatus))
            : -1;

        return (
            <div
                data-opportunity-workflow-timeline
                className="rounded-xl border border-alloy-stone/15 bg-white/80 px-2.5 py-1.5 shadow-sm ring-1 ring-alloy-stone/10"
            >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {steps.map((q, i) => {
                        const key = String(q.key ?? "").trim();
                        const label = String(q.label ?? q.key ?? "").trim() || "—";
                        const completed = currentIdx >= 0 && i < currentIdx;
                        const current = currentIdx >= 0 && i === currentIdx;
                        const future = currentIdx >= 0 && i > currentIdx;

                        const dotClass = completed
                            ? "bg-[rgb(0,162,131)] text-white"
                            : current
                              ? "bg-alloy-blue text-white ring-2 ring-alloy-blue/20"
                              : "bg-white text-alloy-midnight/45 ring-1 ring-alloy-stone/20";

                        const labelClass = completed
                            ? "text-alloy-midnight/75"
                            : current
                              ? "text-alloy-midnight/90"
                              : future
                                ? "text-alloy-midnight/45"
                                : "text-alloy-midnight/55";

                        return (
                            <div key={key || `${i}`} className="flex min-w-0 items-start gap-1.5">
                                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${dotClass}`}>
                                    {completed ? (
                                        <span className="text-[12px] leading-none font-semibold" aria-hidden>
                                            ✓
                                        </span>
                                    ) : (
                                        <span className="text-[11px] leading-none font-semibold" aria-hidden>
                                            {i + 1}
                                        </span>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <div className={`text-[11px] font-medium whitespace-nowrap ${labelClass}`}>{label}</div>
                                </div>
                                {i < steps.length - 1 ? (
                                    <span
                                        aria-hidden
                                        className={`mx-0.5 h-[2px] w-4 rounded-full ${
                                            completed ? "bg-[rgb(0,162,131)]/45" : current ? "bg-alloy-blue/35" : "bg-alloy-stone/20"
                                        }`}
                                    />
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }, [opportunityInquiryWorkflowDrawer, drawer.type, overviewData, formData.status_key, opportunityQueueDefinition]);

    const opportunityActivityHeaderLine = useMemo(() => {
        if (drawer.type !== "opportunities") return null;
        if (!overviewData || (overviewData as { _create?: boolean })._create) return null;
        if (opportunityActivitySignalLoading) {
            return (
                <span className="text-[11px] text-alloy-midnight/40" aria-busy="true">
                    Last activity: …
                </span>
            );
        }
        const sig = opportunityActivitySignal;
        const nowMs = Date.now();
        const stale = sig?.stale_signal ?? null;
        const hasActivity = Boolean(sig?.last_activity_at && String(sig.last_activity_at).trim());
        const rel = hasActivity && sig?.last_activity_at ? formatActivityRelativeShort(sig.last_activity_at, nowMs) : null;
        const summary = (sig?.last_activity_summary ?? "").trim();
        const detail =
            summary && rel ? `${summary} · ${rel}` : summary || rel || (hasActivity ? "Activity" : null);

        return (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-snug text-alloy-midnight/55">
                <span className="min-w-0">
                    <span className="font-medium text-alloy-midnight/45">Last activity:</span>{" "}
                    {detail ? (
                        <span className="text-alloy-midnight/70">{detail}</span>
                    ) : (
                        <span className="text-alloy-midnight/45">No activity yet</span>
                    )}
                </span>
                {stale ? (
                    <span
                        className={`inline-flex max-w-full shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] leading-tight ${opportunityActivityStaleBadgeClass(stale.severity)}`}
                    >
                        {stale.label}
                    </span>
                ) : null}
            </div>
        );
    }, [drawer.type, overviewData, opportunityActivitySignal, opportunityActivitySignalLoading]);

    if (!drawer.type || !drawer.id) return null;

    const drawerStatusBadge = overviewData &&
        !loading &&
        !drawerGateLoading &&
        !opportunityRecordChromePending &&
        !(overviewData as { _create?: boolean })?._create ? (
        drawer.type === "jobs" && isJobExistingView ? (
            isJobDrawerV2 ? null : (
                <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                        label={
                            String((overviewData as { _status_display?: string | null })._status_display ?? "").trim() ||
                            getStatusLabel((overviewData as { status_key?: string }).status_key) ||
                            String((overviewData as { status_key?: string }).status_key ?? "").trim() ||
                            "—"
                        }
                        variant={getStatusVariant((overviewData as { status_key?: string }).status_key)}
                    />
                    <span className="text-xs text-alloy-midnight/55 whitespace-nowrap">Payment</span>
                    <StatusBadge label={paymentStatusLabel} variant={paymentStatusVariant} />
                </div>
            )
        ) : drawer.type === "opportunities" &&
          !opportunityInquiryWorkflowDrawer &&
          (opportunityOverviewStatusBadgeLabel(overviewData as Record<string, unknown>) ||
              (overviewData as { status_key?: string }).status_key) ? (
            <StatusBadge
                label={
                    opportunityOverviewStatusBadgeLabel(overviewData as Record<string, unknown>) ||
                    getStatusLabel((overviewData as { status_key?: string }).status_key) ||
                    String((overviewData as { status_key?: string }).status_key ?? "")
                }
                variant="default"
            />
        ) : drawer.type === "opportunities" && opportunityInquiryWorkflowDrawer && opportunityInquiryWorkflowHeaderStatus ? (
            opportunityInquiryWorkflowHeaderStatus
        ) : drawer.type === "schedules" &&
          ((overviewData as { _status_display?: string | null })._status_display ||
              (overviewData as { _schedule_status_label?: string | null })._schedule_status_label ||
              (overviewData as { status_key?: string }).status_key) ? (
            <StatusBadge
                label={
                    String((overviewData as { _status_display?: string | null })._status_display ?? "").trim() ||
                    String((overviewData as { _schedule_status_label?: string | null })._schedule_status_label ?? "").trim() ||
                    getStatusLabel((overviewData as { status_key?: string }).status_key) ||
                    String((overviewData as { status_key?: string }).status_key ?? "")
                }
                variant="default"
            />
        ) : drawer.type === "vendors" &&
          ((overviewData as { _status_display?: string | null })._status_display ||
              (overviewData as { _vendor_status_label?: string | null })._vendor_status_label ||
              (overviewData as { status_key?: string | null }).status_key) ? (
            <StatusBadge
                label={
                    String((overviewData as { _status_display?: string | null })._status_display ?? "").trim() ||
                    String((overviewData as { _vendor_status_label?: string | null })._vendor_status_label ?? "").trim() ||
                    getStatusLabel((overviewData as { status_key?: string | null }).status_key) ||
                    String((overviewData as { status_key?: string | null }).status_key ?? "")
                }
                variant="default"
            />
        ) : drawer.type === "payments" && overviewData && !(overviewData as { _create?: boolean })._create ? (
            (() => {
                const { label, variant } = paymentRowStatusBadgeProps(overviewData as PaymentRowLike);
                return <StatusBadge label={label} variant={variant} />;
            })()
        ) : drawer.type === "subscriptions" && overviewData ? (
            <StatusBadge
                label={
                    String((overviewData as { _status_display?: string | null })._status_display ?? "").trim() ||
                    String((overviewData as { status?: string | null }).status ?? "").trim() ||
                    "—"
                }
                variant="default"
            />
        ) : STATUS_ENTITY_TYPES.includes(drawer.type) &&
          !(drawer.type === "opportunities" && opportunityInquiryWorkflowDrawer) &&
          (overviewData as { status_key?: string }).status_key ? (
            <StatusBadge label={getStatusLabel((overviewData as { status_key: string }).status_key) ?? (overviewData as { status_key: string }).status_key} variant="default" />
        ) : null
    ) : null;

    const drawerHeaderActions = (
        <div className="flex flex-wrap items-center justify-end gap-2">
            {canGoBack && previousDrawer && (
                <button type="button" onClick={goBack} className="shrink-0 px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30 text-alloy-midnight/90">
                    ← Back to {getEntityLabel(labels, previousDrawer.type, "singular")}
                </button>
            )}
            {overviewData && !loading && canEditInDrawer(drawer.type) && (
                <>
            {drawer.type === "jobs" && isJobExistingView &&
                (isJobDrawerV2 ? (
                    <JobDrawerV2PrimaryActions
                        canMutate={!!canMutate}
                        jobId={drawer.id as string}
                        vendorSingular={vendorSingular}
                        jobActionLoading={jobActionLoading}
                        setJobActionLoading={setJobActionLoading}
                        hasServerJobPaymentSummary={hasServerJobPaymentSummary}
                        jobPaymentSummaryFromApi={jobPaymentSummaryFromApi}
                        jobSchedulesLength={jobSchedules.length}
                        openCollectPayment={openCollectPayment}
                        clearPaymentToast={() => setPaymentToast(null)}
                        setJobExpandedSections={setJobExpandedSections}
                        openReschedule={openReschedule}
                        firstSchedule={jobSchedules[0] ?? null}
                        rescheduleFormActive={!!rescheduleForm}
                        setData={setData}
                        refetch={refetch}
                        router={router}
                        recordChromeActions={recordChromeJob.actions}
                        onRecordChromeAction={handleRecordChromeJobAction}
                    />
                ) : (
                    jobQuickActionsNode
                ))}
            {drawer.type === "schedules" && isScheduleExistingView && scheduleHeaderQuickActionsNode}
            {drawer.type === "opportunities" && isOpportunityExistingView && opportunityHeaderQuickActionsNode}
                        {drawer.type === "jobs" && !(data as { _create?: boolean })?._create && canMutate && jobFormDirty && (
                            <>
                                <button type="button" onClick={saveEdit} disabled={saving} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
                                <button type="button" onClick={() => { if (initialJobFormData) setFormData((prev) => ({ ...prev, ...initialJobFormData })); setSaveError(null); }} className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30">Cancel</button>
                            </>
                        )}
            {INLINE_EDIT_ENTITY_TYPES.includes(drawer.type as (typeof INLINE_EDIT_ENTITY_TYPES)[number]) && !(data as { _create?: boolean })?._create && canMutate && (nonJobFormDirty || saving || saveSuccess) && (
                <>
                    {saveSuccess && <span className="text-sm text-alloy-juniper font-medium">Saved</span>}
                    <button type="button" onClick={saveEdit} disabled={saving} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
                    <button type="button" onClick={handleInlineCancel} className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30">Cancel</button>
                </>
            )}
            {drawer.type === "workflows" && !(data as { _create?: boolean })?._create && (
                <>
                    {canMutate && (
                        <>
                            <button type="button" onClick={saveEdit} disabled={saving} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
                            <button
                                type="button"
                                onClick={() => {
                                    setSaveError(null);
                                    if (data && !(data as { _create?: boolean })._create) hydrateWorkflowEditorFromData(data as Record<string, unknown>);
                                }}
                                className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30"
                            >
                                Cancel
                            </button>
                        </>
                    )}
                    <button type="button" onClick={() => { setRunModalOpen(true); setRunPayload("{}"); setRunResult(null); setRunJsonError(null); }} className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30">Run {workflowSingular.toLowerCase()}</button>
                </>
            )}
            {drawer.type === "schedules" && canMutate && !(data as { _create?: boolean })?._create && <button type="button" onClick={() => { setSetLocationEntity("schedule"); const sid = (data?.location_id as string) ?? (data?._location_id as string) ?? null; setSetLocationSelectedId(sid); setSetLocationError(null); fetch("/api/admin/locations").then((r) => r.ok ? r.json() : { locations: [] }).then((j: { locations?: { id: string; label: string | null; address1: string | null; city: string | null; state: string | null; postal_code: string | null }[] }) => setSetLocationList(j.locations ?? [])).catch(() => setSetLocationList([])); setSetLocationOpen(true); }} className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30">{((data?.location_id as string) ?? (data?._location_id as string)) ? "Change location" : "Set location"}</button>}
            {drawer.type === "locations" && canMutate && !(data as { _create?: boolean })?._create && (
                <>
                    <button type="button" onClick={saveEdit} disabled={saving} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
                    <button type="button" onClick={() => { startEdit(); setSaveError(null); }} className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30">Cancel</button>
                </>
            )}
            {(drawer.type === "subscriptions" || drawer.type === "documents") && canMutate && drawer.id && drawer.id !== "new" && !(data as { _create?: boolean })?._create && (
                <>
                    <button type="button" onClick={saveEdit} disabled={saving} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
                    <button type="button" onClick={() => { startEdit(); setSaveError(null); }} className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30">Cancel</button>
                </>
            )}
            {canMutate && !(data as { _create?: boolean })?._create && drawer.id && drawer.id !== "new" && canHardDeleteEntityType(drawer.type) && (
                deletionEligibilityLoading ? (
                    <span className="text-xs text-alloy-midnight/50">Checking…</span>
                ) : deletionEligibility && !deletionEligibility.allowed ? (
                    <span className="text-xs text-alloy-midnight/70 max-w-[200px]" title={deletionEligibility.reason}>{deletionEligibility.reason}</span>
                ) : deletionEligibility?.allowed === true ? (
                    <button type="button" onClick={() => setDeleteConfirmOpen(true)} className="px-3 py-1.5 text-sm border border-alloy-ember/50 text-alloy-ember rounded-md hover:bg-alloy-ember/10">Delete</button>
                ) : null
            )}
                </>
            )}
                </div>
    );

    const drawerHeaderExtra =
        isJobRecordModalTarget && drawer.type === "jobs" ? (
            <JobDrawerV2TabBar
                tabs={jobDrawerV2TabListResolved}
                tabLabels={jobDrawerV2TabLabelsResolved}
                active={drawerTab}
                onSelect={setDrawerTab}
                tabButtonsDisabled={drawerGateLoading}
            />
        ) : (drawerReady || drawerGateLoading) &&
          ["jobs", "schedules", "opportunities", "customers", "contacts", "customer_members", "persons", "vendors", "locations", "payments", "discount_redemptions", "service_offerings", "service_plan_templates", "addons", "subscriptions", "documents"].includes(
              drawer.type,
          ) &&
          !(overviewData && (overviewData as { _create?: boolean })._create) ? (
            <div className="flex min-h-[2.875rem] flex-wrap gap-0.5 rounded-lg border border-admin-border bg-white p-0.5">
                {drawerTabStripKeys.map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        disabled={drawerGateLoading}
                        onClick={() => {
                            if (!drawerGateLoading) setDrawerTab(tab);
                        }}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors adminv2-record-modal-tab ${drawerTab === tab ? "adminv2-record-modal-tab--active" : "text-alloy-forge/80 hover:bg-alloy-stone/50"} ${drawerGateLoading ? "opacity-85 cursor-default" : ""}`}
                        aria-busy={drawerGateLoading}
                    >
                        {tabLabels[tab] ?? tab}
                    </button>
                ))}
            </div>
        ) : undefined;

    const jobV2MetaSubtitle =
        isJobDrawerV2 && overviewData && !(overviewData as { _create?: boolean })?._create
            ? [
                  String((overviewData as { _customer_name?: string })._customer_name ?? "").trim(),
                  String((overviewData as { service_key?: string }).service_key ?? "").trim() ||
                      String((overviewData as { job_type?: string }).job_type ?? "").trim(),
              ]
                  .filter(Boolean)
                  .join(" · ") || undefined
            : undefined;
    const drawerTitleResolved =
        isOpportunityRecordModalTarget &&
        drawer.type === "opportunities" &&
        drawer.id !== "new" &&
        !opportunityDrawerShellSettled &&
        !error
            ? "Inquiry"
            : drawerGateLoading
              ? `Loading ${drawer.type ? getEntityLabel(labels, drawer.type, "singular").toLowerCase() : "record"}…`
              : drawer.type === "opportunities" &&
                  overviewData &&
                  !(overviewData as { _create?: boolean })._create &&
                  opportunityInquiryWorkflowDrawer
                ? (() => {
                      const d = overviewData as Record<string, unknown>;
                      const ident = (d._identity as Record<string, unknown> | null) ?? null;
                      const household = ident && typeof ident.household === "object" ? (ident.household as Record<string, unknown>) : null;
                      const householdLabel = household && typeof household.label === "string" ? household.label.trim() : "";
                      const customerName =
                          typeof (d as { _customer_name?: unknown })._customer_name === "string"
                              ? String((d as { _customer_name: string })._customer_name).trim()
                              : "";
                      const inquiryTitle = opportunityInquiryIdentityInquiryTitle(d);
                      const nm = String((d.name as string | undefined) ?? "").trim();
                      const base = householdLabel || customerName || inquiryTitle || nm || opportunitySingular;
                      const raw = base.startsWith("Enrollment") ? base : `Enrollment — ${base}`;
                      return (
                          raw
                              .replace(/\bInquiry\b/gi, "")
                              .replace(/\s{2,}/g, " ")
                              .replace(/^\s*[-:]\s*/g, "")
                              .trim() || raw
                      );
                  })()
                : isJobDrawerV2 && overviewData && !(overviewData as { _create?: boolean })?._create
                  ? String((overviewData as { title?: string }).title ?? "").trim() || "Job"
                  : typeof title === "string"
                    ? title
                    : title != null
                      ? String(title)
                      : "—";
    const headerSubtitleBase = jobV2MetaSubtitle ?? drawerHeaderRecordSubtitle ?? undefined;
    const workflowCompactRecordNum =
        drawer.type === "opportunities" && opportunityInquiryWorkflowDrawer && typeof headerSubtitleBase === "string"
            ? (() => {
                  const m = headerSubtitleBase.match(/#\s*(\d+)/);
                  return m?.[1] ? `#${m[1]}` : headerSubtitleBase;
              })()
            : headerSubtitleBase;
    const headerSubtitleResolved =
        drawer.type === "opportunities" && opportunityInquiryWorkflowDrawer ? (
            <div className="mt-0.5 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                    {workflowCompactRecordNum ? <span>{workflowCompactRecordNum}</span> : null}
                    <span className="shrink-0">{opportunityInquiryWorkflowHeaderStatus}</span>
                </div>
                {overviewData && !(overviewData as { _create?: boolean })._create ? (
                    <OperationalAttentionHeaderStrip
                        key={`attn-hdr-${String((overviewData as { id?: string }).id ?? "")}`}
                        variant="chrome"
                        overviewData={overviewData as Record<string, unknown>}
                    />
                ) : null}
                {opportunityActivityHeaderLine}
            </div>
        ) : drawer.type === "opportunities" && !opportunityInquiryWorkflowDrawer ? (
            <div className="mt-0.5 space-y-1.5">
                {headerSubtitleBase ? <div>{headerSubtitleBase}</div> : null}
                {overviewData && !(overviewData as { _create?: boolean })._create ? (
                    <OperationalAttentionHeaderStrip
                        key={`attn-hdr-${String((overviewData as { id?: string }).id ?? "")}`}
                        variant="chrome"
                        overviewData={overviewData as Record<string, unknown>}
                    />
                ) : null}
                {opportunityActivityHeaderLine}
            </div>
        ) : (
            headerSubtitleBase
        );

    const workflowHeaderTitleRight =
        drawer.type === "opportunities" && opportunityInquiryWorkflowDrawerShell ? (
            <div className="flex flex-wrap items-start justify-end gap-2">
                {opportunityHeaderQuickActionsNode}
            </div>
        ) : undefined;

    const opportunityWorkflowHeaderChromePending =
        drawer.type === "opportunities" &&
        opportunityInquiryWorkflowDrawerShell &&
        (drawerGateLoading || opportunityRecordChromePending);

    const headerSubtitleForDrawer =
        opportunityWorkflowHeaderChromePending ? (
            <DrawerOpportunityWorkflowSubtitleGateSkeleton />
        ) : drawerGateLoading ? (
            <DrawerSubtitleGateSkeleton />
        ) : (
            headerSubtitleResolved
        );

    const headerTitleRightForDrawer =
        opportunityWorkflowHeaderChromePending ? (
            <DrawerWorkflowHeaderQuickActionsSkeleton />
        ) : (
            workflowHeaderTitleRight
        );

    const headerSignalsForDrawer =
        opportunityWorkflowHeaderChromePending ? (
            <DrawerOpportunityWorkflowTimelineGateSkeleton />
        ) : drawerGateLoading && isJobRecordModalTarget && drawer.type === "jobs" ? (
            <div className="min-h-[3.25rem] w-full" aria-busy="true">
                <DrawerQuietSkeletonBar className="h-14 w-full rounded-lg opacity-95" />
            </div>
        ) : isJobDrawerV2 ? (
            jobDrawerV2SignalsNode
        ) : (
            opportunityInquiryWorkflowHeaderTimeline
        );

    /** Inquiry workflow anchors primary actions beside the title row — omit empty headerActions row entirely. */
    const workflowOpportunityUsesTitleRailActions =
        drawer.type === "opportunities" && opportunityInquiryWorkflowDrawerShell;

    const headerActionsForDrawer = workflowOpportunityUsesTitleRailActions
        ? undefined
        : drawerGateLoading
          ? (
                <div
                    className="flex min-h-[40px] w-full flex-wrap items-center justify-end gap-2"
                    aria-busy="true"
                >
                    {drawerHeaderActions}
                    <DrawerQuietSkeletonBar className="hidden h-9 w-28 sm:block" />
                    <DrawerQuietSkeletonBar className="h-9 w-24" />
                </div>
            )
          : drawerHeaderActions;

    const recordCleaningV2Eligible =
        showJobRecordModalV2 || scheduleRecordChromeBodyShell || opportunityRecordChromeBodyShell;

    return (
        <Drawer
            isOpen
            onClose={closeDrawer}
            title={drawerTitleResolved}
            headerSubtitle={headerSubtitleForDrawer}
            headerTitleRight={headerTitleRightForDrawer}
            statusBadge={
                drawer.type === "opportunities" && opportunityInquiryWorkflowDrawer ? undefined : drawerStatusBadge
            }
            headerActions={headerActionsForDrawer}
            headerSignals={headerSignalsForDrawer}
            headerExtra={drawerHeaderExtra}
            zIndexBackdrop={60}
            zIndexPanel={70}
            accentColor={drawer.type ? DRAWER_ACCENT_COLORS[drawer.type] : undefined}
            variant={drawerShellVariant}
            presentation={useAdminV2RecordModalPresentation ? "modal" : "sidebar"}
            panelClassName={useAdminV2RecordModalPresentation ? "max-w-7xl" : undefined}
            recordModalTone={recordCleaningV2Eligible ? "cleaning-v2" : undefined}
            recordModalContextStyle={
                recordCleaningV2Eligible
                    ? recordSurfaceContextStyle({
                          ...(drawer.operationalVisualContext ?? {}),
                      })
                    : undefined
            }
        >
            <div className="">
            {error && <p className="text-alloy-ember">Error: {error}</p>}
            {drawerBodyGateLoading ? (
                <div
                    className={drawerRecordBodyRootClassName}
                    data-adminv2-drawer-record-gate-skeleton="true"
                    data-adminv2-job-drawer-body={
                        isJobRecordModalTarget && drawer.type === "jobs" ? "true" : undefined
                    }
                    data-adminv2-schedule-drawer-body={scheduleRecordChromeBodyShell ? "true" : undefined}
                    data-adminv2-opportunity-drawer-body={opportunityRecordChromeBodyShell ? "true" : undefined}
                >
                    <DrawerRecordGateSkeleton
                        modalJob={isJobRecordModalTarget && drawer.type === "jobs"}
                        modalSchedule={Boolean(scheduleRecordChromeBodyShell && drawer.type === "schedules")}
                        modalOpportunityWorkflow={
                            !!(
                                opportunityRecordChromeBodyShell &&
                                (opportunityInquiryWorkflowDrawer || opportunityRecordChromePending)
                            )
                        }
                        modalOpportunityClassic={
                            !!(
                                opportunityRecordChromeBodyShell &&
                                recordChromeOpportunity.configResolved &&
                                !opportunityInquiryWorkflowDrawer
                            )
                        }
                        recordGateOpportunityWorkflowShape={recordGateOpportunityWorkflowShape}
                    />
                </div>
            ) : drawerReady && data && dataMatchesDrawer ? (
                <div
                    className={drawerRecordBodyRootClassName}
                    data-adminv2-job-drawer-body={isJobDrawerV2 && drawer.type === "jobs" ? "true" : undefined}
                    data-adminv2-schedule-drawer-body={showScheduleRecordModalV2 ? "true" : undefined}
                    data-adminv2-opportunity-drawer-body={showOpportunityRecordModalV2 ? "true" : undefined}
                >
                    {saveError && <p className="text-alloy-ember text-sm">{saveError}</p>}
                    {registryActionFeedback ? (
                        <div
                            className={`rounded-md border px-3 py-2 text-sm ${
                                registryActionFeedback.type === "success"
                                    ? "border-alloy-pine/35 bg-emerald-50/90 text-alloy-midnight"
                                    : "border-alloy-ember/40 bg-amber-50 text-alloy-ember"
                            }`}
                            role="status"
                        >
                            <div className="font-medium">{registryActionFeedback.message}</div>
                            {registryActionFeedback.workflow_run_id ? (
                                <div className="mt-1.5 text-xs">
                                    <Link
                                        href={`/adminV2/workflows?run=${encodeURIComponent(registryActionFeedback.workflow_run_id)}`}
                                        className="font-semibold text-alloy-blue hover:underline"
                                    >
                                        Review workflow runs
                                    </Link>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                    {drawer.type === "schedules" &&
                        showScheduleRecordModalV2 &&
                        scheduleCancelPrompt &&
                        drawer.id &&
                        drawer.id !== "new" &&
                        !(data as { canceled_at?: string | null }).canceled_at && (
                            <div
                                className="rounded-lg border border-amber-200 bg-amber-50/95 px-4 py-3 text-sm text-amber-950"
                                role="region"
                                aria-label="Confirm cancel visit"
                            >
                                <p className="font-medium">Cancel this visit?</p>
                                <p className="mt-1 text-xs text-amber-900/85 leading-snug">
                                    This uses the cancel API — sets <code className="text-[11px] bg-amber-100/80 px-1 rounded">canceled_at</code>, workflow
                                    status, and fee rules. It cannot be done from the status dropdown.
                                </p>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <input
                                        value={scheduleCancelReason}
                                        onChange={(e) => setScheduleCancelReason(e.target.value)}
                                        placeholder="Reason (optional)"
                                        className="min-w-[10rem] flex-1 rounded border border-amber-300/80 bg-white px-2 py-1.5 text-sm"
                                    />
                                    <button
                                        type="button"
                                        className="rounded bg-alloy-ember/90 px-3 py-1.5 text-sm font-medium text-white hover:opacity-95"
                                        onClick={async () => {
                                            if (!drawer.id) return;
                                            try {
                                                const res = await fetch(`/api/admin/schedules/${drawer.id}/cancel`, {
                                                    method: "POST",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify({ cancel_reason: scheduleCancelReason || null }),
                                                });
                                                const j = await res.json().catch(() => ({}));
                                                if (!res.ok) throw new Error((j as { error?: string }).error || "Failed");
                                                setScheduleCancelReason("");
                                                setScheduleCancelPrompt(false);
                                                refetch();
                                                router.refresh();
                                                window.dispatchEvent(
                                                    new CustomEvent("admin-entity-saved", { detail: { type: "schedules", id: drawer.id } })
                                                );
                                            } catch (err) {
                                                setSaveError((err as Error).message);
                                            }
                                        }}
                                    >
                                        Confirm cancel
                                    </button>
                                    <button
                                        type="button"
                                        className="text-sm text-amber-900/80 hover:underline"
                                        onClick={() => {
                                            setScheduleCancelPrompt(false);
                                            setScheduleCancelReason("");
                                        }}
                                    >
                                        Back
                                    </button>
                                </div>
                            </div>
                        )}
                    {((drawer.type === "contacts" || drawer.type === "customer_members") && (data as { _person_id?: string | null })?._person_id) && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900">
                            <p className="font-medium">Legacy record.</p>
                            <p className="mt-1 text-amber-800/90">Open the canonical Person to view and manage this human record.</p>
                            <button type="button" onClick={() => openDrawer({ type: "persons", id: (data as { _person_id: string })._person_id })} className="mt-2 px-3 py-1.5 text-sm font-medium bg-alloy-midnight text-white rounded-md hover:opacity-90">Open canonical Person</button>
                        </div>
                    )}
                    {drawer.type === "schedules" && (data as { _create?: boolean })?._create && (
                        <div className="space-y-4">
                            <p className="text-sm text-alloy-midnight/70">Create a new schedule. {drawer.defaultSchedulePrefill?.job_id ? `${jobSingular} is prefilled.` : "Enter start and end times."}</p>
                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Start (required)</label><input type="datetime-local" value={scheduleCreateForm.start_at} onChange={(e) => setScheduleCreateForm((f) => ({ ...f, start_at: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">End (required)</label><input type="datetime-local" value={scheduleCreateForm.end_at} onChange={(e) => setScheduleCreateForm((f) => ({ ...f, end_at: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Timezone</label><input value={scheduleCreateForm.timezone} onChange={(e) => setScheduleCreateForm((f) => ({ ...f, timezone: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" placeholder="IANA, e.g. America/New_York" /></div>
                            <button type="button" disabled={scheduleCreateSaving || !scheduleCreateForm.start_at || !scheduleCreateForm.end_at || !drawer.defaultSchedulePrefill?.job_id} onClick={async () => { setScheduleCreateSaving(true); setSaveError(null); try { const prefill = drawer.defaultSchedulePrefill!; const start = new Date(scheduleCreateForm.start_at); const end = new Date(scheduleCreateForm.end_at); if (end <= start) { setSaveError("End must be after start"); return; } const body: Record<string, unknown> = { job_id: prefill.job_id, start_at: start.toISOString(), end_at: end.toISOString(), timezone: scheduleCreateForm.timezone || null, location_id: prefill.location_id || null }; if (prefill.status_key) body.status_key = prefill.status_key; else if (prefill.schedule_status_id) body.schedule_status_id = prefill.schedule_status_id; const res = await fetch("/api/admin/schedules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const json = await res.json().catch(() => ({})); if (!res.ok) throw new Error((json.error as string) || "Create failed"); const newId = (json as { id?: string }).id; if (newId) { openDrawer({ type: "schedules", id: newId }); router.refresh(); } } catch (e) { setSaveError((e as Error).message); } finally { setScheduleCreateSaving(false); } }} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50">{scheduleCreateSaving ? "Creating…" : "Create Schedule"}</button>
                        </div>
                    )}
                    {drawerTab === "related" && drawer.type === "opportunities" && drawer.id && drawer.id !== "new" && (
                        <div className="space-y-0 pt-5" data-entity-drawer-related>
                            {opportunityRelatedLoading ? (
                                <div className="flex min-h-[12rem] flex-col gap-3 py-2" aria-busy="true">
                                    <DrawerQuietSkeletonBar className="h-5 w-40" />
                                    <DrawerQuietSkeletonBar className="h-12 rounded-lg opacity-95" />
                                    <DrawerQuietSkeletonBar className="h-12 rounded-lg opacity-90" />
                                    <DrawerQuietSkeletonBar className="h-10 w-52 opacity-95" />
                                </div>
                            ) : (() => {
                                const d = opportunityRelatedData;
                                const opp = data as { customer_id?: string | null; _customer_name?: string | null; primary_person_id?: string | null; primary_contact_id?: string | null; location_id?: string | null; _location_id?: string | null; _location_name?: string | null; _primary_person_name?: string | null; _primary_contact_name?: string | null; _contact_name?: string | null } | null | undefined;
                                const personItem = opp?.primary_person_id ? [{ id: opp.primary_person_id, entityType: "persons" as const, label: (opp._primary_person_name as string)?.trim() || "Person", meta: undefined }] : [];
                                const customerItem = opp?.customer_id ? [{ id: opp.customer_id, entityType: "customers" as const, label: (opp._customer_name as string)?.trim() || customerSingular, meta: undefined }] : [];
                                const contactItem = opp?.primary_contact_id ? [{ id: opp.primary_contact_id, entityType: "contacts" as const, label: (opp._primary_contact_name ?? opp._contact_name as string)?.trim() || contactSingular, meta: undefined }] : [];
                                const locationId = (opp?.location_id ?? opp?._location_id) as string | null | undefined;
                                const locationItem = locationId ? [{ id: locationId, entityType: "locations" as const, label: (opp?._location_name as string)?.trim() || "Location", meta: undefined }] : [];
                                const jobItems = (d?.jobs ?? []).map((j) => ({ id: j.id, entityType: "jobs" as const, label: (j.title as string) || "Job", meta: [j.scheduled_at ? displayDateTime(j.scheduled_at as string) : null, j.created_at ? displayDate(j.created_at as string) : null].filter(Boolean).join(" · ") || undefined }));
                                const quoteItems = (d?.quotes ?? []).map((q) => ({ id: q.id, label: "Quote", meta: q.created_at ? displayDate(q.created_at) : undefined }));
                                const discountItems = (d?.discount_redemptions ?? []).map((r) => ({ id: r.id, label: "Redemption", meta: r.created_at ? displayDate(r.created_at as string) : undefined }));
                                type Sec = { key: string; title: string; defaultExpanded: boolean; items: { id: string; entityType?: AdminDrawerEntityType; label: string; meta?: string }[]; addAction?: { label: string; onClick: () => void } };
                                const sections: Sec[] = [
                                    { key: "person", title: "Person", defaultExpanded: true, items: personItem },
                                    { key: "location", title: "Location", defaultExpanded: true, items: locationItem },
                                    { key: "customer", title: customerSingular, defaultExpanded: true, items: customerItem },
                                    { key: "contact", title: "Contact (compatibility)", defaultExpanded: false, items: contactItem },
                                    { key: "jobs", title: "Jobs", defaultExpanded: true, items: jobItems, addAction: { label: "Add Job", onClick: () => openDrawer({ type: "jobs", id: "new", defaultJobPrefill: { opportunity_id: drawer.id ?? undefined, customer_id: opp?.customer_id ?? undefined, primary_contact_id: opp?.primary_contact_id ?? undefined } }) } },
                                    { key: "quotes", title: "Quotes", defaultExpanded: false, items: quoteItems },
                                    { key: "discount_redemptions", title: "Discounts / Promotions", defaultExpanded: false, items: discountItems },
                                ];
                                const visible = sections.filter((s) => s.items.length > 0 || s.addAction);
                                if (visible.length === 0) return <p className="text-sm text-alloy-midnight/60">No related records.</p>;
                                return (
                                    <>
                                        {visible.map((sec) => (
                                            <EntityDrawerSection
                                                key={sec.key}
                                                config={{ key: sec.key, title: sec.title, defaultExpanded: sec.defaultExpanded, collapsible: true, gridCols: 1, fields: [] }}
                                                defaultExpanded={sec.defaultExpanded}
                                            >
                                                {sec.items.length > 0 ? (
                                                    <div className="flex flex-col gap-2">
                                                        {sec.addAction && (
                                                            <div className="flex justify-end">
                                                                <button type="button" onClick={sec.addAction.onClick} className="px-2 py-1 text-xs border border-alloy-stone/50 rounded hover:bg-alloy-stone/20 text-alloy-midnight">{sec.addAction.label}</button>
                                                            </div>
                                                        )}
                                                        <ul className="space-y-0 list-none p-0 m-0">
                                                            {sec.items.map((item) => (
                                                                <li key={item.id}>
                                                                    {(item as { entityType?: AdminDrawerEntityType }).entityType ? (
                                                                        <button type="button" onClick={() => openDrawer({ type: (item as { entityType: AdminDrawerEntityType }).entityType!, id: item.id })} className="w-full text-left rounded-lg px-3 py-2 hover:bg-alloy-stone/30 transition-colors border-0 bg-transparent">
                                                                            <div className="font-medium text-alloy-forge/90 text-sm">{item.label}</div>
                                                                            {item.meta && <div className="text-xs text-alloy-muted mt-0.5">{item.meta}</div>}
                                                                        </button>
                                                                    ) : (
                                                                        <div className="rounded-lg px-3 py-2 text-sm text-alloy-forge/90">
                                                                            <div className="font-medium">{item.label}</div>
                                                                            {item.meta && <div className="text-xs text-alloy-muted mt-0.5">{item.meta}</div>}
                                                                        </div>
                                                                    )}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                ) : sec.addAction ? (
                                                    <div className="py-3 flex flex-col gap-2">
                                                        <p className="text-sm text-alloy-midnight/60">No jobs yet.</p>
                                                        <button type="button" onClick={sec.addAction.onClick} className="self-start px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30">{sec.addAction.label}</button>
                                                    </div>
                                                ) : (
                                                    <ul className="space-y-0 list-none p-0 m-0">
                                                        {sec.items.map((item) => (
                                                            <li key={item.id}>
                                                                {(item as { entityType?: AdminDrawerEntityType }).entityType ? (
                                                                    <button type="button" onClick={() => openDrawer({ type: (item as { entityType: AdminDrawerEntityType }).entityType!, id: item.id })} className="w-full text-left rounded-lg px-3 py-2 hover:bg-alloy-stone/30 transition-colors border-0 bg-transparent">
                                                                        <div className="font-medium text-alloy-forge/90 text-sm">{item.label}</div>
                                                                        {item.meta && <div className="text-xs text-alloy-muted mt-0.5">{item.meta}</div>}
                                                                    </button>
                                                                ) : (
                                                                    <div className="rounded-lg px-3 py-2 text-sm text-alloy-forge/90">
                                                                        <div className="font-medium">{item.label}</div>
                                                                        {item.meta && <div className="text-xs text-alloy-muted mt-0.5">{item.meta}</div>}
                                                                    </div>
                                                                )}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </EntityDrawerSection>
                                        ))}
                                    </>
                                );
                            })()}
                        </div>
                    )}
                    {drawerTab === "related" && drawer.type === "schedules" && data && (
                        <div className="pt-2 space-y-3 mb-4">
                            {(data.job_id as string) && (
                                <DrawerLinkWithName label={jobSingular} id={data?.job_id != null ? String(data.job_id) : ""} type="jobs" displayName={getJobTitleFromData(data?._job)} />
                            )}
                            {(data._customer as { id?: string; name?: string }) && (
                                <DrawerLinkWithName label="Customer" id={(data._customer as { id: string }).id} type="customers" displayName={(data._customer as { name?: string }).name ?? null} />
                            )}
                            {(data._primary_person_id as string) && (
                                <DrawerLinkWithName label="Person" id={String(data._primary_person_id)} type="persons" displayName={(data._primary_person_name as string)?.trim() || null} />
                            )}
                            <div className="py-1.5">
                                <strong className="text-[#45506c] text-sm">Assigned {vendorSingular}:</strong>{" "}
                                {(data._vendor as { id?: string; name?: string }) ? (
                                    <button type="button" onClick={() => openDrawer({ type: "vendors", id: (data._vendor as { id: string }).id })} className="text-alloy-blue hover:underline text-sm">{(data._vendor as { name?: string }).name ?? "Vendor"}</button>
                                ) : (data._job_assigned_vendor as { id?: string; name?: string }) ? (
                                    <button type="button" onClick={() => openDrawer({ type: "vendors", id: (data._job_assigned_vendor as { id: string }).id })} className="text-alloy-blue hover:underline text-sm">{(data._job_assigned_vendor as { name?: string }).name ?? "Vendor"}</button>
                                ) : (
                                    <span className="text-[#31394d]">Unassigned</span>
                                )}
                            </div>
                            <div className="py-1.5 flex items-center gap-2 flex-wrap">
                                <strong className="text-[#45506c] text-sm">Location:</strong>{" "}
                                {((data._location_id as string) ?? (data.location_id as string)) ? (
                                    (() => {
                                        const locId = (data._location_id as string) ?? (data.location_id as string);
                                        const loc = data._location as { address1?: string | null; city?: string | null; postal_code?: string | null } | null | undefined;
                                        let name: string | null = (data._location_label as string) ?? null;
                                        if (!name && loc) {
                                            const parts = [loc.address1, loc.city, loc.postal_code].filter(Boolean);
                                            name = parts.length ? parts.join(", ") : null;
                                        }
                                        const display = name ?? `${locId.slice(0, 8)}…`;
                                        return (
                                            <>
                                                <button type="button" onClick={() => openDrawer({ type: "locations", id: locId })} className="text-alloy-blue hover:underline">
                                                    {display}
                                                </button>
                                                {canMutate && <button type="button" onClick={(e) => { e.stopPropagation(); openDrawer({ type: "locations", id: locId }); }} className="text-xs px-2 py-0.5 border border-alloy-stone/50 rounded hover:bg-alloy-stone/20 text-alloy-midnight/80">Edit</button>}
                                                {canMutate && <button type="button" onClick={() => { setSetLocationEntity("schedule"); setSetLocationSelectedId(locId); setSetLocationError(null); fetch("/api/admin/locations").then((r) => r.ok ? r.json() : { locations: [] }).then((j: { locations?: { id: string; label: string | null; address1: string | null; city: string | null; state: string | null; postal_code: string | null }[] }) => setSetLocationList(j.locations ?? [])).catch(() => setSetLocationList([])); setSetLocationOpen(true); }} className="text-xs px-2 py-0.5 border border-alloy-stone/50 rounded hover:bg-alloy-stone/20 text-alloy-midnight/80">Change</button>}
                                            </>
                                        );
                                    })()
                                ) : (
                                    <>
                                        <span className="text-[#31394d]">Unassigned</span>
                                        {canMutate && <button type="button" onClick={() => { setSetLocationEntity("schedule"); setSetLocationSelectedId(null); setSetLocationError(null); fetch("/api/admin/locations").then((r) => r.ok ? r.json() : { locations: [] }).then((j: { locations?: { id: string; label: string | null; address1: string | null; city: string | null; state: string | null; postal_code: string | null }[] }) => setSetLocationList(j.locations ?? [])).catch(() => setSetLocationList([])); setSetLocationOpen(true); }} className="text-xs px-2 py-0.5 border border-alloy-stone/50 rounded hover:bg-alloy-stone/20 text-alloy-blue">Set location</button>}
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                    {drawerTab === "related" && drawer.type === "locations" && data && (
                        <div className="pt-2 space-y-3 mb-4">
                            <DrawerLinkWithName label="Customer" id={data?.customer_id != null ? String(data.customer_id) : null} type="customers" displayName={String(data?._customer_name ?? "")} />
                        </div>
                    )}
                    {drawerTab === "related" && drawer.type === "persons" && drawer.id && drawer.id !== "new" && (
                        <div className="pt-2 mb-4">
                            {personRelatedLoading ? (
                                <div className="flex min-h-[10rem] flex-col gap-3 py-1" aria-busy="true">
                                    <DrawerQuietSkeletonBar className="h-4 w-32" />
                                    <DrawerQuietSkeletonBar className="h-24 rounded-lg opacity-95" />
                                    <DrawerQuietSkeletonBar className="h-24 rounded-lg opacity-90" />
                                </div>
                            ) : personRelatedData ? (
                                <div className="space-y-6">
                                    {((personRelatedData.customer_persons?.length) ?? 0) > 0 && (
                            <section>
                                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Customers</h3>
                                            <ul className="space-y-1.5 text-sm">
                                                {personRelatedData.customer_persons.map((cp: { id: string; customer_id: string; _customer_name?: string | null; role_type?: string | null; _role_label?: string | null }) => (
                                                    <li key={cp.id}>
                                                        <button type="button" onClick={() => openDrawer({ type: "customers", id: cp.customer_id })} className="text-alloy-blue hover:underline">
                                                            {cp._customer_name ?? cp.customer_id.slice(0, 8) + "…"}
                                                            {(cp._role_label ?? cp.role_type) ? ` · ${cp._role_label ?? cp.role_type}` : ""}
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        </section>
                                    )}
                                    {((personRelatedData.person_relationships?.length) ?? 0) > 0 && (
                                        <section>
                                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Relationships</h3>
                                            <ul className="space-y-1.5 text-sm">
                                                {personRelatedData.person_relationships.map((pr: { id: string; _other_person_id: string; _other_person_name?: string | null; relationship_type?: string | null; _relationship_type_label?: string | null }) => (
                                                    <li key={pr.id}>
                                                        <button type="button" onClick={() => openDrawer({ type: "persons", id: pr._other_person_id })} className="text-alloy-blue hover:underline">
                                                            {pr._other_person_name ?? pr._other_person_id.slice(0, 8) + "…"}
                                                            {(pr._relationship_type_label ?? pr.relationship_type) ? ` (${pr._relationship_type_label ?? pr.relationship_type})` : ""}
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                            </section>
                                    )}
                                    {((personRelatedData.compatibility_contacts?.length) ?? 0) > 0 && (
                                        <section>
                                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Contact records (legacy)</h3>
                                            <p className="text-xs text-alloy-midnight/60 mb-1">Compatibility layer; prefer People for canonical view.</p>
                                            <ul className="space-y-1 text-sm">
                                                {(personRelatedData.compatibility_contacts as { id: string; first_name?: string | null; last_name?: string | null }[]).map((c) => (
                                                    <li key={c.id}>
                                                        <button type="button" onClick={() => openDrawer({ type: "contacts", id: c.id })} className="text-alloy-blue hover:underline">
                                                            {[c.first_name, c.last_name].filter(Boolean).join(" ") || c.id.slice(0, 8) + "…"}
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        </section>
                                    )}
                                    {((personRelatedData.compatibility_members?.length) ?? 0) > 0 && (
                                        <section>
                                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Member records (legacy)</h3>
                                            <p className="text-xs text-alloy-midnight/60 mb-1">Compatibility layer; prefer People for canonical view.</p>
                                            <ul className="space-y-1 text-sm">
                                                {(personRelatedData.compatibility_members as { id: string; display_name?: string | null }[]).map((m) => (
                                                    <li key={m.id}>
                                                        <button type="button" onClick={() => openDrawer({ type: "customer_members", id: m.id })} className="text-alloy-blue hover:underline">
                                                            {m.display_name ?? m.id.slice(0, 8) + "…"}
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        </section>
                                    )}
                                    {((personRelatedData.linked_locations?.length) ?? 0) > 0 && (
                                        <section>
                                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Locations</h3>
                                            <p className="text-xs text-alloy-midnight/60 mb-1">Linked via person_locations.</p>
                                            <ul className="space-y-1.5 text-sm">
                                                {(personRelatedData.linked_locations ?? []).map((row: { location_id: string; _location_label?: string | null; is_primary?: boolean; relationship_type?: string | null }) => (
                                                    <li key={row.location_id}>
                                                        <button type="button" onClick={() => openDrawer({ type: "locations", id: row.location_id })} className="text-alloy-blue hover:underline">
                                                            {row._location_label?.trim() || row.location_id.slice(0, 8) + "…"}
                                                        </button>
                                                        {row.is_primary ? <span className="text-alloy-muted ml-1">· Primary</span> : null}
                                                        {row.relationship_type ? <span className="text-alloy-muted ml-1">· {row.relationship_type}</span> : null}
                                                    </li>
                                                ))}
                                            </ul>
                                        </section>
                                    )}
                                    {((personRelatedData.opportunities?.length) ?? 0) > 0 && (
                                        <section>
                                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Opportunities</h3>
                                            <ul className="space-y-1.5 text-sm">
                                                {(personRelatedData.opportunities ?? []).map((o: { id: string; name?: string | null; status_key?: string | null; quote_total?: number | null; job_date?: string | null }) => (
                                                    <li key={o.id}>
                                                        <button type="button" onClick={() => openDrawer({ type: "opportunities", id: o.id })} className="text-alloy-blue hover:underline">
                                                            {o.name?.trim() || o.id.slice(0, 8) + "…"}
                                                        </button>
                                                        <span className="text-alloy-muted ml-1">
                                                            {o.status_key ? `· ${o.status_key}` : ""}
                                                            {o.quote_total != null ? ` · ${formatMoneyFromDollars(Number(o.quote_total))}` : ""}
                                                            {o.job_date ? ` · ${displayDate(String(o.job_date))}` : ""}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </section>
                                    )}
                                    {(!personRelatedData.customer_persons?.length &&
                                        !personRelatedData.person_relationships?.length &&
                                        !personRelatedData.compatibility_contacts?.length &&
                                        !personRelatedData.compatibility_members?.length &&
                                        !(personRelatedData.linked_locations?.length ?? 0) &&
                                        !(personRelatedData.opportunities?.length ?? 0)) && (
                                        <p className="text-sm text-alloy-midnight/60">No related records.</p>
                                    )}
                                </div>
                            ) : (
                                <p className="text-sm text-alloy-midnight/60">No related data.</p>
                            )}
                        </div>
                    )}
                    {drawerTab === "related" && drawer.type === "customer_members" && (
                        <div className="pt-2 mb-4">
                            {memberRelatedDataLoading ? (
                                <div className="flex min-h-[11rem] flex-col gap-3 py-1" aria-busy="true">
                                    <DrawerQuietSkeletonBar className="h-4 w-36" />
                                    <DrawerQuietSkeletonBar className="h-28 rounded-lg opacity-95" />
                                </div>
                            ) : memberRelatedData ? (() => {
                                const { linkedContacts, customer, documents } = memberRelatedData;
                                const hasContacts = linkedContacts.length > 0;
                                const hasCustomer = !!customer;
                                const hasDocuments = documents.length > 0;
                                const customerId = data && (data.customer_id as string) ? String(data.customer_id) : null;
                                const showLinkedSection = hasContacts || (canMutate && customerId && drawer.id && drawer.id !== "new");
                                if (!showLinkedSection && !hasCustomer && !hasDocuments) {
                                    return <p className="text-sm text-alloy-midnight/60">No related records.</p>;
                                }
                                return (
                                    <div className="space-y-0">
                                        {showLinkedSection && (
                                            <EntityDrawerSection config={{ key: "linked_contacts", title: "Linked Contacts", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [] }}>
                                                <div className="flex flex-col gap-2">
                                                    {canMutate && customerId && drawer.id && drawer.id !== "new" && (
                                                        <div className="flex flex-wrap gap-2 justify-end">
                                                            <button type="button" onClick={() => openDrawer({ type: "contacts", id: "new", defaultCustomerId: customerId })} className="px-2 py-1 text-xs border border-alloy-stone/50 rounded hover:bg-alloy-stone/20 text-alloy-midnight">Add contact</button>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setMemberLinkModalOpen(true);
                                                                    setMemberLinkRoleKey(memberRelatedRoles[0]?.role_key ?? "");
                                                                    setMemberLinkContactId("");
                                                                    setMemberLinkError(null);
                                                                    fetch(`/api/admin/related/customer/${customerId}`)
                                                                        .then((r) => (r.ok ? r.json() : { contacts: [] }))
                                                                        .then((json: { contacts?: { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null }[] }) => {
                                                                            const opts = (json.contacts ?? []).map((c) => ({
                                                                                id: c.id,
                                                                                first_name: c.first_name ?? null,
                                                                                last_name: c.last_name ?? null,
                                                                                email: c.email ?? null,
                                                                                phone: c.phone ?? null,
                                                                            }));
                                                                            setMemberLinkContactOptions(opts);
                                                                        })
                                                                        .catch(() => setMemberLinkContactOptions([]));
                                                                }}
                                                                className="px-2 py-1 text-xs border border-alloy-stone/50 rounded hover:bg-alloy-stone/20 text-alloy-midnight"
                                                            >
                                                                Link contact
                                                            </button>
                                                        </div>
                                                    )}
                                                    {hasContacts ? (
                                                    <ul className="space-y-2">
                                                        {linkedContacts.map((c) => (
                                                            <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                                                                <button type="button" onClick={() => openDrawer({ type: "contacts", id: c.contact_id })} className="text-alloy-blue hover:underline text-left font-medium">
                                                                    {c.contact_name || "Contact"}
                                                                </button>
                                                                {c.role_label && <span className="text-alloy-muted">{c.role_label}</span>}
                                                                {(c.email || c.phone) && (
                                                                    <span className="text-alloy-midnight/70">
                                                                        {[c.email, c.phone ? formatPhoneUS(c.phone) : null].filter(Boolean).join(" · ")}
                                                                    </span>
                                                                )}
                                                                {!c.is_active && <span className="text-xs text-alloy-muted">(inactive)</span>}
                                                                {canMutate && (
                                                                    <button
                                                                        type="button"
                                                                        disabled={memberUnlinkingId === c.id}
                                                                        onClick={async () => {
                                                                            setMemberUnlinkingId(c.id);
                                                                            try {
                                                                                const res = await fetch(`/api/admin/customer-member-contacts/${c.id}`, { method: "DELETE" });
                                                                                if (res.ok) { refetchMemberLinks(); refetchMemberRelated(); }
                                                                            } finally { setMemberUnlinkingId(null); }
                                                                        }}
                                                                        className="text-xs px-1.5 py-0.5 border border-red-200 text-red-700 rounded hover:bg-red-50 disabled:opacity-50"
                                                                    >
                                                                        {memberUnlinkingId === c.id ? "…" : "Unlink"}
                                                                    </button>
                                                                )}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                    ) : (
                                                        <p className="text-sm text-alloy-midnight/60">No linked contacts yet. Add or link a contact above.</p>
                                                    )}
                                                </div>
                                            </EntityDrawerSection>
                                        )}
                                        {hasCustomer && (
                                            <EntityDrawerSection config={{ key: "customer", title: "Customer", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [] }}>
                                                <div>
                                                    <button type="button" onClick={() => openDrawer({ type: "customers", id: customer.id })} className="text-alloy-blue hover:underline text-sm">
                                                        {customer.name || "Customer"}
                                                    </button>
                                                </div>
                                            </EntityDrawerSection>
                                        )}
                                        {hasDocuments && (
                                            <EntityDrawerSection config={{ key: "documents", title: "Documents", defaultExpanded: false, collapsible: true, gridCols: 1, fields: [] }}>
                                                <ul className="space-y-1.5 text-sm">
                                                    {documents.map((doc) => (
                                                        <li key={doc.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                                            <span className="font-medium">{(doc as { name?: string | null }).name || (doc as { original_filename?: string | null }).original_filename || "Document"}</span>
                                                            {(doc as { document_type?: string | null }).document_type && <span className="text-alloy-muted">{(doc as { document_type: string }).document_type}</span>}
                                                            {(doc as { status?: string | null }).status && <span className="text-alloy-muted">{(doc as { status: string }).status}</span>}
                                                            {((doc as { uploaded_at?: string | null }).uploaded_at || (doc as { created_at?: string | null }).created_at) && (
                                                                <span className="text-alloy-muted text-xs">{displayDateTime((doc as { uploaded_at?: string | null }).uploaded_at || (doc as { created_at?: string }).created_at || "")}</span>
                                                            )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </EntityDrawerSection>
                                        )}
                                    </div>
                                );
                            })() : (
                                <p className="text-sm text-alloy-midnight/60">No related records.</p>
                            )}
                        </div>
                    )}
                    {/* Legacy customer_members related block removed - now using memberRelatedData + EntityDrawerSection above */}
                    {false && (drawer.type as string) === "customer_members_legacy_remove" && (
                        <div className="pt-2 space-y-4 mb-4">
                            <section>
                                <div className="flex items-center justify-between gap-2 mb-2">
                                    <h4 className="text-xs font-semibold tracking-wider text-[#59678b]">Linked contacts (Guardians)</h4>
                                    {canMutate && data && (data?.customer_id as string) && drawer.id && drawer.id !== "new" && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setMemberLinkModalOpen(true);
                                                setMemberLinkRoleKey(memberRelatedRoles[0]?.role_key ?? "");
                                                setMemberLinkContactId("");
                                                setMemberLinkError(null);
                                                const cid = data!.customer_id as string;
                                                fetch(`/api/admin/related/customer/${cid}`)
                                                    .then((r) => (r.ok ? r.json() : { contacts: [] }))
                                                    .then((json: { contacts?: { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null }[] }) => {
                                                        const opts = (json.contacts ?? []).map((c) => ({
                                                            id: c.id,
                                                            first_name: c.first_name ?? null,
                                                            last_name: c.last_name ?? null,
                                                            email: c.email ?? null,
                                                            phone: c.phone ?? null,
                                                        }));
                                                        setMemberLinkContactOptions(opts);
                                                    })
                                                    .catch(() => setMemberLinkContactOptions([]));
                                            }}
                                            className="px-2 py-1 text-xs border border-alloy-stone/50 rounded hover:bg-alloy-stone/20 text-alloy-midnight"
                                        >
                                            Link contact
                                        </button>
                                    )}
                                </div>
                                {!data ? (
                                    <p className="text-sm text-[#59678b]">Loading…</p>
                                ) : !(data?.customer_id as string) ? (
                                    <p className="text-sm text-[#59678b]">No customer linked — link a family/customer first.</p>
                                ) : memberRelatedLinksLoading ? (
                                    <p className="text-sm text-[#59678b]">Loading…</p>
                                ) : memberRelatedLinks.length === 0 ? (
                                    <p className="text-sm text-[#59678b]">No linked contacts. Use “Link contact” to add guardians.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {memberRelatedRoles.map((role) => {
                                            const linksForRole = memberRelatedLinks.filter((l) => l.role_key === role.role_key && l.is_active);
                                            if (linksForRole.length === 0) return null;
                                            return (
                                                <div key={role.id}>
                                                    <h5 className="text-xs font-medium text-[#45506c] mb-1.5">{role.role_label}</h5>
                                                    <ul className="space-y-1.5">
                                                        {linksForRole.map((link) => {
                                                            const c = link.contact;
                                                            const name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.phone || c.id.slice(0, 8) + "…" : link.contact_id.slice(0, 8) + "…";
                                                            return (
                                                                <li key={link.id} className="flex items-center gap-2 flex-wrap">
                                                                    <button type="button" onClick={() => c && openDrawer({ type: "contacts", id: c.id })} className="text-alloy-blue hover:underline text-sm text-left">
                                                                        {name}
                                                                    </button>
                                                                    {c && (c.email || c.phone) && (
                                                                        <span className="text-xs text-[#59678b]">
                                                                            {[c.email, c.phone ? formatPhoneUS(c.phone) : null].filter(Boolean).join(" · ")}
                                                                        </span>
                                                                    )}
                                                                    {canMutate && (
                                                                        <button
                                                                            type="button"
                                                                            disabled={memberUnlinkingId === link.id}
                                                                            onClick={async () => {
                                                                                setMemberUnlinkingId(link.id);
                                                                                try {
                                                                                    const res = await fetch(`/api/admin/customer-member-contacts/${link.id}`, { method: "DELETE" });
                                                                                    if (res.ok) refetchMemberLinks();
                                                                                } finally {
                                                                                    setMemberUnlinkingId(null);
                                                                                }
                                                                            }}
                                                                            className="text-xs px-1.5 py-0.5 border border-red-200 text-red-700 rounded hover:bg-red-50 disabled:opacity-50"
                                                                        >
                                                                            {memberUnlinkingId === link.id ? "…" : "Unlink"}
                                                                        </button>
                                                                    )}
                                                                </li>
                                                            );
                                                        })}
                                                    </ul>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>
                        </div>
                    )}
                    {drawerTab === "related" && drawer.type === "contacts" && drawer.id && drawer.id !== "new" && (
                        <div className="pt-2">
                            {contactRelatedLoading ? (
                                <p className="text-sm text-alloy-midnight/60">Loading related…</p>
                            ) : contactRelatedData ? (
                                <div className="space-y-6">
                                    {(contactRelatedData.linkedCustomer || contactRelatedData.linkedVendor) && (
                                        <section>
                                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Linked Records</h3>
                                            <ul className="space-y-1.5 text-sm">
                                                {contactRelatedData.linkedCustomer && (
                                                    <li><button type="button" onClick={() => openDrawer({ type: "customers", id: contactRelatedData!.linkedCustomer!.id })} className="text-alloy-blue hover:underline">{contactRelatedData.linkedCustomer.name ?? contactRelatedData.linkedCustomer.id}</button> (Customer)</li>
                                                )}
                                                {contactRelatedData.linkedVendor && (
                                                    <li><button type="button" onClick={() => openDrawer({ type: "vendors", id: contactRelatedData!.linkedVendor!.id })} className="text-alloy-blue hover:underline">{contactRelatedData.linkedVendor.name ?? contactRelatedData.linkedVendor.id}</button> (Vendor)</li>
                                                )}
                                            </ul>
                                        </section>
                                    )}
                                    {(contactRelatedData.opportunities.length > 0 || contactRelatedData.jobs.length > 0 || contactRelatedData.customer_subscriptions.length > 0 || (contactRelatedData.linkedCustomer && (contactRelatedData.opportunities.length === 0 || contactRelatedData.jobs.length === 0))) && (
                                        <section>
                                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Operational Relationships</h3>
                                            <div className="space-y-3 text-sm">
                                                {(contactRelatedData.opportunities.length > 0 || (contactRelatedData.linkedCustomer && contactRelatedData.opportunities.length === 0)) && (
                                                    <div>
                                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                                            <p className="text-alloy-muted text-xs font-medium">Opportunities (primary contact)</p>
                                                            {contactRelatedData.linkedCustomer && (
                                                                <button type="button" onClick={() => openDrawer({ type: "opportunities", id: "new", defaultCustomerId: contactRelatedData!.linkedCustomer!.id })} className="text-xs px-2 py-0.5 border border-alloy-stone/50 rounded hover:bg-alloy-stone/20 text-alloy-midnight">Add opportunity</button>
                                                            )}
                                                        </div>
                                                        {contactRelatedData.opportunities.length > 0 ? (
                                                        <ul className="space-y-1">
                                                            {contactRelatedData.opportunities.map((o) => (
                                                                <li key={o.id} className="flex flex-col gap-0.5 py-1">
                                                                    <button type="button" onClick={() => openDrawer({ type: "opportunities", id: o.id })} className="text-alloy-blue hover:underline text-left">{o.name ?? "Opportunity"}</button>
                                                                    <span className="text-xs text-alloy-muted">{o.job_date ? displayDate(o.job_date) : ""}{o.status ? ` · ${o.status}` : ""}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                        ) : (
                                                            <p className="text-sm text-alloy-midnight/60">No opportunities yet.</p>
                                                        )}
                                                    </div>
                                                )}
                                                {contactRelatedData.jobs.length > 0 && (
                                                    <div>
                                                        <p className="text-alloy-muted text-xs font-medium mb-1">Jobs (primary contact)</p>
                                                        <ul className="space-y-1">
                                                            {contactRelatedData.jobs.map((j) => (
                                                                <li key={j.id} className="flex flex-col gap-0.5 py-1">
                                                                    <button type="button" onClick={() => openDrawer({ type: "jobs", id: j.id })} className="text-alloy-blue hover:underline text-left">{j.title ?? "Job"}</button>
                                                                    <span className="text-xs text-alloy-muted">{j.scheduled_at ? displayDateTime(j.scheduled_at) : ""}</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                                {contactRelatedData.customer_subscriptions.length > 0 && (
                                                    <div>
                                                        <p className="text-alloy-muted text-xs font-medium mb-1">Customer subscriptions (primary contact)</p>
                                                        <ul className="space-y-2">
                                                            {contactRelatedData.customer_subscriptions.map((s) => (
                                                                <li key={s.id} className="flex flex-col">
                                                                    <button type="button" onClick={() => openDrawer({ type: "subscriptions", id: s.id })} className="text-alloy-blue hover:underline text-left text-sm">
                                                                        {s.status ?? "Subscription"} {s.start_date ? ` · ${displayDate(s.start_date)}` : ""}
                                                                    </button>
                                                                    <span className="text-xs text-alloy-muted">Subscription</span>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                            </div>
                                        </section>
                                    )}
                                    {(contactRelatedData.customer_member_contacts.length > 0 || contactRelatedData.vendor_contacts.length > 0) && (
                                        <section>
                                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Membership / Association</h3>
                                            <div className="space-y-2 text-sm">
                                                {contactRelatedData.customer_member_contacts.length > 0 && (
                                                    <p>Customer member contacts: {contactRelatedData.customer_member_contacts.length}</p>
                                                )}
                                                {contactRelatedData.vendor_contacts.length > 0 && (
                                                    <p>Vendor contacts: {contactRelatedData.vendor_contacts.length}</p>
                                                )}
                                            </div>
                                        </section>
                                    )}
                                    {(contactRelatedData.messages.length > 0 || contactRelatedData.documents.length > 0 || contactRelatedData.discount_redemptions.length > 0) && (
                                        <section>
                                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Communication / Ownership</h3>
                                            <ul className="space-y-2 text-sm">
                                                {contactRelatedData.messages.length > 0 && contactRelatedData.messages.slice(0, 10).map((m) => (
                                                    <li key={m.id} className="flex flex-col gap-0.5 py-1">
                                                        <span className="text-alloy-forge/90">Message</span>
                                                        <span className="text-xs text-alloy-muted">{m.created_at ? displayDateTime(m.created_at) : ""}{m.status ? ` · ${m.status}` : ""}</span>
                                                    </li>
                                                ))}
                                                {contactRelatedData.documents.length > 0 && contactRelatedData.documents.map((doc) => (
                                                    <li key={doc.id} className="flex flex-col gap-0.5 py-1">
                                                        <span className="text-alloy-forge/90">{doc.name ?? "Document"}</span>
                                                        <span className="text-xs text-alloy-muted">{doc.document_type ?? ""}{doc.uploaded_at ? ` · ${displayDateTime(doc.uploaded_at)}` : ""}</span>
                                                    </li>
                                                ))}
                                                {contactRelatedData.discount_redemptions.length > 0 && contactRelatedData.discount_redemptions.slice(0, 5).map((r) => (
                                                    <li key={r.id} className="flex flex-col gap-0.5 py-1">
                                                        <span className="text-alloy-forge/90">Discount redemption</span>
                                                        <span className="text-xs text-alloy-muted">{r.created_at ? displayDateTime(r.created_at) : ""}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </section>
                                    )}
                                    {contactRelatedData.contact_tags.length > 0 && (
                                        <section>
                                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Tags</h3>
                                            <p className="text-sm">Contact tags: {contactRelatedData.contact_tags.length}</p>
                                        </section>
                                    )}
                                    {!contactRelatedData.linkedCustomer && !contactRelatedData.linkedVendor && contactRelatedData.opportunities.length === 0 && contactRelatedData.jobs.length === 0 && contactRelatedData.customer_subscriptions.length === 0 && contactRelatedData.customer_member_contacts.length === 0 && contactRelatedData.vendor_contacts.length === 0 && contactRelatedData.messages.length === 0 && contactRelatedData.documents.length === 0 && contactRelatedData.discount_redemptions.length === 0 && contactRelatedData.contact_tags.length === 0 && (
                                        <p className="text-sm text-alloy-midnight/60">No related records.</p>
                                    )}
                                </div>
                            ) : (
                                <p className="text-sm text-alloy-midnight/60">No related data.</p>
                            )}
                        </div>
                    )}
                    {drawerTab === "related" && drawer.type === "customers" && drawer.id && drawer.id !== "new" && (
                        <div className="space-y-0 pt-5" data-entity-drawer-related>
                            {customerRelatedLoading ? (
                                <p className="text-sm text-alloy-midnight/60">Loading related records…</p>
                            ) : customerRelatedData ? (() => {
                                const d = customerRelatedData;
                                const primaryId = d._primary_contact_id ?? null;
                                const customerId = drawer.id;
                                type Sec = { key: string; title: string; defaultExpanded: boolean; items: { id: string; entityType?: AdminDrawerEntityType; label: string; meta?: string }[]; addAction?: { label: string; onClick: () => void } };
                                const peopleItems = (d.people ?? []).map((p: { person_id: string; _person_name?: string | null; role_label?: string | null; _person_email?: string | null; _person_phone?: string | null }) => ({
                                    id: p.person_id,
                                    entityType: "persons" as const,
                                    label: (p._person_name as string) || "Person",
                                    meta: [p.role_label, p._person_email, p._person_phone ? formatPhoneUS(p._person_phone) : null].filter(Boolean).join(" · ") || undefined,
                                }));
                                const sections: Sec[] = [
                                    { key: "people", title: "People", defaultExpanded: true, items: peopleItems },
                                    { key: "opportunities", title: "Opportunities", defaultExpanded: false, items: (d.opportunities ?? []).map((o) => ({ id: o.id, entityType: "opportunities" as const, label: (o.name as string) || "Opportunity", meta: [o.status, o.quote_total != null ? formatMoneyFromDollars(Number(o.quote_total)) : null].filter(Boolean).join(" · ") || undefined })), addAction: { label: "New Opportunity", onClick: () => openDrawer({ type: "opportunities", id: "new", defaultCustomerId: customerId }) } },
                                    { key: "jobs", title: jobPlural, defaultExpanded: false, items: (d.jobs ?? []).map((j) => ({ id: j.id, entityType: "jobs" as const, label: (j.title as string) || "Job", meta: [j.scheduled_at ? displayDateTime(j.scheduled_at as string) : null].filter(Boolean).join(" · ") || undefined })) },
                                    { key: "schedules", title: scheduleSingular + "s", defaultExpanded: false, items: (d.schedules ?? []).map((s) => ({ id: s.id, entityType: "schedules" as const, label: s.start_at ? displayDateTime(s.start_at) : "Schedule", meta: s.end_at ? `to ${displayDateTime(s.end_at)}` : undefined })) },
                                    { key: "locations", title: "Locations", defaultExpanded: false, items: (d.locations ?? []).map((l) => ({ id: l.id, entityType: "locations" as const, label: (l.label as string) || [l.address1, l.city, l.state].filter(Boolean).join(", ") || "Location", meta: [l.location_type, l.city, l.state].filter(Boolean).join(" · ") || undefined })), addAction: { label: "Add Location", onClick: () => openDrawer({ type: "locations", id: "new", defaultCustomerId: customerId }) } },
                                    { key: "subscriptions", title: "Subscriptions", defaultExpanded: false, items: (d.customer_subscriptions ?? []).map((s) => ({ id: s.id, entityType: "subscriptions" as const, label: (s.status as string) || "Subscription", meta: s.start_date ? displayDate(s.start_date as string) : undefined })) },
                                    { key: "discounts", title: "Discounts / Promotions", defaultExpanded: false, items: (d.discount_redemptions ?? []).map((r) => ({ id: r.id, entityType: "discount_redemptions" as const, label: "Redemption", meta: r.created_at ? displayDate(r.created_at as string) : undefined })) },
                                    { key: "messages", title: "Messages", defaultExpanded: false, items: (d.messages ?? []).map((m) => ({ id: m.id, label: (m.body as string)?.slice(0, 50) || (m.to_phone ? formatPhoneUS(m.to_phone as string) : "") || "Message", meta: m.created_at ? displayDateTime(m.created_at as string) : undefined })) },
                                    { key: "tags", title: "Tags", defaultExpanded: false, items: (d.customer_tags ?? []).map((t) => ({ id: t.id, label: (t.name as string) || "Tag" })) },
                                ];
                                const withAdd = sections.filter((s) => s.items.length > 0 || s.addAction);
                                if (withAdd.length === 0) return <p className="text-sm text-alloy-midnight/60">No related records.</p>;
                                return (
                                    <>
                                        {withAdd.map((sec) => (
                                            <EntityDrawerSection
                                                key={sec.key}
                                                config={{
                                                    key: sec.key,
                                                    title: sec.title,
                                                    defaultExpanded: sec.defaultExpanded,
                                                    collapsible: true,
                                                    gridCols: 1,
                                                    fields: [],
                                                }}
                                                defaultExpanded={sec.defaultExpanded}
                                            >
                                                {sec.items.length > 0 ? (
                                                    <div className="flex flex-col gap-2">
                                                        {sec.addAction && (
                                                            <div className="flex justify-end">
                                                                <button type="button" onClick={sec.addAction.onClick} className="px-2 py-1 text-xs border border-alloy-stone/50 rounded hover:bg-alloy-stone/20 text-alloy-midnight">{sec.addAction.label}</button>
                                                            </div>
                                                        )}
                                                        <ul className="space-y-0 list-none p-0 m-0">
                                                            {sec.items.map((item) => (
                                                                <li key={item.id}>
                                                                    {item.entityType ? (
                                                                        <button type="button" onClick={() => openDrawer({ type: item.entityType!, id: item.id })} className="w-full text-left rounded-lg px-3 py-2 hover:bg-alloy-stone/30 transition-colors border-0 bg-transparent">
                                                                            <div className="font-medium text-alloy-forge/90 text-sm">{item.label}</div>
                                                                            {item.meta && <div className="text-xs text-alloy-muted mt-0.5">{item.meta}</div>}
                                                                            {sec.key === "contacts" && primaryId === item.id && <span className="text-xs text-alloy-blue mt-0.5">Primary</span>}
                                                                        </button>
                                                                    ) : (
                                                                        <div className="rounded-lg px-3 py-2 text-sm text-alloy-forge/90">
                                                                            <div className="font-medium">{item.label}</div>
                                                                            {item.meta && <div className="text-xs text-alloy-muted mt-0.5">{item.meta}</div>}
                                                                        </div>
                                                                    )}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                ) : sec.addAction ? (
                                                    <div className="py-3 flex flex-col gap-2">
                                                        <p className="text-sm text-alloy-midnight/60">No {sec.key === "opportunities" ? "opportunities" : sec.key === "locations" ? "locations" : sec.key} yet.</p>
                                                        <button type="button" onClick={sec.addAction.onClick} className="self-start px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30">{sec.addAction.label}</button>
                                                    </div>
                                                ) : (
                                                    <ul className="space-y-0 list-none p-0 m-0" />
                                                )}
                                            </EntityDrawerSection>
                                        ))}
                                    </>
                                );
                            })() : <p className="text-sm text-alloy-midnight/60">No related data.</p>}
                        </div>
                    )}
                    {drawerTab === "related" && drawer.type === "vendors" && drawer.id && drawer.id !== "new" && (
                        <div className="space-y-0 pt-5" data-entity-drawer-related>
                            {vendorRelatedLoading ? (
                                <p className="text-sm text-alloy-midnight/60">Loading related records…</p>
                            ) : vendorRelatedData ? (() => {
                                const d = vendorRelatedData;
                                type Sec = { key: string; title: string; defaultExpanded: boolean; items: { id: string; entityType?: AdminDrawerEntityType; label: string; meta?: string; isPrimary?: boolean }[] };
                                const peopleItems = (d.people ?? []).map((p) => ({
                                    id: p.id,
                                    entityType: "persons" as const,
                                    label: [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || (p.email as string) || "Person",
                                    meta: [
                                        p.email,
                                        p.phone ? formatPhoneUS(p.phone as string) : null,
                                    ].filter(Boolean).join(" · ") || undefined,
                                    isPrimary: !!(p as { _is_primary?: boolean })._is_primary,
                                }));
                                const jobItems = (d.jobs ?? []).map((j) => ({
                                    id: j.id,
                                    entityType: "jobs" as const,
                                    label: (j.title as string) || "Job",
                                    meta: [
                                        j.scheduled_at ? displayDateTime(j.scheduled_at as string) : null,
                                        (j.display_total_cents != null ? j.display_total_cents : j.gross_price_cents) != null
                                            ? formatMoneyFromCents(Number(j.display_total_cents ?? j.gross_price_cents))
                                            : null,
                                        j.created_at ? displayDate(j.created_at as string) : null,
                                    ]
                                        .filter(Boolean)
                                        .join(" · ") || undefined,
                                }));
                                const schedItems = (d.schedules ?? []).map((s) => ({
                                    id: s.id,
                                    entityType: "schedules" as const,
                                    label: s.start_at ? displayDateTime(String(s.start_at)) : "Visit",
                                    meta: [s.end_at ? displayDateTime(String(s.end_at)) : null, s.status_key ? String(s.status_key) : null, s.price_cents != null ? formatMoneyFromCents(s.price_cents) : null]
                                        .filter(Boolean)
                                        .join(" · ") || undefined,
                                }));
                                const fin = d.financials_summary;
                                const finItems =
                                    fin &&
                                        (fin.job_count > 0 ||
                                            fin.total_gross_cents > 0 ||
                                            (fin.total_display_cents ?? 0) > 0)
                                        ? [
                                              {
                                                  id: "financials-summary",
                                                  label: `Assigned jobs (in scope): ${fin.job_count}`,
                                                  meta: `Total (net, summed): ${formatMoneyFromCents(fin.total_display_cents ?? fin.total_gross_cents)}`,
                                              },
                                          ]
                                        : [];
                                const sections: Sec[] = [
                                    { key: "people", title: "People", defaultExpanded: true, items: peopleItems },
                                    { key: "jobs", title: "Jobs", defaultExpanded: true, items: jobItems },
                                    { key: "schedules", title: "Schedules", defaultExpanded: false, items: schedItems },
                                    { key: "financials", title: "Financials (summary)", defaultExpanded: false, items: finItems },
                                    { key: "assignments", title: "Assignments", defaultExpanded: false, items: (d.assignments ?? []).map((a) => ({ id: a.id, label: "Assignment", meta: a.created_at ? displayDateTime(a.created_at as string) : undefined })) },
                                ];
                                const visible = sections.filter((s) => s.items.length > 0);
                                if (visible.length === 0) return <p className="text-sm text-alloy-midnight/60">No related records.</p>;
                                return (
                                    <>
                                        {visible.map((sec) => (
                                            <EntityDrawerSection
                                                key={sec.key}
                                                config={{
                                                    key: sec.key,
                                                    title: sec.title,
                                                    defaultExpanded: sec.defaultExpanded,
                                                    collapsible: true,
                                                    gridCols: 1,
                                                    fields: [],
                                                }}
                                                defaultExpanded={sec.defaultExpanded}
                                            >
                                                <div className="flex flex-col gap-2">
                                                    <ul className="space-y-0 list-none p-0 m-0">
                                                        {sec.items.map((item) => (
                                                            <li key={item.id}>
                                                                {item.entityType ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => openDrawer({ type: item.entityType!, id: item.id })}
                                                                        className="w-full text-left rounded-lg px-3 py-2 hover:bg-alloy-stone/30 transition-colors border-0 bg-transparent"
                                                                    >
                                                                        <div className="font-medium text-alloy-forge/90 text-sm">{item.label}</div>
                                                                        {item.meta && <div className="text-xs text-alloy-muted mt-0.5">{item.meta}</div>}
                                                                        {(item as { isPrimary?: boolean }).isPrimary && <span className="text-xs text-alloy-blue mt-0.5">Primary</span>}
                                                                    </button>
                                                                ) : (
                                                                    <div className="rounded-lg px-3 py-2 text-sm text-alloy-forge/90">
                                                                        <div className="font-medium">{item.label}</div>
                                                                        {item.meta && <div className="text-xs text-alloy-muted mt-0.5">{item.meta}</div>}
                                                                    </div>
                                                                )}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            </EntityDrawerSection>
                                        ))}
                                    </>
                                );
                            })() : <p className="text-sm text-alloy-midnight/60">No related data.</p>}
                        </div>
                    )}
                    {drawerTab === "related" && drawer.type === "locations" && drawer.id && (
                        <div className="pt-2">
                            <RelatedRecordsTabs entityType="location" entityId={drawer.id} />
                        </div>
                    )}
                    {drawerTab === "related" && drawer.type === "jobs" && drawer.id && drawer.id !== "new" && (
                        <div className="space-y-0 pt-5" data-entity-drawer-related>
                            {jobRelatedLoading ? (
                                <p className="text-sm text-alloy-midnight/60">Loading related records…</p>
                            ) : jobRelatedData ? (() => {
                                const d = jobRelatedData;
                                const scheduleItems = (d.schedules ?? []).filter((s) => !(s as { canceled_at?: string | null }).canceled_at).map((s) => ({
                                    id: s.id,
                                    entityType: "schedules" as const,
                                    label: (s as { _visit_label?: string })._visit_label ?? "Visit",
                                    meta: [s.start_at ? displayDateTime(s.start_at) : null, s.end_at ? displayDateTime(s.end_at) : null, (s as { _vendor_name?: string | null })._vendor_name, (s as { status_key?: string | null }).status_key].filter(Boolean).join(" · ") || undefined,
                                }));
                                const opp = d.opportunity;
                                const messageItems = (d.messages ?? []).map((m: unknown) => {
                                    const x = m as { id: string; created_at?: string };
                                    return { id: x.id, label: "Message", meta: x.created_at ? displayDateTime(x.created_at) : undefined };
                                });
                                const discountItems = (d.discounts ?? []).map((r) => ({ id: r.id, label: (r as { _code?: string | null })._code ?? "Discount", meta: r.created_at ? displayDate(r.created_at) : undefined }));
                                const jobId = drawer.id;
                                const dataForPrefill = data as { customer_id?: string | null; location_id?: string | null; assigned_vendor_id?: string | null } | null | undefined;
                                type Sec = { key: string; title: string; defaultExpanded: boolean; items: { id: string; entityType?: AdminDrawerEntityType; label: string; meta?: string }[]; addAction?: { label: string; onClick: () => void } };
                                const sections: Sec[] = [
                                    { key: "schedules", title: "Schedules", defaultExpanded: true, items: scheduleItems, addAction: { label: "Add Schedule", onClick: async () => { let status_key: string | null = null; try { const r = await fetch("/api/admin/status-options?entity_type=schedules"); const j = await r.json().catch(() => ({})); const opts = (j.options ?? []) as { value: string }[]; status_key = opts[0]?.value ?? null; } catch { /* ignore */ } openDrawer({ type: "schedules", id: "new", defaultSchedulePrefill: { job_id: jobId, customer_id: dataForPrefill?.customer_id ?? null, location_id: dataForPrefill?.location_id ?? null, assigned_vendor_id: jobAssignedVendorId ?? dataForPrefill?.assigned_vendor_id ?? null, status_key } }); } } },
                                    { key: "opportunity", title: "Opportunity", defaultExpanded: !!opp, items: opp ? [{ id: opp.id, entityType: "opportunities" as const, label: (opp.name as string) || "Opportunity", meta: opp.created_at ? displayDate(opp.created_at as string) : undefined }] : [] },
                                    { key: "messages", title: "Messages", defaultExpanded: false, items: messageItems },
                                    { key: "discounts", title: "Discounts", defaultExpanded: false, items: discountItems },
                                ];
                                const visible = sections.filter((s) => s.items.length > 0 || s.addAction);
                                if (visible.length === 0) return <p className="text-sm text-alloy-midnight/60">No related records.</p>;
                                return (
                                    <>
                                        {visible.map((sec) => (
                                            <EntityDrawerSection
                                                key={sec.key}
                                                config={{ key: sec.key, title: sec.title, defaultExpanded: sec.defaultExpanded, collapsible: true, gridCols: 1, fields: [] }}
                                                defaultExpanded={sec.defaultExpanded}
                                            >
                                                {sec.items.length > 0 ? (
                                                    <div className="flex flex-col gap-2">
                                                        {sec.addAction && (
                                                            <div className="flex justify-end">
                                                                <button type="button" onClick={sec.addAction.onClick} className="px-2 py-1 text-xs border border-alloy-stone/50 rounded hover:bg-alloy-stone/20 text-alloy-midnight">{sec.addAction.label}</button>
                                                            </div>
                                                        )}
                                                        <ul className="space-y-0 list-none p-0 m-0">
                                                            {sec.items.map((item) => (
                                                                <li key={item.id}>
                                                                    {(item as { entityType?: AdminDrawerEntityType }).entityType ? (
                                                                        <button type="button" onClick={() => openDrawer({ type: (item as { entityType: AdminDrawerEntityType }).entityType!, id: item.id })} className="w-full text-left rounded-lg px-3 py-2 hover:bg-alloy-stone/30 transition-colors border-0 bg-transparent">
                                                                            <div className="font-medium text-alloy-forge/90 text-sm">{item.label}</div>
                                                                            {item.meta && <div className="text-xs text-alloy-muted mt-0.5">{item.meta}</div>}
                                                                        </button>
                                                                    ) : (
                                                                        <div className="rounded-lg px-3 py-2 text-sm text-alloy-forge/90">
                                                                            <div className="font-medium">{item.label}</div>
                                                                            {item.meta && <div className="text-xs text-alloy-muted mt-0.5">{item.meta}</div>}
                                                                        </div>
                                                                    )}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                ) : sec.addAction ? (
                                                    <div className="py-3 flex flex-col gap-2">
                                                        <p className="text-sm text-alloy-midnight/60">No schedules yet.</p>
                                                        <button type="button" onClick={sec.addAction.onClick} className="self-start px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30">{sec.addAction.label}</button>
                                                    </div>
                                                ) : (
                                                    <ul className="space-y-0 list-none p-0 m-0" />
                                                )}
                                            </EntityDrawerSection>
                                        ))}
                                    </>
                                );
                            })() : <p className="text-sm text-alloy-midnight/60">No related data.</p>}
                        </div>
                    )}
                    {drawerTab === "related" && drawer.type === "payments" && drawer.id && (
                        <div className="space-y-0 pt-5" data-entity-drawer-related>
                            {paymentRelatedLoading ? (
                                <p className="text-sm text-alloy-midnight/60">Loading related records…</p>
                            ) : paymentRelatedData ? (() => {
                                const d = paymentRelatedData;
                                const hasCustomer = !!d.customer;
                                const hasJob = !!d.job;
                                const hasLedger = (d.ledger_transactions?.length ?? 0) > 0;
                                const hasGl = (d.gl_journal_lines?.length ?? 0) > 0;
                                if (!hasCustomer && !hasJob && !hasLedger && !hasGl) return <p className="text-sm text-alloy-midnight/60">No related records.</p>;
                                return (
                                    <>
                                        {hasCustomer && (
                                            <EntityDrawerSection key="customer" config={{ key: "customer", title: "Customer", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [] }} defaultExpanded>
                                                <button type="button" onClick={() => openDrawer({ type: "customers", id: d.customer!.id })} className="w-full text-left rounded-lg px-3 py-2 hover:bg-alloy-stone/30 transition-colors border-0 bg-transparent">
                                                    <div className="font-medium text-alloy-forge/90 text-sm">{(d.customer as { name?: string | null }).name ?? "Customer"}</div>
                                                    {d.customer?.created_at && <div className="text-xs text-alloy-muted mt-0.5">{displayDateTime(d.customer.created_at)}</div>}
                                                </button>
                                            </EntityDrawerSection>
                                        )}
                                        {hasJob && (
                                            <EntityDrawerSection key="job" config={{ key: "job", title: "Job", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [] }} defaultExpanded>
                                                <button type="button" onClick={() => openDrawer({ type: "jobs", id: (d.job as { id: string }).id })} className="w-full text-left rounded-lg px-3 py-2 hover:bg-alloy-stone/30 transition-colors border-0 bg-transparent">
                                                    <div className="font-medium text-alloy-forge/90 text-sm">{(d.job as { _job_label?: string | null })._job_label ?? (d.job as { title?: string | null }).title ?? "Job"}</div>
                                                    {(d.job as { created_at?: string })?.created_at && <div className="text-xs text-alloy-muted mt-0.5">{displayDateTime((d.job as { created_at: string }).created_at)}</div>}
                                                </button>
                                            </EntityDrawerSection>
                                        )}
                                        {hasLedger && (
                                            <EntityDrawerSection key="ledger_transactions" config={{ key: "ledger_transactions", title: "Ledger Transactions", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [] }} defaultExpanded>
                                                <ul className="space-y-0 list-none p-0 m-0">
                                                    {(d.ledger_transactions ?? []).map((lt) => (
                                                        <li key={lt.id} className="rounded-lg px-3 py-2 text-sm text-alloy-forge/90">
                                                            <div className="font-medium">{(lt.type ?? "Transaction")} · {(lt.direction ?? "")} {lt.amount_cents != null ? formatMoneyFromCents(lt.amount_cents) : ""}</div>
                                                            {lt.occurred_at && <div className="text-xs text-alloy-muted mt-0.5">{displayDateTime(lt.occurred_at)}</div>}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </EntityDrawerSection>
                                        )}
                                        {hasGl && (
                                            <EntityDrawerSection key="gl_journal_lines" config={{ key: "gl_journal_lines", title: "GL Journal Lines", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [] }} defaultExpanded>
                                                <ul className="space-y-0 list-none p-0 m-0">
                                                    {(d.gl_journal_lines ?? []).map((line) => (
                                                        <li key={line.id} className="rounded-lg px-3 py-2 text-sm text-alloy-forge/90">
                                                            <div className="font-medium">Line {line.line_no ?? ""} {line.amount_cents != null ? formatMoneyFromCents(line.amount_cents) : ""}</div>
                                                            {line.created_at && <div className="text-xs text-alloy-muted mt-0.5">{displayDateTime(line.created_at)}</div>}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </EntityDrawerSection>
                                        )}
                                    </>
                                );
                            })() : <p className="text-sm text-alloy-midnight/60">No related records.</p>}
                        </div>
                    )}
                    {drawerTab === "ledger" && drawer.type === "payments" && drawer.id && (
                        <div className="space-y-0 pt-5" data-entity-drawer-ledger>
                            {paymentRelatedLoading ? (
                                <p className="text-sm text-alloy-midnight/60">Loading ledger…</p>
                            ) : paymentRelatedData ? (() => {
                                const d = paymentRelatedData;
                                const hasLedger = (d.ledger_transactions?.length ?? 0) > 0;
                                const hasGl = (d.gl_journal_lines?.length ?? 0) > 0;
                                if (!hasLedger && !hasGl) return <p className="text-sm text-alloy-midnight/60">No ledger activity recorded.</p>;
                                return (
                                    <>
                                        {hasLedger && (
                                            <EntityDrawerSection key="ledger_transactions" config={{ key: "ledger_transactions", title: "Ledger Transactions", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [] }} defaultExpanded>
                                                <ul className="space-y-0 list-none p-0 m-0">
                                                    {(d.ledger_transactions ?? []).map((lt) => (
                                                        <li key={lt.id} className="rounded-lg px-3 py-2 text-sm text-alloy-forge/90">
                                                            <div className="font-medium">{(lt.type ?? "Transaction")} · {(lt.direction ?? "")} {lt.amount_cents != null ? formatMoneyFromCents(lt.amount_cents) : ""}</div>
                                                            {lt.occurred_at && <div className="text-xs text-alloy-muted mt-0.5">{displayDateTime(lt.occurred_at)}</div>}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </EntityDrawerSection>
                                        )}
                                        {hasGl && (
                                            <EntityDrawerSection key="gl_journal_lines" config={{ key: "gl_journal_lines", title: "GL Journal Lines", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [] }} defaultExpanded>
                                                <ul className="space-y-0 list-none p-0 m-0">
                                                    {(d.gl_journal_lines ?? []).map((line) => (
                                                        <li key={line.id} className="rounded-lg px-3 py-2 text-sm text-alloy-forge/90">
                                                            <div className="font-medium">Line {line.line_no ?? ""} {line.amount_cents != null ? formatMoneyFromCents(line.amount_cents) : ""}</div>
                                                            {line.created_at && <div className="text-xs text-alloy-muted mt-0.5">{displayDateTime(line.created_at)}</div>}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </EntityDrawerSection>
                                        )}
                                    </>
                                );
                            })() : <p className="text-sm text-alloy-midnight/60">No ledger activity recorded.</p>}
                        </div>
                    )}
                    {drawerTab === "related" && drawer.type === "discount_redemptions" && drawer.id && (
                        <div className="space-y-0 pt-5" data-entity-drawer-related>
                            {redemptionRelatedLoading ? (
                                <p className="text-sm text-alloy-midnight/60">Loading related records…</p>
                            ) : redemptionRelatedData ? (() => {
                                const d = redemptionRelatedData;
                                const hasCustomer = !!d.customer;
                                const hasContact = !!d.contact;
                                const hasOpportunity = !!d.opportunity;
                                const hasJob = !!d.job;
                                const hasCode = !!d.discount_code;
                                if (!hasCustomer && !hasContact && !hasOpportunity && !hasJob && !hasCode) return <p className="text-sm text-alloy-midnight/60">No related records.</p>;
                                return (
                                    <>
                                        {hasCustomer && (
                                            <EntityDrawerSection key="customer" config={{ key: "customer", title: "Customer", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [] }} defaultExpanded>
                                                <button type="button" onClick={() => openDrawer({ type: "customers", id: d.customer!.id })} className="w-full text-left rounded-lg px-3 py-2 hover:bg-alloy-stone/30 transition-colors border-0 bg-transparent">
                                                    <div className="font-medium text-alloy-forge/90 text-sm">{(d.customer as { name?: string | null }).name ?? "Customer"}</div>
                                                    {d.customer?.created_at && <div className="text-xs text-alloy-muted mt-0.5">{displayDateTime(d.customer.created_at)}</div>}
                                                </button>
                                            </EntityDrawerSection>
                                        )}
                                        {hasContact && d.contact && (
                                            <EntityDrawerSection key="contact" config={{ key: "contact", title: "Contact", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [] }} defaultExpanded>
                                                <button type="button" onClick={() => openDrawer({ type: "contacts", id: d.contact!.id })} className="w-full text-left rounded-lg px-3 py-2 hover:bg-alloy-stone/30 transition-colors border-0 bg-transparent">
                                                    <div className="font-medium text-alloy-forge/90 text-sm">{[d.contact.first_name, d.contact.last_name].filter(Boolean).join(" ") || "Contact"}</div>
                                                    {d.contact.created_at && <div className="text-xs text-alloy-muted mt-0.5">{displayDateTime(d.contact.created_at)}</div>}
                                                </button>
                                            </EntityDrawerSection>
                                        )}
                                        {hasOpportunity && (
                                            <EntityDrawerSection key="opportunity" config={{ key: "opportunity", title: "Opportunity", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [] }} defaultExpanded>
                                                <button type="button" onClick={() => openDrawer({ type: "opportunities", id: (d.opportunity as { id: string }).id })} className="w-full text-left rounded-lg px-3 py-2 hover:bg-alloy-stone/30 transition-colors border-0 bg-transparent">
                                                    <div className="font-medium text-alloy-forge/90 text-sm">{(d.opportunity as { name?: string | null }).name ?? "Opportunity"}</div>
                                                    {(d.opportunity as { created_at?: string }).created_at && <div className="text-xs text-alloy-muted mt-0.5">{displayDateTime((d.opportunity as { created_at: string }).created_at)}</div>}
                                                </button>
                                            </EntityDrawerSection>
                                        )}
                                        {hasJob && (
                                            <EntityDrawerSection key="job" config={{ key: "job", title: "Job", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [] }} defaultExpanded>
                                                <button type="button" onClick={() => openDrawer({ type: "jobs", id: (d.job as { id: string }).id })} className="w-full text-left rounded-lg px-3 py-2 hover:bg-alloy-stone/30 transition-colors border-0 bg-transparent">
                                                    <div className="font-medium text-alloy-forge/90 text-sm">{(d.job as { _job_label?: string | null })._job_label ?? (d.job as { title?: string | null }).title ?? "Job"}</div>
                                                    {(d.job as { created_at?: string })?.created_at && <div className="text-xs text-alloy-muted mt-0.5">{displayDateTime((d.job as { created_at: string }).created_at)}</div>}
                                                </button>
                                            </EntityDrawerSection>
                                        )}
                                        {hasCode && (
                                            <EntityDrawerSection key="discount_code" config={{ key: "discount_code", title: "Discount Code", defaultExpanded: true, collapsible: true, gridCols: 1, fields: [] }} defaultExpanded>
                                                <div className="rounded-lg px-3 py-2 text-sm text-alloy-forge/90">
                                                    <div className="font-medium">{(d.discount_code as { code?: string | null }).code ?? "—"}</div>
                                                    <div className="text-xs text-alloy-muted mt-0.5">
                                                        {[(d.discount_code as { is_active?: boolean | null }).is_active != null ? ((d.discount_code as { is_active: boolean }).is_active ? "Active" : "Inactive") : null, (d.discount_code as { discount_type?: string | null }).discount_type, (d.discount_code as { discount_value?: number | null }).discount_value != null ? `${(d.discount_code as { discount_value: number }).discount_value}${(d.discount_code as { discount_type?: string | null }).discount_type === "percent" ? "%" : ""}` : null, (d.discount_code as { first_job_only?: boolean | null }).first_job_only ? "First job only" : null].filter(Boolean).join(" · ") || "—"}
                                                    </div>
                                                </div>
                                            </EntityDrawerSection>
                                        )}
                                    </>
                                );
                            })() : <p className="text-sm text-alloy-midnight/60">No related records.</p>}
                        </div>
                    )}
                    {drawerTab === "related" && drawer.type === "service_offerings" && drawer.id && (
                        <div className="space-y-0 pt-5" data-entity-drawer-related>
                            {offeringRelatedLoading ? (
                                <p className="text-sm text-alloy-midnight/60">Loading related records…</p>
                            ) : offeringRelatedData ? (
                                (offeringRelatedData.pricing_services?.length ?? 0) > 0 ? (
                                    <section>
                                        <h3 className={DRAWER_SECTION_HEADER_CLASS}>Pricing services</h3>
                                        <ul className="space-y-1.5 text-sm text-alloy-forge/90">
                                            {offeringRelatedData.pricing_services.map((ps: Record<string, unknown>) => (
                                                <li key={String(ps.id)} className="py-1">
                                                    {ps.id != null ? String(ps.id).slice(0, 8) + "…" : "—"}
                                                    {ps.created_at != null ? ` · ${displayDateTime(String(ps.created_at))}` : ""}
                                                </li>
                                            ))}
                                        </ul>
                                    </section>
                                ) : (
                                    <p className="text-sm text-alloy-midnight/60">No related records.</p>
                                )
                            ) : (
                                <p className="text-sm text-alloy-midnight/60">No related records.</p>
                            )}
                        </div>
                    )}
                    {drawerTab === "related" && drawer.type === "service_plan_templates" && drawer.id && (
                        <div className="space-y-0 pt-5" data-entity-drawer-related>
                            {planTemplateRelatedLoading ? (
                                <p className="text-sm text-alloy-midnight/60">Loading related records…</p>
                            ) : planTemplateRelatedData ? (
                                (planTemplateRelatedData.pricing_frequencies?.length ?? 0) > 0 ? (
                                    <section>
                                        <h3 className={DRAWER_SECTION_HEADER_CLASS}>Pricing frequencies</h3>
                                        <ul className="space-y-1.5 text-sm text-alloy-forge/90">
                                            {planTemplateRelatedData.pricing_frequencies.map((pf: Record<string, unknown>) => (
                                                <li key={String(pf.id)} className="py-1">
                                                    {(pf.frequency_key ?? pf.frequency_label ?? pf.id) != null ? String(pf.frequency_key ?? pf.frequency_label ?? pf.id) : "—"}
                                                    {pf.created_at != null ? ` · ${displayDateTime(String(pf.created_at))}` : ""}
                                                </li>
                                            ))}
                                        </ul>
                                    </section>
                                ) : (
                                    <p className="text-sm text-alloy-midnight/60">No related records.</p>
                                )
                            ) : (
                                <p className="text-sm text-alloy-midnight/60">No related records.</p>
                            )}
                        </div>
                    )}
                    {drawerTab === "related" && drawer.type === "addons" && drawer.id && (
                        <div className="space-y-0 pt-5" data-entity-drawer-related>
                            {addonRelatedLoading ? (
                                <p className="text-sm text-alloy-midnight/60">Loading related records…</p>
                            ) : (
                                <p className="text-sm text-alloy-midnight/60">No related records.</p>
                            )}
                        </div>
                    )}
                    {drawerTab === "documents" && drawer.type === "contacts" && drawer.id && drawer.id !== "new" && (
                        <div className="pt-2 space-y-3">
                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Documents</h3>
                            <EntityDocumentsSection
                                documents={contactRelatedData?.documents ?? []}
                                loading={contactRelatedLoading}
                                uploadEntityType="contact"
                                entityId={drawer.id}
                                canMutate={canMutate}
                                onAfterUpload={() => setContactRelatedData(null)}
                            />
                        </div>
                    )}
                    {drawerTab === "financials" && drawer.type === "jobs" && data && !(data as { _create?: boolean })?._create && (
                        <div className={`pt-2 ${DRAWER_ROW_SPACING}`}>
                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Payments &amp; pricing</h3>
                            {drawer.id && drawer.id !== "new" && canMutate && adminRole === "admin" ? (
                                <JobManualChargeForm jobId={drawer.id} disabled={!canMutate} onCreated={() => refetchJobPayments()} />
                            ) : null}
                            {jobPaymentsFetchError ? (
                                <p className="text-sm text-red-600 mb-3 rounded border border-red-200 bg-red-50 px-2 py-2">{jobPaymentsFetchError}</p>
                            ) : !jobPaymentSummaryFromApi ? (
                                <p className="text-sm text-alloy-midnight/60 mb-4">Loading payment summary…</p>
                            ) : (
                                <div className="rounded-md border border-alloy-stone/30 bg-alloy-stone/10 px-3 py-2 text-sm space-y-1 mb-4">
                                    <div className="flex justify-between gap-2">
                                        <span className="text-alloy-midnight/70">
                                            {jobTotalSummaryLabel(jobPaymentSummaryFromApi.receivable_source)}
                                        </span>
                                        <span className="font-medium">
                                            {jobPaymentSummaryFromApi.job_total_cents != null
                                                ? formatMoneyFromCents(jobPaymentSummaryFromApi.job_total_cents)
                                                : jobPaymentSummaryFromApi.original_amount_cents != null
                                                  ? formatMoneyFromCents(jobPaymentSummaryFromApi.original_amount_cents)
                                                  : "—"}
                                        </span>
                                    </div>
                                    <div className="flex justify-between gap-2">
                                        <span className="text-alloy-midnight/70">Paid (posted)</span>
                                        <span className="font-medium">{formatMoneyFromCents(jobPaymentSummaryFromApi.paid_amount_cents)}</span>
                                    </div>
                                    <div className="flex justify-between gap-2">
                                        <span className="text-alloy-midnight/70">Outstanding</span>
                                        <span className="font-medium">
                                            {(jobPaymentSummaryFromApi.outstanding_balance_cents ?? jobPaymentSummaryFromApi.balance_due_cents) != null
                                                ? formatMoneyFromCents(
                                                      (jobPaymentSummaryFromApi.outstanding_balance_cents ??
                                                          jobPaymentSummaryFromApi.balance_due_cents) as number
                                                  )
                                                : "—"}
                                        </span>
                                    </div>
                                    {jobPaymentSummaryFromApi.pending_payment_amount_cents > 0 ? (
                                        <div className="flex justify-between gap-2">
                                            <span className="text-alloy-midnight/70">Pending (authorized)</span>
                                            <span className="font-medium">
                                                {formatMoneyFromCents(jobPaymentSummaryFromApi.pending_payment_amount_cents)}
                                            </span>
                                        </div>
                                    ) : null}
                                    <div className="flex justify-between gap-2">
                                        <span className="text-alloy-midnight/70">Payment state</span>
                                        <span className="font-medium">
                                            {jobPaymentStatusKeyLabel(jobPaymentSummaryFromApi.payment_status_key)}
                                        </span>
                                    </div>
                                </div>
                            )}
                            {jobPaymentsFetchError ? null : !jobPaymentSummaryFromApi ? null : (
                                <JobReceivableChargesPanel
                                    receivableSource={jobPaymentSummaryFromApi.receivable_source}
                                    chargeRows={jobPaymentSummaryFromApi.charge_balance_rows}
                                    openChargeCount={jobPaymentSummaryFromApi.open_charge_count}
                                    className="mb-4"
                                />
                            )}
                            {jobPaymentsFetchError ? null : !jobPaymentSummaryFromApi ? null : jobPayments.length > 0 ? (
                                <ul className="space-y-2">
                                    {jobPayments.map((p) => {
                                        const refId =
                                            (p.processor_transaction_id != null && String(p.processor_transaction_id).trim() !== ""
                                                ? String(p.processor_transaction_id).trim()
                                                : null) ?? (p.provider_payment_id?.trim() || null);
                                        const recv = p.received_at ? displayDateTime(p.received_at) : null;
                                        const posted = p.posted_at ? displayDateTime(p.posted_at) : p.paid_at ? displayDateTime(p.paid_at) : null;
                                        return (
                                            <li key={p.id} className="text-sm border-b border-alloy-stone/15 pb-2 last:border-0">
                                                <div>
                                                    <span className="font-medium">{formatMoneyFromCents(p.amount_cents)}</span>
                                                    <span className="text-alloy-midnight/70"> — {paymentRowStatusDisplayLabel(p)}</span>
                                                    {p.processor ? (
                                                        <span className="text-alloy-midnight/55"> · {p.processor}</span>
                                                    ) : null}
                                                </div>
                                                <div className="text-xs text-alloy-midnight/55 mt-0.5 space-x-2 space-y-0.5">
                                                    {recv ? <span>Received {recv}</span> : null}
                                                    {posted ? <span>{recv ? "·" : ""} Posted {posted}</span> : null}
                                                    {p.allocation_state ? (
                                                        <span>
                                                            · Alloc {formatMoneyFromCents(p.allocated_amount_cents ?? 0)} / unalloc{" "}
                                                            {formatMoneyFromCents(p.unallocated_amount_cents ?? 0)} ({p.allocation_state})
                                                        </span>
                                                    ) : null}
                                                </div>
                                                {refId ? <span className="block font-mono text-xs text-alloy-midnight/50 mt-0.5">{refId}</span> : null}
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : (
                                <p className="text-sm text-alloy-midnight/60">No payments yet.</p>
                            )}
                            {jobPayoutLoading ? <p className="text-sm text-alloy-midnight/60 mt-4">Loading payout…</p> : jobPayout && (data as { assigned_vendor_id?: string | null })?.assigned_vendor_id ? (
                                <div className="mt-4 space-y-2">
                                    <p className="text-sm"><strong>Payout policy:</strong> {jobPayout.policy.mode === "tiered" ? "Tiered" : "Flat"}{jobPayout.policy.mode === "flat" && jobPayout.policy.value != null && ` · ${jobPayout.policy.value}%`}</p>
                                    {jobPayout.schedules.length > 0 && <div className="overflow-x-auto"><table className="w-full text-sm border border-alloy-stone/20"><thead><tr className="border-b text-left text-alloy-midnight/70"><th className="py-1 pr-2">Scheduled</th><th className="py-1 pr-2">Price</th><th className="py-1 pr-2">Payout</th></tr></thead><tbody>{jobPayout.schedules.map((s) => <tr key={s.schedule_id} className="border-b border-alloy-stone/10"><td className="py-1 pr-2">{s.scheduled_at ? displayDateTime(s.scheduled_at) : "—"}</td><td className="py-1 pr-2">{s.price_cents != null ? formatMoneyFromCents(s.price_cents) : "—"}</td><td className="py-1 pr-2">{s.payout_cents != null ? formatMoneyFromCents(s.payout_cents) : "—"}</td></tr>)}</tbody></table></div>}</div>
                            ) : (data as { assigned_vendor_id?: string | null })?.assigned_vendor_id ? <p className="text-sm text-alloy-midnight/60 mt-4">Could not load payout.</p> : null}
                            {!jobFinancialsLoading && jobFinancials && (
                                <>
                                    {jobFinancials.booking_economics && (
                                        <div className="mt-4 rounded border border-alloy-stone/25 bg-alloy-stone/5 px-3 py-3 space-y-2">
                                            <h3 className={`${DRAWER_SECTION_HEADER_CLASS}`}>Booking pricing</h3>
                                            <p className="text-xs text-alloy-midnight/60 max-w-xl leading-relaxed">
                                                From the job row: gross / discount / net first visit, and recurring visit amount when the job is recurring.
                                            </p>
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-alloy-midnight/80 mt-2">
                                                <span>First visit (gross)</span>
                                                <span>
                                                    {jobFinancials.booking_economics.first_visit_gross_cents != null
                                                        ? formatMoneyFromCents(jobFinancials.booking_economics.first_visit_gross_cents)
                                                        : "—"}
                                                </span>
                                                <span>One-time discount</span>
                                                <span>
                                                    {jobFinancials.booking_economics.discount_cents != null &&
                                                    jobFinancials.booking_economics.discount_cents > 0
                                                        ? `-${formatMoneyFromCents(jobFinancials.booking_economics.discount_cents)}`
                                                        : "—"}
                                                </span>
                                                <span>First visit (net)</span>
                                                <span>
                                                    {jobFinancials.booking_economics.first_visit_net_cents != null
                                                        ? formatMoneyFromCents(jobFinancials.booking_economics.first_visit_net_cents)
                                                        : "—"}
                                                </span>
                                                <span>Recurring visit</span>
                                                <span>
                                                    {jobFinancials.booking_economics.recurring_visit_cents != null
                                                        ? formatMoneyFromCents(jobFinancials.booking_economics.recurring_visit_cents)
                                                        : "—"}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                    <h3 className={`${DRAWER_SECTION_HEADER_CLASS} mt-6`}>Ledger (general ledger)</h3>
                                    <p className="text-xs text-alloy-midnight/55 mt-1 max-w-xl leading-relaxed">
                                        These totals sum <strong>gl_journal_lines</strong> for this job (mapped accounts only).{" "}
                                        <strong>Posted journal entries</strong> counts <strong>schedule_completed</strong>{" "}
                                        entries for this job&apos;s schedules — not individual Stripe charges.
                                    </p>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-alloy-midnight/80 mt-3">
                                        <span>Revenue (credits)</span><span>{formatMoneyFromCents(jobFinancials.totals.total_revenue_credits)}</span>
                                        <span>Discounts (debits)</span><span>{formatMoneyFromCents(jobFinancials.totals.total_discount_debits)}</span>
                                        <span>Vendor payout (debits)</span><span>{formatMoneyFromCents(jobFinancials.totals.total_vendor_payout_debits)}</span>
                                        <span>Cash (debits)</span><span>{formatMoneyFromCents(jobFinancials.totals.total_cash_debits)}</span>
                                        <span>Vendor payable (credits)</span><span>{formatMoneyFromCents(jobFinancials.totals.total_vendor_payable_credits)}</span>
                                    </div>
                                    <p className="text-xs text-alloy-midnight/60 mt-2">Posted journal entries (schedule scope): {jobFinancials.posted_entries_count}</p>
                                    {jobFinancials.schedules.length > 0 ? (
                                        <div className="mt-3 overflow-x-auto">
                                            <table className="w-full text-sm border border-alloy-stone/20">
                                                <thead>
                                                    <tr className="border-b text-left text-alloy-midnight/70">
                                                        <th className="py-1 pr-2">Visit (start)</th>
                                                        <th className="py-1 pr-2">Visit</th>
                                                        <th className="py-1 pr-2">Status</th>
                                                        <th className="py-1 pr-2">Price</th>
                                                        <th className="py-1 pr-2">GL posted</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {jobFinancials.schedules.map((s) => (
                                                        <tr key={s.id} className="border-b border-alloy-stone/10">
                                                            <td className="py-1 pr-2">{s.start_at ? displayDateTime(s.start_at) : "—"}</td>
                                                            <td className="py-1 pr-2">
                                                                {s.visit_kind === "recurring"
                                                                    ? "Recurring"
                                                                    : s.visit_kind === "first"
                                                                      ? "First"
                                                                      : "—"}
                                                            </td>
                                                            <td className="py-1 pr-2">{s.status_key ?? "—"}</td>
                                                            <td className="py-1 pr-2">
                                                                {s.price_cents != null ? formatMoneyFromCents(s.price_cents) : "—"}
                                                            </td>
                                                            <td className="py-1 pr-2">{s.posted ? "Yes" : "No"}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            <p className="text-xs text-alloy-midnight/55 mt-1 max-w-xl leading-relaxed">
                                                Billing model here: the payment summary above uses receivable <span className="font-mono text-[11px]">charges</span>{" "}
                                                when present (see receivable charges list); otherwise priced job lines. Job-level{" "}
                                                <span className="font-mono text-[11px]">payments</span> rows roll up below. This table is per schedule with{" "}
                                                <span className="font-mono text-[11px]">schedule_completed</span> GL entries when visits complete.
                                            </p>
                                        </div>
                                    ) : null}
                                    {(() => {
                                        const t = jobFinancials.totals;
                                        const glSum =
                                            (t.total_revenue_credits || 0) +
                                            (t.total_discount_debits || 0) +
                                            (t.total_vendor_payout_debits || 0) +
                                            (t.total_cash_debits || 0) +
                                            (t.total_vendor_payable_credits || 0);
                                        const hasPaidMoney = (jobPaymentSummaryFromApi?.paid_amount_cents ?? 0) > 0;
                                        if (glSum === 0 && hasPaidMoney) {
                                            return (
                                                <p className="text-xs text-alloy-midnight/80 mt-2 max-w-xl rounded border border-amber-200/80 bg-amber-50/90 px-2.5 py-2 leading-relaxed">
                                                    You have successful card charges above, but <strong>no GL lines on this job yet</strong>. That is expected
                                                    here: payment success updates <strong>payments</strong> (and may set{" "}
                                                    <span className="font-mono text-[11px]">posted_to_ledger_at</span> on the row); this screen does{" "}
                                                    <strong>not</strong> yet show automatic cash/revenue journal entries from Stripe.
                                                </p>
                                            );
                                        }
                                        return null;
                                    })()}
                                </>
                            )}
                        </div>
                    )}
                    {drawerTab === "financials" && drawer.type === "schedules" && drawer.id && drawer.id !== "new" && (
                        <div className={`pt-2 ${DRAWER_ROW_SPACING}`}>
                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Schedule financials</h3>
                            {scheduleFinancialsLoading && <p className="text-sm text-alloy-midnight/60">Loading…</p>}
                            {!scheduleFinancialsLoading && scheduleFinancials && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-alloy-midnight/80">
                                        <span>Price</span><span>{scheduleFinancials.schedule?.price_cents != null ? formatMoneyFromCents(scheduleFinancials.schedule.price_cents) : "—"}</span>
                                        <span>Customer payment posted?</span><span>{scheduleFinancials.customer_payment_posted ? "Yes" : "No"}</span>
                                        <span>Vendor payout posted?</span><span>{scheduleFinancials.vendor_payout_posted ? "Yes" : "No"}</span>
                                    </div>
                                    {canMutate && (
                                        <ScheduleCashEventButtons
                                            scheduleId={drawer.id}
                                            onSuccess={() => {
                                                fetch(`/api/admin/financials/schedule/${drawer.id}`)
                                                    .then((r) => (r.ok ? r.json() : null))
                                                    .then(setScheduleFinancials)
                                                    .catch(() => setScheduleFinancials(null));
                                            }}
                                        />
                                    )}
                                </div>
                            )}
                            {!scheduleFinancialsLoading && !scheduleFinancials && <p className="text-sm text-alloy-midnight/50">Could not load financials.</p>}
                        </div>
                    )}
                    {drawerTab === "financials" && drawer.type === "vendors" && drawer.id && drawer.id !== "new" && (
                        <div className={`pt-2 ${DRAWER_ROW_SPACING}`}>
                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Financials</h3>
                            {vendorRelatedLoading ? (
                                <p className="text-sm text-alloy-midnight/60">Loading…</p>
                            ) : vendorRelatedData?.financials_summary ? (
                                <div className="space-y-2 text-sm text-alloy-midnight/80">
                                    <p>
                                        Assigned jobs (in related-data scope): <strong>{vendorRelatedData.financials_summary.job_count}</strong>
                                    </p>
                                    <p>
                                        Total (net after discount, summed):{" "}
                                        <strong>
                                            {formatMoneyFromCents(
                                                vendorRelatedData.financials_summary.total_display_cents ??
                                                    vendorRelatedData.financials_summary.total_gross_cents
                                            )}
                                        </strong>
                                    </p>
                                    <p className="text-alloy-midnight/60">
                                        Gross total (reference):{" "}
                                        <strong>{formatMoneyFromCents(vendorRelatedData.financials_summary.total_gross_cents)}</strong>
                                    </p>
                                    <p className="text-xs text-alloy-midnight/50">Figures mirror the Related tab job list (API-capped). Open individual jobs for full pricing and ledger context.</p>
                                </div>
                            ) : (
                                <p className="text-sm text-alloy-midnight/60">No financial summary available.</p>
                            )}
                        </div>
                    )}
                    {drawerTab === "financials" && (drawer.type === "opportunities" || drawer.type === "customers") && (
                        <div className={`pt-2 ${DRAWER_ROW_SPACING}`}>
                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Financials</h3>
                            <p className="text-sm text-alloy-midnight/60">Financial details for {drawer.type} are available in the Financials section of the admin.</p>
                        </div>
                    )}
                    {drawerTab === "automation" && drawer.type === "opportunities" && (
                        <div className="pt-2 space-y-3">
                            <p className="text-sm text-[#59678b]">Configure statuses and workflows for opportunities.</p>
                            <ul className="space-y-1.5">
                                <li>
                                    <Link href="/admin/system/statuses?entity_type=opportunity" className="text-alloy-blue hover:underline text-sm">Statuses</Link>
                                </li>
                                <li>
                                    <Link href="/admin/workflows?entity_type=opportunity" className="text-alloy-blue hover:underline text-sm">Workflows</Link>
                                </li>
                            </ul>
                        </div>
                    )}
                    {drawerTab === "payments" && drawer.type === "customers" && drawer.id && drawer.id !== "new" && (
                        <div className="pt-2 space-y-3">
                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Payments</h3>
                            {customerRelatedLoading ? (
                                <p className="text-sm text-alloy-midnight/60">Loading…</p>
                            ) : (customerRelatedData?.payments?.length ?? 0) > 0 ? (
                                <ul className="space-y-2">
                                    {(customerRelatedData?.payments ?? []).map((p) => (
                                        <li key={p.id} className="text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
                                            <span className="font-medium text-alloy-forge/90">{formatMoneyFromCents(p.amount_cents ?? 0)}</span>
                                            <span className="text-alloy-midnight/70">{p.status_key ?? "—"}</span>
                                            <span className="text-alloy-muted text-xs">{p.paid_at ? displayDateTime(p.paid_at) : p.created_at ? displayDateTime(p.created_at) : ""}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-alloy-midnight/60">No payments available.</p>
                            )}
                                        </div>
                                    )}
                    {drawerTab === "documents" && drawer.type === "customer_members" && drawer.id && drawer.id !== "new" && (
                        <div className="pt-2 space-y-3">
                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Documents</h3>
                            <EntityDocumentsSection
                                documents={memberRelatedData?.documents ?? []}
                                loading={memberRelatedDataLoading}
                                uploadEntityType="customer_member"
                                entityId={drawer.id}
                                canMutate={canMutate}
                                onAfterUpload={refetchMemberRelated}
                            />
                        </div>
                    )}
                    {drawerTab === "documents" && drawer.type === "customers" && drawer.id && drawer.id !== "new" && (
                        <div className="pt-2 space-y-3">
                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Documents</h3>
                            <EntityDocumentsSection
                                documents={customerRelatedData?.documents ?? []}
                                loading={customerRelatedLoading}
                                uploadEntityType="customer"
                                entityId={drawer.id}
                                canMutate={canMutate}
                                onAfterUpload={() => setCustomerRelatedData(null)}
                            />
                        </div>
                    )}
                    {drawerTab === "documents" && drawer.type === "persons" && drawer.id && drawer.id !== "new" && (
                        <div className="pt-2 space-y-3">
                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Documents</h3>
                            <p className="text-xs text-alloy-midnight/60 -mt-1 mb-2">
                                Includes files linked to this person and onboarding documents from any vendor that lists this person as the primary person.
                            </p>
                            <EntityDocumentsSection
                                documents={personRelatedData?.documents ?? []}
                                loading={personRelatedLoading}
                                uploadEntityType="person"
                                entityId={drawer.id}
                                canMutate={canMutate}
                                onAfterUpload={() => setPersonRelatedData(null)}
                            />
                        </div>
                    )}
                    {drawerTab === "communications" &&
                        drawer.type === "opportunities" &&
                        drawer.id &&
                        drawer.id !== "new" &&
                        opportunityRecordGateWorkflowLayout && (
                            <div className="pt-2 space-y-3" data-admin-opportunity-comms-panel="true">
                                {isTaskAssistV1UiEnabled() ? (
                                    <TaskAssistOpportunityLauncher entityId={drawer.id} label={String(drawerTitleResolved)} />
                                ) : null}
                                <CommunicationsDrawerSection
                                    embedded
                                    apiEntityType="opportunities"
                                    entityId={drawer.id}
                                    active={drawerTab === "communications"}
                                    opportunityComposeContext={opportunityCommunicationsComposeContext}
                                />
                            </div>
                        )}
                    {drawerTab === "notes" &&
                        drawer.type === "opportunities" &&
                        drawer.id &&
                        drawer.id !== "new" &&
                        overviewData &&
                        !(overviewData as { _create?: boolean })._create &&
                        opportunityRecordGateWorkflowLayout && (
                            <div className="pt-2 space-y-3">
                                {(() => {
                                    const d = overviewData as Record<string, unknown>;
                                    const followUpOverdue = isOpportunityFollowUpOverdue(d.next_follow_up_at);
                                    const followNotesValue = String(formData.follow_up_notes ?? d.follow_up_notes ?? "");
                                    return (
                                        <div
                                            className={`rounded-lg border border-alloy-stone/[0.1] bg-white/[0.97] p-2.5 shadow-sm ring-1 ring-alloy-stone/[0.06] ${
                                                followUpOverdue
                                                    ? "border-amber-200/75 bg-amber-50/[0.22] ring-amber-100/40"
                                                    : ""
                                            }`}
                                        >
                                            <div className={oppInqEyebrow}>
                                                Notes & next step
                                                {followUpOverdue ? (
                                                    <span className="ml-2 font-semibold normal-case text-amber-900/85">
                                                        Follow-up overdue
                                                    </span>
                                                ) : null}
                                            </div>
                                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    disabled
                                                    className="rounded-md border border-alloy-stone/25 bg-alloy-stone/5 px-2 py-1 text-[11px] font-semibold text-alloy-midnight/40"
                                                    title="Coming soon"
                                                >
                                                    Add note
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setDrawerTab("activity")}
                                                    className="rounded-md border border-alloy-stone/25 bg-white px-2 py-1 text-[11px] font-semibold text-alloy-midnight/75 hover:border-alloy-blue/35 hover:text-alloy-blue"
                                                >
                                                    View activity
                                                </button>
                                            </div>
                                            <textarea
                                                value={followNotesValue}
                                                onChange={(e) =>
                                                    setFormData((prev) => ({ ...prev, follow_up_notes: e.target.value }))
                                                }
                                                onBlur={() => {
                                                    if (nonJobFormDirty) saveEdit();
                                                }}
                                                rows={3}
                                                disabled={!canMutate}
                                                placeholder="Add follow-up notes…"
                                                className="mt-1.5 w-full resize-none rounded-md border border-alloy-stone/20 bg-white px-2.5 py-2 text-[12px] leading-snug text-alloy-midnight/80 shadow-sm focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20 disabled:opacity-60"
                                            />
                                            {(() => {
                                                const md =
                                                    data && typeof data === "object"
                                                        ? ((data as { metadata?: unknown }).metadata as Record<
                                                              string,
                                                              unknown
                                                          > | null)
                                                        : null;
                                                const rawNotes = md && typeof md.notes === "string" ? md.notes.trim() : "";
                                                if (!rawNotes) return null;
                                                return (
                                                    <div className="mt-2.5 rounded-md border border-alloy-stone/15 bg-white px-2.5 py-2">
                                                        <div className={oppInqEyebrow}>Logged notes (from actions)</div>
                                                        <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[12px] leading-snug text-alloy-midnight/75">
                                                            {rawNotes}
                                                        </pre>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                    {drawerTab === "documents" && drawer.type === "opportunities" && drawer.id && drawer.id !== "new" && (
                        <div className="pt-2 space-y-3">
                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Documents</h3>
                            <EntityDocumentsSection
                                documents={opportunityRelatedData?.documents ?? []}
                                loading={opportunityRelatedLoading}
                                uploadEntityType="opportunity"
                                entityId={drawer.id}
                                canMutate={canMutate}
                                onAfterUpload={() => setOpportunityRelatedData(null)}
                            />
                        </div>
                    )}
                    {drawerTab === "documents" && drawer.type === "jobs" && drawer.id && drawer.id !== "new" && (
                        <div className="pt-2 space-y-3">
                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Documents</h3>
                            <EntityDocumentsSection
                                documents={jobRelatedData?.documents ?? []}
                                loading={jobRelatedLoading}
                                uploadEntityType="job"
                                entityId={drawer.id}
                                canMutate={canMutate}
                                onAfterUpload={refetchJobRelatedData}
                            />
                        </div>
                    )}
                    {drawerTab === "documents" && drawer.type === "schedules" && drawer.id && drawer.id !== "new" && (
                        <div className="pt-2 space-y-3">
                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Documents</h3>
                            <EntityDocumentsSection
                                documents={scheduleRelatedDocuments}
                                loading={scheduleRelatedDocumentsLoading}
                                uploadEntityType="schedule"
                                entityId={drawer.id}
                                canMutate={canMutate}
                                onAfterUpload={refetchScheduleRelatedDocuments}
                            />
                        </div>
                    )}
                    {drawerTab === "documents" && drawer.type === "vendors" && drawer.id && drawer.id !== "new" && (
                        <div className="pt-2 space-y-3">
                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Documents</h3>
                            <p className="text-xs text-alloy-midnight/60 -mt-1 mb-2">
                                Canonical files live in the documents list below. Legacy storage paths may still exist on the vendor record for older integrations.
                            </p>
                            <EntityDocumentsSection
                                documents={vendorRelatedData?.documents ?? []}
                                loading={vendorRelatedLoading}
                                uploadEntityType="vendor"
                                entityId={drawer.id}
                                canMutate={canMutate}
                                onAfterUpload={refetchVendorRelated}
                            />
                        </div>
                    )}
                    {drawerTab === "documents" && drawer.type === "locations" && drawer.id && drawer.id !== "new" && (
                        <div className="pt-2 space-y-3">
                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Documents</h3>
                            <EntityDocumentsSection
                                documents={locationDocuments}
                                loading={locationDocumentsLoading}
                                uploadEntityType="location"
                                entityId={drawer.id}
                                canMutate={canMutate}
                                onAfterUpload={() => {
                                    setLocationDocumentsLoading(true);
                                    fetch(`/api/admin/related/location/${drawer.id}`)
                                        .then((r) => (r.ok ? r.json() : { documents: [] }))
                                        .then((json: { documents?: LocationDocumentsRow[] }) => setLocationDocuments(json.documents ?? []))
                                        .catch(() => setLocationDocuments([]))
                                        .finally(() => setLocationDocumentsLoading(false));
                                }}
                            />
                        </div>
                    )}
                    {drawerTab === "activity" && (
                        <div className={`${DRAWER_ROW_SPACING} pt-2`}>
                            {drawer.type === "payments" && drawer.id ? (
                                <div className="space-y-4">
                                    <section>
                                        <h3 className={DRAWER_SECTION_HEADER_CLASS}>Timeline</h3>
                                        <ul className="space-y-1.5 text-sm text-alloy-forge/90">
                                            {(data as { status?: string | null })?.status != null && String((data as { status: string }).status).trim() !== "" ? (
                                                <li>Status (canonical): {paymentRowStatusDisplayLabel(data as PaymentRowLike)}</li>
                                            ) : null}
                                            {(data as { received_at?: string | null })?.received_at != null ? (
                                                <li>Received: {displayDateTime(String((data as { received_at: string }).received_at))}</li>
                                            ) : null}
                                            {(data as { posted_at?: string | null })?.posted_at != null ? (
                                                <li>Posted: {displayDateTime(String((data as { posted_at: string }).posted_at))}</li>
                                            ) : null}
                                            {data?.created_at != null ? <li>Created: {displayDateTime(String(data.created_at))}</li> : null}
                                            {data?.updated_at != null ? <li>Updated: {displayDateTime(String(data.updated_at))}</li> : null}
                                            {data?.paid_at != null ? <li>Paid at (legacy): {displayDateTime(String(data.paid_at))}</li> : null}
                                            {data?.posted_to_ledger_at != null ? (
                                                <li>Posted to ledger: {displayDateTime(String(data.posted_to_ledger_at))}</li>
                                            ) : null}
                                        </ul>
                                        {!data?.created_at &&
                                            !data?.updated_at &&
                                            !data?.paid_at &&
                                            !data?.posted_to_ledger_at &&
                                            !(data as { received_at?: string | null })?.received_at &&
                                            !(data as { posted_at?: string | null })?.posted_at &&
                                            (!(data as { status?: string | null })?.status || String((data as { status: string }).status).trim() === "") && (
                                                <p className="text-sm text-alloy-midnight/60">No activity recorded.</p>
                                            )}
                                    </section>
                                </div>
                            ) : drawer.type === "customers" && drawer.id && drawer.id !== "new" ? (
                                <div className="space-y-4">
                                    <section>
                                        <h3 className={DRAWER_SECTION_HEADER_CLASS}>Timeline</h3>
                                        <ul className="space-y-1.5 text-sm text-alloy-forge/90">
                                            {data?.created_at != null ? <li>Created: {displayDateTime(String(data.created_at))}</li> : null}
                                            {data?.updated_at != null ? <li>Updated: {displayDateTime(String(data.updated_at))}</li> : null}
                                        </ul>
                                        {!data?.created_at && !data?.updated_at && (
                                            <p className="text-sm text-alloy-midnight/60">No activity recorded.</p>
                                        )}
                                    </section>
                                </div>
                            ) : drawer.type === "contacts" && drawer.id && drawer.id !== "new" ? (
                                <div className="space-y-6">
                                    {(contactRelatedData?.messages?.length ?? 0) > 0 && (
                                        <section>
                                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Messages</h3>
                                            <ul className="space-y-2">
                                                {(contactRelatedData?.messages ?? []).map((m) => (
                                                    <li key={m.id} className="text-sm text-alloy-forge/90">
                                                        {m.created_at ? displayDateTime(m.created_at) : ""}
                                                        {m.to_phone ? ` · ${m.to_phone}` : ""}
                                                        {m.status ? ` · ${m.status}` : ""}
                                                    </li>
                                                ))}
                                            </ul>
                                        </section>
                                    )}
                                    <section>
                                        <h3 className={DRAWER_SECTION_HEADER_CLASS}>Timeline</h3>
                                        <ul className="space-y-1.5 text-sm text-alloy-forge/90">
                                            {data?.created_at != null ? <li>Created: {displayDateTime(String(data.created_at))}</li> : null}
                                            {data?.updated_at != null ? <li>Updated: {displayDateTime(String(data.updated_at))}</li> : null}
                                            {(data as { archived_at?: string | null })?.archived_at != null ? <li>Archived: {displayDateTime(String((data as { archived_at: string }).archived_at))}</li> : null}
                                        </ul>
                                        {!data?.created_at && !data?.updated_at && !(data as { archived_at?: string | null })?.archived_at && (
                                            <p className="text-sm text-alloy-midnight/60">No timeline events.</p>
                                        )}
                                    </section>
                                    {(contactRelatedData?.messages?.length === 0 && !data?.created_at && !data?.updated_at && !(data as { archived_at?: string | null })?.archived_at && !contactRelatedLoading) && (
                                        <p className="text-sm text-alloy-midnight/60">No activity recorded.</p>
                                    )}
                                    {contactRelatedLoading && !contactRelatedData && <p className="text-sm text-alloy-midnight/60">Loading…</p>}
                                </div>
                            ) : drawer.type === "customer_members" && drawer.id && drawer.id !== "new" ? (
                                <div className="space-y-4">
                                    <section>
                                        <h3 className={DRAWER_SECTION_HEADER_CLASS}>Timeline</h3>
                                        <ul className="space-y-1.5 text-sm text-alloy-forge/90">
                                            {data?.created_at != null ? <li>Created: {displayDateTime(String(data.created_at))}</li> : null}
                                            {data?.updated_at != null ? <li>Updated: {displayDateTime(String(data.updated_at))}</li> : null}
                                        </ul>
                                        {!data?.created_at && !data?.updated_at && (
                                            <p className="text-sm text-alloy-midnight/60">No activity recorded.</p>
                                        )}
                                    </section>
                                </div>
                            ) : drawer.type === "vendors" && drawer.id && drawer.id !== "new" ? (
                                <div className="space-y-4">
                                    <section>
                                        <h3 className={DRAWER_SECTION_HEADER_CLASS}>Timeline</h3>
                                        <ul className="space-y-1.5 text-sm text-alloy-forge/90">
                                            {data?.created_at != null ? <li>Created: {displayDateTime(String(data.created_at))}</li> : null}
                                            {data?.updated_at != null ? <li>Updated: {displayDateTime(String(data.updated_at))}</li> : null}
                                            {(data as { submitted_at?: string | null })?.submitted_at != null ? <li>Submitted: {displayDateTime(String((data as { submitted_at: string }).submitted_at))}</li> : null}
                                        </ul>
                                        {!data?.created_at && !data?.updated_at && !(data as { submitted_at?: string | null })?.submitted_at && (
                                            <p className="text-sm text-alloy-midnight/60">No activity recorded.</p>
                                        )}
                                    </section>
                                </div>
                            ) : drawer.type === "opportunities" && drawer.id && drawer.id !== "new" ? (
                                <div className="space-y-4">
                                    <section>
                                        <h3 className={DRAWER_SECTION_HEADER_CLASS}>Activity</h3>
                                        {opportunityActivityLoading ? (
                                            <p className="text-sm text-alloy-midnight/60">Loading activity…</p>
                                        ) : opportunityActivityError ? (
                                            <p className="text-sm text-alloy-ember">{opportunityActivityError}</p>
                                        ) : (opportunityActivityEvents?.length ?? 0) > 0 ? (
                                            <ul className="mt-2 space-y-3">
                                                {(opportunityActivityEvents ?? []).map((ev) => {
                                                    const p = (ev.payload && typeof ev.payload === "object"
                                                        ? ev.payload
                                                        : {}) as Record<string, unknown>;
                                                    const preview =
                                                        p.body_preview != null && String(p.body_preview).trim()
                                                            ? String(p.body_preview)
                                                            : null;
                                                    const act = formatOpportunityActivityTimelineEvent({
                                                        event_type: ev.event_type,
                                                        payload: p,
                                                    });
                                                    return (
                                                        <li
                                                            key={ev.id}
                                                            className="rounded-lg border border-alloy-stone/15 bg-white px-3 py-2 text-sm"
                                                        >
                                                            <div className="font-semibold text-alloy-forge">{act.title}</div>
                                                            {act.detail ? (
                                                                <div className="mt-0.5 text-[13px] font-normal text-alloy-forge/80">
                                                                    {act.detail}
                                                                </div>
                                                            ) : null}
                                                            <div className="mt-0.5 text-[12px] text-alloy-forge/65">
                                                                {displayDateTime(ev.occurred_at)} · {act.actorLabel}
                                                            </div>
                                                            {preview ? (
                                                                <div className="mt-1.5 text-[13px] text-alloy-forge/85 whitespace-pre-wrap">
                                                                    {preview}
                                                                </div>
                                                            ) : null}
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        ) : (
                                            <p className="text-sm text-alloy-midnight/60">No workflow events yet.</p>
                                        )}
                                    </section>
                                    <section>
                                        <div className="flex items-center justify-between gap-3">
                                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Workflow runs</h3>
                                            <a href="/adminV2/workflows" className="text-sm font-semibold text-alloy-blue hover:underline">
                                                Workflows
                                            </a>
                                        </div>
                                        {opportunityWorkflowRunsLoading ? (
                                            <p className="text-sm text-alloy-midnight/60">Loading workflow runs…</p>
                                        ) : opportunityWorkflowRunsError ? (
                                            <p className="text-sm text-alloy-ember">{opportunityWorkflowRunsError}</p>
                                        ) : (opportunityWorkflowRuns?.length ?? 0) > 0 ? (
                                            <div className="mt-2 divide-y divide-alloy-stone/10 rounded-lg border border-alloy-stone/15 bg-white">
                                                {(opportunityWorkflowRuns ?? []).map((r) => {
                                                    const bad = r.status === "failed" || !!r.has_failed_action;
                                                    return (
                                                        <a
                                                            key={r.id}
                                                            href={`/adminV2/workflows?run=${encodeURIComponent(r.id)}`}
                                                            className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-alloy-stone/10"
                                                        >
                                                            <div className="min-w-0">
                                                                <div className="truncate font-semibold text-alloy-forge">
                                                                    {r.workflow_name ?? r.workflow_id}
                                                                </div>
                                                                <div className="truncate text-[12px] text-alloy-forge/60">
                                                                    {displayDateTime(r.started_at)} ·{" "}
                                                                    <span className={bad ? "text-alloy-ember font-semibold" : ""}>
                                                                        {bad ? "Failed" : r.status}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="shrink-0 text-[12px] font-semibold text-alloy-blue">View</div>
                                                        </a>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-alloy-midnight/60">No workflow runs recorded.</p>
                                        )}
                                    </section>
                                    <section>
                                        <h3 className={DRAWER_SECTION_HEADER_CLASS}>Record</h3>
                                        <ul className="space-y-1.5 text-sm text-alloy-forge/90">
                                            {data?.created_at != null ? <li>Created: {displayDateTime(String(data.created_at))}</li> : null}
                                            {data?.updated_at != null ? <li>Updated: {displayDateTime(String(data.updated_at))}</li> : null}
                                        </ul>
                                        {!data?.created_at && !data?.updated_at && (
                                            <p className="text-sm text-alloy-midnight/60">No record timestamps.</p>
                                        )}
                                    </section>
                                </div>
                            ) : drawer.type === "jobs" && drawer.id && drawer.id !== "new" ? (
                                <div className="space-y-4">
                                    {isJobDrawerV2 ? (
                                        <JobDrawerV2TimelineCard data={(data ?? null) as Record<string, unknown> | null} />
                                    ) : (
                                        <section>
                                            <h3 className={DRAWER_SECTION_HEADER_CLASS}>Timeline</h3>
                                            <ul className="space-y-1.5 text-sm text-alloy-forge/90">
                                                {data?.created_at != null ? <li>Job created: {displayDateTime(String(data.created_at))}</li> : null}
                                                {data?.updated_at != null ? <li>Updated: {displayDateTime(String(data.updated_at))}</li> : null}
                                            </ul>
                                            {!data?.created_at && !data?.updated_at && (
                                                <p className="text-sm text-alloy-midnight/60">No activity recorded.</p>
                                            )}
                                        </section>
                                    )}
                                </div>
                            ) : drawer.type === "discount_redemptions" && drawer.id ? (
                                <div className="space-y-4">
                                    <section>
                                        <h3 className={DRAWER_SECTION_HEADER_CLASS}>Timeline</h3>
                                        <ul className="space-y-1.5 text-sm text-alloy-forge/90">
                                            {data?.created_at != null ? (
                                                <li>Redemption created: {displayDateTime(String(data.created_at))}</li>
                                            ) : null}
                                        </ul>
                                        {!data?.created_at && (
                                            <p className="text-sm text-alloy-midnight/60">No activity recorded.</p>
                                        )}
                                    </section>
                                </div>
                            ) : drawer.type === "service_offerings" && drawer.id ? (
                                <div className="space-y-4">
                                    <section>
                                        <h3 className={DRAWER_SECTION_HEADER_CLASS}>Timeline</h3>
                                        <ul className="space-y-1.5 text-sm text-alloy-forge/90">
                                            {data?.created_at != null ? <li>Created: {displayDateTime(String(data.created_at))}</li> : null}
                                            {data?.updated_at != null ? <li>Updated: {displayDateTime(String(data.updated_at))}</li> : null}
                                        </ul>
                                        {!data?.created_at && !data?.updated_at && (
                                            <p className="text-sm text-alloy-midnight/60">No activity recorded.</p>
                                        )}
                                    </section>
                                </div>
                            ) : drawer.type === "service_plan_templates" && drawer.id ? (
                                <div className="space-y-4">
                                    <section>
                                        <h3 className={DRAWER_SECTION_HEADER_CLASS}>Timeline</h3>
                                        <ul className="space-y-1.5 text-sm text-alloy-forge/90">
                                            {data?.created_at != null ? <li>Created: {displayDateTime(String(data.created_at))}</li> : null}
                                            {data?.updated_at != null ? <li>Updated: {displayDateTime(String(data.updated_at))}</li> : null}
                                        </ul>
                                        {!data?.created_at && !data?.updated_at && (
                                            <p className="text-sm text-alloy-midnight/60">No activity recorded.</p>
                                        )}
                                    </section>
                                </div>
                            ) : drawer.type === "addons" && drawer.id ? (
                                <div className="space-y-4">
                                    <section>
                                        <h3 className={DRAWER_SECTION_HEADER_CLASS}>Timeline</h3>
                                        <ul className="space-y-1.5 text-sm text-alloy-forge/90">
                                            {data?.created_at != null ? <li>Created: {displayDateTime(String(data.created_at))}</li> : null}
                                            {data?.updated_at != null ? <li>Updated: {displayDateTime(String(data.updated_at))}</li> : null}
                                        </ul>
                                        {!data?.created_at && !data?.updated_at && (
                                            <p className="text-sm text-alloy-midnight/60">No activity recorded.</p>
                                        )}
                                    </section>
                                </div>
                            ) : (
                                <>
                                    <h3 className={DRAWER_SECTION_HEADER_CLASS}>IDs &amp; raw fields</h3>
                                    {["id", "created_at", "updated_at", "external_id", "stripe_customer_id", "default_payment_method_id", "customer_id", "primary_contact_id", "opportunity_id", "job_id", "schedule_id", "vertical_id", "pipeline_stage_id", "job_status_id", "vendor_id", "assigned_vendor_id"].map((key) => {
                                    const val = data[key];
                                    if (val === undefined) return null;
                                    return <div key={key} className="text-sm"><span className="text-alloy-midnight/60">{key}:</span> <span className="font-mono text-alloy-midnight/90">{typeof val === "string" && val.length > 24 ? val.slice(0, 8) + "…" : String(val)}</span></div>;
                                    })}
                                </>
                            )}
                        </div>
                    )}
                    {drawerTab === "rrs_overview" &&
                        drawer.type === "jobs" &&
                        !isJobDrawerV2 &&
                        drawer.id &&
                        drawer.id !== "new" &&
                        !(data as { _create?: boolean })?._create && (
                            <div className="space-y-0 pt-5" data-entity-drawer-rrs-overview>
                                <JobRrsOverviewTab jobId={drawer.id} variant="legacy" />
                            </div>
                        )}
                    {drawerTab === "overview" &&
                        drawer.type === "opportunities" &&
                        drawer.id &&
                        drawer.id !== "new" &&
                        !(data as { _create?: boolean })?._create && (
                            <div className="mb-4 space-y-3">
                                <OpportunityPacketReviewOverview
                                    opportunityId={drawer.id}
                                    canMutate={!!canMutate}
                                    onInvalidate={() => {
                                        setOpportunityRelatedData(null);
                                        setOpportunityActivitySignalNonce((n) => n + 1);
                                    }}
                                />
                                <p className="rounded-md border border-alloy-stone/25 bg-alloy-stone/[0.04] px-3 py-2 text-[11px] leading-relaxed text-alloy-midnight/65">
                                    Send new packets from the toolbar (
                                    <span className="font-medium text-alloy-midnight/75">Send enrollment packet</span>
                                    ).{" "}
                                    <button
                                        type="button"
                                        className="font-semibold text-alloy-blue hover:underline"
                                        onClick={() => setDrawerTab("activity")}
                                    >
                                        Activity
                                    </button>
                                    {" · "}
                                    <button
                                        type="button"
                                        className="font-semibold text-alloy-blue hover:underline"
                                        onClick={() => setDrawerTab("documents")}
                                    >
                                        Documents
                                    </button>{" "}
                                    list launches and linked files.
                                </p>
                            </div>
                        )}
                    {drawerTab === "overview" &&
                        drawer.type === "opportunities" &&
                        drawer.id &&
                        drawer.id !== "new" &&
                        !(data as { _create?: boolean })?._create &&
                        !useConfigDrivenOverview &&
                        overviewData && (
                            <section
                                className="mb-3 rounded-xl border border-admin-border bg-white/80 px-2.5 py-2.5 shadow-sm"
                                data-drawer-section="operational_attention_detail_legacy"
                            >
                                <OperationalAttentionDrawerSection
                                    overviewData={overviewData as Record<string, unknown>}
                                />
                            </section>
                        )}
                    {drawerTab === "overview" && useConfigDrivenOverview && presentationType && (
                        isJobDrawerV2 && drawer.type === "jobs" ? (
                            showJobRecordModalV2 ? (
                                <JobRecordModalV2
                                    record={(entityDrawerOverviewData ?? null) as Record<string, unknown> | null}
                                    formData={formData}
                                    setFormData={setFormData}
                                    canMutate={!!canMutate}
                                    statusDefs={statusDefsForDrawer}
                                    onBlurSave={() => {
                                        if (drawer.type === "jobs" && jobFormDirty) saveEdit();
                                        else if (nonJobFormDirty) saveEdit();
                                    }}
                                    jobVendorOptions={jobVendorsForAssign}
                                    jobWorkUnitOptions={jobWorkUnitOptions}
                                    jobContactOptions={jobContactOptions}
                                    jobLocationOptions={jobLocationOptions}
                                    primaryContactDisabled={primaryContactDisabled}
                                    firstSchedule={jobSchedules[0] ?? null}
                                    rescheduleFormActive={!!rescheduleForm}
                                    openReschedule={openReschedule}
                                    openJobLocationChange={openJobLocationChange}
                                    openDrawer={openEntityFromJobRecord}
                                    presentationType={presentationType}
                                    entityDrawerOverviewData={entityDrawerOverviewData}
                                    customSectionContent={overviewCustomContent}
                                    selectOptionsByFieldKey={overviewSelectOptionsByFieldKey}
                                    getStatusLabel={getStatusLabel}
                                    isEditing={isEditing || drawer.type === "jobs"}
                                    recordChromeLayout={recordChromeJob.layout}
                                />
                            ) : (
                                <div
                                    className="space-y-2 [&_section[data-entity-section]]:mb-2 [&_[data-entity-drawer-overview]]:pt-1"
                                    data-adminv2-job-record-overview="true"
                                >
                                    <JobRecordPrimaryPanel
                                        record={(entityDrawerOverviewData ?? null) as Record<string, unknown> | null}
                                        formData={formData}
                                        setFormData={setFormData}
                                        canMutate={!!canMutate}
                                        statusDefs={statusDefsForDrawer}
                                        onBlur={() => {
                                            if (drawer.type === "jobs" && jobFormDirty) saveEdit();
                                        }}
                                        jobCustomerOptions={jobCustomerOptions}
                                        jobVendorOptions={jobVendorsForAssign}
                                        jobContactOptions={jobContactOptions}
                                        jobLocationOptions={jobLocationOptions}
                                        primaryContactDisabled={primaryContactDisabled}
                                        firstSchedule={jobSchedules[0] ?? null}
                                        rescheduleFormActive={!!rescheduleForm}
                                        openReschedule={openReschedule}
                                        openJobLocationChange={openJobLocationChange}
                                        openDrawer={openEntityFromJobRecord}
                                    />
                                    <div className="adminv2-job-record-fielddeck">
                                        <EntityDrawerOverview
                                            entityType={presentationType}
                                            data={entityDrawerOverviewData}
                                            customSectionContent={overviewCustomContent}
                                            overviewSectionsOverride={JOB_DRAWER_V2_OVERVIEW_SECTIONS}
                                            selectOptionsByFieldKey={overviewSelectOptionsByFieldKey}
                                            isEditing={isEditing || drawer.type === "jobs"}
                                            formData={formData}
                                            onFieldChange={(key, value) => {
                                                setFormData((prev) => ({ ...prev, [key]: value }));
                                            }}
                                            onBlur={() => {
                                                if (drawer.type === "jobs" && jobFormDirty) saveEdit();
                                                else if (nonJobFormDirty) saveEdit();
                                            }}
                                            canEdit={!!canMutate}
                                            statusDefs={statusDefsForDrawer}
                                            getStatusLabel={getStatusLabel}
                                            onOpenDrawer={(type, id) => openEntityFromJobRecord(type as AdminDrawerEntityType, id)}
                                        />
                                    </div>
                                </div>
                            )
                        ) : showScheduleRecordModalV2 ? (
                            <ScheduleRecordModalV2
                                entityType={presentationType}
                                data={entityDrawerOverviewData}
                                customSectionContent={overviewCustomContent}
                                overviewSectionsOverride={configDrivenOverviewSections.length > 0 ? configDrivenOverviewSections : undefined}
                                scheduleOverviewRows={recordChromeSchedule.layout?.config_json?.overview_rows}
                                scheduleRecordLayout={recordChromeSchedule.layout?.config_json ?? null}
                                selectOptionsByFieldKey={overviewSelectOptionsByFieldKey}
                                isEditing={isEditing}
                                formData={formData}
                                onFieldChange={(key, value) => {
                                    setFormData((prev) => ({ ...prev, [key]: value }));
                                }}
                                onBlur={() => { if (drawer.type === "jobs" && jobFormDirty) saveEdit(); else if (nonJobFormDirty) saveEdit(); }}
                                canEdit={!!canMutate}
                                statusDefs={statusDefsForDrawer}
                                getStatusLabel={getStatusLabel}
                                onOpenDrawer={(type, id) => openDrawer({ type: type as AdminDrawerEntityType, id })}
                            />
                        ) : (
                            <>
                                {drawer.type === "opportunities" && overviewData && !(overviewData as { _create?: boolean })._create ? (
                                    <>
                                        <section
                                            className={
                                                opportunityInquiryWorkflowDrawer
                                                    ? "mb-3"
                                                    : "rounded-xl border border-admin-border bg-white/80 px-2.5 py-2 mb-2 shadow-sm"
                                            }
                                            data-opportunity-record-snapshot="true"
                                        >
                                            {(() => {
                                                const d = overviewData as Record<string, unknown>;
                                                const ident =
                                                    ((d as { _identity?: unknown })._identity as
                                                        | {
                                                              household?: { id: string; label: string } | null;
                                                              primary_person?: { id: string; label: string; email?: string | null; phone?: string | null; role_label?: string | null } | null;
                                                              primary_contact?: { id: string; label: string; email?: string | null; phone?: string | null; role_label?: string | null } | null;
                                                              primary_child?: { id: string; display_name: string; relationship_label?: string | null } | null;
                                                              inquiry?: { title?: string | null; lines?: { key: string; label: string; value: string }[] } | null;
                                                          }
                                                        | null) ?? null;
                                                const household = String(ident?.household?.label ?? "").trim();
                                                const primaryPerson = String(ident?.primary_person?.label ?? "").trim();
                                                const primaryPersonRole = String(ident?.primary_person?.role_label ?? "").trim();
                                                const primaryContact = String(ident?.primary_contact?.label ?? "").trim();
                                                const comm = ident?.primary_contact ?? ident?.primary_person ?? null;
                                                const commRoleLabel = String((comm as { role_label?: string | null } | null)?.role_label ?? "").trim();
                                                const commName = String((comm as { label?: string | null } | null)?.label ?? "").trim();
                                                const commEmail = String((comm as { email?: string | null } | null)?.email ?? "").trim();
                                                const commPhone = String((comm as { phone?: string | null } | null)?.phone ?? "").trim();
                                                const primaryContactLabelLine = String(commName || primaryContact || primaryPerson || "").trim();
                                                const primaryContactNamePending =
                                                    opportunityFullHydratePending && !primaryContactLabelLine;
                                                const primaryContactChannelsPending =
                                                    opportunityFullHydratePending &&
                                                    !!primaryContactLabelLine &&
                                                    (!commPhone || !commEmail);
                                                const childName = String(ident?.primary_child?.display_name ?? "").trim();
                                                const childRel = String(ident?.primary_child?.relationship_label ?? "").trim();
                                                const inquiryTitle =
                                                    String(ident?.inquiry?.title ?? "").trim() || "";
                                                const stageLabel = (() => {
                                                    const sk = String(formData.status_key ?? d.status_key ?? "").trim();
                                                    if (!sk) return "—";
                                                    const hit = (statusDefsForDrawer ?? []).find(
                                                        (s) => String(s.status_key ?? "").trim() === sk
                                                    );
                                                    const label = hit ? String(hit.status_label ?? "").trim() : "";
                                                    return label || sk;
                                                })();
                                                const nextStep = d._lifecycle_next_step as { title?: string; lines?: string[] } | undefined;
                                                const nextStepText = (nextStep?.lines ?? [])
                                                    .map((l) => String(l).trim())
                                                    .filter(Boolean)
                                                    .slice(0, 2)
                                                    .join(" · ");
                                                const nextStepTitle = String(nextStep?.title ?? "").trim();
                                                const nextStepIsWhatsNext = nextStepTitle.toLowerCase() === "what’s next" || nextStepTitle.toLowerCase() === "what's next";
                                                const currentStatus = String(formData.status_key ?? d.status_key ?? "").trim();
                                                let statusOptions =
                                                    statusDefsForDrawer
                                                        ?.filter((s) => s.is_active !== false)
                                                        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) ?? [];
                                                if (currentStatus && !statusOptions.some((s) => s.status_key === currentStatus)) {
                                                    statusOptions = [
                                                        ...statusOptions,
                                                        { status_key: currentStatus, status_label: currentStatus, sort_order: 9999, is_active: true },
                                                    ];
                                                }

                                                const tinyLabel = oppInqEyebrow;
                                                const strong = oppInqDisplayName;
                                                const openPrimaryContactRecord = () => {
                                                    const pid = String(d.primary_person_id ?? "").trim();
                                                    if (pid) openDrawer({ type: "persons", id: pid });
                                                    // Enrollment doctrine: do not use legacy contacts for inquiry workflow drawer.
                                                };

                                                if (opportunityInquiryWorkflowDrawer) {
                                                    const householdId =
                                                        ident?.household?.id ?? (String(d.customer_id ?? "").trim() || null);
                                                    const familyContactsInSummary =
                                                        !!drawer.id &&
                                                        drawer.id !== "new" &&
                                                        recordOpportunityDrawerLayoutIncludesSection(
                                                            (recordChromeOpportunity.layout?.config_json ?? null) as RecordLayoutConfigJson | null,
                                                            "family_contacts"
                                                        );

                                                    return (
                                                        <div
                                                            className="rounded-xl border border-alloy-stone/15 border-l-[3px] border-l-[rgb(0,162,131)] bg-gradient-to-br from-emerald-50/45 via-white to-white px-2.5 py-2.5 shadow-md ring-1 ring-alloy-stone/10"
                                                            data-opportunity-inquiry-summary="true"
                                                        >
                                                            <div className="flex flex-wrap items-end justify-between gap-2 border-b border-alloy-stone/12 pb-2">
                                                                <span className={tinyLabel}>Inquiry summary</span>
                                                                {stageLabel && stageLabel !== "—" ? (
                                                                    <span className="text-[10px] font-medium tracking-[0.08em] text-alloy-midnight/40">
                                                                        Status · <span className="text-alloy-midnight/60">{stageLabel}</span>
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                            <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2 lg:items-stretch lg:gap-3">
                                                                <div className={`${oppInqInnerCard} min-h-0`}>
                                                                    <div className={tinyLabel}>Family & contacts</div>
                                                                    {familyContactsInSummary ? (
                                                                        <div className="mt-1 flex min-h-0 flex-1 flex-col">
                                                                            <FamilyContactsPanel
                                                                                variant="summary"
                                                                                opportunityId={drawer.id}
                                                                                record={d}
                                                                                canMutate={!!canMutate}
                                                                                sectionKey="family_contacts"
                                                                                departmentId={opportunityDrawerDepartmentId || null}
                                                                                workUnitId={String(d.work_unit_id ?? "").trim() || null}
                                                                                router={router}
                                                                                openDrawer={openDrawer}
                                                                                recordHydrationPending={false}
                                                                                opportunityFullHydratePending={opportunityFullHydratePending}
                                                                                opportunityFullHydrateApplied={opportunityFullHydrateApplied}
                                                                                opportunityFullHydrateFailed={opportunityFullHydrateFailed}
                                                                                openForm={({ form_key, action }) => {
                                                                                    setActionFormState({
                                                                                        form_key,
                                                                                        action,
                                                                                        executeContext: {
                                                                                            surface: "record_section",
                                                                                            section_key: "family_contacts",
                                                                                        },
                                                                                    });
                                                                                }}
                                                                                excludeActionKeys={opportunityRegistryHeaderActionKeys}
                                                                                refreshKey={relatedPeopleRefreshKey}
                                                                                onRegistryApplied={() => {
                                                                                    setRelatedPeopleRefreshKey((n) => n + 1);
                                                                                    void refetch();
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    ) : (
                                                                        <>
                                                                            {household ? (
                                                                                householdId ? (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => openDrawer({ type: "customers", id: householdId })}
                                                                                        className={`mt-1 block w-full truncate text-left ${oppInqNameLink}`}
                                                                                    >
                                                                                        {household}
                                                                                    </button>
                                                                                ) : (
                                                                                    <div className={`mt-1 ${oppInqDisplayName}`}>{household}</div>
                                                                                )
                                                                            ) : opportunityFullHydrateFailed ? (
                                                                                <div className={`mt-1 ${oppInqMutedEmpty}`}>
                                                                                    Household could not be confirmed — try refreshing the drawer.
                                                                                </div>
                                                                            ) : opportunityFullHydratePending ? (
                                                                                <div
                                                                                    className="mt-1 h-9 w-full max-w-[14rem] skeleton-pulse rounded-md bg-alloy-stone/15"
                                                                                    aria-hidden
                                                                                />
                                                                            ) : (
                                                                                <div className={`mt-1 ${oppInqMutedEmpty}`}>No household on file.</div>
                                                                            )}
                                                                            <div className={`${tinyLabel} mt-2.5`}>
                                                                                {commRoleLabel ? `Primary contact (${commRoleLabel})` : "Primary contact"}
                                                                            </div>
                                                                            {opportunityFullHydrateFailed && !primaryContactLabelLine ? (
                                                                                <div className={`mt-0.5 ${oppInqMutedEmpty}`}>
                                                                                    Primary contact could not be loaded — try refreshing the drawer.
                                                                                </div>
                                                                            ) : primaryContactNamePending ? (
                                                                                <div
                                                                                    className="mt-0.5 h-9 w-full max-w-[14rem] skeleton-pulse rounded-md bg-alloy-stone/15"
                                                                                    aria-hidden
                                                                                />
                                                                            ) : (
                                                                                <>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={openPrimaryContactRecord}
                                                                                        className={`mt-0.5 block w-full truncate text-left ${oppInqNameLink}`}
                                                                                    >
                                                                                        {primaryContactLabelLine || "—"}
                                                                                    </button>
                                                                                    {primaryContactChannelsPending ? (
                                                                                        <div
                                                                                            className="mt-1 flex min-h-[1.875rem] items-center"
                                                                                            aria-hidden
                                                                                        >
                                                                                            <div className="h-3 w-full max-w-[18rem] skeleton-pulse rounded bg-alloy-stone/11" />
                                                                                        </div>
                                                                                    ) : (
                                                                                        <div className="mt-1 min-h-[1.875rem]">
                                                                                            <OppInquiryContactChannelsRow phone={commPhone} email={commEmail} />
                                                                                        </div>
                                                                                    )}
                                                                                </>
                                                                            )}
                                                                        </>
                                                                    )}
                                                                </div>
                                                                <div className={`${oppInqInnerCard} min-h-[11.5rem] min-w-0`}>
                                                                    <div className={tinyLabel}>What matters now</div>
                                                                    <div className="mt-1.5 flex min-h-0 flex-1 flex-col space-y-2">
                                                                        <div>
                                                                            <div className={tinyLabel}>Desired start</div>
                                                                            <input
                                                                                type="date"
                                                                                value={toDateInputValue(formData.desired_start_date ?? d.desired_start_date)}
                                                                                onChange={(e) =>
                                                                                    setFormData((prev) => ({
                                                                                        ...prev,
                                                                                        desired_start_date: e.target.value || null,
                                                                                    }))
                                                                                }
                                                                                onBlur={() => {
                                                                                    if (nonJobFormDirty) saveEdit();
                                                                                }}
                                                                                disabled={!canMutate}
                                                                                className={oppInqFieldInput}
                                                                            />
                                                                        </div>
                                                                        <div>
                                                                            {drawer.id && drawer.id !== "new" ? (
                                                                                <OpportunityInquiryTourDateBlock
                                                                                    opportunityId={drawer.id}
                                                                                    locationId={String((d.location_id as string | null | undefined) ?? "").trim()}
                                                                                    metadata={d.metadata}
                                                                                    viewerTimezone={viewerTz}
                                                                                    canMutate={!!canMutate}
                                                                                    onRefresh={refetch}
                                                                                    labelClassName={tinyLabel}
                                                                                    readonlyFieldClassName={oppInqReadonlyField}
                                                                                />
                                                                            ) : (
                                                                                <>
                                                                                    <div className={tinyLabel}>Tour date</div>
                                                                                    <div
                                                                                        className={`${oppInqReadonlyField}`}
                                                                                        aria-label="Tour date (managed by actions)"
                                                                                    >
                                                                                        {(() => {
                                                                                            const md = (d.metadata ?? null) as Record<string, unknown> | null;
                                                                                            const fmt = formatTourDateTime(md?.tour_date, md?.tour_time, {
                                                                                                displayTimeZoneIana: viewerTz,
                                                                                            });
                                                                                            return fmt.display;
                                                                                        })()}
                                                                                    </div>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    {/* Next step is now rendered inline in the drawer header (informational). */}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                }

                                                return (
                                                    <div className="space-y-2">
                                                        <div className="min-w-0">
                                                            <div className="text-[10px] font-semibold tracking-[0.12em] text-alloy-midnight/45">
                                                                Opportunity
                                                            </div>
                                                            <div className={`mt-0.5 ${strong} truncate`}>
                                                                {childName ? (
                                                                    <>
                                                                        Child: {childName}
                                                                        {childRel ? <span className="text-alloy-midnight/55"> ({childRel})</span> : null}
                                                                    </>
                                                                ) : (
                                                                    inquiryTitle || "—"
                                                                )}
                                                            </div>
                                                            <div className="mt-0.5 text-[12px] font-medium text-alloy-midnight/70 truncate">
                                                                {[
                                                                    household ? `Household: ${household}` : null,
                                                                    primaryPerson ? `${primaryPersonRole || "Primary person"}: ${primaryPerson}` : null,
                                                                    !primaryPerson && primaryContact ? `Primary contact: ${primaryContact}` : null,
                                                                ]
                                                                    .filter(Boolean)
                                                                    .join(" · ") || "—"}
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                            <div className="min-w-0">
                                                                <div className={tinyLabel}>Status</div>
                                                                <select
                                                                    value={currentStatus}
                                                                    onChange={(e) =>
                                                                        setFormData((prev) => ({
                                                                            ...prev,
                                                                            status_key: e.target.value || null,
                                                                        }))
                                                                    }
                                                                    onBlur={() => {
                                                                        if (nonJobFormDirty) saveEdit();
                                                                    }}
                                                                    disabled={!canMutate}
                                                                    className="w-full min-w-0 rounded-lg border border-admin-border bg-white px-2 py-1.5 text-[13px] font-semibold text-alloy-forge focus:border-alloy-blue focus:outline-none focus:ring-1 focus:ring-alloy-blue/20 disabled:opacity-60"
                                                                    aria-label="Opportunity status"
                                                                >
                                                                    <option value="">— None —</option>
                                                                    {statusOptions.map((s) => (
                                                                        <option key={s.status_key} value={s.status_key}>
                                                                            {s.status_label ?? s.status_key}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className={tinyLabel}>{commRoleLabel || ""}</div>
                                                                <div className="rounded-lg border border-alloy-stone/25 bg-white px-2 py-1.5">
                                                                    {opportunityFullHydrateFailed &&
                                                                    !(commName || primaryContact || primaryPerson || household).trim() ? (
                                                                        <div className="text-[12px] text-alloy-midnight/55">
                                                                            Contact summary unavailable — try refreshing the drawer.
                                                                        </div>
                                                                    ) : opportunityFullHydratePending &&
                                                                    !(commName || primaryContact || primaryPerson || household).trim() ? (
                                                                        <div
                                                                            className="h-8 w-full max-w-[14rem] skeleton-pulse rounded-md bg-alloy-stone/15"
                                                                            aria-hidden
                                                                        />
                                                                    ) : (
                                                                        <>
                                                                            <div className="text-[13px] font-semibold text-alloy-midnight/85 truncate">
                                                                                {commName || primaryContact || primaryPerson || household || "—"}
                                                                            </div>
                                                                            {opportunityFullHydratePending &&
                                                                            !!(commName || primaryContact || primaryPerson || household).trim() &&
                                                                            (!commPhone || !commEmail) ? (
                                                                                <div
                                                                                    className="mt-1 flex min-h-[1.875rem] items-center"
                                                                                    aria-hidden
                                                                                >
                                                                                    <div className="h-3 w-full max-w-[18rem] skeleton-pulse rounded bg-alloy-stone/11" />
                                                                                </div>
                                                                            ) : (
                                                                                <div className="mt-0.5 min-h-[1.875rem]">
                                                                                    <OppInquiryContactChannelsRow
                                                                                        phone={commPhone || null}
                                                                                        email={commEmail || null}
                                                                                    />
                                                                                </div>
                                                                            )}
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </section>
                                        {/* Enrollment direction: lifecycle is not a drawer section. */}
                                    </>
                                ) : null}
                                {drawer.type === "opportunities" && !opportunityInquiryWorkflowDrawer ? opportunityQuoteSummaryNode : null}
                                {drawer.type === "opportunities" && !opportunityInquiryWorkflowDrawer ? opportunityQuoteIntakeNode : null}
                                {drawer.type === "opportunities" &&
                                    overviewData &&
                                    !(overviewData as { _create?: boolean })._create &&
                                    drawer.id &&
                                    drawer.id !== "new" && (
                                        <section
                                            className="mb-3 rounded-xl border border-admin-border bg-white/80 px-2.5 py-2.5 shadow-sm"
                                            data-drawer-section="operational_attention_detail"
                                        >
                                            <OperationalAttentionDrawerSection
                                                overviewData={overviewData as Record<string, unknown>}
                                            />
                                        </section>
                                    )}
                                <EntityDrawerOverview
                                    entityType={presentationType}
                                    data={entityDrawerOverviewData}
                                    customSectionContent={overviewCustomContent}
                                    customSectionHeaderRight={overviewSectionHeaderRight as any}
                                    overviewSectionsOverride={
                                        opportunityInquiryWorkflowDrawer
                                            ? configDrivenOverviewSections
                                            : configDrivenOverviewSections.length > 0
                                              ? configDrivenOverviewSections
                                              : undefined
                                    }
                                    scheduleOverviewRows={
                                        drawer.type === "schedules"
                                            ? recordChromeSchedule.layout?.config_json?.overview_rows
                                            : undefined
                                    }
                                    scheduleRecordLayout={
                                        drawer.type === "schedules" ? (recordChromeSchedule.layout?.config_json ?? null) : undefined
                                    }
                                    selectOptionsByFieldKey={overviewSelectOptionsByFieldKey}
                                    isEditing={isEditing}
                                    formData={formData}
                                    onFieldChange={(key, value) => {
                                        setFormData((prev) => ({ ...prev, [key]: value }));
                                    }}
                                    onBlur={() => { if (drawer.type === "jobs" && jobFormDirty) saveEdit(); else if (nonJobFormDirty) saveEdit(); }}
                                    canEdit={!!canMutate}
                                    statusDefs={statusDefsForDrawer}
                                    getStatusLabel={getStatusLabel}
                                    onOpenDrawer={(type, id) => openDrawer({ type: type as AdminDrawerEntityType, id })}
                                    sectionSurface={opportunityInquiryWorkflowDrawer ? "premium" : "default"}
                                />
                                {drawer.type === "opportunities" &&
                                    !opportunityInquiryWorkflowDrawer &&
                                    drawer.id &&
                                    drawer.id !== "new" &&
                                    !(overviewData as { _create?: boolean })?._create && (
                                        <div className="mb-4 rounded-xl border border-admin-border bg-white/80 px-2.5 py-2.5 shadow-sm">
                                            <CommunicationsDrawerSection
                                                key={drawer.id}
                                                embedded
                                                apiEntityType="opportunities"
                                                entityId={drawer.id}
                                                active
                                                opportunityComposeContext={opportunityCommunicationsComposeContext}
                                            />
                                        </div>
                                    )}
                            </>
                        )
                    )}
                    {drawerTab === "overview" && !useConfigDrivenOverview && (
                        <>
                            {drawer.type === "persons" && (data as { _create?: boolean })?._create ? (
                                <div className="space-y-4">
                                    {personCreateError && <p className="text-sm text-red-600">{personCreateError}</p>}
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">First name</label><input value={String(personCreateForm.first_name ?? "")} onChange={(e) => setPersonCreateForm((f) => ({ ...f, first_name: e.target.value }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" placeholder="Optional" /></div>
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Last name</label><input value={String(personCreateForm.last_name ?? "")} onChange={(e) => setPersonCreateForm((f) => ({ ...f, last_name: e.target.value }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" placeholder="Optional" /></div>
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Email</label><input type="email" value={String(personCreateForm.email ?? "")} onChange={(e) => setPersonCreateForm((f) => ({ ...f, email: e.target.value }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" placeholder="Optional" /></div>
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Phone</label><input value={String(personCreateForm.phone ?? "")} onChange={(e) => setPersonCreateForm((f) => ({ ...f, phone: e.target.value }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" placeholder="Optional" /></div>
                                    <div className="flex gap-2 pt-2">
                                        <button type="button" disabled={personCreateSaving || !canMutate} onClick={async () => {
                                            setPersonCreateSaving(true); setPersonCreateError(null);
                                            try {
                                                const res = await fetch("/api/admin/persons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ first_name: personCreateForm.first_name?.trim() || null, last_name: personCreateForm.last_name?.trim() || null, email: personCreateForm.email?.trim() || null, phone: personCreateForm.phone?.trim() || null }) });
                                                const json = await res.json().catch(() => ({}));
                                                if (!res.ok) throw new Error((json as { error?: string }).error ?? "Create failed");
                                                const newId = (json as { id?: string }).id;
                                                if (newId) { openDrawer({ type: "persons", id: newId }); refetch(); }
                                                else setPersonCreateError("No id returned");
                                            } catch (e: unknown) { setPersonCreateError((e as Error).message); }
                                            setPersonCreateSaving(false);
                                        }} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md disabled:opacity-50">{personCreateSaving ? "Creating…" : "Create person"}</button>
                                        <button type="button" onClick={closeDrawer} className="px-3 py-1.5 text-sm border rounded-md">Cancel</button>
                                    </div>
                                </div>
                            ) : drawer.type === "contacts" && (data as { _create?: boolean })?._create ? (
                                <div className="space-y-4">
                                    {contactCreateError && <p className="text-sm text-red-600">{contactCreateError}</p>}
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">First name</label><input value={String(formData.first_name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, first_name: e.target.value }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" /></div>
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Last name</label><input value={String(formData.last_name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, last_name: e.target.value }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" /></div>
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Email</label><input type="email" value={String(formData.email ?? "")} onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" /></div>
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Phone</label><input value={String(formData.phone ?? "")} onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" /></div>
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Company name</label><input value={String(formData.company_name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, company_name: e.target.value }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" /></div>
                                    {statusDefsLoading ? <div className="text-sm text-alloy-midnight/60">Status: Loading…</div> : (
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Status</label><select value={String(formData.status_key ?? "")} onChange={(e) => setFormData((f) => ({ ...f, status_key: e.target.value || "" }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60"><option value="">— None —</option>{statusDefsForDrawer.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order).map((s) => <option key={s.status_key} value={s.status_key}>{s.status_label ?? s.status_key}</option>)}</select></div>
                                    )}
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Notes</label><textarea value={String(formData.notes ?? "")} onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))} rows={2} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" /></div>
                                    <div className="flex gap-2 pt-2">
                                        <button type="button" disabled={contactCreateSaving || !canMutate} onClick={async () => {
                                            setContactCreateSaving(true); setContactCreateError(null);
                                            try {
                                                const res = await fetch("/api/admin/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ first_name: (formData.first_name as string)?.trim() || null, last_name: (formData.last_name as string)?.trim() || null, email: (formData.email as string)?.trim() || null, phone: (formData.phone as string)?.trim() || null, company_name: (formData.company_name as string)?.trim() || null, notes: (formData.notes as string)?.trim() || null, status: (formData.status as string) || null, status_key: (formData.status_key as string)?.trim() || null, customer_id: (formData.customer_id as string)?.trim() || null, vendor_id: (formData.vendor_id as string)?.trim() || null, vendor_contact_role: (formData.vendor_contact_role as string)?.trim() || null }) });
                                                const json = await res.json().catch(() => ({}));
                                                if (!res.ok) throw new Error((json as { error?: string }).error ?? "Create failed");
                                                const newId = (json as { id?: string }).id;
                                                if (newId) { openDrawer({ type: "contacts", id: newId }); router.refresh(); }
                                                else setContactCreateError("No id returned");
                                            } catch (e: unknown) { setContactCreateError((e as Error).message); }
                                            setContactCreateSaving(false);
                                        }} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md disabled:opacity-50">{contactCreateSaving ? "Creating…" : "Create"}</button>
                                        <button type="button" onClick={closeDrawer} className="px-3 py-1.5 text-sm border rounded-md">Cancel</button>
                                    </div>
                                </div>
                            ) : drawer.type === "contacts" && data && (
                                <>
                                    <div className="space-y-4">
                                        <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">First name</label><input value={String(formData.first_name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, first_name: e.target.value }))} onBlur={() => { if (drawer.type === "contacts" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS} /></div>
                                        <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Last name</label><input value={String(formData.last_name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, last_name: e.target.value }))} onBlur={() => { if (drawer.type === "contacts" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS} /></div>
                                        <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Email</label><input type="email" value={String(formData.email ?? "")} onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))} onBlur={() => { if (drawer.type === "contacts" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS} /></div>
                                        <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Phone</label><input value={String(formData.phone ?? "")} onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))} onBlur={() => { if (drawer.type === "contacts" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS} /></div>
                                        <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Company name</label><input value={String(formData.company_name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, company_name: e.target.value }))} onBlur={() => { if (drawer.type === "contacts" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS} /></div>
                                            {statusDefsLoading ? <div className="text-sm text-alloy-midnight/60">Status: Loading…</div> : (
                                            <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Status</label><select value={String(formData.status_key ?? "")} onChange={(e) => setFormData((f) => ({ ...f, status_key: e.target.value || "" }))} onBlur={() => { if (drawer.type === "contacts" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS}><option value="">— None —</option>{statusDefsForDrawer.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order).map((s) => <option key={s.status_key} value={s.status_key}>{s.status_label ?? s.status_key}</option>)}</select></div>
                                        )}
                                        <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Notes</label><textarea value={String(formData.notes ?? "")} onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))} onBlur={() => { if (drawer.type === "contacts" && nonJobFormDirty) saveEdit(); }} rows={2} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS} /></div>
                                            </div>
                                            <Field label="Archived" value={data.archived_at ? "Yes" : "No"} />
                                    <DrawerLinkWithName label="Customer" id={data?.customer_id != null ? String(data.customer_id) : null} type="customers" displayName={String(data?._customer_name ?? "")} />
                                    <div className="pt-2 border-t border-[#e6e8ec]">
                                        <strong className="text-alloy-midnight/70">Vendor:</strong>{" "}
                                        {(() => {
                                            const v: ContactVendorShape | null = (data._contact_vendor as ContactVendorShape | null | undefined) ?? null;
                                            return v ? (
                                                <button
                                                    type="button"
                                                    onClick={() => openDrawer({ type: "vendors", id: v.id })}
                                                    className="text-alloy-blue hover:underline text-sm"
                                                >
                                                    {v.name || v.id}
                                                </button>
                                            ) : (
                                                <span className="text-alloy-midnight/60">None</span>
                                            );
                                        })()}
                                    </div>
                                    {canMutate && (
                                        <div className="pt-2 border-t border-[#e6e8ec] flex gap-2">
                                            {data.archived_at ? (
                                                <button type="button" onClick={async () => { const res = await fetch(`/api/admin/contacts/${drawer.id}/unarchive`, { method: "POST" }); if (res.ok) { refetch(); router.refresh(); } }} className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/20">Unarchive</button>
                                            ) : (
                                                <button type="button" onClick={async () => { const res = await fetch(`/api/admin/contacts/${drawer.id}/archive`, { method: "POST" }); if (res.ok) { refetch(); router.refresh(); } }} className="px-3 py-1.5 text-sm border border-alloy-ember/40 text-alloy-ember rounded-md hover:bg-alloy-ember/10">Archive</button>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                            {drawer.type === "customer_members" && data && (
                                <>
                                    {(data as { _create?: boolean })._create ? (
                                        <div className="space-y-4">
                                            {memberCreateError && <p className="text-red-600 text-sm">{memberCreateError}</p>}
                                            <div>
                                                <label className="block text-sm text-alloy-midnight/70 mb-0.5">Customer *</label>
                                                <select value={String(formData.customer_id ?? "")} onChange={(e) => setFormData((f) => ({ ...f, customer_id: e.target.value }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60">
                                                    <option value="">— Select —</option>
                                                    {memberCustomers.map((c) => <option key={c.id} value={c.id}>{c.name || c.id}</option>)}
                                                </select>
                                            </div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Display name *</label><input value={String(formData.display_name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, display_name: e.target.value }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                            <div>
                                                <label className="block text-sm text-alloy-midnight/70 mb-0.5">Relationship</label>
                                                <select value={String(formData.relationship ?? "")} onChange={(e) => setFormData((f) => ({ ...f, relationship: e.target.value }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60">
                                                    <option value="">— Select —</option>
                                                    {memberRelationshipOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                                                </select>
                                                {(formData.relationship as string) === "other" && (
                                                    <input value={String(formData.relationship_custom ?? "")} onChange={(e) => setFormData((f) => ({ ...f, relationship_custom: e.target.value }))} placeholder="Specify relationship" disabled={!canMutate} className="mt-1 w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" />
                                                )}
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">First name</label><input value={String(formData.first_name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, first_name: e.target.value }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                                <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Last name</label><input value={String(formData.last_name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, last_name: e.target.value }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                            </div>
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">DOB</label><input type="date" value={String(formData.dob ?? "")} onChange={(e) => setFormData((f) => ({ ...f, dob: e.target.value }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                    {statusDefsLoading ? null : (
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Status</label><select value={String(formData.status_key ?? "")} onChange={(e) => setFormData((f) => ({ ...f, status_key: e.target.value || "" }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60"><option value="">— None —</option>{statusDefsForDrawer.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order).map((s) => <option key={s.status_key} value={s.status_key}>{s.status_label ?? s.status_key}</option>)}</select></div>
                                    )}
                                    <label className="flex items-center gap-2"><input type="checkbox" checked={!!formData.is_active} onChange={(e) => setFormData((f) => ({ ...f, is_active: e.target.checked }))} disabled={!canMutate} /> <span className="text-sm text-alloy-midnight/70">Active</span></label>
                                    <div className="flex gap-2 pt-2">
                                        <button type="button" disabled={memberCreateSaving || !canMutate || !(formData.display_name as string)?.trim() || !(formData.customer_id as string)?.trim()} onClick={async () => {
                                            setMemberCreateSaving(true); setMemberCreateError(null);
                                            try {
                                                const rel = (formData.relationship as string)?.trim() || null;
                                                const meta = rel === "other" ? { relationship_custom: (formData.relationship_custom as string)?.trim() || null } : undefined;
                                                const status_key = (formData.status_key as string)?.trim() || null;
                                                const res = await fetch("/api/admin/customer-members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer_id: formData.customer_id, display_name: (formData.display_name as string)?.trim(), relationship: rel, first_name: (formData.first_name as string)?.trim() || null, last_name: (formData.last_name as string)?.trim() || null, dob: (formData.dob as string)?.trim() || null, is_active: !!formData.is_active, status_key, metadata: meta }) });
                                                        const json = await res.json().catch(() => ({}));
                                                        if (!res.ok) throw new Error((json.error as string) || "Create failed");
                                                        const newId = (json as { id?: string }).id;
                                                        if (newId) { openDrawer({ type: "customer_members", id: newId }); router.refresh(); }
                                                        else setMemberCreateError("No id returned");
                                                    } catch (e: unknown) { setMemberCreateError((e as Error).message); }
                                                    setMemberCreateSaving(false);
                                                }} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md disabled:opacity-50">{memberCreateSaving ? "Creating…" : "Create"}</button>
                                                <button type="button" onClick={closeDrawer} className="px-3 py-1.5 text-sm border rounded-md">Cancel</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="space-y-4">
                                                <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Display name *</label><input value={String(formData.display_name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, display_name: e.target.value }))} onBlur={() => { if (drawer.type === "customer_members" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS} /></div>
                                            <div>
                                                    <label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Relationship</label>
                                                    <select value={String(formData.relationship ?? "")} onChange={(e) => setFormData((f) => ({ ...f, relationship: e.target.value }))} onBlur={() => { if (drawer.type === "customer_members" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS}>
                                                    <option value="">— Select —</option>
                                                    {memberRelationshipOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                                                </select>
                                                {(formData.relationship as string) === "other" && (
                                                        <input value={String(formData.relationship_custom ?? "")} onChange={(e) => setFormData((f) => ({ ...f, relationship_custom: e.target.value }))} onBlur={() => { if (drawer.type === "customer_members" && nonJobFormDirty) saveEdit(); }} placeholder="Specify relationship" disabled={!canMutate} className={`mt-1 ${INLINE_EDIT_INPUT_CLASS}`} />
                                                )}
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                    <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">First name</label><input value={String(formData.first_name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, first_name: e.target.value }))} onBlur={() => { if (drawer.type === "customer_members" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS} /></div>
                                                    <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Last name</label><input value={String(formData.last_name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, last_name: e.target.value }))} onBlur={() => { if (drawer.type === "customer_members" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS} /></div>
                                            </div>
                                                <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">DOB</label><input type="date" value={String(formData.dob ?? "")} onChange={(e) => setFormData((f) => ({ ...f, dob: e.target.value }))} onBlur={() => { if (drawer.type === "customer_members" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS} /></div>
                                    {statusDefsLoading ? <div className="text-sm text-alloy-midnight/60">Status: Loading…</div> : (
                                                    <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Status</label><select value={String(formData.status_key ?? "")} onChange={(e) => setFormData((f) => ({ ...f, status_key: e.target.value || "" }))} onBlur={() => { if (drawer.type === "customer_members" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS}><option value="">— None —</option>{statusDefsForDrawer.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order).map((s) => <option key={s.status_key} value={s.status_key}>{s.status_label ?? s.status_key}</option>)}</select></div>
                                                )}
                                                <label className="flex items-center gap-2"><input type="checkbox" checked={!!formData.is_active} onChange={(e) => setFormData((f) => ({ ...f, is_active: e.target.checked }))} onBlur={() => { if (drawer.type === "customer_members" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} /> <span className="text-sm text-alloy-midnight/70">Active</span></label>
                                    </div>
                                    <DrawerLinkWithName label="Customer" id={data?.customer_id != null ? String(data.customer_id) : null} type="customers" displayName={String(data?._customer_name ?? "")} />
                                            {canMutate && (
                                                <div className="pt-2 border-t border-[#e6e8ec] flex gap-2">
                                                    {!memberDeleteConfirm ? (
                                                        <button type="button" onClick={() => setMemberDeleteConfirm(true)} className="px-3 py-1.5 text-sm border border-alloy-ember/40 text-alloy-ember rounded-md hover:bg-alloy-ember/10">Delete</button>
                                                    ) : (
                                                        <>
                                                            <span className="text-sm text-alloy-midnight/70">Delete this {memberSingular.toLowerCase()}?</span>
                                                            <button type="button" disabled={memberDeleting} onClick={async () => {
                                                                setMemberDeleting(true);
                                                                try {
                                                                    const res = await fetch(`/api/admin/customer-members/${drawer.id}`, { method: "DELETE" });
                                                                    const json = await res.json().catch(() => ({}));
                                                                    if (!res.ok) throw new Error((json.error as string) || "Delete failed");
                                                                    closeDrawer();
                                                                    router.refresh();
                                                                } catch (e: unknown) { setMemberCreateError((e as Error).message); }
                                                                setMemberDeleting(false);
                                                                setMemberDeleteConfirm(false);
                                                            }} className="px-3 py-1.5 text-sm bg-alloy-ember text-white rounded-md hover:bg-alloy-ember/90 disabled:opacity-50">Yes, delete</button>
                                                            <button type="button" onClick={() => { setMemberDeleteConfirm(false); setMemberCreateError(null); }} className="px-3 py-1.5 text-sm border rounded-md">Cancel</button>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </>
                            )}
                    {drawer.type === "customers" && (
                        <>
                            {(data as { _create?: boolean })?._create ? (
                                <p className="text-sm text-alloy-midnight/70">Create from this drawer is not yet available. Close and use another flow to add a customer.</p>
                            ) : (
                                <>
                            <div className="space-y-4">
                                <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Name</label><input value={String(formData.name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))} onBlur={() => { if (drawer.type === "customers" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS} /></div>
                                    {statusDefsLoading ? <div className="text-sm text-alloy-midnight/60">Status: Loading…</div> : (
                                    <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Status</label><select value={String(formData.status_key ?? "")} onChange={(e) => setFormData((f) => ({ ...f, status_key: e.target.value || "" }))} onBlur={() => { if (drawer.type === "customers" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS}><option value="">— None —</option>{statusDefsForDrawer.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order).map((s) => <option key={s.status_key} value={s.status_key}>{s.status_label ?? s.status_key}</option>)}</select></div>
                                )}
                                    </div>
                                            {(data._primary_person_id as string | null) && (
                                                <div className="py-1.5">
                                                    <strong className="text-[#45506c] text-sm">Primary Person:</strong>{" "}
                                                    <button type="button" onClick={() => openDrawer({ type: "persons", id: data._primary_person_id as string })} className="text-alloy-blue hover:underline">
                                                        {(data._primary_person_name as string)?.trim() || "View person"}
                                                    </button>
                                                </div>
                                            )}
                                            {(data._primary_contact as { id?: string; first_name?: string; last_name?: string; email?: string; phone?: string } | null) && (
                                                <div className="py-1.5">
                                                    <strong className="text-[#45506c] text-sm">Contact (compatibility):</strong>{" "}
                                                    <button type="button" onClick={() => openDrawer({ type: "contacts", id: (data._primary_contact as { id: string }).id })} className="text-alloy-blue hover:underline">
                                                        {[(data._primary_contact as { first_name?: string }).first_name, (data._primary_contact as { last_name?: string }).last_name].filter(Boolean).join(" ") || (data._primary_contact as { id: string }).id.slice(0, 8) + "…"}
                                                    </button>
                                                    {((data._primary_contact as { email?: string }).email || (data._primary_contact as { phone?: string }).phone) && (
                                                        <span className="text-[#31394d] text-sm ml-1">
                                                            (
                                                            {[
                                                                (data._primary_contact as { email?: string }).email,
                                                                (data._primary_contact as { phone?: string }).phone
                                                                    ? formatPhoneUS((data._primary_contact as { phone: string }).phone)
                                                                    : null,
                                                            ]
                                                                .filter(Boolean)
                                                                .join(" · ")}
                                                            )
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            {(data._primary_location as { id?: string; label?: string; address1?: string } | null) && (
                                                <div className="py-1.5">
                                                    <strong className="text-[#45506c] text-sm">Primary Location:</strong>{" "}
                                                    <button type="button" onClick={() => openDrawer({ type: "locations", id: (data._primary_location as { id: string }).id })} className="text-alloy-blue hover:underline">
                                                        {(data._primary_location as { label?: string }).label || (data._primary_location as { address1?: string }).address1 || (data._primary_location as { id: string }).id.slice(0, 8) + "…"}
                                                    </button>
                                                </div>
                                            )}
                                            {(data._counts as { contacts?: number; opportunities?: number; jobs?: number; schedules?: number; locations?: number }) && (
                                                <div className="py-1.5 text-sm text-[#59678b]">
                                                    <strong className="text-[#45506c]">Counts:</strong>{" "}
                                                    Contacts {(data._counts as { contacts?: number }).contacts ?? 0}
                                                    {" · "}Opportunities {(data._counts as { opportunities?: number }).opportunities ?? 0}
                                                    {" · "}Jobs {(data._counts as { jobs?: number }).jobs ?? 0}
                                                    {" · "}Schedules {(data._counts as { schedules?: number }).schedules ?? 0}
                                                    {" · "}Locations {(data._counts as { locations?: number }).locations ?? 0}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </>
                            )}
                            {drawer.type === "vendors" && (
                                <>
                                    <div className="space-y-0">
                                        <details open className="border-b border-[#e6e8ec] pb-5 pt-1">
                                            <summary className="cursor-pointer list-none text-xs font-semibold tracking-wider text-[#59678b] mb-3">Overview</summary>
                                            <div className="space-y-0">
                                                <Field label="ID" value={String(data?.id ?? "")} />
                                                <Field label="Submitted" value={data.submitted_at ? displayDateTime(String(data.submitted_at)) : displayDateTime(String(data?.created_at ?? ""))} />
                                                <div className="space-y-4">
                                                    <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Name</label><input value={String(formData.name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))} onBlur={() => { if (drawer.type === "vendors" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS} /></div>
                                                    <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Company name</label><input value={String(formData.company_name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, company_name: e.target.value }))} onBlur={() => { if (drawer.type === "vendors" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS} placeholder="Optional" /></div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Status</label>
                                                        {statusDefsLoading ? (
                                                            <p className="text-sm text-alloy-midnight/60">Loading…</p>
                                                        ) : (
                                                            <select
                                                                value={String(formData.status_key ?? "")}
                                                                onChange={(e) =>
                                                                    setFormData((f) => ({ ...f, status_key: e.target.value || "" }))
                                                                }
                                                                onBlur={() => {
                                                                    if (drawer.type === "vendors" && nonJobFormDirty) saveEdit();
                                                                }}
                                                                disabled={!canMutate}
                                                                className={INLINE_EDIT_INPUT_CLASS}
                                                            >
                                                                <option value="">— None —</option>
                                                                {statusDefsForDrawer
                                                                    .filter((s) => s.is_active)
                                                                    .sort((a, b) => a.sort_order - b.sort_order)
                                                                    .map((s) => (
                                                                        <option key={s.status_key} value={s.status_key}>
                                                                            {s.status_label ?? s.status_key}
                                                                        </option>
                                                                    ))}
                                                            </select>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Primary person</label>
                                                        <select
                                                            value={String((formData as VendorFormData).primary_person_id ?? "")}
                                                            onChange={(e) => setFormData((f) => ({ ...f, primary_person_id: e.target.value || "" }))}
                                                            onBlur={() => { if (drawer.type === "vendors" && nonJobFormDirty) saveEdit(); }}
                                                            disabled={!canMutate}
                                                            className={INLINE_EDIT_INPUT_CLASS}
                                                        >
                                                            <option value="">— None —</option>
                                                            {vendorPrimaryPersonOptions.map((o) => (
                                                                <option key={o.value} value={o.value}>{o.label}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Email</label><input type="email" value={String(formData.email ?? "")} onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))} onBlur={() => { if (drawer.type === "vendors" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS} /></div>
                                                    <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Phone</label><input value={String(formData.phone ?? "")} onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))} onBlur={() => { if (drawer.type === "vendors" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS} /></div>
                                                </div>
                                            </div>
                                        </details>
                                        <details className="border-b border-[#e6e8ec] pb-5 pt-4">
                                            <summary className="cursor-pointer list-none mb-3 text-xs font-semibold tracking-wider text-[#59678b]">Payout</summary>
                                            <div className="space-y-2">
                                                {vendorPayoutLoading ? (
                                                    <p className="text-sm text-alloy-midnight/60">Loading…</p>
                                                ) : vendorPayout ? (
                                                    <>
                                                        <p className="text-sm text-alloy-midnight/80">
                                                            <strong>Policy:</strong> {vendorPayout.policy.mode === "tiered" ? "Tiered" : "Flat"}
                                                            {vendorPayout.policy.mode === "flat" && vendorPayout.policy.value != null && ` · ${vendorPayout.policy.value}%`}
                                                        </p>
                                                        <p className="text-xs text-alloy-midnight/60">
                                                            Source: {vendorPayout.source === "vendor" ? "Vendor override" : vendorPayout.source === "org" ? "Org default" : "Legacy"}
                                                        </p>
                                                        {vendorPayout.policy.mode === "tiered" ? (
                                                            <>
                                                                {vendorPayoutJobId ? (
                                                                    <div className="text-sm text-alloy-midnight/80 space-y-0.5">
                                                                        <p>Completed occurrences: <strong>{vendorPayout.completed_occurrences}</strong></p>
                                                                        <p>Current payout: <strong>{formatPayoutPercent(vendorPayout.payout_percent)}</strong></p>
                                                                        {vendorPayoutJobPayout?.job.completed_payout_cents_total != null && (
                                                                            <p>Payout total: <strong>{formatMoneyFromCents(vendorPayoutJobPayout.job.completed_payout_cents_total)}</strong></p>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <p className="text-sm text-alloy-midnight/60">Select a job to preview tier.</p>
                                                                )}
                                                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                                                    <select
                                                                        value={vendorPayoutJobId}
                                                                        onChange={(e) => setVendorPayoutJobId(e.target.value)}
                                                                        className="px-2 py-1 border border-alloy-stone/40 rounded text-sm min-w-[180px]"
                                                                    >
                                                                        <option value="">— Select job —</option>
                                                                        {vendorPayoutJobOptions.map((j) => (
                                                                            <option key={j.id} value={j.id}>{j.title ?? j.id.slice(0, 8)}</option>
                                                                        ))}
                                                                    </select>
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <p className="text-sm text-alloy-midnight/80">Payout: <strong>{formatPayoutPercent(vendorPayout.payout_percent)}</strong></p>
                                                        )}
                                                        <Link href="/admin/system/payouts" className="text-xs text-alloy-blue hover:underline inline-block">Configure payout defaults</Link>
                                                        {canMutate && (
                                                            <div className="mt-3 pt-3 border-t border-alloy-stone/20 space-y-2">
                                                                <label className="flex items-center gap-2 text-sm">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={vendorPayoutOverrideEnabled}
                                                                        onChange={(e) => setVendorPayoutOverrideEnabled(e.target.checked)}
                                                                    />
                                                                    Override org default
                                                                </label>
                                                                {vendorPayoutOverrideEnabled ? (
                                                                    <div className="space-y-2 pl-0">
                                                                        <div className="flex flex-wrap gap-2 items-center">
                                                                            <select value={vendorPayoutOverrideForm.mode} onChange={(e) => setVendorPayoutOverrideForm((f) => ({ ...f, mode: e.target.value as "flat" | "tiered" }))} className="px-2 py-1 border rounded text-sm">
                                                                                <option value="flat">Flat</option>
                                                                                <option value="tiered">Tiered</option>
                                                                            </select>
                                                                            {vendorPayoutOverrideForm.mode === "flat" && (
                                                                                <input type="number" min={0} max={100} step={0.5} value={vendorPayoutOverrideForm.value ?? 80} onChange={(e) => setVendorPayoutOverrideForm((f) => ({ ...f, value: Number(e.target.value) || 80 }))} className="w-16 px-2 py-1 border rounded text-sm" />
                                                                            )}
                                                                            {vendorPayoutOverrideForm.mode === "tiered" && (
                                                                                <>
                                                                                    <select value={vendorPayoutOverrideForm.basis ?? "job_completed_occurrences"} onChange={(e) => setVendorPayoutOverrideForm((f) => ({ ...f, basis: e.target.value }))} className="px-2 py-1 border rounded text-sm">
                                                                                        <option value="job_completed_occurrences">Job occurrences</option>
                                                                                        <option value="vendor_job_completed_occurrences">Vendor job occurrences</option>
                                                                                    </select>
                                                                                    <input type="text" placeholder="completed" value={vendorPayoutOverrideForm.completed_status_key ?? "completed"} onChange={(e) => setVendorPayoutOverrideForm((f) => ({ ...f, completed_status_key: e.target.value || "completed" }))} className="w-24 px-2 py-1 border rounded text-sm" />
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                        {vendorPayoutOverrideForm.mode === "tiered" && (
                                                                            <div className="space-y-1">
                                                                                <span className="text-xs font-medium text-alloy-midnight/70">Tiers (from / to / value %)</span>
                                                                                <div className="border border-alloy-stone/20 rounded overflow-hidden">
                                                                                    <table className="w-full text-sm">
                                                                                        <thead className="bg-alloy-stone/10">
                                                                                            <tr>
                                                                                                <th className="text-left px-2 py-1 font-medium text-xs">From</th>
                                                                                                <th className="text-left px-2 py-1 font-medium text-xs">To (blank = ∞)</th>
                                                                                                <th className="text-left px-2 py-1 font-medium text-xs">Value %</th>
                                                                                                <th className="w-14" />
                                                                                            </tr>
                                                                                        </thead>
                                                                                        <tbody>
                                                                                            {(vendorPayoutOverrideForm.tiers ?? []).map((tier, i) => (
                                                                                                <tr key={i} className="border-t border-alloy-stone/10">
                                                                                                    <td className="px-2 py-1">
                                                                                                        <input type="number" min={0} value={tier.from} onChange={(e) => setVendorPayoutOverrideForm((f) => { const tiers = [...(f.tiers ?? [])]; tiers[i] = { ...tiers[i]!, from: Number(e.target.value) || 0 }; return { ...f, tiers }; })} className="w-14 px-1.5 py-0.5 border rounded text-sm" />
                                                                                                    </td>
                                                                                                    <td className="px-2 py-1">
                                                                                                        <input type="number" min={0} placeholder="∞" value={tier.to ?? ""} onChange={(e) => setVendorPayoutOverrideForm((f) => { const tiers = [...(f.tiers ?? [])]; tiers[i] = { ...tiers[i]!, to: e.target.value === "" ? null : Number(e.target.value) }; return { ...f, tiers }; })} className="w-14 px-1.5 py-0.5 border rounded text-sm" />
                                                                                                    </td>
                                                                                                    <td className="px-2 py-1">
                                                                                                        <input type="number" min={0} max={100} step={0.5} value={tier.value} onChange={(e) => setVendorPayoutOverrideForm((f) => { const tiers = [...(f.tiers ?? [])]; tiers[i] = { ...tiers[i]!, value: Number(e.target.value) || 0 }; return { ...f, tiers }; })} className="w-14 px-1.5 py-0.5 border rounded text-sm" />
                                                                                                    </td>
                                                                                                    <td className="px-2 py-1">
                                                                                                        <button type="button" onClick={() => setVendorPayoutOverrideForm((f) => { const tiers = (f.tiers ?? []).filter((_, idx) => idx !== i); return { ...f, tiers: tiers.length ? tiers : [{ from: 1, to: null, value: 80 }] }; })} className="text-red-600 hover:underline text-xs">Remove</button>
                                                                                                    </td>
                                                                                                </tr>
                                                                                            ))}
                                                                                        </tbody>
                                                                                    </table>
                                                                                </div>
                                                                                <button type="button" onClick={() => setVendorPayoutOverrideForm((f) => { const tiers = [...(f.tiers ?? [])]; const last = tiers[tiers.length - 1]; const nextFrom = last && typeof last.to === "number" ? last.to + 1 : (last?.from ?? 0) + 1; return { ...f, tiers: [...tiers, { from: nextFrom, to: null, value: 80 }] }; })} className="text-xs text-alloy-blue hover:underline">Add tier</button>
                                                                            </div>
                                                                        )}
                                                                        <button type="button" disabled={vendorPayoutOverrideSaving} onClick={async () => { if (!drawer.id) return; setVendorPayoutOverrideSaving(true); try { const res = await fetch(`/api/admin/vendors/${drawer.id}/payout-policy`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vendor_payout_policy: { mode: vendorPayoutOverrideForm.mode, type: "percentage", value: vendorPayoutOverrideForm.mode === "flat" ? (vendorPayoutOverrideForm.value ?? 80) : undefined, basis: vendorPayoutOverrideForm.mode === "tiered" ? (vendorPayoutOverrideForm.basis ?? "job_completed_occurrences") : undefined, completed_status_key: vendorPayoutOverrideForm.completed_status_key ?? "completed", tiers: vendorPayoutOverrideForm.mode === "tiered" ? (vendorPayoutOverrideForm.tiers ?? []) : undefined } }) }); const json = await res.json().catch(() => ({})); if (!res.ok) throw new Error((json.error as string) || "Failed"); setData((prev) => prev ? { ...prev, metadata: { ...(prev.metadata as object || {}), vendor_payout_policy: vendorPayoutOverrideForm } } : prev); refetch(); const payoutRes = await fetch(`/api/admin/vendors/${drawer.id}/payout${vendorPayoutJobId ? `?job_id=${encodeURIComponent(vendorPayoutJobId)}` : ""}`); if (payoutRes.ok) { const payoutJson = await payoutRes.json(); setVendorPayout({ policy: payoutJson.policy, source: payoutJson.source ?? "org", completed_occurrences: payoutJson.completed_occurrences ?? 0, payout_percent: payoutJson.payout_percent ?? 80 }); } } catch (e) { alert((e as Error).message); } finally { setVendorPayoutOverrideSaving(false); } }} className="px-2 py-1 text-xs bg-alloy-blue text-white rounded hover:opacity-90 disabled:opacity-50">Save override</button>
                                                                    </div>
                                                                ) : vendorPayout?.source === "vendor" ? (
                                                                    <button type="button" disabled={vendorPayoutOverrideSaving} onClick={async () => { if (!drawer.id) return; setVendorPayoutOverrideSaving(true); try { const res = await fetch(`/api/admin/vendors/${drawer.id}/payout-policy`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vendor_payout_policy: null }) }); const json = await res.json().catch(() => ({})); if (!res.ok) throw new Error((json.error as string) || "Failed"); setData((prev) => prev ? { ...prev, metadata: { ...(prev.metadata as object || {}), vendor_payout_policy: null } } : prev); setVendorPayoutOverrideEnabled(false); refetch(); const payoutRes = await fetch(`/api/admin/vendors/${drawer.id}/payout${vendorPayoutJobId ? `?job_id=${encodeURIComponent(vendorPayoutJobId)}` : ""}`); if (payoutRes.ok) { const payoutJson = await payoutRes.json(); setVendorPayout({ policy: payoutJson.policy, source: payoutJson.source ?? "org", completed_occurrences: payoutJson.completed_occurrences ?? 0, payout_percent: payoutJson.payout_percent ?? 80 }); } } catch (e) { alert((e as Error).message); } finally { setVendorPayoutOverrideSaving(false); } }} className="px-2 py-1 text-xs border border-alloy-stone/50 rounded hover:bg-alloy-stone/20">Clear override</button>
                                                                ) : null}
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <p className="text-sm text-alloy-midnight/60">Could not load payout policy.</p>
                                                )}
                                            </div>
                                        </details>
                                        <details className="border-b border-[#e6e8ec] pb-5 pt-4">
                                            <summary className="cursor-pointer list-none mb-3 text-xs font-semibold tracking-wider text-[#59678b]">Documents</summary>
                                            <div className="space-y-2">
                                                {(() => {
                                                    const insurancePath = typeof data.insurance_doc_path === "string" ? data.insurance_doc_path : null;
                                                    return (
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-alloy-midnight/70 shrink-0">Insurance:</span>
                                                            {insurancePath ? (
                                                                <button type="button" onClick={async () => { const res = await fetch(`/api/admin/vendors/${drawer.id}/documents/signed-url?path=${encodeURIComponent(insurancePath)}`); const json = await res.json().catch(() => ({})); if (json.ok && (json as { signedUrl?: string }).signedUrl) window.open((json as { signedUrl: string }).signedUrl, "_blank"); else alert((json as { error?: string }).error || "Failed to get link"); }} className="text-xs px-2 py-0.5 border border-alloy-stone/50 rounded hover:bg-alloy-stone/20 shrink-0 text-alloy-blue border-alloy-blue/50">View Insurance</button>
                                                            ) : (
                                                                <span className="text-alloy-midnight/50">—</span>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                                {(() => {
                                                    const driversLicensePath = typeof data.drivers_license_doc_path === "string" ? data.drivers_license_doc_path : null;
                                                    return (
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-alloy-midnight/70 shrink-0">Driver&apos;s License:</span>
                                                            {driversLicensePath ? (
                                                                <button type="button" onClick={async () => { const res = await fetch(`/api/admin/vendors/${drawer.id}/documents/signed-url?path=${encodeURIComponent(driversLicensePath)}`); const json = await res.json().catch(() => ({})); if (json.ok && (json as { signedUrl?: string }).signedUrl) window.open((json as { signedUrl: string }).signedUrl, "_blank"); else alert((json as { error?: string }).error || "Failed to get link"); }} className="text-xs px-2 py-0.5 border border-alloy-stone/50 rounded hover:bg-alloy-stone/20 shrink-0 text-alloy-blue border-alloy-blue/50">View Driver&apos;s License</button>
                                                            ) : (
                                                                <span className="text-alloy-midnight/50">—</span>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </details>
                                        <details className="border-b border-[#e6e8ec] pb-5 pt-4">
                                            <summary className="cursor-pointer list-none mb-3 text-xs font-semibold tracking-wider text-[#59678b]">{jobPlural} & Schedule</summary>
                                            {((data._vendor_jobs as VendorDrawerJob[]) ?? []).length === 0 ? (
                                                <p className="text-sm text-alloy-midnight/60">No jobs assigned yet.</p>
                                            ) : (
                                                <ul className="space-y-2">
                                                    {((data._vendor_jobs as VendorDrawerJob[]) ?? []).map((job) => {
                                                        const scheds = ((data._vendor_schedules as { job_id: string; start_at: string; end_at: string; timezone: string }[]) ?? []).filter((s) => s.job_id === job.id);
                                                        return (
                                                            <li key={job.id} className="border border-[#e6e8ec] rounded p-2 text-sm">
                                                                <button type="button" onClick={() => openDrawer({ type: "jobs", id: job.id })} className="text-alloy-blue hover:underline font-medium">{job.title || job.id.slice(0, 8)}</button>
                                                                <div className="text-alloy-midnight/70 mt-0.5">Scheduled: {job.scheduled_at ? displayDateTime(job.scheduled_at) : "-"} · Status: {job._job_status_label ?? "—"}</div>
                                                                {(job.display_total_cents != null || job.gross_price_cents != null) && (
                                                                    <div>
                                                                        Total:{" "}
                                                                        {formatMoneyFromCents(
                                                                            Number(job.display_total_cents ?? job.gross_price_cents ?? 0)
                                                                        )}
                                                                    </div>
                                                                )}
                                                                {job.recurring_total_cents != null && <div>Recurring: {formatMoneyFromCents(job.recurring_total_cents)}</div>}
                                                                {job.opportunity_id && <button type="button" onClick={() => openDrawer({ type: "opportunities", id: job.opportunity_id })} className="text-alloy-blue hover:underline text-xs">Opportunity</button>}
                                                                {scheds.length > 0 && <div className="mt-1 text-xs"><strong>Schedules:</strong> {scheds.map((s) => `${displayDateTime(s.start_at)} – ${displayDateTime(s.end_at)} (${s.timezone || "-"})`).join("; ")}</div>}
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            )}
                                        </details>
                                        <details className="pt-4 pb-2">
                                            <summary className="cursor-pointer list-none mb-3 text-xs font-semibold tracking-wider text-[#59678b]">Operational / Settings</summary>
                                            <div className="space-y-2 mt-2">
                                                {isEditing ? (
                                                    <>
                                                        <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Address</label><input value={String(formData.address_line1 ?? "")} onChange={(e) => setFormData((f) => ({ ...f, address_line1: e.target.value }))} placeholder="Line 1" className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                                        <div className="grid grid-cols-3 gap-2"><input value={String(formData.city ?? "")} onChange={(e) => setFormData((f) => ({ ...f, city: e.target.value }))} placeholder="City" className="px-2 py-1.5 border rounded text-sm" /><input value={String(formData.state ?? "")} onChange={(e) => setFormData((f) => ({ ...f, state: e.target.value }))} placeholder="State" className="px-2 py-1.5 border rounded text-sm" /><input value={String(formData.postal_code ?? "")} onChange={(e) => setFormData((f) => ({ ...f, postal_code: e.target.value }))} placeholder="ZIP" className="px-2 py-1.5 border rounded text-sm" /></div>
                                                        <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Service area zips (comma-separated)</label><input value={String(formData.service_area_zip_codes ?? "")} onChange={(e) => setFormData((f) => ({ ...f, service_area_zip_codes: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                                        <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Days available (comma-separated)</label><input value={String(formData.days_available ?? "")} onChange={(e) => setFormData((f) => ({ ...f, days_available: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                                        <div className="flex gap-4"><label className="block text-sm text-alloy-midnight/70 mb-0.5">Hours</label><input value={String(formData.operating_hours_open ?? "")} onChange={(e) => setFormData((f) => ({ ...f, operating_hours_open: e.target.value }))} placeholder="Open" className="px-2 py-1.5 border rounded text-sm w-24" /><input value={String(formData.operating_hours_close ?? "")} onChange={(e) => setFormData((f) => ({ ...f, operating_hours_close: e.target.value }))} placeholder="Close" className="px-2 py-1.5 border rounded text-sm w-24" /></div>
                                                        <div className="flex items-center gap-2"><input type="checkbox" checked={!!formData.owns_supplies} onChange={(e) => setFormData((f) => ({ ...f, owns_supplies: e.target.checked }))} /><label className="text-sm text-alloy-midnight/70">Owns supplies</label></div>
                                                        <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Max daily jobs</label><input type="number" value={(formData as VendorFormData).max_daily_jobs === "" || (formData as VendorFormData).max_daily_jobs === undefined ? "" : (formData as VendorFormData).max_daily_jobs} onChange={(e) => setFormData((f) => ({ ...f, max_daily_jobs: e.target.value === "" ? "" : Number(e.target.value) }))} className="w-full px-2 py-1.5 border rounded text-sm w-24" /></div>
                                                        <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Payout %</label><input type="number" step="0.01" value={(formData as VendorFormData).payout_percent === "" || (formData as VendorFormData).payout_percent === undefined ? "" : (formData as VendorFormData).payout_percent} onChange={(e) => setFormData((f) => ({ ...f, payout_percent: e.target.value === "" ? "" : Number(e.target.value) }))} className="w-full px-2 py-1.5 border rounded text-sm w-24" /></div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Field label="Address" value={[data.address_line1, data.city, data.state, data.postal_code].filter(Boolean).join(", ") || "—"} />
                                                        <Field label="Service area zips" value={Array.isArray(data.service_area_zip_codes) ? Array.from(data.service_area_zip_codes).join(", ") : String(data?.service_area_zip_codes ?? "") || "—"} />
                                                        <Field label="Days available" value={Array.isArray(data.days_available) ? Array.from(data.days_available).join(", ") : String(data?.days_available ?? "") || "—"} />
                                                        <Field label="Hours" value={[data.operating_hours_open, data.operating_hours_close].filter(Boolean).join(" – ") || "—"} />
                                                        <Field label="Owns supplies" value={data.owns_supplies ? "Yes" : "No"} />
                                                        <Field label="Max daily jobs" value={data.max_daily_jobs != null ? String(data.max_daily_jobs) : "—"} />
                                                        <Field label="Payout %" value={formatPayoutPercent(data.payout_percent)} />
                                                        <Field label="Consent (agreement)" value={data.consent_contractor_agreement ? "Yes" : "No"} />
                                                        <Field label="Consent (marketing)" value={data.consent_marketing ? "Yes" : "No"} />
                                                        <Field label="Consent (legal)" value={data.consent_legal ? "Yes" : "No"} />
                                                    </>
                                                )}
                                            </div>
                                        </details>
                                    </div>
                                </>
                            )}
                            {drawer.type === "opportunities" && (
                                <>
                                    <Field label="Name" value={String(data?.name ?? "")} />
                                    <div className="space-y-4">
                                        <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Job Date</label><input type="date" value={String(formData.job_date ?? "")} onChange={(e) => setFormData((f) => ({ ...f, job_date: e.target.value }))} onBlur={() => { if (drawer.type === "opportunities" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS} /></div>
                                        <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Time Window</label><input value={String(formData.job_time_window ?? "")} onChange={(e) => setFormData((f) => ({ ...f, job_time_window: e.target.value }))} onBlur={() => { if (drawer.type === "opportunities" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS} /></div>
                                        <div>
                                            <label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Status</label>
                                            {statusDefsLoading ? (
                                                <p className="text-sm text-alloy-midnight/60">Loading…</p>
                                            ) : (
                                                <select
                                                    value={String(formData.status_key ?? "")}
                                                    onChange={(e) => setFormData((f) => ({ ...f, status_key: e.target.value || "" }))}
                                                    onBlur={() => {
                                                        if (drawer.type === "opportunities" && nonJobFormDirty) saveEdit();
                                                    }}
                                                    disabled={!canMutate}
                                                    className={INLINE_EDIT_INPUT_CLASS}
                                                >
                                                    <option value="">— None —</option>
                                                    {statusDefsForDrawer
                                                        .filter((s) => s.is_active)
                                                        .sort((a, b) => a.sort_order - b.sort_order)
                                                        .map((s) => (
                                                            <option key={s.status_key} value={s.status_key}>
                                                                {s.status_label ?? s.status_key}
                                                            </option>
                                                        ))}
                                                </select>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Vertical</label>
                                            <select
                                                value={String(formData.vertical_id ?? "")}
                                                onChange={(e) => setFormData((f) => ({ ...f, vertical_id: e.target.value || null }))}
                                                onBlur={() => { if (drawer.type === "opportunities" && nonJobFormDirty) saveEdit(); }}
                                                disabled={!canMutate}
                                                className={INLINE_EDIT_INPUT_CLASS}
                                            >
                                                <option value="">— None —</option>
                                                {(() => {
                                                    const vid = String(formData.vertical_id ?? "");
                                                    const opts = [...oppVerticalOptions];
                                                    if (vid && !opts.some((o) => o.id === vid)) {
                                                        const nm = String((data as { _vertical_name?: string | null })?._vertical_name ?? "").trim();
                                                        opts.push({ id: vid, name: nm || `${vid.slice(0, 8)}…` });
                                                    }
                                                    return opts.map((v) => <option key={v.id} value={v.id}>{v.name}</option>);
                                                })()}
                                            </select>
                                        </div>
                                        <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Quote Total ($)</label><input type="number" step="0.01" value={typeof formData.quote_total === "number" && !Number.isNaN(formData.quote_total) ? formData.quote_total : formData.quote_total !== "" && formData.quote_total != null ? String(formData.quote_total) : ""} onChange={(e) => setFormData((f) => ({ ...f, quote_total: e.target.value === "" ? null : parseFloat(e.target.value) }))} onBlur={() => { if (drawer.type === "opportunities" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS} /></div>
                                        <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Discount amount</label><input type="number" step="0.01" value={formData.discount_amount != null && formData.discount_amount !== "" ? String(formData.discount_amount) : ""} onChange={(e) => setFormData((f) => ({ ...f, discount_amount: e.target.value === "" ? null : parseFloat(e.target.value) }))} onBlur={() => { if (drawer.type === "opportunities" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS} /></div>
                                        <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Discount code</label><input value={String(formData.discount_code ?? "")} onChange={(e) => setFormData((f) => ({ ...f, discount_code: e.target.value }))} onBlur={() => { if (drawer.type === "opportunities" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS} /></div>
                                        <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Notes</label><textarea value={String(formData.notes ?? "")} onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))} onBlur={() => { if (drawer.type === "opportunities" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate} className={INLINE_EDIT_INPUT_CLASS} rows={2} /></div>
                                    </div>
                                    <DrawerLinkWithName label="Customer" id={data?.customer_id != null ? String(data.customer_id) : null} type="customers" displayName={String(data?._customer_name ?? "")} />
                                    <DrawerLinkWithName label="Person" id={data?._primary_person_id != null ? String(data._primary_person_id) : null} type="persons" displayName={String(data?._primary_person_name ?? data?._contact_name ?? "")} />
                                    <DrawerLinkWithName label="Contact (compatibility)" id={data?.primary_contact_id != null ? String(data.primary_contact_id) : null} type="contacts" displayName={String(data?._contact_name ?? "")} />
                                </>
                            )}
                            {drawer.type === "jobs" && (
                                <>
                                    {isJobExistingView && (
                                    <>
                                    <JobDrawerRelationshipsSection
                                        formData={formData}
                                        setFormData={setFormData}
                                        canMutate={canMutate}
                                        jobExpandedSections={jobExpandedSections}
                                        setJobExpandedSections={setJobExpandedSections}
                                        jobCustomerOptions={jobCustomerOptions}
                                        jobContactOptions={jobContactOptions}
                                        primaryContactDisabled={primaryContactDisabled}
                                        jobLocationOptions={jobLocationOptions}
                                        jobWorkUnitOptions={jobWorkUnitOptions}
                                        jobOpportunityOptions={jobOpportunityOptions}
                                        jobVendorOptions={jobVendorsForAssign}
                                        jobAssignedVendorId={jobAssignedVendorId}
                                        setJobAssignedVendorId={setJobAssignedVendorId}
                                        jobAssignedVendorSaving={jobAssignedVendorSaving}
                                        applyVendorToUpcoming={applyVendorToUpcoming}
                                        setApplyVendorToUpcoming={setApplyVendorToUpcoming}
                                        customerSingular={customerSingular}
                                        contactSingular={contactSingular}
                                        opportunitySingular={opportunitySingular}
                                        vendorSingular={vendorSingular}
                                        openDrawer={openDrawer}
                                        openJobLocationChange={openJobLocationChange}
                                        saveJobAssignedVendor={saveJobAssignedVendor}
                                    />
                                    <div key="financials" className="border-b border-[#e6e8ec]">
                                        <button type="button" onClick={() => setJobExpandedSections((s) => ({ ...s, financials: !s.financials }))} className="w-full flex items-center justify-between py-2 text-left text-xs font-semibold tracking-wider text-[#59678b]">
                                            Financials
                                            <span className="text-alloy-midnight opacity-60">{jobExpandedSections.financials ? "▼" : "▶"}</span>
                                        </button>
                                        {jobExpandedSections.financials && (
                                            <div className="space-y-3 pb-3">
                                                <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Gross price ($)</label><input type="number" step="0.01" min="0" value={formData.gross_price_cents != null && formData.gross_price_cents !== "" ? (Number(formData.gross_price_cents) / 100) : ""} onChange={(e) => { const v = e.target.value; const cents = v === "" ? null : Math.round(parseFloat(v) * 100); setFormData((f) => ({ ...f, gross_price_cents: cents })); }} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" placeholder="0.00" /></div>
                                                <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Discount</label><select value={String(formData.discount_code_id ?? "")} onChange={(e) => setFormData((f) => ({ ...f, discount_code_id: e.target.value || null }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60"><option value="">(none)</option>{jobDiscountOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                                                {(() => { const gross = Number(formData.gross_price_cents ?? 0); const token = typeof formData.discount_code_id === "string" ? formData.discount_code_id : ""; const selectedOpt = token ? jobDiscountOptions.find((o) => o.value === token) ?? null : null; const discountCents = selectedOpt ? computeJobDiscountOptionPreviewCents(selectedOpt, gross) : 0; const netCents = Math.max(0, gross - discountCents); return (<><p className="text-sm text-alloy-midnight/80"><strong>Discount amount:</strong> {discountCents > 0 ? `-${formatMoneyFromCents(discountCents)}` : formatMoneyFromCents(0)}</p><p className="text-sm text-alloy-midnight/80"><strong>Net price:</strong> {formatMoneyFromCents(netCents)}</p></>); })()}
                                                <details className="pt-2" open>
                                                    <summary className="cursor-pointer list-none text-xs font-semibold tracking-wider text-[#59678b] mb-2">Payout</summary>
                                                    {jobPayoutLoading ? <p className="text-sm text-alloy-midnight/60">Loading…</p> : !(data as { assigned_vendor_id?: string | null })?.assigned_vendor_id ? <p className="text-sm text-alloy-midnight/70">No {vendorSingular} assigned.</p> : jobPayout ? (
                                                        <div className="space-y-2">
                                                            <p className="text-sm text-alloy-midnight/80"><strong>Policy:</strong> {jobPayout.policy.mode === "tiered" ? "Tiered" : "Flat"}{jobPayout.policy.mode === "flat" && jobPayout.policy.value != null && ` · ${jobPayout.policy.value}%`}</p>
                                                            <p className="text-xs text-alloy-midnight/60">Source: {jobPayout.source === "vendor" ? "Vendor override" : jobPayout.source === "org" ? "Org default" : "Legacy"}</p>
                                                            <p className="text-sm">Completed: <strong>{jobPayout.job.completed_occurrences_total}</strong> · Payout: <strong>{formatPayoutPercent(jobPayout.job.current_payout_percent)}</strong></p>
                                                            {jobPayout.schedules.length > 0 && <div className="overflow-x-auto"><table className="w-full text-sm border border-alloy-stone/20"><thead><tr className="border-b text-left text-alloy-midnight/70"><th className="py-1 pr-2">Scheduled</th><th className="py-1 pr-2">Price</th><th className="py-1 pr-2">Payout $</th></tr></thead><tbody>{jobPayout.schedules.map((s) => <tr key={s.schedule_id} className="border-b border-alloy-stone/10"><td className="py-1 pr-2">{s.scheduled_at ? displayDateTime(s.scheduled_at) : "—"}</td><td className="py-1 pr-2">{s.price_cents != null ? formatMoneyFromCents(s.price_cents) : "—"}</td><td className="py-1 pr-2">{s.payout_cents != null ? formatMoneyFromCents(s.payout_cents) : "—"}</td></tr>)}</tbody></table></div>}
                                                        </div>
                                                    ) : <p className="text-sm text-alloy-midnight/60">Could not load payout.</p>}
                                                </details>
                                            </div>
                                        )}
                                    </div>
                                    <div className="border-b border-[#e6e8ec]">
                                        <button type="button" onClick={() => setJobExpandedSections((s) => ({ ...s, scheduling: !s.scheduling }))} className="w-full flex items-center justify-between py-2 text-left text-xs font-semibold tracking-wider text-[#59678b]">
                                            Scheduling
                                            <span className="text-alloy-midnight opacity-60">{jobExpandedSections.scheduling ? "▼" : "▶"}</span>
                                        </button>
                                        {jobExpandedSections.scheduling && (
                                            <div className="space-y-3 pb-3">
                                                <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Job start date (optional)</label><input type="datetime-local" value={String(formData.scheduled_at ?? "")} onChange={(e) => setFormData((f) => ({ ...f, scheduled_at: e.target.value }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" /></div>
                                                <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Service frequency</label><select value={String(formData.service_frequency_key ?? "")} onChange={(e) => { const v = e.target.value; const opt = jobFrequencyOptions.find((f) => f.key === v); setFormData((f) => ({ ...f, service_frequency_key: v, is_recurring: opt?.is_recurring ?? false })); }} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60"><option value="">— None —</option>{jobFrequencyOptions.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></div>
                                                <div>
                                                    <label className="block text-sm text-alloy-midnight/70 mb-0.5">Status</label>
                                                    {statusDefsLoading ? (
                                                        <p className="text-sm text-alloy-midnight/60">Loading…</p>
                                                    ) : (
                                                        <select
                                                            value={String(formData.status_key ?? "")}
                                                            onChange={(e) => setFormData((f) => ({ ...f, status_key: e.target.value || "" }))}
                                                            disabled={!canMutate}
                                                            className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60"
                                                        >
                                                            <option value="">— None —</option>
                                                            {statusDefsForDrawer
                                                                .filter((s) => s.is_active)
                                                                .sort((a, b) => a.sort_order - b.sort_order)
                                                                .map((s) => (
                                                                    <option key={s.status_key} value={s.status_key}>
                                                                        {s.status_label ?? s.status_key}
                                                                    </option>
                                                                ))}
                                                        </select>
                                                    )}
                                                </div>
                                                <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Internal notes</label><textarea value={String(formData.internal_notes ?? "")} onChange={(e) => setFormData((f) => ({ ...f, internal_notes: e.target.value }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" rows={2} /></div>
                                                {drawer.id && drawer.id !== "new" && (
                                                    <button type="button" onClick={async () => { const jobId = drawer.id; const custId = (formData.customer_id as string) || (data?.customer_id as string) || null; const locId = (formData.location_id as string) || (data?.location_id as string) || null; const vendorId = jobAssignedVendorId || (data?.assigned_vendor_id as string) || null; let status_key: string | null = null; try { const r = await fetch("/api/admin/status-options?entity_type=schedules"); const j = await r.json().catch(() => ({})); const opts = (j.options ?? []) as { value: string }[]; status_key = opts[0]?.value ?? null; } catch { /* ignore */ } openDrawer({ type: "schedules", id: "new", defaultSchedulePrefill: { job_id: jobId as string, customer_id: custId, location_id: locId || null, assigned_vendor_id: vendorId, status_key } }); }} className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30">New Schedule</button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className="border-b border-[#e6e8ec]">
                                        <button type="button" onClick={() => setJobExpandedSections((s) => ({ ...s, ledger: !s.ledger }))} className="w-full flex items-center justify-between py-2 text-left text-xs font-semibold tracking-wider text-[#59678b]">
                                            Ledger
                                            <span className="text-alloy-midnight opacity-60">{jobExpandedSections.ledger ? "▼" : "▶"}</span>
                                        </button>
                                        {jobExpandedSections.ledger && (
                                            <div className="space-y-3 pb-3">
                                                {jobFinancialsLoading && <p className="text-sm text-alloy-midnight/60">Loading…</p>}
                                                {!jobFinancialsLoading && jobFinancials && (
                                                    <>
                                                        {jobFinancials.booking_economics && (
                                                            <div className="rounded border border-alloy-stone/25 bg-alloy-stone/5 px-3 py-3 space-y-2 mb-3">
                                                                <p className="text-xs font-semibold tracking-wider text-[#59678b]">Booking pricing</p>
                                                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-alloy-midnight/80">
                                                                    <span>First visit (gross)</span>
                                                                    <span>
                                                                        {jobFinancials.booking_economics.first_visit_gross_cents != null
                                                                            ? formatMoneyFromCents(jobFinancials.booking_economics.first_visit_gross_cents)
                                                                            : "—"}
                                                                    </span>
                                                                    <span>One-time discount</span>
                                                                    <span>
                                                                        {jobFinancials.booking_economics.discount_cents != null &&
                                                                        jobFinancials.booking_economics.discount_cents > 0
                                                                            ? `-${formatMoneyFromCents(jobFinancials.booking_economics.discount_cents)}`
                                                                            : "—"}
                                                                    </span>
                                                                    <span>First visit (net)</span>
                                                                    <span>
                                                                        {jobFinancials.booking_economics.first_visit_net_cents != null
                                                                            ? formatMoneyFromCents(jobFinancials.booking_economics.first_visit_net_cents)
                                                                            : "—"}
                                                                    </span>
                                                                    <span>Recurring visit</span>
                                                                    <span>
                                                                        {jobFinancials.booking_economics.recurring_visit_cents != null
                                                                            ? formatMoneyFromCents(jobFinancials.booking_economics.recurring_visit_cents)
                                                                            : "—"}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        )}
                                                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-alloy-midnight/80">
                                                            <span>Revenue (credits)</span><span>{formatMoneyFromCents(jobFinancials.totals.total_revenue_credits)}</span>
                                                            <span>Discounts (debits)</span><span>{formatMoneyFromCents(jobFinancials.totals.total_discount_debits)}</span>
                                                            <span>Vendor payout (debits)</span><span>{formatMoneyFromCents(jobFinancials.totals.total_vendor_payout_debits)}</span>
                                                            <span>Cash (debits)</span><span>{formatMoneyFromCents(jobFinancials.totals.total_cash_debits)}</span>
                                                            <span>Vendor payable (credits)</span><span>{formatMoneyFromCents(jobFinancials.totals.total_vendor_payable_credits)}</span>
                                                        </div>
                                                        <p className="text-xs text-alloy-midnight/60">Posted journal entries: {jobFinancials.posted_entries_count}</p>
                                                        {jobFinancials.schedules.length > 0 && (
                                                            <div className="overflow-x-auto">
                                                                <table className="w-full text-sm border border-alloy-stone/20">
                                                                    <thead>
                                                                        <tr className="border-b text-left text-alloy-midnight/70">
                                                                            <th className="py-1 pr-2">Start</th>
                                                                            <th className="py-1 pr-2">Visit</th>
                                                                            <th className="py-1 pr-2">Price</th>
                                                                            <th className="py-1 pr-2">Status</th>
                                                                            <th className="py-1 pr-2">{vendorSingular}</th>
                                                                            <th className="py-1 pr-2">Posted?</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {jobFinancials.schedules.map((s) => (
                                                                            <tr key={s.id} className="border-b border-alloy-stone/10">
                                                                                <td className="py-1 pr-2">{s.start_at ? displayDateTime(s.start_at) : "—"}</td>
                                                                                <td className="py-1 pr-2">
                                                                                    {s.visit_kind === "recurring"
                                                                                        ? "Recurring"
                                                                                        : s.visit_kind === "first"
                                                                                          ? "First"
                                                                                          : "—"}
                                                                                </td>
                                                                                <td className="py-1 pr-2">
                                                                                    {s.price_cents != null ? formatMoneyFromCents(s.price_cents) : "—"}
                                                                                </td>
                                                                                <td className="py-1 pr-2">{s.status_key ?? "—"}</td>
                                                                                <td className="py-1 pr-2">{s.assigned_vendor_id ? `${String(s.assigned_vendor_id).slice(0, 8)}…` : "—"}</td>
                                                                                <td className="py-1 pr-2">{s.posted ? "Yes" : "No"}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                                {!jobFinancialsLoading && !jobFinancials && drawer.id && drawer.id !== "new" && <p className="text-sm text-alloy-midnight/50">Could not load ledger.</p>}
                                            </div>
                                        )}
                                    </div>
                                    </>
                                    )}
                                    {(isEditing || drawer.type === "jobs") ? (
                                        <>
                                            {(drawer.type === "jobs" && (data as { _create?: boolean })?._create) && (
                                                <>
                                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">{customerSingular} (required)</label><select value={String(formData.customer_id ?? "")} onChange={(e) => setFormData((f) => ({ ...f, customer_id: e.target.value, primary_contact_id: "" }))} className="w-full px-2 py-1.5 border rounded text-sm"><option value="">Select {customerSingular.toLowerCase()}</option>{jobCustomerOptions.map((c) => <option key={c.id} value={c.id}>{c.name ?? c.id}</option>)}</select></div>
                                                    <div>
                                                        <label className="block text-sm text-alloy-midnight/70 mb-0.5">Status (required)</label>
                                                        {statusDefsLoading ? (
                                                            <p className="text-sm text-alloy-midnight/60">Loading…</p>
                                                        ) : (
                                                            <select
                                                                value={String(formData.status_key ?? "")}
                                                                onChange={(e) => setFormData((f) => ({ ...f, status_key: e.target.value || "" }))}
                                                                className="w-full px-2 py-1.5 border rounded text-sm"
                                                            >
                                                                <option value="">Select status</option>
                                                                {statusDefsForDrawer
                                                                    .filter((s) => s.is_active)
                                                                    .sort((a, b) => a.sort_order - b.sort_order)
                                                                    .map((s) => (
                                                                        <option key={s.status_key} value={s.status_key}>
                                                                            {s.status_label ?? s.status_key}
                                                                        </option>
                                                                    ))}
                                                            </select>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm text-alloy-midnight/70 mb-0.5">Primary {contactSingular}</label>
                                                        <select
                                                            value={String(formData.primary_contact_id ?? "")}
                                                            onChange={(e) => setFormData((f) => ({ ...f, primary_contact_id: e.target.value }))}
                                                            disabled={primaryContactDisabled}
                                                            className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60"
                                                        >
                                                            <option value="">Select {contactSingular.toLowerCase()}</option>
                                                            {jobContactOptions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                                                        </select>
                                                        {primaryContactDisabled && (
                                                            <p className="text-xs text-alloy-midnight/50 mt-0.5">Select a customer to load contacts</p>
                                                        )}
                                                    </div>
                                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Service frequency</label><select value={String(formData.service_frequency_key ?? "")} onChange={(e) => { const v = e.target.value; const opt = jobFrequencyOptions.find((f) => f.key === v); setFormData((f) => ({ ...f, service_frequency_key: v, is_recurring: opt?.is_recurring ?? false })); }} className="w-full px-2 py-1.5 border rounded text-sm"><option value="">— None —</option>{jobFrequencyOptions.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></div>
                                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Gross price ($)</label><input type="number" step="0.01" min="0" value={formData.gross_price_cents != null ? Number(formData.gross_price_cents) / 100 : ""} onChange={(e) => { const v = e.target.value; const cents = v === "" ? null : Math.round(parseFloat(v) * 100); setFormData((f) => ({ ...f, gross_price_cents: cents })); }} className="w-full px-2 py-1.5 border rounded text-sm" placeholder="0.00" /></div>
                                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Discount</label><select value={String(formData.discount_code_id ?? "")} onChange={(e) => setFormData((f) => ({ ...f, discount_code_id: e.target.value || null }))} className="w-full px-2 py-1.5 border rounded text-sm"><option value="">(none)</option>{jobDiscountOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
                                                    {(() => { const gross = Number(formData.gross_price_cents ?? 0); const token = typeof formData.discount_code_id === "string" ? formData.discount_code_id : ""; const selectedOpt = token ? jobDiscountOptions.find((o) => o.value === token) ?? null : null; const discountCents = selectedOpt ? computeJobDiscountOptionPreviewCents(selectedOpt, gross) : 0; const netCents = Math.max(0, gross - discountCents); return (<><p className="text-sm text-alloy-midnight/80"><strong>Discount amount:</strong> {discountCents > 0 ? `-${formatMoneyFromCents(discountCents)}` : formatMoneyFromCents(0)}</p><p className="text-sm text-alloy-midnight/80"><strong>Net price:</strong> {formatMoneyFromCents(netCents)}</p></>); })()}
                                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Internal notes</label><textarea value={String(formData.internal_notes ?? "")} onChange={(e) => setFormData((f) => ({ ...f, internal_notes: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" rows={2} /></div>
                                                    <div className="flex gap-2 pt-1">
                                                        <button type="button" disabled={jobCreateSaving || !(formData.customer_id as string)?.trim() || !(formData.status_key as string)?.trim()} onClick={async () => { setJobCreateSaving(true); setSaveError(null); try { const grossCents = Number(formData.gross_price_cents ?? 0); const discountToken = typeof formData.discount_code_id === "string" && formData.discount_code_id.trim() ? formData.discount_code_id.trim() : null; const body: Record<string, unknown> = { customer_id: (formData.customer_id as string)?.trim(), status_key: (formData.status_key as string)?.trim(), is_recurring: !!formData.is_recurring, service_frequency_key: (formData.service_frequency_key as string)?.trim() || null, gross_price_cents: grossCents || null, primary_contact_id: (formData.primary_contact_id as string)?.trim() || null, opportunity_id: (formData.opportunity_id as string)?.trim() || null, title: (formData.title as string)?.trim() || null, description: (formData.internal_notes as string)?.trim() || null, discount_code_id: discountToken }; const res = await fetch("/api/admin/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const json = await res.json().catch(() => ({})); if (!res.ok) throw new Error((json.error as string) || "Create failed"); const newId = (json as { id?: string }).id; if (newId) { window.dispatchEvent(new CustomEvent("admin-entity-saved", { detail: { type: "jobs", id: newId } })); closeDrawer(); } } catch (e) { setSaveError((e as Error).message); } finally { setJobCreateSaving(false); } }} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50">{jobCreateSaving ? "Creating…" : "Create"}</button>
                                                    </div>
                                                    {saveError && <p className="text-alloy-ember text-sm">{saveError}</p>}
                                                </>
                                            )}
                                            {!(data as { _create?: boolean })?._create && drawer.type !== "jobs" && (
                                            <>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Job start date (optional)</label><input type="datetime-local" value={String(formData.scheduled_at ?? "")} onChange={(e) => setFormData((f) => ({ ...f, scheduled_at: e.target.value }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" /></div>
                                            {drawer.type === "jobs" && (
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Service frequency</label><select value={String(formData.service_frequency_key ?? "")} onChange={(e) => { const v = e.target.value; const opt = jobFrequencyOptions.find((f) => f.key === v); setFormData((f) => ({ ...f, service_frequency_key: v, is_recurring: opt?.is_recurring ?? false })); }} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60"><option value="">— None —</option>{jobFrequencyOptions.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></div>
                                            )}
                                            {drawer.type !== "jobs" && <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Service frequency key</label><input value={String(formData.service_frequency_key ?? "")} onChange={(e) => setFormData((f) => ({ ...f, service_frequency_key: e.target.value }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" /></div>}
                                            {statusDefsLoading ? null : (
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Status</label><select value={String(formData.status_key ?? "")} onChange={(e) => setFormData((f) => ({ ...f, status_key: e.target.value || "" }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60"><option value="">— None —</option>{statusDefsForDrawer.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order).map((s) => <option key={s.status_key} value={s.status_key}>{s.status_label ?? s.status_key}</option>)}</select></div>
                                            )}
                                            {drawer.type === "jobs" && (
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Gross price ($)</label><input type="number" step="0.01" min="0" value={formData.gross_price_cents != null && formData.gross_price_cents !== "" ? Number(formData.gross_price_cents) / 100 : ""} onChange={(e) => { const v = e.target.value; const cents = v === "" ? null : Math.round(parseFloat(v) * 100); setFormData((f) => ({ ...f, gross_price_cents: cents })); }} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" placeholder="0.00" /></div>
                                            )}
                                            {drawer.type === "jobs" && (
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Primary {contactSingular}</label><select value={String(formData.primary_contact_id ?? "")} onChange={(e) => setFormData((f) => ({ ...f, primary_contact_id: e.target.value }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60"><option value="">— None —</option>{jobContactOptions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
                                            )}
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Internal notes</label><textarea value={String(formData.internal_notes ?? "")} onChange={(e) => setFormData((f) => ({ ...f, internal_notes: e.target.value }))} disabled={drawer.type === "jobs" ? !canMutate : false} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" rows={2} /></div>
                                            </>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <Field label="Recurring" value={data.is_recurring ? "Yes" : "No"} />
                                            <Field label="Scheduled at" value={displayDateTime(String(data?.scheduled_at ?? ""))} />
                                            <div className="py-1.5">
                                                <strong className="text-[#45506c] text-sm">Status</strong>
                                                {statusDefsLoading ? <p className="text-sm text-alloy-midnight/60 mt-0.5">Loading…</p> : (() => { const key = data.status_key as string | null | undefined; const label = getStatusLabel(key); if (label) return <p className="text-sm text-alloy-midnight/80 mt-0.5">{label}</p>; return <p className="text-sm text-alloy-midnight/80 mt-0.5">Unknown <Link href="/admin/system/statuses?entity_type=jobs" className="text-alloy-blue hover:underline">Configure statuses</Link></p>; })()}
                                            </div>
                                            <Field label="Internal notes" value={getMetaString(data?.metadata, "internal_notes") || "-"} />
                                        </>
                                    )}
                                    {!(data as { _create?: boolean })?._create && drawer.type !== "jobs" && (
                                    <>
                                    <Field label="Gross Price" value={formatMoneyFromCents(Number(data?.gross_price_cents ?? 0))} />
                                    <Field label="Payout" value={formatMoneyFromCents(Number(data?.contractor_payout_cents ?? 0))} />
                                    <DrawerLinkWithName label={opportunitySingular} id={data?.opportunity_id != null ? String(data.opportunity_id) : null} type="opportunities" displayName={String(data?._opportunity_name ?? "")} />
                                    <DrawerLinkWithName label="Person" id={data?._primary_person_id != null ? String(data._primary_person_id) : null} type="persons" displayName={String(data?._primary_person_name ?? data?._contact_name ?? "")} />
                                    <DrawerLinkWithName label="Contact (compatibility)" id={data?.primary_contact_id != null ? String(data.primary_contact_id) : null} type="contacts" displayName={String(data?._contact_name ?? "")} />
                                    <DrawerLinkWithName label={customerSingular} id={data?.customer_id != null ? String(data.customer_id) : null} type="customers" displayName={String(data?._customer_name ?? "")} />
                                    </>
                                    )}
                                    <Field label="Offer Code" value={String(data?.offer_code ?? "")} />
                                    {jobSchedules.length > 0 && (
                                        <div className="pt-4 border-t border-[#e6e8ec]">
                                            <strong className="text-alloy-midnight/70 block mb-2">Reschedule</strong>
                                            {rescheduleForm && rescheduleScheduleId ? (
                                                <div className="space-y-2">
                                                    {rescheduleError && <p className="text-red-600 text-sm">{rescheduleError}</p>}
                                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Start</label><input type="datetime-local" value={rescheduleForm.start_at} onChange={(e) => setRescheduleForm((f) => f ? { ...f, start_at: e.target.value } : f)} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">End</label><input type="datetime-local" value={rescheduleForm.end_at} onChange={(e) => setRescheduleForm((f) => f ? { ...f, end_at: e.target.value } : f)} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Timezone</label><input value={rescheduleForm.timezone} onChange={(e) => setRescheduleForm((f) => f ? { ...f, timezone: e.target.value } : f)} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                                    <div className="flex gap-2">
                                                        <button type="button" onClick={saveReschedule} disabled={rescheduleSaving} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md">{rescheduleSaving ? "Saving…" : "Save"}</button>
                                                        <button type="button" onClick={cancelReschedule} className="px-3 py-1.5 text-sm border rounded-md">Cancel</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-1">
                                                    {jobSchedules.slice(0, 3).map((s) => (
                                                        <div key={s.id} className="flex items-center justify-between gap-2 py-1">
                                                            <span className="text-sm">{displayDateTime(s.start_at)} – {displayDateTime(s.end_at)} ({s.timezone || "—"})</span>
                                                            <button type="button" onClick={() => openReschedule(s)} className="text-sm text-alloy-blue hover:underline">Reschedule</button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div className="pt-4 border-t border-[#e6e8ec]">
                                        <strong className="text-alloy-midnight/70 block mb-2">Payments</strong>
                                        {paymentToast && (
                                            <div className={`mb-2 px-3 py-2 rounded text-sm ${paymentToast.type === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`} role="alert">
                                                {paymentToast.message}
                                            </div>
                                        )}
                                        {jobPaymentsFetchError ? (
                                            <p className="text-sm text-red-600">{jobPaymentsFetchError}</p>
                                        ) : !jobPaymentSummaryFromApi ? (
                                            <p className="text-sm text-alloy-midnight/60">Loading payment summary…</p>
                                        ) : (
                                            <>
                                                <div className="rounded-md border border-alloy-stone/30 bg-alloy-stone/10 px-2 py-2 mb-2 text-xs space-y-1">
                                                    <div className="flex justify-between gap-2">
                                                        <span className="text-alloy-midnight/60">
                                                            {jobTotalSummaryLabel(jobPaymentSummaryFromApi.receivable_source)}
                                                        </span>
                                                        <span>
                                                            {jobPaymentSummaryFromApi.job_total_cents != null
                                                                ? formatMoneyFromCents(jobPaymentSummaryFromApi.job_total_cents)
                                                                : jobPaymentSummaryFromApi.original_amount_cents != null
                                                                  ? formatMoneyFromCents(jobPaymentSummaryFromApi.original_amount_cents)
                                                                  : "—"}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-2">
                                                        <span className="text-alloy-midnight/60">Paid (posted)</span>
                                                        <span>{formatMoneyFromCents(jobPaymentSummaryFromApi.paid_amount_cents)}</span>
                                                    </div>
                                                    <div className="flex justify-between gap-2">
                                                        <span className="text-alloy-midnight/60">Outstanding</span>
                                                        <span>
                                                            {(jobPaymentSummaryFromApi.outstanding_balance_cents ??
                                                                jobPaymentSummaryFromApi.balance_due_cents) != null
                                                                ? formatMoneyFromCents(
                                                                      (jobPaymentSummaryFromApi.outstanding_balance_cents ??
                                                                          jobPaymentSummaryFromApi.balance_due_cents) as number
                                                                  )
                                                                : "—"}
                                                        </span>
                                                    </div>
                                                    {jobPaymentSummaryFromApi.pending_payment_amount_cents > 0 ? (
                                                        <div className="flex justify-between gap-2">
                                                            <span className="text-alloy-midnight/60">Pending (authorized)</span>
                                                            <span>
                                                                {formatMoneyFromCents(jobPaymentSummaryFromApi.pending_payment_amount_cents)}
                                                            </span>
                                                        </div>
                                                    ) : null}
                                                </div>
                                                {jobPaymentSummaryFromApi.receivable_source === "charges" ? (
                                                    <JobReceivableChargesPanel
                                                        receivableSource={jobPaymentSummaryFromApi.receivable_source}
                                                        chargeRows={jobPaymentSummaryFromApi.charge_balance_rows}
                                                        openChargeCount={jobPaymentSummaryFromApi.open_charge_count}
                                                        compact
                                                        className="mb-2"
                                                    />
                                                ) : null}
                                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                                    <span className="text-xs text-alloy-midnight/60">Payment state:</span>
                                                    <StatusBadge label={paymentStatusLabel} variant={paymentStatusVariant} />
                                                </div>
                                                {jobPayments.length > 0 && (
                                                    <div className="mb-3">
                                                        <p className="text-xs text-alloy-midnight/60 mb-1">Attempts (newest first)</p>
                                                        <ul className="text-sm space-y-1 border border-[#e6e8ec] rounded p-2 bg-[#F4F6F9]/30 max-h-40 overflow-y-auto">
                                                            {jobPayments.map((p) => {
                                                                const refId =
                                                                    (p.processor_transaction_id != null &&
                                                                    String(p.processor_transaction_id).trim() !== ""
                                                                        ? String(p.processor_transaction_id).trim()
                                                                        : null) ?? (p.provider_payment_id?.trim() || null);
                                                                const when = p.posted_at || p.received_at || p.created_at;
                                                                return (
                                                                    <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                                                        <span>{displayDateTime(when)}</span>
                                                                        <span>{formatMoneyFromCents(p.amount_cents)}</span>
                                                                        <span className="text-alloy-midnight/70">{paymentRowStatusDisplayLabel(p)}</span>
                                                                        {refId ? (
                                                                            <span className="font-mono text-xs text-alloy-midnight/60">{refId}</span>
                                                                        ) : null}
                                                                    </li>
                                                                );
                                                            })}
                                                        </ul>
                                                    </div>
                                                )}
                                                <div className="flex flex-wrap gap-2">
                                                    {jobPayments.some((p) => effectivePaymentRowStatusKey(p) === "pending") && (
                                                        <button type="button" disabled title="Void Pending — coming soon" className="px-3 py-1.5 text-sm border border-[#e6e8ec] rounded-md text-alloy-midnight/50 cursor-not-allowed">
                                                            Void Pending
                                                        </button>
                                                    )}
                                                    {jobPayments.some((p) => effectivePaymentRowStatusKey(p) === "paid") && (
                                                        <button type="button" disabled title="Refund — coming soon" className="px-3 py-1.5 text-sm border border-[#e6e8ec] rounded-md text-alloy-midnight/50 cursor-not-allowed">
                                                            Refund
                                                        </button>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </>
                            )}
                            {drawer.type === "schedules" && !(data as { _create?: boolean })?._create && (
                                <>
                                    <div className="rounded-md border border-alloy-stone/40 bg-alloy-stone/10 px-3 py-2.5 mb-3 space-y-2">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <h4 className="text-[11px] font-semibold tracking-wide text-alloy-forge/80">Current status</h4>
                                            <Link
                                                href="/admin/system/statuses?entity_type=schedules"
                                                className="text-[11px] text-alloy-blue hover:underline shrink-0"
                                            >
                                                Schedules statuses (source of truth)
                                            </Link>
                                        </div>
                                        {(data.canceled_at as string) ? (
                                            <div className="space-y-1.5">
                                                <p className="text-sm text-alloy-midnight flex flex-wrap items-center gap-2">
                                                    <span className="text-alloy-midnight/60">Visit:</span>
                                                    <strong>Canceled</strong>
                                                    <StatusBadge label="Canceled" variant="neutral" />
                                                </p>
                                                <p className="text-xs text-alloy-midnight/70">
                                                    <span className="text-alloy-midnight/50">Canceled at:</span>{" "}
                                                    {displayDateTime(String(data.canceled_at))}
                                                </p>
                                                <p className="text-xs text-alloy-midnight/70">
                                                    <span className="text-alloy-midnight/50">Cancel reason:</span>{" "}
                                                    {(data.cancel_reason as string)?.trim() ? String(data.cancel_reason).trim() : "—"}
                                                </p>
                                                <p className="text-xs text-alloy-midnight/65 border-t border-alloy-stone/25 pt-1.5 mt-1.5">
                                                    <span className="text-alloy-midnight/50">Workflow status (from statuses):</span>{" "}
                                                    {(() => {
                                                        const sk = String(data.status_key ?? "").trim();
                                                        const lab =
                                                            sk &&
                                                            (statusDefsForDrawer.find((s) => s.status_key === sk)?.status_label?.trim() ||
                                                                String(
                                                                    (data as { _schedule_status_label?: string | null })._schedule_status_label ??
                                                                        ""
                                                                ).trim());
                                                        return (
                                                            <>
                                                                {lab ? <strong>{lab}</strong> : <span className="text-alloy-midnight/45">—</span>}
                                                                {sk ? (
                                                                    <span className="font-mono text-[10px] text-alloy-midnight/45 ml-1">({sk})</span>
                                                                ) : null}
                                                            </>
                                                        );
                                                    })()}
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="space-y-1">
                                                <p className="text-sm text-alloy-midnight">
                                                    <span className="text-alloy-midnight/60">Workflow status:</span>{" "}
                                                    <strong>
                                                        {String((data as { _status_display?: string | null })._status_display ?? "").trim() ||
                                                            (() => {
                                                                const sk = String(formData.status_key ?? data.status_key ?? "").trim();
                                                                return (
                                                                    statusDefsForDrawer.find((s) => s.status_key === sk)?.status_label?.trim() ||
                                                                    sk ||
                                                                    "—"
                                                                );
                                                            })()}
                                                    </strong>
                                                </p>
                                                <p className="text-xs text-alloy-midnight/55">
                                                    <span className="text-alloy-midnight/50">status_key:</span>{" "}
                                                    <span className="font-mono">{String(formData.status_key ?? data.status_key ?? "").trim() || "—"}</span>
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                    {(data.job_id as string) && (
                                        <div>
                                            <strong className="text-alloy-midnight/70">{jobSingular}</strong>
                                            <button type="button" onClick={() => openDrawer({ type: "jobs", id: data?.job_id != null ? String(data.job_id) : "" })} className="ml-2 text-alloy-blue hover:underline text-sm">
                                                {(data._job as { title?: string })?.title ?? (data.job_id as string).slice(0, 8) + "…"}
                                            </button>
                                            <span className="text-alloy-midnight/50 text-xs ml-1">({(data.job_id as string).slice(0, 8)}…)</span>
                                        </div>
                                    )}
                                    {(data._customer as { id?: string; name?: string }) && (
                                        <div>
                                            <strong className="text-alloy-midnight/70">{customerSingular}</strong>
                                            <button type="button" onClick={() => openDrawer({ type: "customers", id: (data._customer as { id: string }).id })} className="ml-2 text-alloy-blue hover:underline text-sm">{(data._customer as { name?: string }).name ?? (data._customer as { id: string }).id.slice(0, 8) + "…"}</button>
                                        </div>
                                    )}
                                    {(data._contact as { id?: string; email?: string; phone?: string }) && (
                                        <div>
                                            <strong className="text-alloy-midnight/70">{contactSingular}</strong>
                                            <button type="button" onClick={() => openDrawer({ type: "contacts", id: (data._contact as { id: string }).id })} className="ml-2 text-alloy-blue hover:underline text-sm">{(data._contact as { email?: string }).email ?? (data._contact as { phone?: string }).phone ?? (data._contact as { id: string }).id.slice(0, 8) + "…"}</button>
                                        </div>
                                    )}
                                    {(data._opportunity as { id?: string; name?: string }) && (
                                        <div>
                                            <strong className="text-alloy-midnight/70">{opportunitySingular}</strong>
                                            <button type="button" onClick={() => openDrawer({ type: "opportunities", id: (data._opportunity as { id: string }).id })} className="ml-2 text-alloy-blue hover:underline text-sm">{(data._opportunity as { name?: string }).name ?? (data._opportunity as { id: string }).id.slice(0, 8) + "…"}</button>
                                        </div>
                                    )}
                                    <div className="space-y-4">
                                        <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Start</label><input type="datetime-local" value={String(formData.start_at ?? "")} onChange={(e) => setFormData((f) => ({ ...f, start_at: e.target.value }))} onBlur={() => { if (drawer.type === "schedules" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate || !!(data.canceled_at as string)} className={INLINE_EDIT_INPUT_CLASS} /></div>
                                        <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">End</label><input type="datetime-local" value={String(formData.end_at ?? "")} onChange={(e) => setFormData((f) => ({ ...f, end_at: e.target.value }))} onBlur={() => { if (drawer.type === "schedules" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate || !!(data.canceled_at as string)} className={INLINE_EDIT_INPUT_CLASS} /></div>
                                        <div><label className="block text-xs font-medium text-alloy-midnight/60 mb-0.5">Timezone</label><input value={String(formData.timezone ?? "")} onChange={(e) => setFormData((f) => ({ ...f, timezone: e.target.value }))} onBlur={() => { if (drawer.type === "schedules" && nonJobFormDirty) saveEdit(); }} disabled={!canMutate || !!(data.canceled_at as string)} className={INLINE_EDIT_INPUT_CLASS} /></div>
                                    </div>
                                    <div className="rounded-md border border-alloy-stone/35 bg-white px-3 py-2.5 mt-3 space-y-2">
                                        <h4 className="text-[11px] font-semibold tracking-wide text-alloy-forge/80">Change workflow status</h4>
                                        <p className="text-[11px] text-alloy-midnight/55 leading-snug max-w-xl">
                                            Options match{" "}
                                            <Link href="/admin/system/statuses?entity_type=schedules" className="text-alloy-blue hover:underline">
                                                System → Statuses → Schedules
                                            </Link>
                                            . This updates operational workflow only — it does <strong>not</strong> cancel the visit.
                                        </p>
                                        {statusDefsLoading ? (
                                            <p className="text-sm text-alloy-midnight/60">Loading status definitions…</p>
                                        ) : (data.canceled_at as string) ? (
                                            <p className="text-sm text-alloy-midnight/60 py-1">Workflow editing is disabled while the visit is canceled.</p>
                                        ) : (
                                            <select
                                                value={String(formData.status_key ?? "")}
                                                onChange={(e) => setFormData((f) => ({ ...f, status_key: e.target.value || "" }))}
                                                onBlur={() => {
                                                    if (drawer.type === "schedules" && nonJobFormDirty) saveEdit();
                                                }}
                                                disabled={!canMutate}
                                                className={INLINE_EDIT_INPUT_CLASS}
                                            >
                                                <option value="">— None —</option>
                                                {statusDefsForDrawer
                                                    .filter((s) => s.is_active)
                                                    .filter((s) => !isScheduleCanceledStatusKey(s.status_key))
                                                    .sort((a, b) => a.sort_order - b.sort_order)
                                                    .map((s) => (
                                                        <option key={s.status_key} value={s.status_key}>
                                                            {s.status_label ?? s.status_key}
                                                        </option>
                                                    ))}
                                            </select>
                                        )}
                                    </div>
                                    <div className="pt-2 border-t border-[#e6e8ec]" id="schedule-assign-section">
                                        <strong className="text-alloy-midnight/70 block mb-1">Assignment</strong>
                                        {(data._assignment as { id?: string }) ? (
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="inline-flex items-center gap-2">
                                                    <span className="text-xs text-alloy-midnight/60">Assignment:</span>
                                                    <AssignmentStatusBadge statusKey={(data._assignment_status as { key?: string })?.key} label={(data._assignment_status as { label?: string })?.label} />
                                                </span>
                                                <span>{(data._vendor as { name?: string })?.name ?? "Vendor"}</span>
                                                {!(data.canceled_at as string) && (
                                                    <>
                                                        <button type="button" disabled={scheduleAssignLoading} onClick={async () => {
                                                            setScheduleAssignLoading(true);
                                                            try {
                                                                const res = await fetch(`/api/admin/schedules/${drawer.id}/assignment`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status_key: "accepted" }) });
                                                                if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
                                                                refetch(); router.refresh();
                                                            } finally { setScheduleAssignLoading(false); }
                                                        }} className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">Accept</button>
                                                        <button type="button" disabled={scheduleAssignLoading} onClick={async () => {
                                                            setScheduleAssignLoading(true);
                                                            try {
                                                                const res = await fetch(`/api/admin/schedules/${drawer.id}/assignment`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status_key: "declined" }) });
                                                                if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
                                                                refetch(); router.refresh();
                                                            } finally { setScheduleAssignLoading(false); }
                                                        }} className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded">Decline</button>
                                                    </>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-sm">
                                                <p className="mb-1"><span className="text-xs text-alloy-midnight/60">Assignment: </span><AssignmentStatusBadge statusKey={null} label="Unassigned" /></p>
                                                <p className="text-alloy-midnight/60">No schedule assignment yet</p>
                                                {(data._job_assigned_vendor as { id: string; name: string } | null) ? (
                                                    <div className="mt-2 space-y-2">
                                                        <p className="text-alloy-midnight/70">Default {vendorSingular} ({jobSingular}): {(data._job_assigned_vendor as { name: string }).name}</p>
                                                        {!(data.canceled_at as string) && (
                                                            <button
                                                                type="button"
                                                                disabled={scheduleAssignLoading}
                                                                onClick={async () => {
                                                                    if (!drawer.id) return;
                                                                    const jobVendorId = (data._job_assigned_vendor as { id: string }).id;
                                                                    setScheduleAssignLoading(true);
                                                                    try {
                                                                        const res = await fetch(`/api/admin/schedules/${drawer.id}/assign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vendor_id: jobVendorId }) });
                                                                        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Assign failed");
                                                                        refetch(); router.refresh();
                                                                    } finally { setScheduleAssignLoading(false); }
                                                                }}
                                                                className="px-2 py-1.5 text-sm bg-alloy-blue text-white rounded hover:opacity-90 disabled:opacity-50"
                                                            >
                                                                {scheduleAssignLoading ? "Creating…" : "Create assignment from default"}
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : null}
                                            </div>
                                        )}
                                        {!(data.canceled_at as string) && scheduleVendors.length > 0 && ((data._assignment as { id?: string }) || !(data._job_assigned_vendor as { id?: string })) && (
                                            <div className="mt-2 flex items-center gap-2">
                                                <label className="text-sm text-alloy-midnight/70">{(data._assignment as { id?: string }) ? `Override ${vendorSingular}` : `Assign ${vendorSingular}`}</label>
                                                <select
                                                    value=""
                                                    onChange={async (e) => {
                                                        const vid = e.target.value;
                                                        if (!vid) return;
                                                        setScheduleAssignLoading(true);
                                                        try {
                                                            const res = await fetch(`/api/admin/schedules/${drawer.id}/assign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vendor_id: vid }) });
                                                            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Assign failed");
                                                            refetch(); router.refresh();
                                                            e.target.value = "";
                                                        } finally { setScheduleAssignLoading(false); }
                                                    }}
                                                    disabled={scheduleAssignLoading}
                                                    className="px-2 py-1.5 border rounded text-sm"
                                                >
                                                    <option value="">— Select vendor —</option>
                                                    {scheduleVendors.map((v) => (
                                                        <option key={v.id} value={v.id}>
                                                            {v.label ?? formatVendorOptionLabel({ id: v.id, name: v.name })}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                    {!(data.canceled_at as string) && (
                                        <div className="pt-3 border-t border-[#e6e8ec] space-y-2">
                                            <div className="mb-1">
                                                <strong className="text-sm text-alloy-midnight/85 block">Cancel visit</strong>
                                                <p className="text-[11px] text-alloy-midnight/55 leading-snug max-w-xl mt-0.5">
                                                    Separate from workflow status above. Calls the cancel API (sets{" "}
                                                    <code className="text-[10px] bg-alloy-stone/40 px-1 rounded">canceled_at</code> and fee rules on
                                                    the server).
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                            {!scheduleCancelPrompt ? (
                                                <button type="button" onClick={() => setScheduleCancelPrompt(true)} className="px-2 py-1.5 text-sm border border-alloy-ember/50 text-alloy-ember rounded hover:bg-alloy-ember/10">Cancel {scheduleSingular.toLowerCase()}</button>
                                            ) : (
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <input value={scheduleCancelReason} onChange={(e) => setScheduleCancelReason(e.target.value)} placeholder="Reason (optional)" className="px-2 py-1.5 border rounded text-sm w-40" />
                                                    <button type="button" onClick={async () => {
                                                        try {
                                                            const res = await fetch(`/api/admin/schedules/${drawer.id}/cancel`, {
                                                                method: "POST",
                                                                headers: { "Content-Type": "application/json" },
                                                                body: JSON.stringify({ cancel_reason: scheduleCancelReason || null }),
                                                            });
                                                            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
                                                            setScheduleCancelReason("");
                                                            setScheduleCancelPrompt(false);
                                                            refetch(); router.refresh();
                                                            window.dispatchEvent(new CustomEvent("admin-entity-saved", { detail: { type: "schedules", id: drawer.id } }));
                                                        } catch (err) { setSaveError((err as Error).message); }
                                                    }} className="px-2 py-1.5 text-sm bg-alloy-ember/15 text-alloy-ember rounded hover:bg-alloy-ember/20">Confirm cancel</button>
                                                    <button type="button" onClick={() => { setScheduleCancelPrompt(false); setScheduleCancelReason(""); }} className="text-sm text-alloy-midnight/60">Back</button>
                                                </div>
                                            )}
                                            <button type="button" onClick={() => setScheduleRescheduleForm(scheduleRescheduleForm ? null : { start_at: (data.start_at as string) ? new Date(data.start_at as string).toISOString().slice(0, 16) : "", end_at: (data.end_at as string) ? new Date(data.end_at as string).toISOString().slice(0, 16) : "", copy_assignment: !!(data._assignment as { id?: string }) })} className="px-2 py-1.5 text-sm border border-alloy-blue text-alloy-blue rounded hover:bg-alloy-stone/10">Reschedule</button>
                                            </div>
                                        </div>
                                    )}
                                    {scheduleRescheduleForm && (
                                        <div className="pt-2 border border-[#e6e8ec] rounded p-2 space-y-2">
                                            <strong className="text-sm">New time</strong>
                                            <input type="datetime-local" value={scheduleRescheduleForm.start_at} onChange={(e) => setScheduleRescheduleForm((f) => f ? { ...f, start_at: e.target.value } : null)} className="w-full px-2 py-1.5 border rounded text-sm" />
                                            <input type="datetime-local" value={scheduleRescheduleForm.end_at} onChange={(e) => setScheduleRescheduleForm((f) => f ? { ...f, end_at: e.target.value } : null)} className="w-full px-2 py-1.5 border rounded text-sm" />
                                            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={scheduleRescheduleForm.copy_assignment} onChange={(e) => setScheduleRescheduleForm((f) => f ? { ...f, copy_assignment: e.target.checked } : null)} /> Copy assignment to new schedule</label>
                                            <div className="flex gap-2">
                                                <button type="button" disabled={scheduleRescheduleSaving} onClick={async () => {
                                                    if (!scheduleRescheduleForm || !drawer.id) return;
                                                    setScheduleRescheduleSaving(true);
                                                    try {
                                                        const res = await fetch(`/api/admin/schedules/${drawer.id}/reschedule`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ start_at: new Date(scheduleRescheduleForm.start_at).toISOString(), end_at: new Date(scheduleRescheduleForm.end_at).toISOString(), copy_assignment: scheduleRescheduleForm.copy_assignment }) });
                                                        const json = await res.json().catch(() => ({}));
                                                        if (!res.ok) throw new Error((json.error as string) || "Reschedule failed");
                                                        setScheduleRescheduleForm(null);
                                                        const newId = (json as { schedule_id?: string }).schedule_id;
                                                        if (newId) openDrawer({ type: "schedules", id: newId });
                                                        refetch(); router.refresh();
                                                    } finally { setScheduleRescheduleSaving(false); }
                                                }} className="px-2 py-1.5 text-sm bg-alloy-blue text-white rounded disabled:opacity-50">{scheduleRescheduleSaving ? "Creating…" : "Create new schedule"}</button>
                                                <button type="button" onClick={() => setScheduleRescheduleForm(null)} className="px-2 py-1.5 text-sm border rounded">Cancel</button>
                                            </div>
                                        </div>
                                    )}
                                    <div className="pt-4 border-t border-[#e6e8ec]">
                                        <strong className="text-alloy-midnight/70 block mb-2">Financials</strong>
                                        {scheduleFinancialsLoading && <p className="text-sm text-alloy-midnight/60">Loading…</p>}
                                        {!scheduleFinancialsLoading && scheduleFinancials && (
                                            <div className="space-y-3 text-sm">
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-alloy-midnight/80">
                                                    <span>Gross</span><span>{formatMoneyFromCents(scheduleFinancials.computed.gross_cents)}</span>
                                                    <span>Discount</span><span>{formatMoneyFromCents(scheduleFinancials.computed.discount_cents)}</span>
                                                    <span>Net</span><span>{formatMoneyFromCents(scheduleFinancials.computed.net_cents)}</span>
                                                    <span>Payout %</span><span>{formatPayoutPercent(scheduleFinancials.computed.payout_percent)}</span>
                                                    <span>Payout $</span><span>{formatMoneyFromCents(scheduleFinancials.computed.payout_cents)}</span>
                                                    <span>Alloy fee $</span><span>{formatMoneyFromCents(scheduleFinancials.computed.alloy_fee_cents)}</span>
                                                </div>
                                                <p className="text-alloy-midnight/70">
                                                    <strong>Posting status:</strong>{" "}
                                                    {scheduleFinancials.journal_entry ? (
                                                        <>Posted · Entry {scheduleFinancials.journal_entry.id.slice(0, 8)}… · {scheduleFinancials.journal_entry.entry_date ?? "—"}</>
                                                    ) : (
                                                        "Not posted"
                                                    )}
                                                </p>
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-alloy-midnight/80 text-sm">
                                                    <span>Customer payment posted?</span><span>{scheduleFinancials.customer_payment_posted ? "Yes" : "No"}</span>
                                                    <span>Vendor payout posted?</span><span>{scheduleFinancials.vendor_payout_posted ? "Yes" : "No"}</span>
                                                </div>
                                                {canMutate && (
                                                    <ScheduleCashEventButtons
                                                        scheduleId={drawer.id}
                                                        onSuccess={() => {
                                                            fetch(`/api/admin/financials/schedule/${drawer.id}`)
                                                                .then((r) => (r.ok ? r.json() : null))
                                                                .then(setScheduleFinancials)
                                                                .catch(() => setScheduleFinancials(null));
                                                        }}
                                                    />
                                                )}
                                                {scheduleFinancials.journal_entry && scheduleFinancials.journal_entry.lines.length > 0 && (
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-xs border border-[#e6e8ec]">
                                                            <thead><tr className="border-b bg-[#F4F6F9] text-left"><th className="py-1.5 px-2">Account</th><th className="py-1.5 px-2">Debit</th><th className="py-1.5 px-2">Credit</th></tr></thead>
                                                            <tbody>
                                                                {scheduleFinancials.journal_entry.lines.map((line) => (
                                                                    <tr key={line.line_no} className="border-b border-[#e6e8ec]/50">
                                                                        <td className="py-1 px-2">{(line.account_code ?? line.account_name ?? line.account_id) || "—"}</td>
                                                                        <td className="py-1 px-2">{line.debit_cents > 0 ? formatMoneyFromCents(line.debit_cents) : "—"}</td>
                                                                        <td className="py-1 px-2">{line.credit_cents > 0 ? formatMoneyFromCents(line.credit_cents) : "—"}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {!scheduleFinancialsLoading && !scheduleFinancials && drawer.id && drawer.id !== "new" && <p className="text-sm text-alloy-midnight/50">Could not load financials.</p>}
                                    </div>
                                </>
                            )}
                            {drawer.type === "locations" && data && (
                                <>
                                    <Field label="Type" value={(data._location_type_label as string) ?? ((data.location_type as string) ? String(data.location_type).charAt(0).toUpperCase() + String(data.location_type).slice(1).toLowerCase() : "—")} />
                                    <Field label="Owner" value={(data.customer_id as string) ? `${customerSingular} location` : "Org location"} />
                                    {isEditing ? (
                                        <>
                                            {(data as { _create?: boolean })?._create && (
                                                <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Customer (optional)</label><select value={String(formData.customer_id ?? "")} onChange={(e) => setFormData((f) => ({ ...f, customer_id: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm"><option value="">— Org-wide —</option>{locationCustomerOptions.map((c) => <option key={c.id} value={c.id}>{c.name ?? c.id}</option>)}</select></div>
                                            )}
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Name</label><input value={String(formData.label ?? "")} onChange={(e) => setFormData((f) => ({ ...f, label: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Type</label><select value={String(formData.location_type_id ?? "")} onChange={(e) => setFormData((f) => ({ ...f, location_type_id: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm"><option value="">— Select —</option>{locationTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
                                            <div className="flex items-center gap-2"><input type="checkbox" checked={!!formData.is_active} onChange={(e) => setFormData((f) => ({ ...f, is_active: e.target.checked }))} /><label className="text-sm text-alloy-midnight/70">Active</label></div>
                                            {((formData.customer_id as string) || (data.customer_id as string)) && <div className="flex items-center gap-2"><input type="checkbox" checked={!!formData.is_primary} onChange={(e) => setFormData((f) => ({ ...f, is_primary: e.target.checked }))} /><label className="text-sm text-alloy-midnight/70">Primary</label></div>}
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Address 1</label><input value={String(formData.address1 ?? "")} onChange={(e) => setFormData((f) => ({ ...f, address1: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Address 2</label><input value={String(formData.address2 ?? "")} onChange={(e) => setFormData((f) => ({ ...f, address2: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                            <div className="grid grid-cols-3 gap-2"><input value={String(formData.city ?? "")} onChange={(e) => setFormData((f) => ({ ...f, city: e.target.value }))} placeholder="City" className="px-2 py-1.5 border rounded text-sm" /><input value={String(formData.state ?? "")} onChange={(e) => setFormData((f) => ({ ...f, state: e.target.value }))} placeholder="State" className="px-2 py-1.5 border rounded text-sm" /><input value={String(formData.postal_code ?? "")} onChange={(e) => setFormData((f) => ({ ...f, postal_code: e.target.value }))} placeholder="ZIP" className="px-2 py-1.5 border rounded text-sm" /></div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Country</label><input value={String(formData.country ?? "")} onChange={(e) => setFormData((f) => ({ ...f, country: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Access notes</label><textarea value={String(formData.access_notes ?? "")} onChange={(e) => setFormData((f) => ({ ...f, access_notes: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" rows={2} /></div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Access code</label><input value={String(formData.access_code ?? "")} onChange={(e) => setFormData((f) => ({ ...f, access_code: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Access method key</label><input value={String(formData.access_method_key ?? "")} onChange={(e) => setFormData((f) => ({ ...f, access_method_key: e.target.value }))} placeholder="lockbox, front_desk, …" className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Beds</label><input type="number" step="1" value={formData.beds === "" || formData.beds == null ? "" : String(formData.beds)} onChange={(e) => setFormData((f) => ({ ...f, beds: e.target.value === "" ? "" : Number(e.target.value) }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                                <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Baths</label><input type="number" step="0.1" value={formData.baths === "" || formData.baths == null ? "" : String(formData.baths)} onChange={(e) => setFormData((f) => ({ ...f, baths: e.target.value === "" ? "" : Number(e.target.value) }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                            </div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Home type key</label><input value={String(formData.home_type_key ?? "")} onChange={(e) => setFormData((f) => ({ ...f, home_type_key: e.target.value }))} placeholder="house, condo, …" className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Sq ft tier key</label><input value={String(formData.square_footage_tier_key ?? "")} onChange={(e) => setFormData((f) => ({ ...f, square_footage_tier_key: e.target.value }))} placeholder="0_1499, …" className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                        </>
                                    ) : (
                                        <>
                                            <Field label="Name" value={String(data?.label ?? "")} />
                                            <Field label="Address 1" value={String(data?.address1 ?? "")} />
                                            <Field label="Address 2" value={String(data?.address2 ?? "")} />
                                            <Field label="City" value={String(data?.city ?? "")} />
                                            <Field label="State" value={String(data?.state ?? "")} />
                                            <Field label="Postal code" value={String(data?.postal_code ?? "")} />
                                            <Field label="Country" value={String(data?.country ?? "")} />
                                            <Field label="Primary" value={data.is_primary ? "Yes" : "No"} />
                                            <Field label="Active" value={data.is_active ? "Yes" : "No"} />
                                            <Field label="Access notes" value={String(data?.access_notes ?? "")} />
                                            <Field label="Access code" value={String(data?.access_code ?? "")} />
                                            <Field label="Access method key" value={String(data?.access_method_key ?? "")} />
                                            <Field label="Beds" value={data?.beds != null && data.beds !== "" ? String(data.beds) : "—"} />
                                            <Field label="Baths" value={data?.baths != null && data.baths !== "" ? String(data.baths) : "—"} />
                                            <Field label="Home type key" value={String(data?.home_type_key ?? "")} />
                                            <Field label="Sq ft tier key" value={String(data?.square_footage_tier_key ?? "")} />
                                            <DrawerLinkWithName label="Customer" id={data?.customer_id != null ? String(data.customer_id) : null} type="customers" displayName={String(data?._customer_name ?? "")} />
                                        </>
                                    )}
                                </>
                            )}
                            {drawer.type === "workflows" && data && (
                                <>
                                    {(data as { _create?: boolean })._create ? (
                                        <div className="space-y-4">
                                            {createError && <p className="text-red-600 text-sm">{createError}</p>}
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Name *</label><input value={String(formData.name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Description</label><input value={String(formData.description ?? "")} onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                            <div className="flex items-center gap-2"><input type="checkbox" checked={!!formData.enabled} onChange={(e) => setFormData((f) => ({ ...f, enabled: e.target.checked }))} /><label className="text-sm text-alloy-midnight/70">Enabled</label></div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Event type</label><select value={String(formData.event_type ?? "")} onChange={(e) => setFormData((f) => ({ ...f, event_type: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm"><option value="">— Select —</option>{WORKFLOW_EVENT_TYPES.map((ev) => <option key={ev} value={ev}>{ev}</option>)}</select></div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Entity type</label><select value={String(formData.entity_type ?? "")} onChange={(e) => setFormData((f) => ({ ...f, entity_type: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm"><option value="">— Select —</option>{WORKFLOW_ENTITY_TYPES.map((ent) => <option key={ent} value={ent}>{ent}</option>)}</select></div>
                                            <div className="flex gap-2">
                                                <button type="button" disabled={createSaving || !(formData.name as string)?.trim()} onClick={async () => {
                                                    setCreateSaving(true); setCreateError(null);
                                                    try {
                                                        const res = await fetch("/api/admin/workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: (formData.name as string)?.trim(), description: (formData.description as string) || null, enabled: !!formData.enabled, event_type: (formData.event_type as string) || null, entity_type: (formData.entity_type as string) || null }) });
                                                        const json = await res.json().catch(() => ({}));
                                                        if (!res.ok) throw new Error((json.error as string) || "Create failed");
                                                        const newId = (json as { id: string }).id;
                                                        if (newId) { openDrawer({ type: "workflows", id: newId }); router.refresh(); }
                                                        else setCreateError("No id returned");
                                                    } catch (e: unknown) { setCreateError((e as Error).message); }
                                                    setCreateSaving(false);
                                                }} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md disabled:opacity-50">{createSaving ? "Creating…" : "Create"}</button>
                                                <button type="button" onClick={closeDrawer} className="px-3 py-1.5 text-sm border rounded-md">Cancel</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {isEditing ? (
                                                <>
                                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Name</label><input value={String(formData.name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Description</label><input value={String(formData.description ?? "")} onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                                    <div className="flex items-center gap-2"><input type="checkbox" checked={!!formData.enabled} onChange={(e) => setFormData((f) => ({ ...f, enabled: e.target.checked }))} /><label className="text-sm text-alloy-midnight/70">Enabled</label></div>
                                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Event type</label><select value={String(formData.event_type ?? "")} onChange={(e) => setFormData((f) => ({ ...f, event_type: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm"><option value="">— Select —</option>{WORKFLOW_EVENT_TYPES.map((ev) => <option key={ev} value={ev}>{ev}</option>)}</select></div>
                                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Entity type</label><select value={String(formData.entity_type ?? "")} onChange={(e) => setFormData((f) => ({ ...f, entity_type: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm"><option value="">— Select —</option>{WORKFLOW_ENTITY_TYPES.map((ent) => <option key={ent} value={ent}>{ent}</option>)}</select></div>
                                                    <div className="pt-2 border-t border-[#e6e8ec]">
                                                        <strong className="text-alloy-midnight/70 block mb-2">Conditions</strong>
                                                        {workflowConditions.map((c, i) => {
                                                            const entityType = c.target_entity || (formData.entity_type as string) || "job";
                                                            const fieldOptions = fieldCatalogByEntity[entityType] ?? [];
                                                            const selectedField = fieldOptions.find((f) => f.key === c.field_path);
                                                            const operators = selectedField?.operators?.length ? selectedField.operators : ["eq", "neq", "contains", "exists", "is_null", "not_null"];
                                                            const optionsWithCustom = c.field_path && !selectedField
                                                                ? [...fieldOptions, { key: c.field_path, label: c.field_path, data_type: "text", operators: ["eq", "neq", "contains", "exists", "is_null", "not_null"], source: "custom" as const }]
                                                                : fieldOptions;
                                                            return (
                                                                <div key={i} className="flex gap-2 items-center mb-2 flex-wrap">
                                                                    <select value={c.target_entity ?? ""} onChange={(e) => setWorkflowConditions((prev) => prev.map((p, j) => j === i ? { ...p, target_entity: e.target.value || undefined } : p))} className="w-28 px-2 py-1.5 border rounded text-sm" title="Target entity">
                                                                        <option value="">Entity…</option>
                                                                        {WORKFLOW_ENTITY_TYPES.map((ent) => <option key={ent} value={ent}>{ent}</option>)}
                                                                    </select>
                                                                    <select
                                                                        value={c.field_path}
                                                                        onChange={(e) => setWorkflowConditions((prev) => prev.map((p, j) => j === i ? { ...p, field_path: e.target.value, operator: "eq" } : p))}
                                                                        className="flex-1 min-w-0 min-w-[140px] max-w-[200px] px-2 py-1.5 border rounded text-sm"
                                                                        title="Field"
                                                                    >
                                                                        <option value="">— Field —</option>
                                                                        {optionsWithCustom.map((f) => (
                                                                            <option key={f.key} value={f.key}>{f.label}</option>
                                                                        ))}
                                                                    </select>
                                                                    {fieldOptions.length === 0 && entityType && (
                                                                        <span className="text-xs text-alloy-midnight/60">Loading fields…</span>
                                                                    )}
                                                                    <select value={c.operator} onChange={(e) => setWorkflowConditions((prev) => prev.map((p, j) => j === i ? { ...p, operator: e.target.value } : p))} className="w-24 px-2 py-1.5 border rounded text-sm">
                                                                        {operators.map((op) => (
                                                                            <option key={op} value={op}>{op}</option>
                                                                        ))}
                                                                    </select>
                                                                    <input placeholder="value" value={c.value} onChange={(e) => setWorkflowConditions((prev) => prev.map((p, j) => j === i ? { ...p, value: e.target.value } : p))} className="flex-1 min-w-0 px-2 py-1.5 border rounded text-sm max-w-[120px]" />
                                                                    <button type="button" onClick={() => setWorkflowConditions((prev) => prev.filter((_, j) => j !== i))} className="text-red-600 text-sm">Remove</button>
                                                                </div>
                                                            );
                                                        })}
                                                        <button type="button" onClick={() => setWorkflowConditions((prev) => [...prev, { target_entity: (formData.entity_type as string) || undefined, field_path: "", operator: "eq", value: "" }])} className="text-sm text-alloy-blue hover:underline">Add condition</button>
                                                    </div>
                                                    <div className="pt-2 border-t border-[#e6e8ec]">
                                                        <strong className="text-alloy-midnight/70 block mb-2">Actions</strong>
                                                        {workflowActions.map((a, i) => (
                                                            <div key={i} className="border border-[#e6e8ec] rounded p-2 mb-2">
                                                                <div className="flex gap-2 items-center mb-1 flex-wrap">
                                                                    <select value={a.action_type} onChange={(e) => setWorkflowActions((prev) => prev.map((p, j) => j === i ? { ...p, action_type: e.target.value } : p))} className="px-2 py-1.5 border rounded text-sm">
                                                                        <option value="log">log</option>
                                                                        <option value="create_message">create_message</option>
                                                                        <option value="send_message">send_message</option>
                                                                        <option value="update_entity">update_entity</option>
                                                                    </select>
                                                                    {(a.action_type === "update_entity" || a.action_type === "send_message") && (
                                                                        <select value={a.target_entity ?? ""} onChange={(e) => setWorkflowActions((prev) => prev.map((p, j) => j === i ? { ...p, target_entity: e.target.value || undefined } : p))} className="px-2 py-1.5 border rounded text-sm">
                                                                            <option value="">— Entity —</option>
                                                                            {WORKFLOW_ENTITY_TYPES.map((ent) => <option key={ent} value={ent}>{ent}</option>)}
                                                                        </select>
                                                                    )}
                                                                    <button type="button" onClick={() => setWorkflowActions((prev) => prev.filter((_, j) => j !== i))} className="text-red-600 text-sm">Remove</button>
                                                                    <button type="button" onClick={() => setWorkflowActions((prev) => {
                                                                        if (i <= 0) return prev;
                                                                        const next = [...prev];
                                                                        [next[i - 1], next[i]] = [next[i], next[i - 1]];
                                                                        return next;
                                                                    })} className="text-sm">↑</button>
                                                                    <button type="button" onClick={() => setWorkflowActions((prev) => {
                                                                        if (i >= prev.length - 1) return prev;
                                                                        const next = [...prev];
                                                                        [next[i], next[i + 1]] = [next[i + 1], next[i]];
                                                                        return next;
                                                                    })} className="text-sm">↓</button>
                                                                </div>
                                                                {a.action_type === "create_message" ? (
                                                                    <>
                                                                        <div className="flex justify-end">
                                                                            <button type="button" onClick={() => setWorkflowActionAdvanced((prev) => ({ ...prev, [i]: !prev[i] }))} className="text-xs text-alloy-blue hover:underline">
                                                                                {workflowActionAdvanced[i] ? "Basic mode" : "Advanced (JSON)"}
                                                                            </button>
                                                                        </div>
                                                                        {workflowActionAdvanced[i] ? (
                                                                            <>
                                                                                <label className="block text-xs text-alloy-midnight/60 mb-0.5">Payload (JSON)</label>
                                                                                <textarea value={typeof a.payload === "object" ? JSON.stringify(a.payload, null, 2) : "{}"} onChange={(e) => {
                                                                                    try { const v = e.target.value.trim() ? JSON.parse(e.target.value) : {}; setWorkflowActions((prev) => prev.map((p, j) => j === i ? { ...p, payload: v } : p)); } catch { /* invalid */ }
                                                                                }} className="w-full px-2 py-1.5 border rounded text-sm font-mono" rows={4} />
                                                                            </>
                                                                        ) : (() => {
                                                                            const pl = (a.payload && typeof a.payload === "object" ? a.payload : {}) as Record<string, unknown>;
                                                                            return (
                                                                                <div className="space-y-2">
                                                                                    <div>
                                                                                        <label className="block text-xs text-alloy-midnight/60 mb-0.5">Channel</label>
                                                                                        <select value={String(pl.channel ?? "email")} onChange={(e) => setWorkflowActions((prev) => prev.map((p, j) => j === i ? { ...p, payload: { ...(typeof p.payload === "object" && p.payload ? p.payload : {}), channel: e.target.value } } : p))} className="w-full px-2 py-1.5 border rounded text-sm">
                                                                                            <option value="email">email</option>
                                                                                            <option value="sms">sms</option>
                                                                                        </select>
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="block text-xs text-alloy-midnight/60 mb-0.5">To (supports {"{{contact.phone}}"} etc.)</label>
                                                                                        <input value={String(pl.to_value ?? "")} onChange={(e) => setWorkflowActions((prev) => prev.map((p, j) => j === i ? { ...p, payload: { ...(typeof p.payload === "object" && p.payload ? p.payload : {}), to_value: e.target.value } } : p))} className="w-full px-2 py-1.5 border rounded text-sm" placeholder="e.g. {{contact.phone}}" />
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="block text-xs text-alloy-midnight/60 mb-0.5">Body (supports templates)</label>
                                                                                        <textarea value={String(pl.body ?? "")} onChange={(e) => setWorkflowActions((prev) => prev.map((p, j) => j === i ? { ...p, payload: { ...(typeof p.payload === "object" && p.payload ? p.payload : {}), body: e.target.value } } : p))} className="w-full px-2 py-1.5 border rounded text-sm" rows={3} placeholder="e.g. Booked: {{job.title}} at {{schedule.start_at}}" />
                                                                                    </div>
                                                                                    <div>
                                                                                        <span className="block text-xs text-alloy-midnight/60 mb-1">Attach to records</span>
                                                                                        <div className="flex flex-wrap gap-3">
                                                                                            {(["contact_id", "customer_id", "job_id", "opportunity_id"] as const).map((key) => {
                                                                                                const template = key === "contact_id" ? "{{contact.id}}" : key === "customer_id" ? "{{customer.id}}" : key === "job_id" ? "{{job.id}}" : "{{opportunity.id}}";
                                                                                                const checked = pl[key] === template;
                                                                                                return (
                                                                                                    <label key={key} className="flex items-center gap-1 text-sm">
                                                                                                        <input type="checkbox" checked={!!checked} onChange={(e) => {
                                                                                                            const next = { ...(typeof a.payload === "object" && a.payload ? a.payload : {}) } as Record<string, unknown>;
                                                                                                            next[key] = e.target.checked ? template : undefined;
                                                                                                            setWorkflowActions((prev) => prev.map((p, j) => j === i ? { ...p, payload: next } : p));
                                                                                                        }} className="rounded" />
                                                                                                        {key.replace(/_id$/, "")}
                                                                                                    </label>
                                                                                                );
                                                                                            })}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })()}
                                                                    </>
                                                                ) : a.action_type === "send_message" ? (
                                                                    (() => {
                                                                        const pl = (a.payload && typeof a.payload === "object" ? a.payload : {}) as Record<string, unknown>;
                                                                        const recipients = (Array.isArray(pl.recipients) ? pl.recipients : []) as { type?: string; source?: string; path?: string; vendor_id_path?: string; role_in?: string[]; max?: number; status_key?: string | null; vertical_slug?: string | null; match_job_vertical?: boolean; match_job_zip?: boolean }[];
                                                                        const updateRecipient = (ri: number, patch: Partial<typeof recipients[0]>) => {
                                                                            const next = [...recipients];
                                                                            next[ri] = { ...next[ri], ...patch };
                                                                            setWorkflowActions((prev) => prev.map((p, j) => j === i ? { ...p, payload: { ...(typeof p.payload === "object" && p.payload ? p.payload : {}), recipients: next } } : p));
                                                                        };
                                                                        return (
                                                                            <div className="space-y-2">
                                                                                <div>
                                                                                    <label className="block text-xs text-alloy-midnight/60 mb-0.5">Channel</label>
                                                                                    <select value={String(pl.channel ?? "sms")} onChange={(e) => setWorkflowActions((prev) => prev.map((p, j) => j === i ? { ...p, payload: { ...(typeof p.payload === "object" && p.payload ? p.payload : {}), channel: e.target.value } } : p))} className="w-full px-2 py-1.5 border rounded text-sm">
                                                                                        <option value="sms">sms</option>
                                                                                        <option value="email">email</option>
                                                                                    </select>
                                                                                </div>
                                                                                <div>
                                                                                    <label className="block text-xs text-alloy-midnight/60 mb-0.5">Template / body (supports {`{{job.title}}`}, {`{{schedule.start_at}}`})</label>
                                                                                    <textarea value={String(pl.template ?? pl.body ?? "")} onChange={(e) => setWorkflowActions((prev) => prev.map((p, j) => j === i ? { ...p, payload: { ...(typeof p.payload === "object" && p.payload ? p.payload : {}), template: e.target.value, body: e.target.value } } : p))} className="w-full px-2 py-1.5 border rounded text-sm" rows={3} placeholder="New job: {{job.title}} at {{schedule.start_at}}" />
                                                                                </div>
                                                                                <div>
                                                                                    <label className="block text-xs text-alloy-midnight/60 mb-0.5">Recipients</label>
                                                                                    {recipients.map((rec, ri) => {
                                                                                        const recTypeKey = rec.source === "payload" && rec.path === "contact.id" ? "payload_contact" : rec.source === "payload" && rec.path === "customer.primary_contact_id" ? "customer_primary" : rec.source === "payload" && rec.path === "vendor.primary_contact_id" ? "vendor_primary" : rec.type === "contacts_by_vendor" ? "contacts_by_vendor" : rec.type === "job_qualified_vendors" ? "job_qualified_vendors" : rec.type === "vendors_query" ? "vendors_query" : "";
                                                                                        return (
                                                                                            <div key={ri} className="flex flex-wrap gap-2 items-center mb-2 p-2 border border-[#e6e8ec] rounded">
                                                                                                <select value={recTypeKey} onChange={(e) => {
                                                                                                    const t = e.target.value;
                                                                                                    const next = [...recipients];
                                                                                                    if (t === "payload_contact") next[ri] = { type: "contact", source: "payload", path: "contact.id" };
                                                                                                    else if (t === "customer_primary") next[ri] = { type: "customer", source: "payload", path: "customer.primary_contact_id" };
                                                                                                    else if (t === "vendor_primary") next[ri] = { type: "vendor", source: "payload", path: "vendor.primary_contact_id" };
                                                                                                    else if (t === "contacts_by_vendor") next[ri] = { type: "contacts_by_vendor", source: "query", vendor_id_path: "vendor.id", role_in: ["primary", "billing"] };
                                                                                                    else if (t === "job_qualified_vendors") next[ri] = { type: "job_qualified_vendors", source: "resolver", max: 25, role_in: ["primary"] };
                                                                                                    else if (t === "vendors_query") next[ri] = { type: "vendors_query", source: "query", status_key: "active", vertical_slug: null, match_job_vertical: true, match_job_zip: true, max: 25, role_in: ["primary"] };
                                                                                                    else next[ri] = { type: "contact", source: "payload", path: "contact.id" };
                                                                                                    setWorkflowActions((prev) => prev.map((p, j) => j === i ? { ...p, payload: { ...(typeof p.payload === "object" && p.payload ? p.payload : {}), recipients: next } } : p));
                                                                                                }} className="min-w-[200px] px-2 py-1.5 border rounded text-sm">
                                                                                                    <option value="">— Type —</option>
                                                                                                    <option value="payload_contact">Payload contact</option>
                                                                                                    <option value="customer_primary">Customer primary contact</option>
                                                                                                    <option value="vendor_primary">Vendor primary contact</option>
                                                                                                    <option value="contacts_by_vendor">All contacts for vendor (by role)</option>
                                                                                                    <option value="job_qualified_vendors">Qualified vendors for job (resolver)</option>
                                                                                                    <option value="vendors_query">Vendors (query)</option>
                                                                                                </select>
                                                                                                {rec.type === "job_qualified_vendors" && (
                                                                                                    <>
                                                                                                        <label className="text-xs text-alloy-midnight/60 shrink-0">Max</label>
                                                                                                        <input type="number" min={1} max={500} value={rec.max ?? 25} onChange={(e) => updateRecipient(ri, { max: Math.max(1, parseInt(e.target.value, 10) || 25) })} className="w-16 px-2 py-1.5 border rounded text-sm" />
                                                                                                        <label className="text-xs text-alloy-midnight/60 shrink-0">Roles (optional)</label>
                                                                                                        <input type="text" value={Array.isArray(rec.role_in) ? rec.role_in.join(", ") : "primary"} onChange={(e) => updateRecipient(ri, { role_in: e.target.value.split(",").map((s) => s.trim()).filter(Boolean).length ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean) : ["primary"] })} className="w-24 px-2 py-1.5 border rounded text-sm" placeholder="primary" title="role_in for resolver" />
                                                                                                    </>
                                                                                                )}
                                                                                                {rec.type === "vendors_query" && (
                                                                                                    <div className="flex flex-wrap gap-2 items-center w-full mt-1">
                                                                                                        <label className="text-xs text-alloy-midnight/60 shrink-0">Status</label>
                                                                                                        <select value={rec.status_key ?? ""} onChange={(e) => updateRecipient(ri, { status_key: e.target.value || null })} className="px-2 py-1.5 border rounded text-sm min-w-[100px]">
                                                                                                            <option value="">— Any —</option>
                                                                                                            {vendorStatuses.map((s) => <option key={s.id} value={s.key}>{s.label}</option>)}
                                                                                                        </select>
                                                                                                        <label className="text-xs text-alloy-midnight/60 shrink-0 ml-1">Vertical</label>
                                                                                                        <select value={rec.vertical_slug ?? ""} onChange={(e) => updateRecipient(ri, { vertical_slug: e.target.value || null })} className="px-2 py-1.5 border rounded text-sm min-w-[100px]" disabled={rec.match_job_vertical !== false}>
                                                                                                            <option value="">— None (use job) —</option>
                                                                                                            {workflowVerticals.map((v) => <option key={v.id} value={v.slug}>{v.name}</option>)}
                                                                                                        </select>
                                                                                                        <label className="flex items-center gap-1 text-xs text-alloy-midnight/60 shrink-0"><input type="checkbox" checked={rec.match_job_vertical !== false} onChange={(e) => updateRecipient(ri, { match_job_vertical: e.target.checked })} /> Use job vertical</label>
                                                                                                        <label className="flex items-center gap-1 text-xs text-alloy-midnight/60 shrink-0"><input type="checkbox" checked={rec.match_job_zip !== false} onChange={(e) => updateRecipient(ri, { match_job_zip: e.target.checked })} /> Match job zip</label>
                                                                                                        <label className="text-xs text-alloy-midnight/60 shrink-0">Max</label>
                                                                                                        <input type="number" min={1} max={500} value={rec.max ?? 25} onChange={(e) => updateRecipient(ri, { max: Math.max(1, parseInt(e.target.value, 10) || 25) })} className="w-16 px-2 py-1.5 border rounded text-sm" />
                                                                                                        <label className="text-xs text-alloy-midnight/60 shrink-0">Roles</label>
                                                                                                        <input type="text" value={Array.isArray(rec.role_in) ? rec.role_in.join(", ") : "primary"} onChange={(e) => updateRecipient(ri, { role_in: e.target.value.split(",").map((s) => s.trim()).filter(Boolean).length ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean) : ["primary"] })} className="w-24 px-2 py-1.5 border rounded text-sm" placeholder="primary" />
                                                                                                    </div>
                                                                                                )}
                                                                                                {rec.type === "contacts_by_vendor" && (
                                                                                                    <input value={rec.vendor_id_path ?? "vendor.id"} onChange={(e) => updateRecipient(ri, { vendor_id_path: e.target.value || "vendor.id" })} className="w-28 px-2 py-1.5 border rounded text-sm" placeholder="vendor_id_path" />
                                                                                                )}
                                                                                                {!rec.type?.includes("vendor") && rec.type !== "vendors_query" && rec.path != null && rec.source === "payload" && (
                                                                                                    <span className="text-xs text-alloy-midnight/50">{rec.path}</span>
                                                                                                )}
                                                                                                <button type="button" onClick={() => setWorkflowActions((prev) => prev.map((p, j) => j === i ? { ...p, payload: { ...(typeof p.payload === "object" && p.payload ? p.payload : {}), recipients: recipients.filter((_, k) => k !== ri) } } : p))} className="text-red-600 text-xs">Remove</button>
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                    <button type="button" onClick={() => setWorkflowActions((prev) => prev.map((p, j) => j === i ? { ...p, payload: { ...(typeof p.payload === "object" && p.payload ? p.payload : {}), recipients: [...recipients, { type: "contact", source: "payload", path: "contact.id" }] } } : p))} className="text-sm text-alloy-blue hover:underline">Add recipient</button>
                                                                                </div>
                                                                                <div>
                                                                                    <label className="block text-xs text-alloy-midnight/60 mb-0.5">Dedupe key (optional)</label>
                                                                                    <input value={String(pl.dedupe_key ?? "")} onChange={(e) => setWorkflowActions((prev) => prev.map((p, j) => j === i ? { ...p, payload: { ...(typeof p.payload === "object" && p.payload ? p.payload : {}), dedupe_key: e.target.value || undefined } } : p))} className="w-full px-2 py-1.5 border rounded text-sm" placeholder="e.g. job_new_notify_{{job.id}}" />
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })()
                                                                ) : a.action_type === "update_entity" ? (
                                                                    <>
                                                                        <p className="text-xs text-alloy-midnight/50 mb-1">Payload: <code>entity_type</code>, <code>entity_id</code> (path or literal), <code>patch</code> (object).</p>
                                                                        <div className="flex flex-wrap gap-1 mb-1">
                                                                            {WORKFLOW_ENTITY_ID_QUICK_FILL.map((opt) => (
                                                                                <button key={opt.value} type="button" onClick={() => {
                                                                                    const pl = (a.payload && typeof a.payload === "object" ? a.payload : {}) as Record<string, unknown>;
                                                                                    setWorkflowActions((prev) => prev.map((p, j) => j === i ? { ...p, payload: { ...pl, entity_id: opt.value } } : p));
                                                                                }} className="px-2 py-0.5 text-xs border border-alloy-stone/50 rounded hover:bg-alloy-stone/20">{opt.label}</button>
                                                                            ))}
                                                                        </div>
                                                                        <label className="block text-xs text-alloy-midnight/60 mb-0.5">Payload (JSON)</label>
                                                                        <textarea value={typeof a.payload === "object" ? JSON.stringify(a.payload, null, 2) : "{}"} onChange={(e) => {
                                                                            try { const v = e.target.value.trim() ? JSON.parse(e.target.value) : {}; setWorkflowActions((prev) => prev.map((p, j) => j === i ? { ...p, payload: v } : p)); } catch { /* invalid */ }
                                                                        }} className="w-full px-2 py-1.5 border rounded text-sm font-mono" rows={3} />
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <label className="block text-xs text-alloy-midnight/60 mb-0.5">Payload (JSON)</label>
                                                                        <textarea value={typeof a.payload === "object" ? JSON.stringify(a.payload, null, 2) : "{}"} onChange={(e) => {
                                                                            try { const v = e.target.value.trim() ? JSON.parse(e.target.value) : {}; setWorkflowActions((prev) => prev.map((p, j) => j === i ? { ...p, payload: v } : p)); } catch { /* invalid */ }
                                                                        }} className="w-full px-2 py-1.5 border rounded text-sm font-mono" rows={3} />
                                                                    </>
                                                                )}
                                                            </div>
                                                        ))}
                                                        <button type="button" onClick={() => setWorkflowActions((prev) => [...prev, { action_type: "log", payload: {} }])} className="text-sm text-alloy-blue hover:underline">Add action</button>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <Field label="ID" value={String(data?.id ?? "")} />
                                                    <Field label="Name" value={String(data?.name ?? "")} />
                                                    <Field label="Description" value={(data.description as string) ?? "-"} />
                                                    <Field label="Enabled" value={data.enabled ? "Yes" : "No"} />
                                                    <Field label="Event type" value={(data.event_type as string) ?? "-"} />
                                                    <Field label="Entity type" value={(data.entity_type as string) ?? "-"} />
                                                    <div className="pt-2 border-t border-[#e6e8ec]">
                                                        <strong className="text-alloy-midnight/70 block mb-1">Conditions</strong>
                                                        {(data._conditions as { target_entity?: string; field_path?: string; field?: string; operator: string; value?: string }[] | undefined)?.length ? (data._conditions as { target_entity?: string; field_path?: string; field?: string; operator: string; value?: string }[]).map((c, i) => <div key={i} className="text-sm">{(c.target_entity ?? "") && `${c.target_entity}.`}{c.field_path ?? c.field ?? ""} {c.operator} {c.value ?? ""}</div>) : <div className="text-sm text-alloy-midnight/60">None</div>}
                                                    </div>
                                                    <div className="pt-2 border-t border-[#e6e8ec]">
                                                        <strong className="text-alloy-midnight/70 block mb-1">Actions</strong>
                                                        {(data._actions as { action_order: number; action_type: string; payload?: unknown }[] | undefined)?.length ? (data._actions as { action_order: number; action_type: string; payload?: unknown }[]).map((a, i) => <div key={i} className="text-sm">{(a.action_order ?? i + 1)}. {a.action_type} {a.payload && typeof a.payload === "object" ? JSON.stringify(a.payload) : ""}</div>) : <div className="text-sm text-alloy-midnight/60">None</div>}
                                                    </div>
                                                </>
                                            )}
                                            {saveError && <p className="text-alloy-ember text-sm">{saveError}</p>}
                                            {runModalOpen && drawer.id && drawer.id !== "new" && (
                                                <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4" onClick={() => setRunModalOpen(false)}>
                                                    <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-auto p-4 border border-[#59678b]/40" onClick={(e) => e.stopPropagation()}>
                                                        <h3 className="font-semibold text-alloy-midnight mb-2">Run {workflowSingular.toLowerCase()}</h3>
                                                        <label className="block text-sm text-alloy-midnight/70 mb-1">Event payload (JSON)</label>
                                                        <textarea value={runPayload} onChange={(e) => { setRunPayload(e.target.value); setRunJsonError(null); }} className="w-full px-2 py-1.5 border rounded text-sm font-mono" rows={8} />
                                                        {runJsonError && <p className="text-red-600 text-sm mt-1">{runJsonError}</p>}
                                                        {runResult && <div className={`mt-2 p-2 rounded text-sm ${runResult.status === "completed" || runResult.status === "skipped" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{runResult.status} {runResult.workflow_run_id} {runResult.error ?? ""} {runResult.logs?.length ? <pre className="mt-1 text-xs">{runResult.logs.join("\n")}</pre> : null}</div>}
                                                        <div className="flex gap-2 mt-3">
                                                            <button type="button" disabled={runLoading} onClick={async () => {
                                                                let pl: unknown; try { pl = JSON.parse(runPayload); } catch { setRunJsonError("Invalid JSON"); return; }
                                                                setRunJsonError(null); setRunLoading(true); setRunResult(null);
                                                                try {
                                                                    const res = await fetch(`/api/admin/workflows/${drawer.id}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event_payload: pl }) });
                                                                    const json = await res.json().catch(() => ({}));
                                                                    setRunResult({ status: json.status ?? (res.ok ? "completed" : "failed"), workflow_run_id: json.workflow_run_id ?? "", error: json.error, logs: json.logs });
                                                                    if (!res.ok) setRunResult((r) => r ? { ...r, error: json.error || "Run failed" } : r);
                                                                } catch (e: unknown) { setRunResult({ status: "failed", workflow_run_id: "", error: (e as Error).message }); }
                                                                setRunLoading(false);
                                                            }} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md disabled:opacity-50">{runLoading ? "Running…" : "Run"}</button>
                                                            <button type="button" onClick={() => setRunModalOpen(false)} className="px-3 py-1.5 text-sm border rounded-md">Close</button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </>
                            )}
                            {drawer.type === "discount_redemptions" && (
                                <>
                                    <Field label="ID" value={String(data?.id ?? "")} />
                                    <Field label="Created" value={displayDateTime(data.created_at as string)} />
                                    <Field label="Discount Code" value={String(data?.discount_code ?? "")} />
                                    <Field label="Subtotal" value={formatMoneyFromDollars(data.quote_subtotal as number)} />
                                    <Field label="Discount Amount" value={formatMoneyFromDollars(data.discount_amount as number)} />
                                    <Field label="Total" value={formatMoneyFromDollars(data.quote_total as number)} />
                                    <Field label="Contact ID" value={String(data?.contact_id ?? "")} />
                                    <Field label="Opportunity ID" value={String(data?.opportunity_id ?? "")} />
                                    <Field label={`${jobSingular} ID`} value={String(data?.job_id ?? "")} />
                                </>
                            )}
                        </>
                    )}
                </div>
            ) : null}
            {drawer.type === "opportunities" && drawer.id && drawer.id !== "new" && oppLaunchPacketOpen ? (
                <OpportunityEnrollmentPacketModal
                    open={oppLaunchPacketOpen}
                    opportunityId={String(drawer.id)}
                    opportunityLabel={String((data as { name?: string } | null)?.name ?? "").trim() || "Opportunity"}
                    opportunityRecord={data && !(data as { _create?: boolean })._create ? (data as Record<string, unknown>) : null}
                    canMutate={!!canMutate}
                    onDismiss={({ createdPacketCount }) => {
                        setOppLaunchPacketOpen(false);
                        if (createdPacketCount > 0) {
                            void refetch();
                        }
                    }}
                />
            ) : null}
            {memberLinkModalOpen && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-label="Link contact" onClick={() => setMemberLinkModalOpen(false)}>
                    <div className="bg-white rounded-lg shadow-lg border border-alloy-stone/30 p-4 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-sm font-semibold text-alloy-midnight mb-3">Link contact</h3>
                        {memberLinkError && <p className="text-red-600 text-sm mb-2">{memberLinkError}</p>}
                        <div className="mb-3">
                            <label className="block text-xs font-medium text-[#59678b] mb-1">Role</label>
                            <select
                                value={memberLinkRoleKey}
                                onChange={(e) => setMemberLinkRoleKey(e.target.value)}
                                className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded text-sm"
                            >
                                <option value="">— Select role —</option>
                                {memberRelatedRoles.map((r) => (
                                    <option key={r.id} value={r.role_key}>{r.role_label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="mb-3">
                            <label className="block text-xs font-medium text-[#59678b] mb-1">{contactSingular}</label>
                            <select
                                value={memberLinkContactId}
                                onChange={(e) => setMemberLinkContactId(e.target.value)}
                                className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded text-sm"
                            >
                                <option value="">— Select {contactSingular.toLowerCase()} —</option>
                                {memberLinkContactOptions.map((c) => {
                                    const label = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.phone || c.id.slice(0, 8) + "…";
                                    return <option key={c.id} value={c.id}>{label}</option>;
                                })}
                            </select>
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button type="button" onClick={() => { setMemberLinkModalOpen(false); setMemberLinkError(null); }} className="px-3 py-1.5 text-sm border border-alloy-stone/40 rounded hover:bg-alloy-stone/20">Cancel</button>
                            <button
                                type="button"
                                disabled={memberLinkSaving || !memberLinkRoleKey || !memberLinkContactId}
                                onClick={async () => {
                                    if (!drawer.id || drawer.id === "new" || !memberLinkRoleKey || !memberLinkContactId) return;
                                    setMemberLinkSaving(true);
                                    setMemberLinkError(null);
                                    try {
                                        const res = await fetch("/api/admin/customer-member-contacts", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ customer_member_id: drawer.id, contact_id: memberLinkContactId, role_key: memberLinkRoleKey }),
                                        });
                                        const json = await res.json().catch(() => ({}));
                                        if (!res.ok) {
                                            setMemberLinkError((json as { error?: string }).error ?? "Failed to link");
                                            return;
                                        }
                                        setMemberLinkModalOpen(false);
                                        refetchMemberLinks();
                                    } finally {
                                        setMemberLinkSaving(false);
                                    }
                                }}
                                className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded hover:opacity-90 disabled:opacity-50"
                            >
                                {memberLinkSaving ? "Saving…" : "Link"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {setLocationOpen && setLocationEntity && drawer.id && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-label="Set location">
                    <div className="bg-white rounded-lg shadow-lg border border-alloy-stone/30 p-4 max-w-sm w-full mx-4">
                        <h3 className="text-sm font-semibold text-alloy-midnight mb-3">Set location</h3>
                        {setLocationError && <p className="text-red-600 text-sm mb-2">{setLocationError}</p>}
                        <select
                            value={setLocationSelectedId ?? ""}
                            onChange={(e) => setSetLocationSelectedId(e.target.value ? e.target.value : null)}
                            className="w-full px-2 py-1.5 border border-alloy-stone/40 rounded text-sm mb-3"
                        >
                            <option value="">— None (unassign) —</option>
                            {setLocationList.map((loc) => {
                                let label: string;
                                if (loc.label) {
                                    label = loc.label;
                                } else {
                                    const parts = [loc.address1, loc.city, loc.postal_code].filter(Boolean).join(", ");
                                    label = parts ? parts : loc.id.slice(0, 8) + "…";
                                }
                                return <option key={loc.id} value={loc.id}>{label}</option>;
                            })}
                        </select>
                        <div className="flex gap-2 justify-end">
                            <button type="button" onClick={() => { setSetLocationOpen(false); setSetLocationEntity(null); setSetLocationError(null); }} className="px-3 py-1.5 text-sm border border-alloy-stone/40 rounded hover:bg-alloy-stone/20">Cancel</button>
                            <button
                                type="button"
                                disabled={setLocationSaving}
                                onClick={async () => {
                                    setSetLocationSaving(true);
                                    setSetLocationError(null);
                                    try {
                                        const url = setLocationEntity === "job" ? `/api/admin/jobs/${drawer.id}/location` : `/api/admin/schedules/${drawer.id}/location`;
                                        const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location_id: setLocationSelectedId }) });
                                        const json = await res.json().catch(() => ({}));
                                        if (!res.ok) {
                                            setSetLocationError((json as { error?: string }).error ?? "Failed");
                                            return;
                                        }
                                        setSetLocationOpen(false);
                                        setSetLocationEntity(null);
                                        refetch();
                                    } finally {
                                        setSetLocationSaving(false);
                                    }
                                }}
                                className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded hover:opacity-90 disabled:opacity-50"
                            >
                                {setLocationSaving ? "Saving…" : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <AdminCollectPaymentModal
                isOpen={collectPaymentOpen}
                onClose={() => setCollectPaymentOpen(false)}
                context={collectPaymentContext}
                disabled={!canMutate}
                contextRefreshKey={collectPaymentContextRefresh}
                onAfterRun={(jobId, scheduleId) => {
                    void refetchJobPayments();
                    if (drawer.type === "jobs" && drawer.id === jobId) {
                        void refetchJobFinancials();
                        void refetchJobPayout();
                    }
                    if (drawer.type === "schedules" && paymentParentJobId === jobId) {
                        void refetchScheduleFinancials();
                    }
                    setCollectPaymentContextRefresh((n) => n + 1);
                    refetch();
                    router.refresh();
                    dispatchAfterPaymentRun(jobId, scheduleId);
                }}
                onPaymentOutcome={(o) => setPaymentToast(o)}
            />
            <OpportunityTourScheduleActionModal
                open={actionFormState?.form_key === "schedule_tour" && drawer.type === "opportunities"}
                onClose={() => setActionFormState(null)}
                title={actionFormState?.action?.label ?? "Schedule tour"}
                submitLabel={actionFormState?.action?.label ?? "Save"}
                opportunityId={drawer.type === "opportunities" && drawer.id !== "new" ? drawer.id : ""}
                locationId={
                    data && typeof data === "object" && (data as { location_id?: unknown }).location_id != null
                        ? String((data as { location_id: unknown }).location_id).trim()
                        : null
                }
                initialTourDate={(() => {
                    const md = data && typeof data === "object" ? ((data as any).metadata ?? null) : null;
                    const d = md && typeof md.tour_date === "string" ? md.tour_date.trim() : "";
                    return d || null;
                })()}
                initialTourTime={(() => {
                    const md = data && typeof data === "object" ? ((data as any).metadata ?? null) : null;
                    const t = md && typeof md.tour_time === "string" ? md.tour_time.trim() : "";
                    return t || null;
                })()}
                onSlotBooked={async (result) => {
                    if (!drawer.id || drawer.id === "new" || drawer.type !== "opportunities") return;
                    const booking = result?.booking;
                    const sk = booking && typeof booking.status_key === "string" ? booking.status_key : "";
                    if (
                        booking &&
                        typeof booking.start_at === "string" &&
                        typeof booking.timezone === "string" &&
                        (sk === "confirmed" || sk === "rescheduled")
                    ) {
                        try {
                            const mirror = deriveTourMetadataMirrorFromBooking(booking.start_at, booking.timezone);
                            setData((prev) => {
                                if (!prev || typeof prev !== "object") return prev;
                                const p = prev as Record<string, unknown>;
                                const mdRaw = p.metadata;
                                const md =
                                    mdRaw && typeof mdRaw === "object" && !Array.isArray(mdRaw)
                                        ? { ...(mdRaw as Record<string, unknown>) }
                                        : {};
                                return {
                                    ...p,
                                    metadata: { ...md, ...mirror },
                                    status_key: TOUR_BOOKING_OPPORTUNITY_STATUS.scheduled,
                                };
                            });
                            setFormData((prev) => ({ ...prev, status_key: TOUR_BOOKING_OPPORTUNITY_STATUS.scheduled }));
                        } catch {
                            /* invalid start_at — rely on refetch */
                        }
                    }
                    const rf = refetch();
                    if (rf) await rf;
                    window.dispatchEvent(
                        new CustomEvent("adminv2:opportunity-updated", { detail: { id: drawer.id, action_key: "schedule_tour" } })
                    );
                }}
                onLegacySubmit={async (payload) => {
                    if (!drawer.id || drawer.id === "new" || drawer.type !== "opportunities") return;
                    const actionKey = actionFormState?.action?.key ? String(actionFormState.action.key) : "schedule_tour";
                    setOpportunityActionLoading(actionKey);
                    setSaveError(null);
                    try {
                        const workUnitId =
                            data && typeof data === "object" && (data as { work_unit_id?: unknown }).work_unit_id != null
                                ? String((data as { work_unit_id?: unknown }).work_unit_id)
                                : null;
                        const res = await fetch("/api/admin/actions/execute", {
                            method: "POST",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                action_key: actionKey,
                                entity_type: "opportunity",
                                entity_id: drawer.id,
                                context: { surface: "record_header", work_unit_id: workUnitId },
                                payload,
                            }),
                        });
                        const json = (await res.json().catch(() => ({}))) as {
                            ok?: boolean;
                            error?: string;
                            execution_result?: Record<string, unknown> & {
                                row?: Record<string, unknown>;
                                kind?: string;
                                workflow_run_id?: string;
                            };
                        };
                        if (!res.ok || !json.ok) {
                            throw new Error(json.error ?? "Action failed");
                        }
                        const er = json.execution_result;
                        if (er?.kind === "start_workflow" && typeof er.workflow_run_id === "string" && er.workflow_run_id.trim()) {
                            const rid = er.workflow_run_id.trim();
                            setRegistryActionFeedback({
                                type: "success",
                                message: `Workflow run completed (${rid.slice(0, 8)}…).`,
                                workflow_run_id: rid,
                            });
                        }
                        const row = er?.row;
                        if (row && typeof row === "object") {
                            setData((prev) => (prev && typeof prev === "object" ? { ...prev, ...row } : prev));
                        }
                        refetch();
                        window.dispatchEvent(
                            new CustomEvent("adminv2:opportunity-updated", { detail: { id: drawer.id, action_key: actionKey } })
                        );
                    } finally {
                        setOpportunityActionLoading(null);
                    }
                }}
            />
            <ContactAttemptedModal
                open={actionFormState?.form_key === "contact_attempted"}
                onClose={() => setActionFormState(null)}
                title={actionFormState?.action?.label ?? "Log contact attempt"}
                onSubmit={async (payload) => {
                    if (!drawer.id || drawer.id === "new" || drawer.type !== "opportunities") return;
                    const actionKey = actionFormState?.action?.key ? String(actionFormState.action.key) : "contact_attempted";
                    setOpportunityActionLoading(actionKey);
                    setSaveError(null);
                    try {
                        const workUnitId =
                            data && typeof data === "object" && (data as { work_unit_id?: unknown }).work_unit_id != null
                                ? String((data as { work_unit_id?: unknown }).work_unit_id)
                                : null;
                        const res = await fetch("/api/admin/actions/execute", {
                            method: "POST",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                action_key: actionKey,
                                entity_type: "opportunity",
                                entity_id: drawer.id,
                                context: { surface: "record_header", work_unit_id: workUnitId },
                                payload,
                            }),
                        });
                        const json = (await res.json().catch(() => ({}))) as {
                            ok?: boolean;
                            error?: string;
                            execution_result?: Record<string, unknown> & { row?: Record<string, unknown> };
                        };
                        if (!res.ok || !json.ok) {
                            throw new Error(json.error ?? "Action failed");
                        }
                        const row = json.execution_result?.row;
                        if (row && typeof row === "object") {
                            setData((prev) => (prev && typeof prev === "object" ? { ...prev, ...row } : prev));
                        }
                        setActionFormState(null);
                        refetch();
                        window.dispatchEvent(
                            new CustomEvent("adminv2:opportunity-updated", { detail: { id: drawer.id, action_key: actionKey } })
                        );
                    } finally {
                        setOpportunityActionLoading(null);
                    }
                }}
            />
            <UpdateStatusAddNoteModal
                open={actionFormState?.form_key === "update_status_add_note"}
                onClose={() => setActionFormState(null)}
                title={actionFormState?.action?.label ?? "Update status"}
                initialStatusKey={(() => {
                    if (!data || typeof data !== "object") return null;
                    const v = (data as { status_key?: unknown }).status_key;
                    const s = v != null ? String(v).trim() : "";
                    return s || null;
                })()}
                statusOptions={(statusDefsForDrawer ?? [])
                    .filter((s) => s.is_active !== false)
                    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                    .map((s) => ({
                        value: String(s.status_key ?? ""),
                        label: String(s.status_label ?? s.status_key ?? ""),
                    }))}
                transitionContext={{
                    entityType: "opportunities",
                    departmentId: opportunityWorkUnitDepartmentId,
                    workUnitId:
                        data && typeof data === "object" && (data as { work_unit_id?: unknown }).work_unit_id != null
                            ? String((data as { work_unit_id?: unknown }).work_unit_id)
                            : null,
                    actionKey: actionFormState?.action?.key ? String(actionFormState.action.key) : "update_status_add_note",
                }}
                onSubmit={async (payload) => {
                    if (!drawer.id || drawer.id === "new" || drawer.type !== "opportunities") return;
                    const actionKey = actionFormState?.action?.key ? String(actionFormState.action.key) : "update_status_add_note";
                    setOpportunityActionLoading(actionKey);
                    setSaveError(null);
                    try {
                        const workUnitId =
                            data && typeof data === "object" && (data as { work_unit_id?: unknown }).work_unit_id != null
                                ? String((data as { work_unit_id?: unknown }).work_unit_id)
                                : null;
                        const res = await fetch("/api/admin/actions/execute", {
                            method: "POST",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                action_key: actionKey,
                                entity_type: "opportunity",
                                entity_id: drawer.id,
                                context: { surface: "record_header", work_unit_id: workUnitId },
                                payload,
                            }),
                        });
                        const json = (await res.json().catch(() => ({}))) as {
                            ok?: boolean;
                            error?: string;
                            execution_result?: Record<string, unknown> & { row?: Record<string, unknown> };
                        };
                        if (!res.ok || !json.ok) {
                            throw new Error(json.error ?? "Action failed");
                        }
                        const row = json.execution_result?.row;
                        if (row && typeof row === "object") {
                            setData((prev) => (prev && typeof prev === "object" ? { ...prev, ...row } : prev));
                        }
                        setActionFormState(null);
                        refetch();
                        window.dispatchEvent(
                            new CustomEvent("adminv2:opportunity-updated", { detail: { id: drawer.id, action_key: actionKey } })
                        );
                    } finally {
                        setOpportunityActionLoading(null);
                    }
                }}
            />
            <AddRelatedPersonModal
                open={actionFormState?.form_key === "add_related_person"}
                onClose={() => setActionFormState(null)}
                title={actionFormState?.action?.label ?? "Add parent/contact"}
                onSubmit={async (payload) => {
                    if (!drawer.id || drawer.id === "new") return;
                    const actionKey = actionFormState?.action?.key ? String(actionFormState.action.key) : "add_related_person";
                    setOpportunityActionLoading(actionKey);
                    setSaveError(null);
                    try {
                        const deptId = opportunityWorkUnitDepartmentId?.trim() || null;
                        const wuid =
                            data && typeof data === "object" && (data as { work_unit_id?: unknown }).work_unit_id != null
                                ? String((data as { work_unit_id?: unknown }).work_unit_id).trim() || null
                                : null;
                        const res = await fetch("/api/admin/actions/execute", {
                            method: "POST",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                action_key: actionKey,
                                entity_type: "opportunity",
                                entity_id: drawer.id,
                                context: {
                                    surface: "record_section",
                                    section_key: "customer_booking",
                                    department_id: deptId,
                                    work_unit_id: wuid,
                                },
                                payload,
                            }),
                        });
                        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
                        if (!res.ok || !json.ok) {
                            throw new Error(json.error ?? "Action failed");
                        }
                        setActionFormState(null);
                        setRelatedPeopleRefreshKey((n) => n + 1);
                        refetch();
                    } finally {
                        setOpportunityActionLoading(null);
                    }
                }}
            />
            <AddFamilyMemberModal
                open={actionFormState?.form_key === "add_family_member"}
                onClose={() => setActionFormState(null)}
                title={actionFormState?.action?.label ?? "Add family member"}
                onSubmit={async (payload) => {
                    if (!drawer.id || drawer.id === "new") return;
                    const actionKey = actionFormState?.action?.key ? String(actionFormState.action.key) : "add_family_member";
                    setOpportunityActionLoading(actionKey);
                    setSaveError(null);
                    try {
                        const deptId =
                            opportunityWorkUnitDepartmentId?.trim() ||
                            (data && typeof data === "object"
                                ? String((data as { _work_unit_department_id?: unknown })._work_unit_department_id ?? "").trim() || null
                                : null);
                        const wuid =
                            data && typeof data === "object" && (data as { work_unit_id?: unknown }).work_unit_id != null
                                ? String((data as { work_unit_id?: unknown }).work_unit_id).trim() || null
                                : null;
                        const xc = actionFormState?.executeContext;
                        const res = await fetch("/api/admin/actions/execute", {
                            method: "POST",
                            credentials: "include",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                action_key: actionKey,
                                entity_type: "opportunity",
                                entity_id: drawer.id,
                                context: {
                                    surface: xc?.surface ?? "record_section",
                                    section_key:
                                        xc?.surface === "record_header"
                                            ? null
                                            : (xc?.section_key ?? "family_contacts"),
                                    department_id: deptId,
                                    work_unit_id: wuid,
                                },
                                payload,
                            }),
                        });
                        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
                        if (!res.ok || !json.ok) {
                            throw new Error(json.error ?? "Action failed");
                        }
                        setActionFormState(null);
                        setRelatedPeopleRefreshKey((n) => n + 1);
                        refetch();
                    } finally {
                        setOpportunityActionLoading(null);
                    }
                }}
            />
            <AddInquiryChildModal
                open={!!addInquiryChildState}
                mode={addInquiryChildState?.mode ?? "child"}
                onClose={() => setAddInquiryChildState(null)}
                onSubmit={() => {
                    // Intentionally not persisted in this cleanup pass.
                    // UI plumbing is in place; next slice should create/attach customer_member + opportunity_customer_member.
                    setRegistryActionFeedback({
                        type: "error",
                        message: "Add child is not connected yet (TODO: persistence + match checks).",
                        workflow_run_id: null,
                    });
                    setAddInquiryChildState(null);
                }}
            />
            <AdminDeleteConfirmModal
                isOpen={deleteConfirmOpen}
                onClose={() => { setDeleteConfirmOpen(false); setSaveError(null); }}
                onConfirm={async () => {
                    if (!drawer.type || !drawer.id) return;
                    const url = getDeleteApiPath(drawer.type, drawer.id);
                    if (!url) return;
                    setDeleteSaving(true);
                    setSaveError(null);
                    try {
                        const res = await fetch(url, { method: "DELETE" });
                        const json = await res.json().catch(() => ({}));
                        if (!res.ok) {
                            const msg = (json.error as string) || "Delete failed";
                            const action = json.recommended_action as string | undefined;
                            setSaveError(action ? `${msg} (Recommended: ${action})` : msg);
                            return;
                        }
                        setDeleteConfirmOpen(false);
                        closeDrawer();
                        router.refresh();
                    } finally {
                        setDeleteSaving(false);
                    }
                }}
                recordLabel={drawerTitleResolved}
                entityTypeLabel={getEntityLabel(labels, drawer.type, "singular") ?? drawer.type}
                isLoading={deleteSaving}
            />
            </div>
        </Drawer>
    );
}
