"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Drawer from "@/components/admin/Drawer";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import RelatedRecordsTabs from "@/components/admin/RelatedRecordsTabs";
import { formatMoneyFromCents, formatMoneyFromDollars, formatDate, formatDateTime } from "@/lib/adminFormatters";

const EDITABLE_TYPES = ["opportunities", "jobs", "contacts", "customers", "schedules"] as const;
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
    type: "contacts" | "customers" | "opportunities" | "jobs";
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
    const { drawer, closeDrawer } = useAdminDrawer();
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
        } else if (drawer.type === "schedules") {
            setFormData({
                start_at: data.start_at ? new Date(data.start_at as string).toISOString().slice(0, 16) : "",
                end_at: data.end_at ? new Date(data.end_at as string).toISOString().slice(0, 16) : "",
                timezone: data.timezone ?? "",
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
    }, [drawer.type, drawer.id, formData, refetch, router]);

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
                                <button type="button" onClick={startEdit} className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90">Edit</button>
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
