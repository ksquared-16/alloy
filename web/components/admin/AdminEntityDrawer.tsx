"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Drawer from "@/components/admin/Drawer";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import RelatedRecordsTabs from "@/components/admin/RelatedRecordsTabs";
import { formatMoneyFromCents, formatMoneyFromDollars, formatDate, formatDateTime } from "@/lib/adminFormatters";
import { AssignmentStatusBadge, StatusBadge } from "@/components/admin/StatusBadge";
import {
    WORKFLOW_ENTITY_TYPES,
    WORKFLOW_EVENT_TYPES,
    WORKFLOW_ENTITY_ID_QUICK_FILL,
} from "@/lib/workflowVocab";

type FieldCatalogEntry = { key: string; label: string; data_type: string; operators: string[]; source: string };

const EDITABLE_TYPES = ["opportunities", "jobs", "contacts", "customers", "customer_members", "schedules", "workflows", "vendors", "locations"] as const;

type VendorFormData = {
    vendor_status_id?: string | null;
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
};

/** Contact drawer: vendor linked via contacts.vendor_id (from entity GET _contact_vendor). */
type ContactVendorShape = { id: string; name: string | null; vendor_status_id: string | null; created_at: string };

/** Vendor drawer: contact from contacts where vendor_id = vendor.id (entity GET _vendor_contacts). */
type VendorDrawerContact = { id: string; first_name: string; last_name: string; email: string | null; phone: string | null; vendor_contact_role: string | null };
/** Vendor drawer: job row (entity GET _vendor_jobs). */
type VendorDrawerJob = { id: string; title: string; scheduled_at: string; job_status_id: string; gross_price_cents: number; recurring_total_cents: number; opportunity_id: string };

function canEditInDrawer(type: string): type is (typeof EDITABLE_TYPES)[number] {
    return EDITABLE_TYPES.includes(type as (typeof EDITABLE_TYPES)[number]);
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="py-1.5">
            <strong className="text-[#45506c] text-sm">{label}:</strong>
            <span className="ml-2 text-[#31394d]">{value ?? "—"}</span>
        </div>
    );
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

function DrawerLinkWithName({
    label,
    id,
    type,
    displayName,
}: {
    label: string;
    id: string | null;
    type: "contacts" | "customers" | "customer_members" | "opportunities" | "jobs" | "vendors" | "locations";
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

export default function AdminEntityDrawer() {
    const { drawer, openDrawer, closeDrawer } = useAdminDrawer();
    const { canMutate } = useAdminAuth();
    const { labels } = useEntityLabels();
    const memberSingular = labels.customer_members?.singular ?? "Member";
    const memberPlural = labels.customer_members?.plural ?? "Members";
    const contactSingular = labels.contacts?.singular ?? "Contact";
    const customerSingular = labels.customers?.singular ?? "Customer";
    const opportunitySingular = labels.opportunities?.singular ?? "Opportunity";
    const jobSingular = labels.jobs?.singular ?? "Job";
    const scheduleSingular = labels.schedules?.singular ?? "Schedule";
    const workflowSingular = labels.workflows?.singular ?? "Workflow";
    const vendorSingular = labels.vendors?.singular ?? "Vendor";
    const subscriptionSingular = labels.subscriptions?.singular ?? "Subscription";
    const router = useRouter();
    const [data, setData] = useState<Record<string, unknown> | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState<Record<string, unknown>>({});
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [jobSchedules, setJobSchedules] = useState<{ id: string; job_id: string; start_at: string; end_at: string; timezone: string }[]>([]);
    const [rescheduleForm, setRescheduleForm] = useState<{ start_at: string; end_at: string; timezone: string } | null>(null);
    const [rescheduleScheduleId, setRescheduleScheduleId] = useState<string | null>(null);
    const [rescheduleSaving, setRescheduleSaving] = useState(false);
    const [rescheduleError, setRescheduleError] = useState<string | null>(null);
    const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([]);
    const [stages, setStages] = useState<{ id: string; pipeline_id: string; name: string; position: number }[]>([]);
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
    const [fieldCatalogByEntity, setFieldCatalogByEntity] = useState<Record<string, FieldCatalogEntry[]>>({});
    const [vendorStatuses, setVendorStatuses] = useState<{ id: string; key: string; label: string }[]>([]);
    const [setLocationOpen, setSetLocationOpen] = useState(false);
    const [setLocationEntity, setSetLocationEntity] = useState<"job" | "schedule" | null>(null);
    const [setLocationSelectedId, setSetLocationSelectedId] = useState<string | null>(null);
    const [setLocationSaving, setSetLocationSaving] = useState(false);
    const [setLocationError, setSetLocationError] = useState<string | null>(null);
    const [setLocationList, setSetLocationList] = useState<{ id: string; label: string | null; address1: string | null; city: string | null; state: string | null; postal_code: string | null }[]>([]);
    const [locationTypes, setLocationTypes] = useState<{ id: string; key: string; label: string; position: number; is_active: boolean }[]>([]);
    const [initialJobFormData, setInitialJobFormData] = useState<Record<string, unknown> | null>(null);
    const [vendorPayout, setVendorPayout] = useState<{ policy: { mode: string; value?: number }; source: string; completed_occurrences: number; payout_percent: number } | null>(null);
    const [vendorPayoutJobId, setVendorPayoutJobId] = useState("");
    const [vendorPayoutJobIdInput, setVendorPayoutJobIdInput] = useState("");
    const [vendorPayoutLoading, setVendorPayoutLoading] = useState(false);
    const [workflowVerticals, setWorkflowVerticals] = useState<{ id: string; name: string; slug: string }[]>([]);
    const [scheduleVendors, setScheduleVendors] = useState<{ id: string; name: string }[]>([]);
    const [scheduleAssignLoading, setScheduleAssignLoading] = useState(false);
    const [scheduleCancelReason, setScheduleCancelReason] = useState("");
    const [scheduleCancelPrompt, setScheduleCancelPrompt] = useState(false);
    const [scheduleRescheduleForm, setScheduleRescheduleForm] = useState<{ start_at: string; end_at: string; copy_assignment: boolean } | null>(null);
    const [scheduleRescheduleSaving, setScheduleRescheduleSaving] = useState(false);
    const [jobVendorsForAssign, setJobVendorsForAssign] = useState<{ id: string; name: string }[]>([]);
    const [jobAssignedVendorSaving, setJobAssignedVendorSaving] = useState(false);
    const [jobAssignedVendorId, setJobAssignedVendorId] = useState<string | null>(null);
    const [applyVendorToUpcoming, setApplyVendorToUpcoming] = useState(false);
    const [jobPayments, setJobPayments] = useState<{ id: string; created_at: string; amount_cents: number; provider_payment_id: string | null; payment_status_id: string; payment_statuses: { key: string } | null }[]>([]);
    const [jobPaymentsLoading, setJobPaymentsLoading] = useState(false);
    const [paymentActionLoading, setPaymentActionLoading] = useState<"run" | "retry" | null>(null);
    const [paymentToast, setPaymentToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
    const [drawerTab, setDrawerTab] = useState<"overview" | "related" | "automation" | "details">("overview");
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
    const [memberLinkRoleKey, setMemberLinkRoleKey] = useState("");
    const [memberLinkContactId, setMemberLinkContactId] = useState("");
    const [memberLinkSaving, setMemberLinkSaving] = useState(false);
    const [memberLinkError, setMemberLinkError] = useState<string | null>(null);
    const [memberLinkContactOptions, setMemberLinkContactOptions] = useState<{ id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null }[]>([]);
    const [memberUnlinkingId, setMemberUnlinkingId] = useState<string | null>(null);
    const [memberRelationshipOptions, setMemberRelationshipOptions] = useState<{ key: string; label: string }[]>([]);
    const [contactCreateSaving, setContactCreateSaving] = useState(false);
    const [contactCreateError, setContactCreateError] = useState<string | null>(null);
    type StatusDefOption = { status_key: string; status_label: string | null; sort_order: number; is_active: boolean };
    const [statusDefsForDrawer, setStatusDefsForDrawer] = useState<StatusDefOption[]>([]);
    const [statusDefsLoading, setStatusDefsLoading] = useState(false);
    const STATUS_ENTITY_TYPES = ["customers", "contacts", "customer_members", "vendors", "opportunities", "jobs", "schedules"];
    const refetch = useCallback(() => {
        if (!drawer.type || !drawer.id) return;
        setLoading(true);
        fetch(`/api/admin/entity/${drawer.type}/${drawer.id}`)
            .then((res) => {
                if (!res.ok) throw new Error(res.status === 404 ? "Not found" : "Failed to load");
                return res.json();
            })
            .then(setData)
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [drawer.type, drawer.id]);

    useEffect(() => {
        if (!drawer.type || !drawer.id) {
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
            setMemberLinkContactOptions([]);
            setMemberUnlinkingId(null);
            setMemberRelationshipOptions([]);
            setContactCreateSaving(false);
            setContactCreateError(null);
            return;
        }
        setDrawerTab("overview");
        setLoading(true);
        setError(null);
        setIsEditing(false);
        fetch(`/api/admin/entity/${drawer.type}/${drawer.id}`)
            .then((res) => {
                if (!res.ok) throw new Error(res.status === 404 ? "Not found" : "Failed to load");
                return res.json();
            })
            .then(setData)
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [drawer.type, drawer.id]);

    useEffect(() => {
        if (drawer.type !== "jobs" || !drawer.id) {
            setJobSchedules([]);
            setRescheduleForm(null);
            setJobVendorsForAssign([]);
            setJobAssignedVendorId(null);
            setJobPayments([]);
            return;
        }
        fetch(`/api/admin/related/job/${drawer.id}`)
            .then((res) => res.ok ? res.json() : { schedules: [] })
            .then((json: { schedules?: { id: string; job_id: string; start_at: string; end_at: string; timezone: string }[] }) => setJobSchedules(json.schedules ?? []))
            .catch(() => setJobSchedules([]));
        fetch(`/api/admin/jobs/${drawer.id}/vendors-for-assign`)
            .then((res) => res.ok ? res.json() : { vendors: [] })
            .then((json: { vendors?: { id: string; name: string }[] }) => setJobVendorsForAssign(json.vendors ?? []))
            .catch(() => setJobVendorsForAssign([]));
    }, [drawer.type, drawer.id]);

    const refetchJobPayments = useCallback(() => {
        if (drawer.type !== "jobs" || !drawer.id) return;
        setJobPaymentsLoading(true);
        fetch(`/api/admin/jobs/${drawer.id}/payments`)
            .then((res) => (res.ok ? res.json() : { payments: [] }))
            .then((json: { payments?: { id: string; created_at: string; amount_cents: number; provider_payment_id: string | null; payment_status_id: string; payment_statuses: { key: string } | null }[] }) => setJobPayments(json.payments ?? []))
            .catch(() => setJobPayments([]))
            .finally(() => setJobPaymentsLoading(false));
    }, [drawer.type, drawer.id]);

    useEffect(() => {
        if (drawer.type !== "jobs" || !drawer.id) return;
        refetchJobPayments();
    }, [drawer.type, drawer.id, refetchJobPayments]);

    useEffect(() => {
        if (!paymentToast) return;
        const t = setTimeout(() => setPaymentToast(null), 5000);
        return () => clearTimeout(t);
    }, [paymentToast]);

    useEffect(() => {
        if (drawer.type === "jobs" && data) {
            const vid = (data.assigned_vendor_id as string) ?? null;
            setJobAssignedVendorId(vid);
        } else {
            setJobAssignedVendorId(null);
        }
    }, [drawer.type, data]);

    useEffect(() => {
        if (drawer.type !== "opportunities") {
            setPipelines([]);
            setStages([]);
            return;
        }
        Promise.all([
            fetch("/api/admin/pipelines").then((r) => r.ok ? r.json() : []),
            fetch("/api/admin/pipeline-stages").then((r) => r.ok ? r.json() : []),
        ]).then(([pl, st]) => {
            setPipelines(Array.isArray(pl) ? pl : []);
            setStages(Array.isArray(st) ? st : []);
        }).catch(() => { setPipelines([]); setStages([]); });
    }, [drawer.type]);

    useEffect(() => {
        if (drawer.type !== "locations") {
            setLocationTypes([]);
            return;
        }
        fetch("/api/admin/location-types")
            .then((r) => (r.ok ? r.json() : { location_types: [] }))
            .then((json: { location_types?: { id: string; key: string; label: string; position: number; is_active: boolean }[] }) => setLocationTypes(json.location_types ?? []))
            .catch(() => setLocationTypes([]));
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
        Promise.all([
            fetch("/api/admin/vendor-statuses").then((r) => (r.ok ? r.json() : [])),
            fetch("/api/admin/verticals").then((r) => (r.ok ? r.json() : [])),
        ]).then(([statuses, verts]) => {
            setVendorStatuses(Array.isArray(statuses) ? statuses : []);
            setWorkflowVerticals(Array.isArray(verts) ? verts : []);
        }).catch(() => { setVendorStatuses([]); setWorkflowVerticals([]); });
    }, [drawer.type]);

    useEffect(() => {
        if (drawer.type !== "customer_members") {
            setMemberCustomers([]);
            return;
        }
        fetch("/api/admin/customers")
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
        fetch(`/api/admin/status-definitions?entity_type=${encodeURIComponent(drawer.type)}`)
            .then((r) => (r.ok ? r.json() : { statuses: [] }))
            .then((json: { statuses?: StatusDefOption[] }) => setStatusDefsForDrawer(json.statuses ?? []))
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
            customer_id: "",
            vendor_id: "",
            vendor_contact_role: "",
        });
    }, [drawer.type, data]);

    useEffect(() => {
        if (drawer.type !== "schedules" || !drawer.id) {
            setScheduleVendors([]);
            setScheduleRescheduleForm(null);
            setScheduleCancelPrompt(false);
            return;
        }
        fetch(`/api/admin/schedules/${drawer.id}/vendors-for-assign`)
            .then((r) => (r.ok ? r.json() : { vendors: [] }))
            .then((json: { vendors?: { id: string; name: string }[] }) => setScheduleVendors(Array.isArray(json.vendors) ? json.vendors : []))
            .catch(() => setScheduleVendors([]));
    }, [drawer.type, drawer.id]);

    useEffect(() => {
        if (drawer.type !== "workflows" || !data) return;
        if ((data as { _create?: boolean })._create) {
            setWorkflowConditions([]);
            setWorkflowActions([]);
            const defaultEntity = drawer.defaultWorkflowEntityType ?? "";
            setFormData({ name: "", description: "", enabled: true, event_type: "", entity_type: defaultEntity });
            return;
        }
        if (data._conditions) {
            const cond = (data._conditions as { target_entity?: string; field_path?: string; field?: string; operator?: string; value?: string; value_jsonb?: unknown }[]).map((c) => {
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
        }
        if (data._actions) {
            const acts = (data._actions as { action_type?: string; target_entity?: string; payload?: unknown }[]).map((a) => ({
                action_type: a.action_type ?? "log",
                target_entity: a.target_entity ?? undefined,
                payload: a.payload && typeof a.payload === "object" ? a.payload as Record<string, unknown> : {},
            }));
            setWorkflowActions(acts);
        }
    }, [drawer.type, drawer.defaultWorkflowEntityType, data]);

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
            setFormData({
                job_date: (data.job_date as string)?.slice(0, 10) ?? "",
                job_time_window: data.job_time_window ?? "",
                status: data.status ?? "",
                status_key: (data.status_key as string) ?? "",
                pipeline_stage_id: data.pipeline_stage_id ?? "",
                vertical_id: data.vertical_id ?? "",
                quote_total: data.quote_total ?? "",
                notes: (meta.notes as string) ?? "",
            });
        } else if (drawer.type === "jobs") {
            const meta = (data.metadata as Record<string, unknown>) || {};
            setFormData({
                scheduled_at: data.scheduled_at ? new Date(data.scheduled_at as string).toISOString().slice(0, 16) : "",
                service_frequency_key: (data.service_frequency_key as string) ?? "",
                is_recurring: data.is_recurring ?? false,
                job_status_id: data.job_status_id ?? "",
                status_key: (data.status_key as string) ?? "",
                internal_notes: (meta.internal_notes as string) ?? "",
                assigned_vendor_id: (data.assigned_vendor_id as string) ?? "",
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
            };
            const vendorForm: VendorFormData = {
                vendor_status_id: vendorData.vendor_status_id ?? "",
                status_key: (data.status_key as string) ?? "",
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
            setFormData({
                label: data.label ?? "",
                location_type_id: (data.location_type_id as string) ?? "",
                location_type: (data.location_type as string) ?? "",
                is_active: data.is_active ?? true,
                is_primary: data.is_primary ?? false,
                address1: data.address1 ?? "",
                address2: data.address2 ?? "",
                city: data.city ?? "",
                state: data.state ?? "",
                postal_code: data.postal_code ?? "",
                country: data.country ?? "",
                access_notes: data.access_notes ?? "",
            });
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
            });
        }
        setSaveError(null);
        setIsEditing(true);
    }, [data, drawer.type, memberRelationshipOptions]);

    useEffect(() => {
        if (!drawer.type || !STATUS_ENTITY_TYPES.includes(drawer.type) || !(data as { _create?: boolean })?._create) return;
        if (statusDefsForDrawer.length === 0) return;
        const def = defaultStatusKeyForCreate;
        if (!def) return;
        setFormData((prev) => (prev.status_key === undefined || prev.status_key === "" ? { ...prev, status_key: def } : prev));
    }, [drawer.type, data, statusDefsForDrawer.length, defaultStatusKeyForCreate]);

    const JOB_FORM_KEYS = ["scheduled_at", "service_frequency_key", "is_recurring", "status_key", "job_status_id", "internal_notes"] as const;
    useEffect(() => {
        if (drawer.type !== "vendors" || !drawer.id) {
            setVendorPayout(null);
            setVendorPayoutJobId("");
            setVendorPayoutJobIdInput("");
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
        if (drawer.type !== "jobs" || !data || (data as { _create?: boolean })._create) {
            setInitialJobFormData(null);
            return;
        }
        const meta = (data.metadata as Record<string, unknown>) || {};
        const snapshot = {
            scheduled_at: data.scheduled_at ? new Date(data.scheduled_at as string).toISOString().slice(0, 16) : "",
            service_frequency_key: (data.service_frequency_key as string) ?? "",
            is_recurring: data.is_recurring ?? false,
            job_status_id: data.job_status_id ?? "",
            status_key: (data.status_key as string) ?? "",
            internal_notes: (meta.internal_notes as string) ?? "",
        };
        setFormData((prev) => ({ ...prev, ...snapshot }));
        setInitialJobFormData(snapshot);
    }, [drawer.type, drawer.id, data?.id]);

    const jobFormDirty = useMemo(() => {
        if (drawer.type !== "jobs" || !initialJobFormData) return false;
        return JOB_FORM_KEYS.some((k) => String(formData[k] ?? "") !== String(initialJobFormData[k] ?? ""));
    }, [drawer.type, initialJobFormData, formData.scheduled_at, formData.service_frequency_key, formData.is_recurring, formData.status_key, formData.job_status_id, formData.internal_notes]);

    const saveEdit = useCallback(async () => {
        if (!drawer.type || !drawer.id) return;
        setSaving(true);
        setSaveError(null);
        try {
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
                setIsEditing(false);
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
                    metadata: Object.keys(meta).length ? meta : undefined,
                };
                const res = await fetch(`/api/admin/customer-members/${drawer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((json.error as string) || "Save failed");
                setData((prev) => (prev ? { ...prev, ...json } : prev));
                refetch();
                setIsEditing(false);
                router.refresh();
                return;
            }
            const url = `/api/admin/${drawer.type}/${drawer.id}`;
            const payload: Record<string, unknown> = { ...formData };
            if ("status_label" in payload) delete payload.status_label;
            if (drawer.type === "opportunities" && "notes" in payload) {
                const notes = payload.notes;
                delete payload.notes;
                if (notes !== undefined) payload.notes = notes === "" ? null : notes;
            }
            if (drawer.type === "jobs" && "internal_notes" in payload) {
                const internal_notes = payload.internal_notes;
                delete payload.internal_notes;
                if (internal_notes !== undefined) payload.internal_notes = internal_notes === "" ? null : internal_notes;
            }
            if (drawer.type === "schedules") {
                if (payload.start_at) payload.start_at = new Date(payload.start_at as string).toISOString();
                if (payload.end_at) payload.end_at = new Date(payload.end_at as string).toISOString();
            }
            if (drawer.type === "vendors") {
                if (payload.vendor_status_id === "" || payload.vendor_status_id === undefined) payload.vendor_status_id = null;
                if (payload.status_key === "" || payload.status_key === undefined) payload.status_key = null;
                const daysStr = payload.days_available as string | undefined;
                payload.days_available = daysStr ? String(daysStr).split(",").map((s) => s.trim()).filter(Boolean) : null;
                const zipsStr = payload.service_area_zip_codes as string | undefined;
                payload.service_area_zip_codes = zipsStr ? String(zipsStr).split(",").map((s) => s.trim()).filter(Boolean) : null;
                if (payload.max_daily_jobs === "") payload.max_daily_jobs = null;
                if (payload.payout_percent === "") payload.payout_percent = null;
            }
            if (drawer.type === "locations") {
                const locPayload: Record<string, unknown> = {};
                const keys = ["label", "location_type_id", "location_type", "is_active", "is_primary", "address1", "address2", "city", "state", "postal_code", "country", "access_notes"] as const;
                for (const k of keys) {
                    if (formData[k] === undefined) continue;
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
                const res = await fetch(`/api/admin/locations/${drawer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(locPayload) });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error((json.error as string) || "Save failed");
                setData((prev) => (prev ? { ...prev, ...json } : prev));
                refetch();
                setIsEditing(false);
                router.refresh();
                return;
            }
            const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json.error as string) || "Save failed");
            setData((prev) => (prev ? { ...prev, ...json } : prev));
            refetch();
            setIsEditing(false);
            router.refresh();
            if (drawer.type === "jobs" && drawer.id) {
                window.dispatchEvent(new CustomEvent("admin-entity-saved", { detail: { type: "jobs", id: drawer.id } }));
                setInitialJobFormData(JOB_FORM_KEYS.reduce((acc, k) => ({ ...acc, [k]: formData[k] }), {} as Record<string, unknown>));
            }
        } catch (e: unknown) {
            setSaveError((e as Error).message);
        } finally {
            setSaving(false);
        }
    }, [drawer.type, drawer.id, formData, workflowConditions, workflowActions, refetch, router]);

    if (!drawer.type || !drawer.id) return null;

    const paymentStatusLabel = jobPayments.some((p) => p.payment_statuses?.key === "paid")
        ? "Paid"
        : jobPayments.length === 0
            ? "Unpaid"
            : (jobPayments[0]?.payment_statuses?.key ?? "pending").charAt(0).toUpperCase() + (jobPayments[0]?.payment_statuses?.key ?? "pending").slice(1);
    const paymentStatusVariant = jobPayments.some((p) => p.payment_statuses?.key === "paid") ? "success" : jobPayments[0]?.payment_statuses?.key === "failed" ? "warning" : "default";

    const title: React.ReactNode = data
        ? drawer.type === "contacts"
            ? (data as { _create?: boolean })._create
                ? `New ${contactSingular}`
                : `${contactSingular}: ${[data.first_name, data.last_name].filter(Boolean).join(" ") || drawer.id}`
            : drawer.type === "customers"
                ? (data as { _create?: boolean })._create
                    ? `New ${customerSingular}`
                    : `${customerSingular}: ${(data.name as string) || drawer.id}`
                : drawer.type === "customer_members"
                    ? (data as { _create?: boolean })._create
                        ? `New ${memberSingular}`
                        : `${memberSingular}: ${(data.display_name as string) || [data.first_name, data.last_name].filter(Boolean).join(" ") || drawer.id}`
                    : drawer.type === "opportunities"
                        ? (data as { _create?: boolean })._create
                            ? `New ${opportunitySingular}`
                            : `${opportunitySingular}: ${(data.name as string) || drawer.id}`
                        : drawer.type === "jobs"
                            ? (data as { _create?: boolean })._create
                                ? `New ${jobSingular}`
                                : (
                                    <div className="flex flex-col gap-1 min-w-0">
                                        <span className="truncate">{(data._customer_name as string) || (data.title as string) || drawer.id}</span>
                                        <span className="text-sm font-normal text-alloy-midnight/70">
                                            {((data.title as string) || "Cleaning").trim() || "Cleaning"}
                                            {(data.gross_price_cents != null || (data as { estimated_total_cents?: number }).estimated_total_cents != null) && (
                                                <> · {formatMoneyFromCents((data.gross_price_cents as number) ?? (data as { estimated_total_cents?: number }).estimated_total_cents ?? 0)}</>
                                            )}
                                        </span>
                                        <span className="mt-0.5">
                                            <StatusBadge label={paymentStatusLabel} variant={paymentStatusVariant} />
                                        </span>
                                    </div>
                                )
                            : drawer.type === "schedules"
                                ? (data as { _create?: boolean })._create
                                    ? `New ${scheduleSingular}`
                                    : `${scheduleSingular}: ${drawer.id}`
                                : drawer.type === "locations"
                                    ? `Location: ${(data.label as string) || (data.address1 as string) || drawer.id.slice(0, 8) + "…"}`
                                    : drawer.type === "discount_redemptions"
                                        ? `Redemption: ${(data.discount_code as string) || drawer.id}`
                                        : drawer.type === "workflows"
                                            ? (data as { _create?: boolean })._create
                                                ? `New ${workflowSingular}`
                                                : `${workflowSingular}: ${(data.name as string) || drawer.id}`
                                            : drawer.type === "vendors"
                                                ? (data as { _create?: boolean })._create
                                                    ? `New ${vendorSingular}`
                                                    : `${vendorSingular}: ${(data.name as string) || drawer.id}`
                                                : drawer.type === "subscriptions"
                                                    ? `${subscriptionSingular}: ${(data._customer_name as string) || drawer.id.slice(0, 8)}…`
                                                    : "Details"
        : loading
            ? "Loading…"
            : "Details";

    return (
        <Drawer
            isOpen
            onClose={closeDrawer}
            title={title}
            zIndexBackdrop={60}
            zIndexPanel={70}
        >
            {loading && <p className="text-alloy-midnight/60">Loading…</p>}
            {error && <p className="text-red-600">Error: {error}</p>}
            {data && !loading && (
                <div className="space-y-6">
                    {canEditInDrawer(drawer.type) && (
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#e6e8ec]">
                            <div className="flex gap-2">
                                {drawer.type === "jobs" && !(data as { _create?: boolean })?._create && canMutate && (
                                    <>
                                        {jobFormDirty && (
                                            <>
                                                <button type="button" onClick={saveEdit} disabled={saving} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
                                                <button type="button" onClick={() => { if (initialJobFormData) setFormData((prev) => ({ ...prev, ...initialJobFormData })); setSaveError(null); }} className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30">Cancel</button>
                                            </>
                                        )}
                                        <button type="button" onClick={() => { setSetLocationEntity("job"); setSetLocationSelectedId((data?.location_id as string) ?? null); setSetLocationError(null); fetch("/api/admin/locations").then((r) => r.ok ? r.json() : { locations: [] }).then((j: { locations?: { id: string; label: string | null; address1: string | null; city: string | null; state: string | null; postal_code: string | null }[] }) => setSetLocationList(j.locations ?? [])).catch(() => setSetLocationList([])); setSetLocationOpen(true); }} className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30">{(data?.location_id as string) ? "Change location" : "Set location"}</button>
                                    </>
                                )}
                                {canEditInDrawer(drawer.type) && drawer.type !== "jobs" && (
                                    !isEditing ? (
                                        <>
                                            {canMutate && !(data as { _create?: boolean })?._create && (
                                                <button type="button" onClick={startEdit} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90">Edit</button>
                                            )}
                                            {drawer.type === "workflows" && <button type="button" onClick={() => { setRunModalOpen(true); setRunPayload("{}"); setRunResult(null); setRunJsonError(null); }} className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30">Run {workflowSingular.toLowerCase()}</button>}
                                            {drawer.type === "schedules" && canMutate && <button type="button" onClick={() => { setSetLocationEntity("schedule"); const sid = (data?.location_id as string) ?? (data?._location_id as string) ?? null; setSetLocationSelectedId(sid); setSetLocationError(null); fetch("/api/admin/locations").then((r) => r.ok ? r.json() : { locations: [] }).then((j: { locations?: { id: string; label: string | null; address1: string | null; city: string | null; state: string | null; postal_code: string | null }[] }) => setSetLocationList(j.locations ?? [])).catch(() => setSetLocationList([])); setSetLocationOpen(true); }} className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30">{((data?.location_id as string) ?? (data?._location_id as string)) ? "Change location" : "Set location"}</button>}
                                        </>
                                    ) : (
                                        <>
                                            <button type="button" onClick={saveEdit} disabled={saving} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
                                            <button type="button" onClick={() => { setIsEditing(false); setSaveError(null); }} className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30">Cancel</button>
                                        </>
                                    )
                                )}
                            </div>
                            {["jobs", "schedules", "opportunities", "customers", "contacts", "customer_members", "vendors", "locations"].includes(drawer.type) && !(data as { _create?: boolean })?._create && (
                                <div className="flex gap-0.5 rounded-md border border-[#e6e8ec] bg-[#F4F6F9]/50 p-0.5">
                                    {(["overview", "related", ...(drawer.type === "opportunities" ? ["automation" as const] : []), "details"] as const).map((tab) => (
                                        <button key={tab} type="button" onClick={() => setDrawerTab(tab)} className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${drawerTab === tab ? "bg-[#31394d] text-white shadow-sm" : "text-[#59678b] hover:bg-[#eef0f4]"}`}>{tab.charAt(0).toUpperCase() + tab.slice(1)}</button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    {saveError && <p className="text-red-600 text-sm">{saveError}</p>}
                    {drawerTab === "related" && drawer.type === "opportunities" && data && (
                        <div className="pt-2 space-y-3 mb-4">
                            <DrawerLinkWithName label={customerSingular} id={(data.customer_id as string) ?? null} type="customers" displayName={data._customer_name as string} />
                            <DrawerLinkWithName label={contactSingular} id={(data.primary_contact_id as string) ?? null} type="contacts" displayName={data._contact_name as string} />
                        </div>
                    )}
                    {drawerTab === "related" && drawer.type === "jobs" && data && (
                        <div className="pt-2 space-y-3 mb-4">
                            <div className="py-1.5 flex items-center gap-2 flex-wrap">
                                <strong className="text-[#45506c] text-sm">Location:</strong>{" "}
                                {data.location_id ? (
                                    (() => {
                                        const loc = data._location as { address1?: string | null; city?: string | null; postal_code?: string | null } | null | undefined;
                                        let name: string | null = (data._location_label as string) ?? null;
                                        if (!name && loc) {
                                            const parts = [loc.address1, loc.city, loc.postal_code].filter(Boolean);
                                            name = parts.length ? parts.join(", ") : null;
                                        }
                                        const display = name ?? `${(data.location_id as string).slice(0, 8)}…`;
                                        return (
                                            <>
                                                <button type="button" onClick={() => openDrawer({ type: "locations", id: data.location_id as string })} className="text-alloy-blue hover:underline">
                                                    {display}
                                                </button>
                                                {canMutate && <button type="button" onClick={(e) => { e.stopPropagation(); openDrawer({ type: "locations", id: data.location_id as string }); }} className="text-xs px-2 py-0.5 border border-alloy-stone/50 rounded hover:bg-alloy-stone/20 text-alloy-midnight/80">Edit</button>}
                                                {canMutate && <button type="button" onClick={() => { setSetLocationEntity("job"); setSetLocationSelectedId((data.location_id as string) ?? null); setSetLocationError(null); fetch("/api/admin/locations").then((r) => r.ok ? r.json() : { locations: [] }).then((j: { locations?: { id: string; label: string | null; address1: string | null; city: string | null; state: string | null; postal_code: string | null }[] }) => setSetLocationList(j.locations ?? [])).catch(() => setSetLocationList([])); setSetLocationOpen(true); }} className="text-xs px-2 py-0.5 border border-alloy-stone/50 rounded hover:bg-alloy-stone/20 text-alloy-midnight/80">Change</button>}
                                            </>
                                        );
                                    })()
                                ) : (
                                    <>
                                        <span className="text-[#31394d]">Unassigned</span>
                                        {canMutate && <button type="button" onClick={() => { setSetLocationEntity("job"); setSetLocationSelectedId(null); setSetLocationError(null); fetch("/api/admin/locations").then((r) => r.ok ? r.json() : { locations: [] }).then((j: { locations?: { id: string; label: string | null; address1: string | null; city: string | null; state: string | null; postal_code: string | null }[] }) => setSetLocationList(j.locations ?? [])).catch(() => setSetLocationList([])); setSetLocationOpen(true); }} className="text-xs px-2 py-0.5 border border-alloy-stone/50 rounded hover:bg-alloy-stone/20 text-alloy-blue">Set location</button>}
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                    {drawerTab === "related" && drawer.type === "schedules" && data && (
                        <div className="pt-2 space-y-3 mb-4">
                            {(data.job_id as string) && (
                                <DrawerLinkWithName label="Job" id={data.job_id as string} type="jobs" displayName={(data._job as { title?: string })?.title ?? null} />
                            )}
                            {(data._customer as { id?: string; name?: string }) && (
                                <DrawerLinkWithName label="Customer" id={(data._customer as { id: string }).id} type="customers" displayName={(data._customer as { name?: string }).name ?? null} />
                            )}
                            <div className="py-1.5">
                                <strong className="text-[#45506c] text-sm">Assigned vendor:</strong>{" "}
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
                            <DrawerLinkWithName label="Customer" id={(data.customer_id as string) ?? null} type="customers" displayName={data._customer_name as string} />
                        </div>
                    )}
                    {drawerTab === "related" && drawer.type === "customer_members" && (
                        <div className="pt-2 space-y-4 mb-4">
                            <section>
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-[#59678b] mb-2">Family/Customer</h4>
                                {!data ? (
                                    <p className="text-sm text-[#59678b]">Loading…</p>
                                ) : (data.customer_id as string) ? (
                                    <DrawerLinkWithName
                                        label="Customer"
                                        id={data.customer_id as string}
                                        type="customers"
                                        displayName={(data._customer_name as string) ?? (data.customer_id as string) ?? null}
                                    />
                                ) : (
                                    <p className="text-sm text-[#59678b]">No family/customer linked.</p>
                                )}
                            </section>
                            <section>
                                <div className="flex items-center justify-between gap-2 mb-2">
                                    <h4 className="text-xs font-semibold uppercase tracking-wider text-[#59678b]">Linked contacts (Guardians)</h4>
                                    {canMutate && data && (data.customer_id as string) && drawer.id && drawer.id !== "new" && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setMemberLinkModalOpen(true);
                                                setMemberLinkRoleKey(memberRelatedRoles[0]?.role_key ?? "");
                                                setMemberLinkContactId("");
                                                setMemberLinkError(null);
                                                const cid = data.customer_id as string;
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
                                ) : !(data.customer_id as string) ? (
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
                                                                        <span className="text-xs text-[#59678b]">{[c.email, c.phone].filter(Boolean).join(" · ")}</span>
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
                    {drawerTab === "related" && ["contacts", "customers", "opportunities", "jobs", "locations"].includes(drawer.type) && drawer.id && (
                        <div className="pt-2">
                            <RelatedRecordsTabs entityType={drawer.type === "contacts" ? "contact" : drawer.type === "customers" ? "customer" : drawer.type === "opportunities" ? "opportunity" : drawer.type === "locations" ? "location" : "job"} entityId={drawer.id} />
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
                    {drawerTab === "details" && (
                        <div className="space-y-3 pt-2">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#59678b] border-b border-[#e6e8ec] pb-2">IDs &amp; raw fields</h3>
                            {drawer.type === "customer_members" ? (
                                <>
                                    {["id", "org_id", "customer_id", "external_source", "external_id", "created_at", "updated_at"].map((key) => {
                                        const val = data[key];
                                        if (val === undefined) return null;
                                        return <div key={key} className="text-sm"><span className="text-alloy-midnight/60">{key}:</span> <span className="font-mono text-alloy-midnight/90">{typeof val === "string" && val.length > 24 ? val.slice(0, 8) + "…" : String(val)}</span></div>;
                                    })}
                                    {data.metadata != null && (
                                        <div className="text-sm">
                                            <span className="text-alloy-midnight/60">metadata:</span>
                                            <pre className="mt-1 p-2 bg-alloy-stone/20 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap break-words">
                                                {typeof data.metadata === "object" ? JSON.stringify(data.metadata, null, 2) : String(data.metadata)}
                                            </pre>
                                        </div>
                                    )}
                                </>
                            ) : (
                                ["id", "created_at", "updated_at", "external_id", "stripe_customer_id", "default_payment_method_id", "customer_id", "primary_contact_id", "opportunity_id", "job_id", "schedule_id", "vertical_id", "pipeline_stage_id", "job_status_id", "vendor_id", "assigned_vendor_id"].map((key) => {
                                    const val = data[key];
                                    if (val === undefined) return null;
                                    return <div key={key} className="text-sm"><span className="text-alloy-midnight/60">{key}:</span> <span className="font-mono text-alloy-midnight/90">{typeof val === "string" && val.length > 24 ? val.slice(0, 8) + "…" : String(val)}</span></div>;
                                })
                            )}
                        </div>
                    )}
                    {drawerTab === "overview" && (
                        <>
                            {drawer.type === "contacts" && (data as { _create?: boolean })?._create ? (
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
                                    {isEditing ? (
                                        <>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">First name</label><input value={String(formData.first_name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, first_name: e.target.value }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" /></div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Last name</label><input value={String(formData.last_name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, last_name: e.target.value }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" /></div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Email</label><input type="email" value={String(formData.email ?? "")} onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" /></div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Phone</label><input value={String(formData.phone ?? "")} onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" /></div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Company name</label><input value={String(formData.company_name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, company_name: e.target.value }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" /></div>
                                            {statusDefsLoading ? <div className="text-sm text-alloy-midnight/60">Status: Loading…</div> : (
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Status</label><select value={String(formData.status_key ?? "")} onChange={(e) => setFormData((f) => ({ ...f, status_key: e.target.value || "" }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60"><option value="">— None —</option>{statusDefsForDrawer.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order).map((s) => <option key={s.status_key} value={s.status_key}>{s.status_label ?? s.status_key}</option>)}</select></div>
                                            )}
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Notes</label><textarea value={String(formData.notes ?? "")} onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))} rows={2} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" /></div>
                                        </>
                                    ) : (
                                        <>
                                            <Field label="First name" value={data.first_name as string} />
                                            <Field label="Last name" value={data.last_name as string} />
                                            <Field label="Email" value={data.email as string} />
                                            <Field label="Phone" value={data.phone as string} />
                                            <Field label="Company name" value={data.company_name as string} />
                                            <div className="py-1.5">
                                                <strong className="text-[#45506c] text-sm">Status</strong>
                                                {statusDefsLoading ? <p className="text-sm text-alloy-midnight/60 mt-0.5">Loading…</p> : (() => { const key = data.status_key as string | null | undefined; const label = getStatusLabel(key); if (label) return <p className="text-sm text-alloy-midnight/80 mt-0.5">{label}</p>; return <p className="text-sm text-alloy-midnight/80 mt-0.5">Unknown <Link href={`/admin/system/statuses?entity_type=contacts`} className="text-alloy-blue hover:underline">Configure statuses</Link></p>; })()}
                                            </div>
                                            <Field label="Notes" value={data.notes as string} />
                                            <Field label="Archived" value={data.archived_at ? "Yes" : "No"} />
                                        </>
                                    )}
                                    <DrawerLinkWithName label="Customer" id={(data.customer_id as string) ?? null} type="customers" displayName={data._customer_name as string} />
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
                                    {canMutate && !isEditing && (
                                        <div className="pt-2 border-t border-[#e6e8ec] flex gap-2">
                                            {data.archived_at ? (
                                                <button type="button" onClick={async () => { const res = await fetch(`/api/admin/contacts/${drawer.id}/unarchive`, { method: "POST" }); if (res.ok) { refetch(); router.refresh(); } }} className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/20">Unarchive</button>
                                            ) : (
                                                <button type="button" onClick={async () => { const res = await fetch(`/api/admin/contacts/${drawer.id}/archive`, { method: "POST" }); if (res.ok) { refetch(); router.refresh(); } }} className="px-3 py-1.5 text-sm border border-amber-200 text-amber-800 rounded-md hover:bg-amber-50">Archive</button>
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
                                    ) : isEditing ? (
                                        <>
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
                                    {statusDefsLoading ? <div className="text-sm text-alloy-midnight/60">Status: Loading…</div> : (
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Status</label><select value={String(formData.status_key ?? "")} onChange={(e) => setFormData((f) => ({ ...f, status_key: e.target.value || "" }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60"><option value="">— None —</option>{statusDefsForDrawer.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order).map((s) => <option key={s.status_key} value={s.status_key}>{s.status_label ?? s.status_key}</option>)}</select></div>
                                    )}
                                    <label className="flex items-center gap-2"><input type="checkbox" checked={!!formData.is_active} onChange={(e) => setFormData((f) => ({ ...f, is_active: e.target.checked }))} disabled={!canMutate} /> <span className="text-sm text-alloy-midnight/70">Active</span></label>
                                </>
                            ) : (
                                <>
                                    <Field label="Display name" value={data.display_name as string} />
                                            <Field
                                                label="Relationship"
                                                value={(() => {
                                                    const rel = (data.relationship as string) ?? "";
                                                    if (rel === "other") {
                                                        const custom = ((data.metadata as Record<string, unknown>)?.relationship_custom as string) ?? "";
                                                        return custom || "Other";
                                                    }
                                                    const opt = memberRelationshipOptions.find((o) => o.key === rel);
                                                    return opt ? opt.label : (rel || "—");
                                                })()}
                                            />
                                            <Field label="First name" value={data.first_name as string} />
                                            <Field label="Last name" value={data.last_name as string} />
                                            <Field label="DOB" value={data.dob as string} />
                                    <Field label="Active" value={data.is_active ? "Yes" : "No"} />
                                    <div className="py-1.5">
                                        <strong className="text-[#45506c] text-sm">Status</strong>
                                        {statusDefsLoading ? <p className="text-sm text-alloy-midnight/60 mt-0.5">Loading…</p> : (() => { const key = data.status_key as string | null | undefined; const label = getStatusLabel(key); if (label) return <p className="text-sm text-alloy-midnight/80 mt-0.5">{label}</p>; return <p className="text-sm text-alloy-midnight/80 mt-0.5">Unknown <Link href={`/admin/system/statuses?entity_type=customer_members`} className="text-alloy-blue hover:underline">Configure statuses</Link></p>; })()}
                                    </div>
                                    <DrawerLinkWithName label="Customer" id={(data.customer_id as string) ?? null} type="customers" displayName={data._customer_name as string} />
                                            {canMutate && (
                                                <div className="pt-2 border-t border-[#e6e8ec] flex gap-2">
                                                    {!memberDeleteConfirm ? (
                                                        <button type="button" onClick={() => setMemberDeleteConfirm(true)} className="px-3 py-1.5 text-sm border border-red-200 text-red-700 rounded-md hover:bg-red-50">Delete</button>
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
                                                            }} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md disabled:opacity-50">Yes, delete</button>
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
                            {isEditing ? (
                                <>
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Name</label><input value={String(formData.name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                    {statusDefsLoading ? <div className="text-sm text-alloy-midnight/60">Status: Loading…</div> : (
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Status</label><select value={String(formData.status_key ?? "")} onChange={(e) => setFormData((f) => ({ ...f, status_key: e.target.value || "" }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60"><option value="">— None —</option>{statusDefsForDrawer.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order).map((s) => <option key={s.status_key} value={s.status_key}>{s.status_label ?? s.status_key}</option>)}</select></div>
                                    )}
                                </>
                            ) : (
                                <>
                                    <Field label="Name" value={data.name as string} />
                                    <div className="py-1.5">
                                        <strong className="text-[#45506c] text-sm">Status</strong>
                                        {statusDefsLoading ? <p className="text-sm text-alloy-midnight/60 mt-0.5">Loading…</p> : (() => { const key = data.status_key as string | null | undefined; const label = getStatusLabel(key); if (label) return <p className="text-sm text-alloy-midnight/80 mt-0.5">{label}</p>; return <p className="text-sm text-alloy-midnight/80 mt-0.5">Unknown <Link href={`/admin/system/statuses?entity_type=customers`} className="text-alloy-blue hover:underline">Configure statuses</Link></p>; })()}
                                    </div>
                                            {(data._primary_contact as { id?: string; first_name?: string; last_name?: string; email?: string; phone?: string } | null) && (
                                                <div className="py-1.5">
                                                    <strong className="text-[#45506c] text-sm">Primary Contact:</strong>{" "}
                                                    <button type="button" onClick={() => openDrawer({ type: "contacts", id: (data._primary_contact as { id: string }).id })} className="text-alloy-blue hover:underline">
                                                        {[(data._primary_contact as { first_name?: string }).first_name, (data._primary_contact as { last_name?: string }).last_name].filter(Boolean).join(" ") || (data._primary_contact as { id: string }).id.slice(0, 8) + "…"}
                                                    </button>
                                                    {((data._primary_contact as { email?: string }).email || (data._primary_contact as { phone?: string }).phone) && (
                                                        <span className="text-[#31394d] text-sm ml-1">
                                                            ({[((data._primary_contact as { email?: string }).email), ((data._primary_contact as { phone?: string }).phone)].filter(Boolean).join(" · ")})
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
                                            <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-wider text-[#59678b] mb-3">Overview</summary>
                                            <div className="space-y-0">
                                                <Field label="ID" value={data.id as string} />
                                                <Field label="Submitted" value={data.submitted_at ? formatDateTime(data.submitted_at as string) : formatDateTime(data.created_at as string)} />
                                                {isEditing ? (
                                                    <>
                                                        <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Name</label><input value={String(formData.name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                                        <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Company name</label><input value={String(formData.company_name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, company_name: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" placeholder="Optional" /></div>
                                                        {statusDefsLoading ? <div className="text-sm text-alloy-midnight/60">Status: Loading…</div> : (
                                                <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Status</label><select value={String(formData.status_key ?? "")} onChange={(e) => setFormData((f) => ({ ...f, status_key: e.target.value || "" }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60"><option value="">— None —</option>{statusDefsForDrawer.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order).map((s) => <option key={s.status_key} value={s.status_key}>{s.status_label ?? s.status_key}</option>)}</select></div>
                                                )}
                                                        <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Email</label><input type="email" value={String(formData.email ?? "")} onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                                        <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Phone</label><input value={String(formData.phone ?? "")} onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Field label="Name" value={data.name as string} />
                                                        <Field label="Company name" value={(data.company_name as string)?.trim() ? (data.company_name as string) : "—"} />
                                                        <Field label="Email" value={data.email as string} />
                                                        <Field label="Phone" value={data.phone as string} />
                                                        <div className="py-1.5">
                                                    <strong className="text-[#45506c] text-sm">Status</strong>
                                                    {statusDefsLoading ? <p className="text-sm text-alloy-midnight/60 mt-0.5">Loading…</p> : (() => { const key = data.status_key as string | null | undefined; const label = getStatusLabel(key); if (label) return <p className="text-sm text-alloy-midnight/80 mt-0.5">{label}</p>; return <p className="text-sm text-alloy-midnight/80 mt-0.5">Unknown <Link href={`/admin/system/statuses?entity_type=vendors`} className="text-alloy-blue hover:underline">Configure statuses</Link></p>; })()}
                                                </div>
                                                        <DrawerLinkWithName label="Primary contact" id={(data.primary_contact_id as string) ?? null} type="contacts" displayName={data._primary_contact ? [((data._primary_contact as { first_name?: string }).first_name), ((data._primary_contact as { last_name?: string }).last_name)].filter(Boolean).join(" ") : null} />
                                                    </>
                                                )}
                                            </div>
                                        </details>
                                        <details className="border-b border-[#e6e8ec] pb-5 pt-4" open>
                                            <summary className="cursor-pointer list-none mb-3 text-xs font-semibold uppercase tracking-wider text-[#59678b]">Payout</summary>
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
                                                                    <p className="text-sm text-alloy-midnight/80">
                                                                        Completed occurrences: {vendorPayout.completed_occurrences} · Payout: <strong>{vendorPayout.payout_percent}%</strong>
                                                                    </p>
                                                                ) : (
                                                                    <p className="text-sm text-alloy-midnight/60">Select a job to preview tier.</p>
                                                                )}
                                                                <div className="flex flex-wrap items-center gap-2 mt-1">
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Job ID"
                                                                        value={vendorPayoutJobIdInput}
                                                                        onChange={(e) => setVendorPayoutJobIdInput(e.target.value)}
                                                                        className="px-2 py-1 border border-alloy-stone/40 rounded text-sm w-48 font-mono text-xs"
                                                                    />
                                                                    <button type="button" onClick={() => setVendorPayoutJobId(vendorPayoutJobIdInput.trim())} className="px-2 py-1 text-xs border border-alloy-stone/50 rounded hover:bg-alloy-stone/20">Preview payout for job</button>
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <p className="text-sm text-alloy-midnight/80">Payout: <strong>{vendorPayout.payout_percent}%</strong></p>
                                                        )}
                                                        <Link href="/admin/settings" className="text-xs text-alloy-blue hover:underline inline-block">Configure payout defaults</Link>
                                                    </>
                                                ) : (
                                                    <p className="text-sm text-alloy-midnight/60">Could not load payout policy.</p>
                                                )}
                                            </div>
                                        </details>
                                        <details className="border-b border-[#e6e8ec] pb-5 pt-4">
                                            <summary className="cursor-pointer list-none mb-3 text-xs font-semibold uppercase tracking-wider text-[#59678b]">Documents</summary>
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
                                            <summary className="cursor-pointer list-none mb-3 text-xs font-semibold uppercase tracking-wider text-[#59678b]">Jobs & Schedule</summary>
                                            {((data._vendor_jobs as VendorDrawerJob[]) ?? []).length === 0 ? (
                                                <p className="text-sm text-alloy-midnight/60">No jobs assigned yet.</p>
                                            ) : (
                                                <ul className="space-y-2">
                                                    {((data._vendor_jobs as VendorDrawerJob[]) ?? []).map((job) => {
                                                        const scheds = ((data._vendor_schedules as { job_id: string; start_at: string; end_at: string; timezone: string }[]) ?? []).filter((s) => s.job_id === job.id);
                                                        return (
                                                            <li key={job.id} className="border border-[#e6e8ec] rounded p-2 text-sm">
                                                                <button type="button" onClick={() => openDrawer({ type: "jobs", id: job.id })} className="text-alloy-blue hover:underline font-medium">{job.title || job.id.slice(0, 8)}</button>
                                                                <div className="text-alloy-midnight/70 mt-0.5">Scheduled: {job.scheduled_at ? formatDateTime(job.scheduled_at) : "-"} · Status: {job.job_status_id ?? "-"}</div>
                                                                {job.gross_price_cents != null && <div>Gross: {formatMoneyFromCents(job.gross_price_cents)}</div>}
                                                                {job.recurring_total_cents != null && <div>Recurring: {formatMoneyFromCents(job.recurring_total_cents)}</div>}
                                                                {job.opportunity_id && <button type="button" onClick={() => openDrawer({ type: "opportunities", id: job.opportunity_id })} className="text-alloy-blue hover:underline text-xs">Opportunity</button>}
                                                                {scheds.length > 0 && <div className="mt-1 text-xs"><strong>Schedules:</strong> {scheds.map((s) => `${formatDateTime(s.start_at)} – ${formatDateTime(s.end_at)} (${s.timezone || "-"})`).join("; ")}</div>}
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            )}
                                        </details>
                                        <details className="pt-4 border-b border-[#e6e8ec] pb-4">
                                            <summary className="cursor-pointer list-none mb-3 text-xs font-semibold uppercase tracking-wider text-[#59678b]">
                                                Contacts ({((data._vendor_contacts as VendorDrawerContact[]) ?? []).length})
                                            </summary>
                                            <ul className="space-y-1 mt-2">
                                                {((data._vendor_contacts as VendorDrawerContact[]) ?? []).length === 0 ? (
                                                    <li className="text-sm text-alloy-midnight/60">No contacts linked (contacts are linked via contact’s vendor_id).</li>
                                                ) : (
                                                    ((data._vendor_contacts as VendorDrawerContact[]) ?? []).map((c) => (
                                                        <li key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                                                            <button type="button" onClick={() => openDrawer({ type: "contacts", id: c.id })} className="text-alloy-blue hover:underline text-left">{[c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.id.slice(0, 8)}</button>
                                                            <span className="text-alloy-midnight/50 text-xs">{c.email ?? ""}</span>
                                                            <span className="text-alloy-midnight/50 text-xs">{c.phone ?? ""}</span>
                                                            {c.vendor_contact_role && <span className="text-alloy-midnight/50 text-xs">({c.vendor_contact_role})</span>}
                                                        </li>
                                                    ))
                                                )}
                                            </ul>
                                        </details>
                                        <details className="pt-4 pb-2">
                                            <summary className="cursor-pointer list-none mb-3 text-xs font-semibold uppercase tracking-wider text-[#59678b]">Operational / Settings</summary>
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
                                                        <Field label="Service area zips" value={Array.isArray(data.service_area_zip_codes) ? (data.service_area_zip_codes as string[]).join(", ") : (data.service_area_zip_codes as string) ?? "—"} />
                                                        <Field label="Days available" value={Array.isArray(data.days_available) ? (data.days_available as string[]).join(", ") : (data.days_available as string) ?? "—"} />
                                                        <Field label="Hours" value={[data.operating_hours_open, data.operating_hours_close].filter(Boolean).join(" – ") || "—"} />
                                                        <Field label="Owns supplies" value={data.owns_supplies ? "Yes" : "No"} />
                                                        <Field label="Max daily jobs" value={data.max_daily_jobs != null ? String(data.max_daily_jobs) : "—"} />
                                                        <Field label="Payout %" value={data.payout_percent != null ? String(data.payout_percent) : "—"} />
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
                                    <Field label="Name" value={data.name as string} />
                                    {isEditing ? (
                                        <>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Job Date</label><input type="date" value={String(formData.job_date ?? "")} onChange={(e) => setFormData((f) => ({ ...f, job_date: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Time Window</label><input value={String(formData.job_time_window ?? "")} onChange={(e) => setFormData((f) => ({ ...f, job_time_window: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                            <div>
                                                <label className="block text-sm text-alloy-midnight/70 mb-0.5">Stage</label>
                                                <select value={String(formData.pipeline_stage_id ?? "")} onChange={(e) => setFormData((f) => ({ ...f, pipeline_stage_id: e.target.value || null }))} className="w-full px-2 py-1.5 border rounded text-sm">
                                                    <option value="">— None —</option>
                                                    {pipelines.map((p) => {
                                                        const pipelineStages = stages.filter((s) => s.pipeline_id === p.id).sort((a, b) => a.position - b.position);
                                                        return pipelineStages.map((s) => (
                                                            <option key={s.id} value={s.id}>{p.name}: {s.name}</option>
                                                        ));
                                                    })}
                                                </select>
                                            </div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Vertical ID</label><input value={String(formData.vertical_id ?? "")} onChange={(e) => setFormData((f) => ({ ...f, vertical_id: e.target.value || null }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Quote Total ($)</label><input type="number" step="0.01" value={typeof formData.quote_total === "number" && !Number.isNaN(formData.quote_total) ? formData.quote_total : ""} onChange={(e) => setFormData((f) => ({ ...f, quote_total: e.target.value === "" ? null : parseFloat(e.target.value) }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                            {statusDefsLoading ? null : (
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Status</label><select value={String(formData.status_key ?? "")} onChange={(e) => setFormData((f) => ({ ...f, status_key: e.target.value || "" }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60"><option value="">— None —</option>{statusDefsForDrawer.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order).map((s) => <option key={s.status_key} value={s.status_key}>{s.status_label ?? s.status_key}</option>)}</select></div>
                                            )}
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Notes</label><textarea value={String(formData.notes ?? "")} onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" rows={2} /></div>
                                        </>
                                    ) : (
                                        <>
                                            <Field label="Stage" value={(data._stage_name as string) ?? (data.status as string) ?? "-"} />
                                            <Field label="Job Date" value={formatDate(data.job_date as string)} />
                                            <Field label="Time Window" value={data.job_time_window as string} />
                                            <Field label="Quote Total" value={formatMoneyFromDollars(data.quote_total as number)} />
                                            <Field label="Notes" value={((data.metadata as Record<string, unknown>)?.notes as string) ?? "-"} />
                                            <div className="py-1.5">
                                                <strong className="text-[#45506c] text-sm">Status</strong>
                                                {statusDefsLoading ? <p className="text-sm text-alloy-midnight/60 mt-0.5">Loading…</p> : (() => { const key = data.status_key as string | null | undefined; const label = getStatusLabel(key); if (label) return <p className="text-sm text-alloy-midnight/80 mt-0.5">{label}</p>; return <p className="text-sm text-alloy-midnight/80 mt-0.5">Unknown <Link href="/admin/system/statuses?entity_type=opportunities" className="text-alloy-blue hover:underline">Configure statuses</Link></p>; })()}
                                            </div>
                                        </>
                                    )}
                                    <DrawerLinkWithName label="Customer" id={(data.customer_id as string) ?? null} type="customers" displayName={data._customer_name as string} />
                                    <DrawerLinkWithName label="Primary Contact" id={(data.primary_contact_id as string) ?? null} type="contacts" displayName={data._contact_name as string} />
                                </>
                            )}
                            {drawer.type === "jobs" && (
                                <>
                                    <div className="rounded-lg border border-alloy-stone/30 bg-[#F4F6F9]/50 p-3 mb-4">
                                        <p className="text-xs font-semibold uppercase tracking-wider text-alloy-midnight/60 mb-2">Quick Actions</p>
                                        <div className="flex flex-wrap gap-2">
                                            {!jobPayments.some((p) => p.payment_statuses?.key === "paid") && (
                                                <button
                                                    type="button"
                                                    disabled={!!paymentActionLoading}
                                                    onClick={async () => {
                                                        if (!drawer.id) return;
                                                        setPaymentActionLoading("run");
                                                        setPaymentToast(null);
                                                        try {
                                                            const res = await fetch("/api/admin/payments/run", {
                                                                method: "POST",
                                                                headers: { "Content-Type": "application/json" },
                                                                body: JSON.stringify({ job_id: drawer.id }),
                                                            });
                                                            const json = await res.json().catch(() => ({}));
                                                            if (res.status === 409) {
                                                                setPaymentToast({ type: "error", message: (json as { error?: string }).error ?? "Job already has a paid payment" });
                                                                refetchJobPayments();
                                                                return;
                                                            }
                                                            if (!res.ok) {
                                                                setPaymentToast({ type: "error", message: (json as { error?: string }).error ?? "Run payment failed" });
                                                                return;
                                                            }
                                                            setPaymentToast({ type: "success", message: "Payment succeeded" });
                                                            refetchJobPayments();
                                                            refetch();
                                                        } catch (e) {
                                                            setPaymentToast({ type: "error", message: (e as Error).message });
                                                        } finally {
                                                            setPaymentActionLoading(null);
                                                        }
                                                    }}
                                                    className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50"
                                                >
                                                    {paymentActionLoading === "run" ? "…" : "Run Payment"}
                                                </button>
                                            )}
                                            {jobPayments.length > 0 && jobPayments[0]?.payment_statuses?.key === "failed" && (
                                                <button
                                                    type="button"
                                                    disabled={!!paymentActionLoading}
                                                    onClick={async () => {
                                                        if (!drawer.id) return;
                                                        setPaymentActionLoading("retry");
                                                        setPaymentToast(null);
                                                        try {
                                                            const res = await fetch("/api/admin/payments/run", {
                                                                method: "POST",
                                                                headers: { "Content-Type": "application/json" },
                                                                body: JSON.stringify({ job_id: drawer.id }),
                                                            });
                                                            const json = await res.json().catch(() => ({}));
                                                            if (res.status === 409) {
                                                                setPaymentToast({ type: "error", message: (json as { error?: string }).error ?? "Job already has a paid payment" });
                                                                refetchJobPayments();
                                                                return;
                                                            }
                                                            if (!res.ok) {
                                                                setPaymentToast({ type: "error", message: (json as { error?: string }).error ?? "Retry failed" });
                                                                return;
                                                            }
                                                            setPaymentToast({ type: "success", message: "Payment succeeded" });
                                                            refetchJobPayments();
                                                            refetch();
                                                        } catch (e) {
                                                            setPaymentToast({ type: "error", message: (e as Error).message });
                                                        } finally {
                                                            setPaymentActionLoading(null);
                                                        }
                                                    }}
                                                    className="px-3 py-1.5 text-sm border border-amber-500/60 text-amber-700 rounded-md hover:bg-amber-50 disabled:opacity-50"
                                                >
                                                    {paymentActionLoading === "retry" ? "…" : "Retry Failed"}
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                disabled={!!jobActionLoading}
                                                onClick={async () => {
                                                    if (!drawer.id) return;
                                                    setJobActionLoading("mark_completed");
                                                    try {
                                                        const res = await fetch(`/api/admin/jobs/${drawer.id}`, {
                                                            method: "PATCH",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify({ action: "mark_completed" }),
                                                        });
                                                        const json = await res.json().catch(() => ({}));
                                                        if (!res.ok) throw new Error((json.error as string) || "Failed");
                                                        setData((prev) => (prev ? { ...prev, ...json } : prev));
                                                        refetch();
                                                        router.refresh();
                                                    } catch (e) {
                                                        console.error("Mark completed failed", e);
                                                    } finally {
                                                        setJobActionLoading(null);
                                                    }
                                                }}
                                                className="px-3 py-1.5 text-sm bg-alloy-juniper text-white rounded-md hover:opacity-90 disabled:opacity-50"
                                            >
                                                {jobActionLoading === "mark_completed" ? "…" : "Mark completed"}
                                            </button>
                                            {jobSchedules.length > 0 && !rescheduleForm && (
                                                <button
                                                    type="button"
                                                    onClick={() => openReschedule(jobSchedules[0])}
                                                    className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30"
                                                >
                                                    Reschedule
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <Field label="Title" value={data.title as string} />
                                    <div className="pt-2 pb-2 border-b border-[#e6e8ec]">
                                        <strong className="text-alloy-midnight/70 block mb-2">Default vendor</strong>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <select
                                                value={jobAssignedVendorId ?? ""}
                                                onChange={(e) => setJobAssignedVendorId(e.target.value || null)}
                                                className="px-2 py-1.5 border rounded text-sm min-w-[140px]"
                                            >
                                                <option value="">— None —</option>
                                                {jobVendorsForAssign.map((v) => (
                                                    <option key={v.id} value={v.id}>{v.name}</option>
                                                ))}
                                            </select>
                                            <button
                                                type="button"
                                                disabled={jobAssignedVendorSaving}
                                                onClick={async () => {
                                                    if (!drawer.id) return;
                                                    setJobAssignedVendorSaving(true);
                                                    try {
                                                        const res = await fetch(`/api/admin/jobs/${drawer.id}`, {
                                                            method: "PATCH",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify({ assigned_vendor_id: jobAssignedVendorId || null }),
                                                        });
                                                        const json = await res.json().catch(() => ({}));
                                                        if (!res.ok) throw new Error((json.error as string) || "Save failed");
                                                        setData((prev) => (prev ? { ...prev, assigned_vendor_id: jobAssignedVendorId ?? null, _assigned_vendor: jobAssignedVendorId ? jobVendorsForAssign.find((v) => v.id === jobAssignedVendorId) ?? null : null } : prev));
                                                        if (applyVendorToUpcoming && jobAssignedVendorId) {
                                                            const applyRes = await fetch(`/api/admin/jobs/${drawer.id}/apply-vendor-to-upcoming`, { method: "POST" });
                                                            if (!applyRes.ok) {
                                                                const applyJson = await applyRes.json().catch(() => ({}));
                                                                throw new Error((applyJson.error as string) || "Apply to upcoming failed");
                                                            }
                                                        }
                                                        refetch();
                                                        router.refresh();
                                                    } catch (e) {
                                                        setSaveError((e as Error).message);
                                                    } finally {
                                                        setJobAssignedVendorSaving(false);
                                                    }
                                                }}
                                                className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50"
                                            >
                                                {jobAssignedVendorSaving ? "Saving…" : "Save"}
                                            </button>
                                        </div>
                                        {jobAssignedVendorId && (
                                            <label className="flex items-center gap-2 mt-2 text-sm text-alloy-midnight/70">
                                                <input type="checkbox" checked={applyVendorToUpcoming} onChange={(e) => setApplyVendorToUpcoming(e.target.checked)} />
                                                Apply to all upcoming schedules for this job (safe)
                                            </label>
                                        )}
                                    </div>
                                    {(isEditing || (drawer.type === "jobs" && !(data as { _create?: boolean })?._create)) ? (
                                        <>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Scheduled (local)</label><input type="datetime-local" value={String(formData.scheduled_at ?? "")} onChange={(e) => setFormData((f) => ({ ...f, scheduled_at: e.target.value }))} disabled={drawer.type === "jobs" ? !canMutate : false} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" /></div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Service frequency key</label><input value={String(formData.service_frequency_key ?? "")} onChange={(e) => setFormData((f) => ({ ...f, service_frequency_key: e.target.value }))} disabled={drawer.type === "jobs" ? !canMutate : false} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" /></div>
                                            <div><label className="flex items-center gap-2"><input type="checkbox" checked={!!formData.is_recurring} onChange={(e) => setFormData((f) => ({ ...f, is_recurring: e.target.checked }))} disabled={drawer.type === "jobs" ? !canMutate : false} /> Recurring</label></div>
                                            {statusDefsLoading ? null : (
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Status</label><select value={String(formData.status_key ?? "")} onChange={(e) => setFormData((f) => ({ ...f, status_key: e.target.value || "" }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60"><option value="">— None —</option>{statusDefsForDrawer.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order).map((s) => <option key={s.status_key} value={s.status_key}>{s.status_label ?? s.status_key}</option>)}</select></div>
                                            )}
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Job status ID</label><input value={String(formData.job_status_id ?? "")} onChange={(e) => setFormData((f) => ({ ...f, job_status_id: e.target.value }))} disabled={drawer.type === "jobs" ? !canMutate : false} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" /></div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Internal notes</label><textarea value={String(formData.internal_notes ?? "")} onChange={(e) => setFormData((f) => ({ ...f, internal_notes: e.target.value }))} disabled={drawer.type === "jobs" ? !canMutate : false} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60" rows={2} /></div>
                                        </>
                                    ) : (
                                        <>
                                            <Field label="Recurring" value={data.is_recurring ? "Yes" : "No"} />
                                            <Field label="Scheduled at" value={formatDateTime(data.scheduled_at as string)} />
                                            <div className="py-1.5">
                                                <strong className="text-[#45506c] text-sm">Status</strong>
                                                {statusDefsLoading ? <p className="text-sm text-alloy-midnight/60 mt-0.5">Loading…</p> : (() => { const key = data.status_key as string | null | undefined; const label = getStatusLabel(key); if (label) return <p className="text-sm text-alloy-midnight/80 mt-0.5">{label}</p>; return <p className="text-sm text-alloy-midnight/80 mt-0.5">Unknown <Link href="/admin/system/statuses?entity_type=jobs" className="text-alloy-blue hover:underline">Configure statuses</Link></p>; })()}
                                            </div>
                                            <Field label="Status ID" value={data.job_status_id as string} />
                                            <Field label="Internal notes" value={((data.metadata as Record<string, unknown>)?.internal_notes as string) ?? "-"} />
                                        </>
                                    )}
                                    <Field label="Gross Price" value={formatMoneyFromCents(data.gross_price_cents as number)} />
                                    <Field label="Payout" value={formatMoneyFromCents(data.contractor_payout_cents as number)} />
                                    <DrawerLinkWithName label={opportunitySingular} id={(data.opportunity_id as string) ?? null} type="opportunities" displayName={data._opportunity_name as string} />
                                    <DrawerLinkWithName label={`Primary ${contactSingular}`} id={(data.primary_contact_id as string) ?? null} type="contacts" displayName={data._contact_name as string} />
                                    <DrawerLinkWithName label={customerSingular} id={(data.customer_id as string) ?? null} type="customers" displayName={data._customer_name as string} />
                                    <Field label="Offer Code" value={data.offer_code as string} />
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
                                                            <span className="text-sm">{formatDateTime(s.start_at)} – {formatDateTime(s.end_at)} ({s.timezone || "—"})</span>
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
                                        {jobPaymentsLoading ? (
                                            <p className="text-sm text-alloy-midnight/60">Loading payments…</p>
                                        ) : (
                                            <>
                                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                                    <span className="text-xs text-alloy-midnight/60">State:</span>
                                                    <StatusBadge
                                                        label={
                                                            jobPayments.some((p) => p.payment_statuses?.key === "paid")
                                                                ? "Paid"
                                                                : jobPayments.length === 0
                                                                    ? "Unpaid"
                                                                    : (jobPayments[0]?.payment_statuses?.key ?? "pending").charAt(0).toUpperCase() + (jobPayments[0]?.payment_statuses?.key ?? "pending").slice(1)
                                                        }
                                                        variant={jobPayments.some((p) => p.payment_statuses?.key === "paid") ? "success" : jobPayments[0]?.payment_statuses?.key === "failed" ? "warning" : "default"}
                                                    />
                                                </div>
                                                {jobPayments.length > 0 && (
                                                    <div className="mb-3">
                                                        <p className="text-xs text-alloy-midnight/60 mb-1">Attempts (newest first)</p>
                                                        <ul className="text-sm space-y-1 border border-[#e6e8ec] rounded p-2 bg-[#F4F6F9]/30 max-h-40 overflow-y-auto">
                                                            {jobPayments.map((p) => (
                                                                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                                                    <span>{formatDateTime(p.created_at)}</span>
                                                                    <span>{formatMoneyFromCents(p.amount_cents)}</span>
                                                                    <span className="text-alloy-midnight/70">{p.payment_statuses?.key ?? "—"}</span>
                                                                    {p.provider_payment_id && <span className="font-mono text-xs text-alloy-midnight/60">{p.provider_payment_id}</span>}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                                <div className="flex flex-wrap gap-2">
                                                    {jobPayments.length > 0 && jobPayments[0]?.payment_statuses?.key === "pending" && (
                                                        <button type="button" disabled title="Void Pending — coming soon" className="px-3 py-1.5 text-sm border border-[#e6e8ec] rounded-md text-alloy-midnight/50 cursor-not-allowed">
                                                            Void Pending
                                                        </button>
                                                    )}
                                                    {jobPayments.some((p) => p.payment_statuses?.key === "paid") && (
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
                            {drawer.type === "schedules" && (
                                <>
                                    {(data.job_id as string) && (
                                        <div>
                                            <strong className="text-alloy-midnight/70">{jobSingular}</strong>
                                            <button type="button" onClick={() => openDrawer({ type: "jobs", id: data.job_id as string })} className="ml-2 text-alloy-blue hover:underline text-sm">
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
                                    {isEditing ? (
                                        <>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Start</label><input type="datetime-local" value={String(formData.start_at ?? "")} onChange={(e) => setFormData((f) => ({ ...f, start_at: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">End</label><input type="datetime-local" value={String(formData.end_at ?? "")} onChange={(e) => setFormData((f) => ({ ...f, end_at: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Timezone</label><input value={String(formData.timezone ?? "")} onChange={(e) => setFormData((f) => ({ ...f, timezone: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                            {statusDefsLoading ? null : (
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Status</label><select value={String(formData.status_key ?? "")} onChange={(e) => setFormData((f) => ({ ...f, status_key: e.target.value || "" }))} disabled={!canMutate} className="w-full px-2 py-1.5 border rounded text-sm disabled:opacity-60"><option value="">— None —</option>{statusDefsForDrawer.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order).map((s) => <option key={s.status_key} value={s.status_key}>{s.status_label ?? s.status_key}</option>)}</select></div>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <Field label="Start" value={formatDateTime(data.start_at as string)} />
                                            <Field label="End" value={formatDateTime(data.end_at as string)} />
                                            <Field label="Timezone" value={data.timezone as string} />
                                            <div className="py-1.5">
                                                <strong className="text-[#45506c] text-sm">Status</strong>
                                                {statusDefsLoading ? <p className="text-sm text-alloy-midnight/60 mt-0.5">Loading…</p> : (() => { const key = data.status_key as string | null | undefined; const label = getStatusLabel(key); if (label) return <p className="text-sm text-alloy-midnight/80 mt-0.5">{label}</p>; return <p className="text-sm text-alloy-midnight/80 mt-0.5">Unknown <Link href="/admin/system/statuses?entity_type=schedules" className="text-alloy-blue hover:underline">Configure statuses</Link></p>; })()}
                                            </div>
                                        </>
                                    )}
                                    {(data.canceled_at as string) && (
                                        <div className="text-amber-700 text-sm">Canceled: {formatDateTime(data.canceled_at as string)} {(data.canceled_by as string) && `by ${data.canceled_by}`} {(data.cancel_reason as string) && ` — ${data.cancel_reason}`}</div>
                                    )}
                                    <div className="pt-2 border-t border-[#e6e8ec]">
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
                                                        <p className="text-alloy-midnight/70">Default vendor (job): {(data._job_assigned_vendor as { name: string }).name}</p>
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
                                                <label className="text-sm text-alloy-midnight/70">{(data._assignment as { id?: string }) ? "Override vendor" : "Assign vendor"}</label>
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
                                                    {scheduleVendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                    {!(data.canceled_at as string) && (
                                        <div className="pt-2 border-t border-[#e6e8ec] flex flex-wrap gap-2">
                                            {!scheduleCancelPrompt ? (
                                                <button type="button" onClick={() => setScheduleCancelPrompt(true)} className="px-2 py-1.5 text-sm border border-amber-600 text-amber-700 rounded hover:bg-amber-50">Cancel {scheduleSingular.toLowerCase()}</button>
                                            ) : (
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <input value={scheduleCancelReason} onChange={(e) => setScheduleCancelReason(e.target.value)} placeholder="Reason (optional)" className="px-2 py-1.5 border rounded text-sm w-40" />
                                                    <button type="button" onClick={async () => {
                                                        try {
                                                            const res = await fetch(`/api/admin/schedules/${drawer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ canceled_at: new Date().toISOString(), canceled_by: "admin", cancel_reason: scheduleCancelReason || null }) });
                                                            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
                                                            setScheduleCancelReason("");
                                                            setScheduleCancelPrompt(false);
                                                            refetch(); router.refresh();
                                                        } catch (err) { setSaveError((err as Error).message); }
                                                    }} className="px-2 py-1.5 text-sm bg-amber-100 text-amber-800 rounded">Confirm cancel</button>
                                                    <button type="button" onClick={() => { setScheduleCancelPrompt(false); setScheduleCancelReason(""); }} className="text-sm text-alloy-midnight/60">Back</button>
                                                </div>
                                            )}
                                            <button type="button" onClick={() => setScheduleRescheduleForm(scheduleRescheduleForm ? null : { start_at: (data.start_at as string) ? new Date(data.start_at as string).toISOString().slice(0, 16) : "", end_at: (data.end_at as string) ? new Date(data.end_at as string).toISOString().slice(0, 16) : "", copy_assignment: !!(data._assignment as { id?: string }) })} className="px-2 py-1.5 text-sm border border-alloy-blue text-alloy-blue rounded hover:bg-alloy-stone/10">Reschedule</button>
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
                                </>
                            )}
                            {drawer.type === "locations" && data && (
                                <>
                                    <Field label="Type" value={(data._location_type_label as string) ?? ((data.location_type as string) ? String(data.location_type).charAt(0).toUpperCase() + String(data.location_type).slice(1).toLowerCase() : "—")} />
                                    <Field label="Owner" value={(data.customer_id as string) ? `${customerSingular} location` : "Org location"} />
                                    {isEditing ? (
                                        <>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Name</label><input value={String(formData.label ?? "")} onChange={(e) => setFormData((f) => ({ ...f, label: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Type</label><select value={String(formData.location_type_id ?? "")} onChange={(e) => setFormData((f) => ({ ...f, location_type_id: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm"><option value="">— Select —</option>{locationTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
                                            <div className="flex items-center gap-2"><input type="checkbox" checked={!!formData.is_active} onChange={(e) => setFormData((f) => ({ ...f, is_active: e.target.checked }))} /><label className="text-sm text-alloy-midnight/70">Active</label></div>
                                            {(data.customer_id as string) && <div className="flex items-center gap-2"><input type="checkbox" checked={!!formData.is_primary} onChange={(e) => setFormData((f) => ({ ...f, is_primary: e.target.checked }))} /><label className="text-sm text-alloy-midnight/70">Primary</label></div>}
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Address 1</label><input value={String(formData.address1 ?? "")} onChange={(e) => setFormData((f) => ({ ...f, address1: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Address 2</label><input value={String(formData.address2 ?? "")} onChange={(e) => setFormData((f) => ({ ...f, address2: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                            <div className="grid grid-cols-3 gap-2"><input value={String(formData.city ?? "")} onChange={(e) => setFormData((f) => ({ ...f, city: e.target.value }))} placeholder="City" className="px-2 py-1.5 border rounded text-sm" /><input value={String(formData.state ?? "")} onChange={(e) => setFormData((f) => ({ ...f, state: e.target.value }))} placeholder="State" className="px-2 py-1.5 border rounded text-sm" /><input value={String(formData.postal_code ?? "")} onChange={(e) => setFormData((f) => ({ ...f, postal_code: e.target.value }))} placeholder="ZIP" className="px-2 py-1.5 border rounded text-sm" /></div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Country</label><input value={String(formData.country ?? "")} onChange={(e) => setFormData((f) => ({ ...f, country: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                            <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Access notes</label><textarea value={String(formData.access_notes ?? "")} onChange={(e) => setFormData((f) => ({ ...f, access_notes: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" rows={2} /></div>
                                        </>
                                    ) : (
                                        <>
                                            <Field label="Name" value={data.label as string} />
                                            <Field label="Address 1" value={data.address1 as string} />
                                            <Field label="Address 2" value={data.address2 as string} />
                                            <Field label="City" value={data.city as string} />
                                            <Field label="State" value={data.state as string} />
                                            <Field label="Postal code" value={data.postal_code as string} />
                                            <Field label="Country" value={data.country as string} />
                                            <Field label="Primary" value={data.is_primary ? "Yes" : "No"} />
                                            <Field label="Active" value={data.is_active ? "Yes" : "No"} />
                                            <Field label="Access notes" value={data.access_notes as string} />
                                            <DrawerLinkWithName label="Customer" id={(data.customer_id as string) ?? null} type="customers" displayName={data._customer_name as string} />
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
                                                                                                    else if (t === "vendors_query") next[ri] = { type: "vendors_query", source: "query", status_key: "approved", vertical_slug: null, match_job_vertical: true, match_job_zip: true, max: 25, role_in: ["primary"] };
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
                                                    <Field label="ID" value={data.id as string} />
                                                    <Field label="Name" value={data.name as string} />
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
                                            {saveError && <p className="text-red-600 text-sm">{saveError}</p>}
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
                                    <Field label="ID" value={data.id as string} />
                                    <Field label="Created" value={formatDateTime(data.created_at as string)} />
                                    <Field label="Discount Code" value={data.discount_code as string} />
                                    <Field label="Subtotal" value={formatMoneyFromDollars(data.quote_subtotal as number)} />
                                    <Field label="Discount Amount" value={formatMoneyFromDollars(data.discount_amount as number)} />
                                    <Field label="Total" value={formatMoneyFromDollars(data.quote_total as number)} />
                                    <Field label="Contact ID" value={data.contact_id as string} />
                                    <Field label="Opportunity ID" value={data.opportunity_id as string} />
                                    <Field label="Job ID" value={data.job_id as string} />
                                </>
                            )}
                            {drawer.type === "subscriptions" && data && (() => {
                                const subData = data as {
                                    id: string;
                                    created_at: string;
                                    customer_id: string;
                                    status: string;
                                    start_date: string | null;
                                    _frequency_label: string | null;
                                    _customer_name: string | null;
                                    _schedules?: { id: string; job_id: string; start_at: string; end_at: string; subscription_sequence: number; rescheduled_from_schedule_id: string | null; canceled_at: string | null; canceled_by: string | null; cancel_reason: string | null }[];
                                };
                                const schedules = subData._schedules ?? [];
                                return (
                                    <>
                                        <details className="pt-2 pb-2 border-b border-[#e6e8ec]">
                                            <summary className="cursor-pointer list-none mb-3 text-xs font-semibold uppercase tracking-wider text-[#59678b]">Overview</summary>
                                            <div className="space-y-1">
                                                <Field label="ID" value={subData.id} />
                                                <Field label="Created" value={formatDateTime(subData.created_at)} />
                                                <Field label="Customer" value={subData._customer_name ?? "—"} />
                                                <DrawerLinkWithName label="Customer" id={subData.customer_id ?? null} type="customers" displayName={subData._customer_name} />
                                                <Field label="Frequency" value={subData._frequency_label ?? "—"} />
                                                <Field label="Status" value={subData.status} />
                                                <Field label="Start date" value={subData.start_date ?? "—"} />
                                            </div>
                                        </details>
                                        <details className="pt-4 border-b border-[#e6e8ec] pb-4">
                                            <summary className="cursor-pointer list-none mb-3 text-xs font-semibold uppercase tracking-wider text-[#59678b]">Schedules</summary>
                                            {schedules.length === 0 ? (
                                                <p className="text-sm text-alloy-midnight/60">No occurrences yet.</p>
                                            ) : (
                                                <ul className="space-y-2">
                                                    {schedules.map((s) => (
                                                        <li key={s.id} className="border border-[#e6e8ec] rounded p-2 text-sm">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span>#{s.subscription_sequence} — {formatDateTime(s.start_at)}</span>
                                                                <button type="button" onClick={() => openDrawer({ type: "schedules", id: s.id })} className="text-alloy-blue hover:underline text-xs">Open</button>
                                                            </div>
                                                            {s.rescheduled_from_schedule_id && <div className="text-alloy-midnight/60 text-xs mt-0.5">Rescheduled from schedule</div>}
                                                            {s.canceled_at && <div className="text-red-600/80 text-xs mt-0.5">Canceled {formatDateTime(s.canceled_at)}{s.canceled_by ? ` by ${s.canceled_by}` : ""}{s.cancel_reason ? ` — ${s.cancel_reason}` : ""}</div>}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </details>
                                        {drawer.id && (
                                            <SubscriptionGenerateNextButton subscriptionId={drawer.id} onDone={refetch} />
                                        )}
                                    </>
                                );
                            })()}
                        </>
                    )}
                </div>
            )}
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
        </Drawer>
    );
}
