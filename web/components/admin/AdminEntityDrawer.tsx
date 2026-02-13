"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Drawer from "@/components/admin/Drawer";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import RelatedRecordsTabs from "@/components/admin/RelatedRecordsTabs";
import { formatMoneyFromCents, formatMoneyFromDollars, formatDate, formatDateTime } from "@/lib/adminFormatters";
import {
    WORKFLOW_ENTITY_TYPES,
    WORKFLOW_EVENT_TYPES,
    WORKFLOW_FIELD_PATHS_BY_ENTITY_TYPE,
    WORKFLOW_ENTITY_ID_QUICK_FILL,
    WORKFLOW_CONDITION_OPERATORS,
} from "@/lib/workflowVocab";

const EDITABLE_TYPES = ["opportunities", "jobs", "contacts", "customers", "schedules", "workflows", "vendors"] as const;

type VendorFormData = {
    vendor_status_id?: string | null;
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
        <div>
            <strong className="text-alloy-midnight/70">{label}:</strong> {value ?? "-"}
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
    type: "contacts" | "customers" | "opportunities" | "jobs" | "vendors";
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
            return;
        }
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
            return;
        }
        fetch(`/api/admin/related/job/${drawer.id}`)
            .then((res) => res.ok ? res.json() : { schedules: [] })
            .then((json: { schedules?: { id: string; job_id: string; start_at: string; end_at: string; timezone: string }[] }) => setJobSchedules(json.schedules ?? []))
            .catch(() => setJobSchedules([]));
    }, [drawer.type, drawer.id]);

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
        if (drawer.type !== "workflows" || !data) return;
        if ((data as { _create?: boolean })._create) {
            setWorkflowConditions([]);
            setWorkflowActions([]);
            setFormData({ name: "", description: "", enabled: true, event_type: "", entity_type: "" });
            return;
        }
        if (data._conditions) {
            const cond = (data._conditions as { target_entity?: string; field_path?: string; field?: string; operator?: string; value?: string; value_jsonb?: unknown }[]).map((c) => ({
                target_entity: c.target_entity ?? "",
                field_path: c.field_path ?? c.field ?? "",
                operator: c.operator ?? "eq",
                value: c.value ?? (c.value_jsonb != null ? (typeof c.value_jsonb === "string" ? c.value_jsonb : JSON.stringify(c.value_jsonb)) : ""),
            }));
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
    }, [drawer.type, data]);

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
                internal_notes: (meta.internal_notes as string) ?? "",
            });
        } else if (drawer.type === "contacts") {
            setFormData({
                first_name: data.first_name ?? "",
                last_name: data.last_name ?? "",
                email: data.email ?? "",
                phone: data.phone ?? "",
                status: data.status ?? "",
            });
        } else if (drawer.type === "customers") {
            setFormData({
                name: data.name ?? "",
                status: data.status ?? "",
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
            });
        } else if (drawer.type === "workflows" && !(data as { _create?: boolean })._create) {
            setFormData({
                name: data.name ?? "",
                description: data.description ?? "",
                enabled: data.enabled ?? true,
                event_type: data.event_type ?? "",
                entity_type: data.entity_type ?? "",
            });
        }
        setSaveError(null);
        setIsEditing(true);
    }, [data, drawer.type]);

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
            const url = `/api/admin/${drawer.type}/${drawer.id}`;
            const payload: Record<string, unknown> = { ...formData };
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
                const daysStr = payload.days_available as string | undefined;
                payload.days_available = daysStr ? String(daysStr).split(",").map((s) => s.trim()).filter(Boolean) : null;
                const zipsStr = payload.service_area_zip_codes as string | undefined;
                payload.service_area_zip_codes = zipsStr ? String(zipsStr).split(",").map((s) => s.trim()).filter(Boolean) : null;
                if (payload.max_daily_jobs === "") payload.max_daily_jobs = null;
                if (payload.payout_percent === "") payload.payout_percent = null;
            }
            const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json.error as string) || "Save failed");
            setData((prev) => (prev ? { ...prev, ...json } : prev));
            refetch();
            setIsEditing(false);
            router.refresh();
        } catch (e: unknown) {
            setSaveError((e as Error).message);
        } finally {
            setSaving(false);
        }
    }, [drawer.type, drawer.id, formData, workflowConditions, workflowActions, refetch, router]);

    if (!drawer.type || !drawer.id) return null;

    const title = data
        ? drawer.type === "contacts"
            ? `Contact: ${[data.first_name, data.last_name].filter(Boolean).join(" ") || drawer.id}`
            : drawer.type === "customers"
              ? `Customer: ${(data.name as string) || drawer.id}`
              : drawer.type === "opportunities"
                ? `Opportunity: ${(data.name as string) || drawer.id}`
                : drawer.type === "jobs"
                  ? `Job: ${(data.title as string) || drawer.id}`
                  : drawer.type === "schedules"
                    ? `Schedule: ${drawer.id}`
                    : drawer.type === "discount_redemptions"
                      ? `Redemption: ${(data.discount_code as string) || drawer.id}`
                      : drawer.type === "workflows"
                        ? (data as { _create?: boolean })._create
                          ? "New workflow"
                          : `Workflow: ${(data.name as string) || drawer.id}`
                        : drawer.type === "vendors"
                          ? `Vendor: ${(data.name as string) || drawer.id}`
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
                <div className="space-y-4">
                    {canEditInDrawer(drawer.type) && (
                        <div className="flex gap-2 pb-2 border-b border-alloy-stone/20">
                            {!isEditing ? (
                                <>
                                    <button type="button" onClick={startEdit} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90">Edit</button>
                                    {drawer.type === "workflows" && <button type="button" onClick={() => { setRunModalOpen(true); setRunPayload("{}"); setRunResult(null); setRunJsonError(null); }} className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30">Run workflow</button>}
                                </>
                            ) : (
                                <>
                                    <button type="button" onClick={saveEdit} disabled={saving} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
                                    <button type="button" onClick={() => { setIsEditing(false); setSaveError(null); }} className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30">Cancel</button>
                                </>
                            )}
                        </div>
                    )}
                    {saveError && <p className="text-red-600 text-sm">{saveError}</p>}
                    {drawer.type === "contacts" && (
                        <>
                            <Field label="ID" value={data.id as string} />
                            <Field label="Created" value={formatDateTime(data.created_at as string)} />
                            {isEditing ? (
                                <>
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">First Name</label><input value={String(formData.first_name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, first_name: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Last Name</label><input value={String(formData.last_name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, last_name: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Email</label><input type="email" value={String(formData.email ?? "")} onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Phone</label><input value={String(formData.phone ?? "")} onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Status</label><input value={String(formData.status ?? "")} onChange={(e) => setFormData((f) => ({ ...f, status: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                </>
                            ) : (
                                <>
                                    <Field label="First Name" value={data.first_name as string} />
                                    <Field label="Last Name" value={data.last_name as string} />
                                    <Field label="Email" value={data.email as string} />
                                    <Field label="Phone" value={data.phone as string} />
                                    <Field label="Status" value={data.status as string} />
                                </>
                            )}
                            <DrawerLinkWithName label="Customer" id={(data.customer_id as string) ?? null} type="customers" displayName={data._customer_name as string} />
                            <Field label="External ID" value={data.external_id as string} />
                            <div className="pt-2 border-t border-alloy-stone/20">
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
                        </>
                    )}
                    {drawer.type === "customers" && (
                        <>
                            <Field label="ID" value={data.id as string} />
                            <Field label="Created" value={formatDateTime(data.created_at as string)} />
                            {isEditing ? (
                                <>
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Name</label><input value={String(formData.name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Status</label><input value={String(formData.status ?? "")} onChange={(e) => setFormData((f) => ({ ...f, status: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                </>
                            ) : (
                                <>
                                    <Field label="Name" value={data.name as string} />
                                    <Field label="Status" value={data.status as string} />
                                </>
                            )}
                            <Field label="Stripe Customer ID" value={data.stripe_customer_id as string} />
                            <Field label="Payment Method ID" value={data.default_payment_method_id as string} />
                            <Field label="Vertical ID" value={data.vertical_id as string} />
                            <Field label="External ID" value={data.external_id as string} />
                        </>
                    )}
                    {drawer.type === "vendors" && (
                        <>
                            <div className="space-y-0">
                                <details open className="border-b border-alloy-stone/20 pb-4">
                                    <summary className="text-sm font-semibold text-alloy-midnight/80 cursor-pointer list-none mb-2">Overview</summary>
                                    <div className="space-y-2">
                                        <Field label="ID" value={data.id as string} />
                                        <Field label="Submitted" value={data.submitted_at ? formatDateTime(data.submitted_at as string) : formatDateTime(data.created_at as string)} />
                                        {isEditing ? (
                                            <>
                                                <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Name</label><input value={String(formData.name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                                <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Company name</label><input value={String(formData.company_name ?? "")} onChange={(e) => setFormData((f) => ({ ...f, company_name: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" placeholder="Optional" /></div>
                                                <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Status</label><select value={String(formData.vendor_status_id ?? "")} onChange={(e) => setFormData((f) => ({ ...f, vendor_status_id: e.target.value || null }))} className="w-full px-2 py-1.5 border rounded text-sm"><option value="">— None —</option>{((data._vendor_status_options as { id: string; label: string }[]) ?? []).map((opt) => (<option key={opt.id} value={opt.id}>{opt.label}</option>))}</select></div>
                                                <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Email</label><input type="email" value={String(formData.email ?? "")} onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                                <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Phone</label><input value={String(formData.phone ?? "")} onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                            </>
                                        ) : (
                                            <>
                                                <Field label="Name" value={data.name as string} />
                                                <Field label="Company name" value={(data.company_name as string)?.trim() ? (data.company_name as string) : "—"} />
                                                <Field label="Email" value={data.email as string} />
                                                <Field label="Phone" value={data.phone as string} />
                                                <Field label="Status" value={(data._vendor_status_label as string) ?? "—"} />
                                                <DrawerLinkWithName label="Primary contact" id={(data.primary_contact_id as string) ?? null} type="contacts" displayName={data._primary_contact ? [((data._primary_contact as { first_name?: string }).first_name), ((data._primary_contact as { last_name?: string }).last_name)].filter(Boolean).join(" ") : null} />
                                            </>
                                        )}
                                    </div>
                                </details>
                                <details className="pt-4 border-b border-alloy-stone/20 pb-4">
                                    <summary className="text-sm font-semibold text-alloy-midnight/80 cursor-pointer list-none mb-2">Documents</summary>
                                    <div className="space-y-2">
                                        {(data.insurance_doc_path as string) ? <div><strong className="text-alloy-midnight/70">Insurance:</strong> <span className="text-sm font-mono">{data.insurance_doc_path as string}</span> <span className="text-xs text-alloy-midnight/50">(path; signed URL not implemented)</span></div> : <Field label="Insurance" value="—" />}
                                        {(data.drivers_license_doc_path as string) ? <div><strong className="text-alloy-midnight/70">Drivers license:</strong> <span className="text-sm font-mono">{data.drivers_license_doc_path as string}</span> <span className="text-xs text-alloy-midnight/50">(path; signed URL not implemented)</span></div> : <Field label="Drivers license" value="—" />}
                                    </div>
                                </details>
                                <details className="pt-4 border-b border-alloy-stone/20 pb-4">
                                    <summary className="text-sm font-semibold text-alloy-midnight/80 cursor-pointer list-none mb-2">Jobs & Schedule</summary>
                                    {((data._vendor_jobs as VendorDrawerJob[]) ?? []).length === 0 ? (
                                        <p className="text-sm text-alloy-midnight/60">No jobs assigned yet.</p>
                                    ) : (
                                        <ul className="space-y-2">
                                            {((data._vendor_jobs as VendorDrawerJob[]) ?? []).map((job) => {
                                                const scheds = ((data._vendor_schedules as { job_id: string; start_at: string; end_at: string; timezone: string }[]) ?? []).filter((s) => s.job_id === job.id);
                                                return (
                                                    <li key={job.id} className="border border-alloy-stone/30 rounded p-2 text-sm">
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
                                <details className="pt-4 border-b border-alloy-stone/20 pb-4">
                                    <summary className="text-sm font-semibold text-alloy-midnight/80 cursor-pointer list-none mb-2">
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
                                    <summary className="text-sm font-semibold text-alloy-midnight/80 cursor-pointer list-none mb-2">Operational / Settings</summary>
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
                            <Field label="ID" value={data.id as string} />
                            <Field label="Created" value={formatDateTime(data.created_at as string)} />
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
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Notes</label><textarea value={String(formData.notes ?? "")} onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" rows={2} /></div>
                                </>
                            ) : (
                                <>
                                    <Field label="Stage" value={(data._stage_name as string) ?? (data.status as string) ?? "-"} />
                                    <Field label="Job Date" value={formatDate(data.job_date as string)} />
                                    <Field label="Time Window" value={data.job_time_window as string} />
                                    <Field label="Quote Total" value={formatMoneyFromDollars(data.quote_total as number)} />
                                    <Field label="Notes" value={((data.metadata as Record<string, unknown>)?.notes as string) ?? "-"} />
                                </>
                            )}
                            <DrawerLinkWithName label="Customer" id={(data.customer_id as string) ?? null} type="customers" displayName={data._customer_name as string} />
                            <DrawerLinkWithName label="Primary Contact" id={(data.primary_contact_id as string) ?? null} type="contacts" displayName={data._contact_name as string} />
                            <Field label="External ID" value={data.external_id as string} />
                        </>
                    )}
                    {drawer.type === "jobs" && (
                        <>
                            <Field label="ID" value={data.id as string} />
                            <Field label="Created" value={formatDateTime(data.created_at as string)} />
                            <Field label="Title" value={data.title as string} />
                            {isEditing ? (
                                <>
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Scheduled (local)</label><input type="datetime-local" value={String(formData.scheduled_at ?? "")} onChange={(e) => setFormData((f) => ({ ...f, scheduled_at: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Service frequency key</label><input value={String(formData.service_frequency_key ?? "")} onChange={(e) => setFormData((f) => ({ ...f, service_frequency_key: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                    <div><label className="flex items-center gap-2"><input type="checkbox" checked={!!formData.is_recurring} onChange={(e) => setFormData((f) => ({ ...f, is_recurring: e.target.checked }))} /> Recurring</label></div>
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Job status ID</label><input value={String(formData.job_status_id ?? "")} onChange={(e) => setFormData((f) => ({ ...f, job_status_id: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Internal notes</label><textarea value={String(formData.internal_notes ?? "")} onChange={(e) => setFormData((f) => ({ ...f, internal_notes: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" rows={2} /></div>
                                </>
                            ) : (
                                <>
                                    <Field label="Recurring" value={data.is_recurring ? "Yes" : "No"} />
                                    <Field label="Scheduled" value={formatDateTime(data.scheduled_at as string)} />
                                    <Field label="Status ID" value={data.job_status_id as string} />
                                    <Field label="Internal notes" value={((data.metadata as Record<string, unknown>)?.internal_notes as string) ?? "-"} />
                                </>
                            )}
                            <Field label="Gross Price" value={formatMoneyFromCents(data.gross_price_cents as number)} />
                            <Field label="Payout" value={formatMoneyFromCents(data.contractor_payout_cents as number)} />
                            <DrawerLinkWithName label="Opportunity" id={(data.opportunity_id as string) ?? null} type="opportunities" displayName={data._opportunity_name as string} />
                            <DrawerLinkWithName label="Primary Contact" id={(data.primary_contact_id as string) ?? null} type="contacts" displayName={data._contact_name as string} />
                            <DrawerLinkWithName label="Customer" id={(data.customer_id as string) ?? null} type="customers" displayName={data._customer_name as string} />
                            <Field label="Offer Code" value={data.offer_code as string} />
                            <Field label="External ID" value={data.external_id as string} />
                            {jobSchedules.length > 0 && (
                                <div className="pt-4 border-t border-alloy-stone/20">
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
                            <div className="pt-4 border-t border-alloy-stone/20">
                                <strong className="text-alloy-midnight/70 block mb-2">Status actions</strong>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        disabled={!!jobActionLoading}
                                        onClick={async () => {
                                            if (!drawer.id) return;
                                            setJobActionLoading("assign_vendor");
                                            try {
                                                const res = await fetch(`/api/admin/jobs/${drawer.id}`, {
                                                    method: "PATCH",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify({ action: "assign_vendor" }),
                                                });
                                                const json = await res.json().catch(() => ({}));
                                                if (!res.ok) throw new Error((json.error as string) || "Failed");
                                                setData((prev) => (prev ? { ...prev, ...json } : prev));
                                                refetch();
                                                router.refresh();
                                            } catch (e) {
                                                console.error("Assign vendor failed", e);
                                            } finally {
                                                setJobActionLoading(null);
                                            }
                                        }}
                                        className="px-3 py-1.5 text-sm bg-alloy-stone/80 text-alloy-midnight rounded-md hover:bg-alloy-stone disabled:opacity-50"
                                    >
                                        {jobActionLoading === "assign_vendor" ? "…" : "Assign vendor"}
                                    </button>
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
                                </div>
                            </div>
                        </>
                    )}
                    {drawer.type === "schedules" && (
                        <>
                            <Field label="ID" value={data.id as string} />
                            <Field label="Job ID" value={data.job_id as string} />
                            {isEditing ? (
                                <>
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Start</label><input type="datetime-local" value={String(formData.start_at ?? "")} onChange={(e) => setFormData((f) => ({ ...f, start_at: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">End</label><input type="datetime-local" value={String(formData.end_at ?? "")} onChange={(e) => setFormData((f) => ({ ...f, end_at: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                    <div><label className="block text-sm text-alloy-midnight/70 mb-0.5">Timezone</label><input value={String(formData.timezone ?? "")} onChange={(e) => setFormData((f) => ({ ...f, timezone: e.target.value }))} className="w-full px-2 py-1.5 border rounded text-sm" /></div>
                                </>
                            ) : (
                                <>
                                    <Field label="Start" value={formatDateTime(data.start_at as string)} />
                                    <Field label="End" value={formatDateTime(data.end_at as string)} />
                                    <Field label="Timezone" value={data.timezone as string} />
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
                                            <div className="pt-2 border-t border-alloy-stone/20">
                                                <strong className="text-alloy-midnight/70 block mb-2">Conditions</strong>
                                                {workflowConditions.map((c, i) => {
                                                    const entityType = c.target_entity || (formData.entity_type as string) || "job";
                                                    const fieldOptions = WORKFLOW_FIELD_PATHS_BY_ENTITY_TYPE[entityType] ?? WORKFLOW_FIELD_PATHS_BY_ENTITY_TYPE.job ?? [];
                                                    return (
                                                        <div key={i} className="flex gap-2 items-center mb-2 flex-wrap">
                                                            <select value={c.target_entity ?? ""} onChange={(e) => setWorkflowConditions((prev) => prev.map((p, j) => j === i ? { ...p, target_entity: e.target.value || undefined } : p))} className="w-28 px-2 py-1.5 border rounded text-sm" title="Target entity">
                                                                <option value="">Entity…</option>
                                                                {WORKFLOW_ENTITY_TYPES.map((ent) => <option key={ent} value={ent}>{ent}</option>)}
                                                            </select>
                                                            <input list={`cond-field-${i}`} placeholder="field path (e.g. job.service_frequency_key)" value={c.field_path} onChange={(e) => setWorkflowConditions((prev) => prev.map((p, j) => j === i ? { ...p, field_path: e.target.value } : p))} className="flex-1 min-w-0 px-2 py-1.5 border rounded text-sm" title="Dot path into target entity" />
                                                            <datalist id={`cond-field-${i}`}>
                                                                {fieldOptions.map((opt) => <option key={opt.value} value={opt.value} />)}
                                                            </datalist>
                                                            <select value={c.operator} onChange={(e) => setWorkflowConditions((prev) => prev.map((p, j) => j === i ? { ...p, operator: e.target.value } : p))} className="w-24 px-2 py-1.5 border rounded text-sm">
                                                                {WORKFLOW_CONDITION_OPERATORS.map((op) => <option key={op} value={op}>{op}</option>)}
                                                            </select>
                                                            <input placeholder="value" value={c.value} onChange={(e) => setWorkflowConditions((prev) => prev.map((p, j) => j === i ? { ...p, value: e.target.value } : p))} className="flex-1 min-w-0 px-2 py-1.5 border rounded text-sm max-w-[120px]" />
                                                            <button type="button" onClick={() => setWorkflowConditions((prev) => prev.filter((_, j) => j !== i))} className="text-red-600 text-sm">Remove</button>
                                                        </div>
                                                    );
                                                })}
                                                <button type="button" onClick={() => setWorkflowConditions((prev) => [...prev, { target_entity: (formData.entity_type as string) || undefined, field_path: "", operator: "eq", value: "" }])} className="text-sm text-alloy-blue hover:underline">Add condition</button>
                                            </div>
                                            <div className="pt-2 border-t border-alloy-stone/20">
                                                <strong className="text-alloy-midnight/70 block mb-2">Actions</strong>
                                                {workflowActions.map((a, i) => (
                                                    <div key={i} className="border border-alloy-stone/30 rounded p-2 mb-2">
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
                                                                const recipients = (Array.isArray(pl.recipients) ? pl.recipients : []) as { type?: string; source?: string; path?: string; vendor_id_path?: string; role_in?: string[]; max?: number }[];
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
                                                                            <label className="block text-xs text-alloy-midnight/60 mb-0.5">Template (e.g. New job: {`{{job.title}}`} at {`{{schedule.start_at}}`})</label>
                                                                            <textarea value={String(pl.template ?? "")} onChange={(e) => setWorkflowActions((prev) => prev.map((p, j) => j === i ? { ...p, payload: { ...(typeof p.payload === "object" && p.payload ? p.payload : {}), template: e.target.value } } : p))} className="w-full px-2 py-1.5 border rounded text-sm" rows={3} placeholder="Supports {{job.title}}, {{contact.phone}}, etc." />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-xs text-alloy-midnight/60 mb-0.5">Recipients</label>
                                                                            {recipients.map((rec, ri) => {
                                                                                const recTypeKey = rec.source === "payload" && rec.path === "contact.id" ? "payload_contact" : rec.source === "payload" && rec.path === "customer.primary_contact_id" ? "customer_primary" : rec.source === "payload" && rec.path === "vendor.primary_contact_id" ? "vendor_primary" : rec.type === "contacts_by_vendor" ? "contacts_by_vendor" : rec.type === "job_qualified_vendors" ? "job_qualified_vendors" : "";
                                                                                return (
                                                                                    <div key={ri} className="flex gap-2 items-center mb-1">
                                                                                        <select value={recTypeKey} onChange={(e) => {
                                                                                            const t = e.target.value;
                                                                                            const next = [...recipients];
                                                                                            if (t === "payload_contact") next[ri] = { type: "contact", source: "payload", path: "contact.id" };
                                                                                            else if (t === "customer_primary") next[ri] = { type: "customer", source: "payload", path: "customer.primary_contact_id" };
                                                                                            else if (t === "vendor_primary") next[ri] = { type: "vendor", source: "payload", path: "vendor.primary_contact_id" };
                                                                                            else if (t === "contacts_by_vendor") next[ri] = { type: "contacts_by_vendor", source: "query", vendor_id_path: "vendor.id", role_in: ["primary", "billing"] };
                                                                                            else if (t === "job_qualified_vendors") next[ri] = { type: "job_qualified_vendors", source: "resolver", max: 25 };
                                                                                            else next[ri] = { type: "contact", source: "payload", path: "contact.id" };
                                                                                            setWorkflowActions((prev) => prev.map((p, j) => j === i ? { ...p, payload: { ...(typeof p.payload === "object" && p.payload ? p.payload : {}), recipients: next } } : p));
                                                                                        }} className="flex-1 min-w-0 px-2 py-1.5 border rounded text-sm">
                                                                                            <option value="">— Type —</option>
                                                                                            <option value="payload_contact">Payload contact</option>
                                                                                            <option value="customer_primary">Customer primary contact</option>
                                                                                            <option value="vendor_primary">Vendor primary contact</option>
                                                                                            <option value="contacts_by_vendor">All contacts for vendor (by role)</option>
                                                                                            <option value="job_qualified_vendors">Qualified vendors for job (resolver)</option>
                                                                                        </select>
                                                                                        <span className="text-xs text-alloy-midnight/50 shrink-0">{rec.type === "contacts_by_vendor" ? `vendor: ${rec.vendor_id_path ?? ""}` : rec.type === "job_qualified_vendors" ? `max ${rec.max ?? 25}` : rec.path ?? ""}</span>
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
                                            <div className="pt-2 border-t border-alloy-stone/20">
                                                <strong className="text-alloy-midnight/70 block mb-1">Conditions</strong>
                                                {(data._conditions as { target_entity?: string; field_path?: string; field?: string; operator: string; value?: string }[] | undefined)?.length ? (data._conditions as { target_entity?: string; field_path?: string; field?: string; operator: string; value?: string }[]).map((c, i) => <div key={i} className="text-sm">{(c.target_entity ?? "") && `${c.target_entity}.`}{c.field_path ?? c.field ?? ""} {c.operator} {c.value ?? ""}</div>) : <div className="text-sm text-alloy-midnight/60">None</div>}
                                            </div>
                                            <div className="pt-2 border-t border-alloy-stone/20">
                                                <strong className="text-alloy-midnight/70 block mb-1">Actions</strong>
                                                {(data._actions as { action_order: number; action_type: string; payload?: unknown }[] | undefined)?.length ? (data._actions as { action_order: number; action_type: string; payload?: unknown }[]).map((a, i) => <div key={i} className="text-sm">{(a.action_order ?? i + 1)}. {a.action_type} {a.payload && typeof a.payload === "object" ? JSON.stringify(a.payload) : ""}</div>) : <div className="text-sm text-alloy-midnight/60">None</div>}
                                            </div>
                                        </>
                                    )}
                                    {saveError && <p className="text-red-600 text-sm">{saveError}</p>}
                                    {runModalOpen && drawer.id && drawer.id !== "new" && (
                                        <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4" onClick={() => setRunModalOpen(false)}>
                                            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-auto p-4 border border-[#59678b]/40" onClick={(e) => e.stopPropagation()}>
                                                <h3 className="font-semibold text-alloy-midnight mb-2">Run workflow</h3>
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
                    {drawer.type === "contacts" && drawer.id && <div className="pt-4 border-t border-alloy-stone/20"><RelatedRecordsTabs entityType="contact" entityId={drawer.id} /></div>}
                    {drawer.type === "customers" && drawer.id && <div className="pt-4 border-t border-alloy-stone/20"><RelatedRecordsTabs entityType="customer" entityId={drawer.id} /></div>}
                    {drawer.type === "opportunities" && drawer.id && <div className="pt-4 border-t border-alloy-stone/20"><RelatedRecordsTabs entityType="opportunity" entityId={drawer.id} /></div>}
                    {drawer.type === "jobs" && drawer.id && <div className="pt-4 border-t border-alloy-stone/20"><RelatedRecordsTabs entityType="job" entityId={drawer.id} /></div>}
                </div>
            )}
        </Drawer>
    );
}
