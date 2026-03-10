import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

const ENTITY_TYPES = ["jobs", "opportunities", "contacts", "customers", "customer_members", "schedules", "discount_redemptions", "workflows", "vendors", "subscriptions", "locations"] as const;

type ContactRow = { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null };

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ type: string; id: string }> }
) {
    const { type, id } = await params;
    if (!id || !ENTITY_TYPES.includes(type as (typeof ENTITY_TYPES)[number])) {
        return NextResponse.json({ error: "Invalid type or id" }, { status: 400 });
    }

    try {
        const supabase = createAdminClient();

        if (type === "jobs") {
            if (id === "new") {
                return NextResponse.json({ _create: true });
            }
            const { data, error } = await supabase.from("jobs").select("*").eq("id", id).single();
            if (error || !data) return NextResponse.json(error?.message || "Not found", { status: error?.code === "PGRST116" ? 404 : 500 });
            const out: Record<string, unknown> = { ...data };
            if (data.opportunity_id) {
                const opp = await supabase.from("opportunities").select("name").eq("id", data.opportunity_id).single();
                out._opportunity_name = opp.data?.name ?? null;
            }
            if (data.primary_contact_id) {
                const contact = await supabase.from("contacts").select("first_name, last_name").eq("id", data.primary_contact_id).single();
                const c = contact.data;
                out._contact_name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || null : null;
            }
            if (data.customer_id) {
                const customer = await supabase.from("customers").select("name").eq("id", data.customer_id).single();
                out._customer_name = customer.data?.name ?? null;
            }
            const assignedVendorId = (data as { assigned_vendor_id?: string | null }).assigned_vendor_id;
            if (assignedVendorId) {
                const { data: vendor } = await supabase.from("vendors").select("id, name").eq("id", assignedVendorId).single();
                out._assigned_vendor = vendor ?? null;
            } else {
                out._assigned_vendor = null;
            }
            const jobLocationId = (data as { location_id?: string | null }).location_id;
            if (jobLocationId) {
                const { data: loc } = await supabase.from("locations").select("id, label, address1, city, state, postal_code").eq("id", jobLocationId).maybeSingle();
                if (loc) {
                    const l = loc as { label?: string | null; address1?: string | null; city?: string | null; postal_code?: string | null };
                    out._location_label = l.label ?? ([l.address1, l.city, l.postal_code].filter(Boolean).join(", ") || null);
                    out._location = loc;
                } else {
                    out._location_label = null;
                    out._location = null;
                }
            } else {
                out._location_label = null;
                out._location = null;
            }
            const verticalId = (data as { vertical_id?: string | null }).vertical_id;
            if (verticalId) {
                const { data: vert } = await supabase.from("verticals").select("slug").eq("id", verticalId).maybeSingle();
                out._vertical_slug = (vert as { slug?: string | null } | null)?.slug ?? null;
            } else {
                out._vertical_slug = null;
            }
            return NextResponse.json(out);
        }
        if (type === "opportunities") {
            const { data, error } = await supabase.from("opportunities").select("*").eq("id", id).single();
            if (error || !data) return NextResponse.json(error?.message || "Not found", { status: error?.code === "PGRST116" ? 404 : 500 });
            const out: Record<string, unknown> = { ...data };
            if (data.customer_id) {
                const customer = await supabase.from("customers").select("name").eq("id", data.customer_id).single();
                out._customer_name = customer.data?.name ?? null;
            }
            if (data.primary_contact_id) {
                const contact = await supabase.from("contacts").select("first_name, last_name").eq("id", data.primary_contact_id).single();
                const c = contact.data;
                out._contact_name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || null : null;
            }
            if ((data as { pipeline_stage_id?: string }).pipeline_stage_id) {
                const stage = await supabase.from("pipeline_stages").select("name").eq("id", (data as { pipeline_stage_id: string }).pipeline_stage_id).single();
                out._stage_name = stage.data?.name ?? null;
            } else {
                out._stage_name = null;
            }
            return NextResponse.json(out);
        }
        if (type === "contacts") {
            if (id === "new") {
                return NextResponse.json({ _create: true });
            }
            const { data, error } = await supabase.from("contacts").select("*").eq("id", id).single();
            if (error || !data) return NextResponse.json(error?.message || "Not found", { status: error?.code === "PGRST116" ? 404 : 500 });
            const contact = data as { customer_id?: string | null; vendor_id?: string | null };
            let _linked_customer_name: string | null = null;
            let _linked_vendor_name: string | null = null;
            if (contact.customer_id) {
                const { data: cust } = await supabase.from("customers").select("name").eq("id", contact.customer_id).maybeSingle();
                _linked_customer_name = (cust as { name?: string | null } | null)?.name ?? null;
            }
            if (contact.vendor_id) {
                const { data: vend } = await supabase.from("vendors").select("name").eq("id", contact.vendor_id).maybeSingle();
                _linked_vendor_name = (vend as { name?: string | null } | null)?.name ?? null;
            }
            const [custPrimary, vendPrimary] = await Promise.all([
                supabase.from("customers").select("id").eq("primary_contact_id", id).limit(1).maybeSingle(),
                supabase.from("vendors").select("id").eq("primary_contact_id", id).limit(1).maybeSingle(),
            ]);
            const pc: string[] = [];
            if (custPrimary.data) pc.push("Customer");
            if (vendPrimary.data) pc.push("Vendor");
            const _primary_contact_for = pc.length > 0 ? pc.join(", ") : "—";
            let _contact_vendor: { id: string; name: string | null; vendor_status_id: string | null; created_at: string } | null = null;
            if (contact.vendor_id) {
                const { data: vendor } = await supabase
                    .from("vendors")
                    .select("id, name, vendor_status_id, created_at")
                    .eq("id", contact.vendor_id)
                    .single();
                if (vendor) _contact_vendor = { id: vendor.id, name: vendor.name ?? null, vendor_status_id: vendor.vendor_status_id ?? null, created_at: vendor.created_at };
            }
            return NextResponse.json({
                ...data,
                _contact_vendor,
                _linked_customer_name,
                _linked_vendor_name,
                _primary_contact_for,
            });
        }
        if (type === "customers") {
            const { data, error } = await supabase.from("customers").select("*").eq("id", id).single();
            if (error || !data) return NextResponse.json(error?.message || "Not found", { status: error?.code === "PGRST116" ? 404 : 500 });
            const out: Record<string, unknown> = { ...data };
            const orgId = (data as { org_id?: string }).org_id;
            const primaryContactId = (data as { primary_contact_id?: string | null }).primary_contact_id;
            const verticalId = (data as { vertical_id?: string | null }).vertical_id;
            const metadata = (data as { metadata?: Record<string, unknown> | null }).metadata;
            if (primaryContactId) {
                const { data: contact } = await supabase.from("contacts").select("id, first_name, last_name, email, phone").eq("id", primaryContactId).maybeSingle();
                out._primary_contact = contact ?? null;
                const c = contact as ContactRow | null;
                out._primary_contact_name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || null : null;
                out._primary_contact_email = c?.email ?? null;
                out._primary_contact_phone = c?.phone ?? null;
            } else {
                out._primary_contact = null;
                out._primary_contact_name = null;
                out._primary_contact_email = null;
                out._primary_contact_phone = null;
            }
            const meta = metadata && typeof metadata === "object" ? metadata : {};
            out._metadata_email = (meta.email as string) ?? null;
            out._metadata_phone = (meta.phone as string) ?? null;
            out._metadata_source = (meta.source as string) ?? null;
            if (verticalId) {
                const { data: vert } = await supabase.from("verticals").select("id, name, slug").eq("id", verticalId).maybeSingle();
                const v = vert as { name?: string | null; slug?: string | null } | null;
                out._vertical_name = v ? (v.name ?? v.slug ?? null) : null;
            } else {
                out._vertical_name = null;
            }
            const { data: primaryLoc } = await supabase
                .from("locations")
                .select("id, label, address1, city, postal_code")
                .eq("customer_id", id)
                .eq("org_id", orgId)
                .eq("is_primary", true)
                .limit(1)
                .maybeSingle();
            out._primary_location = primaryLoc ?? null;
            if (orgId) {
                const [
                    { count: contactsCount },
                    { count: oppCount },
                    { count: jobsCount },
                    { count: locsCount },
                ] = await Promise.all([
                    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("customer_id", id),
                    supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("customer_id", id),
                    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("customer_id", id),
                    supabase.from("locations").select("id", { count: "exact", head: true }).eq("customer_id", id).eq("org_id", orgId),
                ]);
                const { data: jobRows } = await supabase.from("jobs").select("id").eq("customer_id", id);
                const jobIds = (jobRows ?? []).map((j: { id: string }) => j.id);
                let schedulesCount = 0;
                if (jobIds.length > 0) {
                    const { count } = await supabase.from("schedules").select("id", { count: "exact", head: true }).in("job_id", jobIds);
                    schedulesCount = count ?? 0;
                }
                out._counts = {
                    contacts: contactsCount ?? 0,
                    opportunities: oppCount ?? 0,
                    jobs: jobsCount ?? 0,
                    schedules: schedulesCount,
                    locations: locsCount ?? 0,
                };
            } else {
                out._counts = { contacts: 0, opportunities: 0, jobs: 0, schedules: 0, locations: 0 };
            }
            return NextResponse.json(out);
        }
        if (type === "schedules") {
            if (id === "new") {
                return NextResponse.json({ _create: true });
            }
            const { data: schedule, error } = await supabase.from("schedules").select("*").eq("id", id).single();
            if (error || !schedule) return NextResponse.json(error?.message || "Not found", { status: error?.code === "PGRST116" ? 404 : 500 });
            const out: Record<string, unknown> = { ...schedule };
            const scheduleLocationId = (schedule as { location_id?: string | null }).location_id;
            const jobId = (schedule as { job_id?: string }).job_id;
            if (jobId) {
                const { data: job } = await supabase.from("jobs").select("id, title, customer_id, primary_contact_id, opportunity_id, vertical_id, job_status_id, assigned_vendor_id, location_id").eq("id", jobId).single();
                out._job = job ?? null;
                if (job) {
                    if ((job as { customer_id?: string }).customer_id) {
                        const { data: cust } = await supabase.from("customers").select("id, name").eq("id", (job as { customer_id: string }).customer_id).single();
                        out._customer = cust ?? null;
                    } else out._customer = null;
                    if ((job as { primary_contact_id?: string }).primary_contact_id) {
                        const { data: contact } = await supabase.from("contacts").select("id, first_name, last_name, email, phone").eq("id", (job as { primary_contact_id: string }).primary_contact_id).single();
                        out._contact = contact ?? null;
                    } else out._contact = null;
                    if ((job as { opportunity_id?: string }).opportunity_id) {
                        const { data: opp } = await supabase.from("opportunities").select("id, name").eq("id", (job as { opportunity_id: string }).opportunity_id).single();
                        out._opportunity = opp ?? null;
                    } else out._opportunity = null;
                    if ((job as { vertical_id?: string }).vertical_id) {
                        const { data: vert } = await supabase.from("verticals").select("id, name, slug").eq("id", (job as { vertical_id: string }).vertical_id).single();
                        out._vertical = vert ?? null;
                    } else out._vertical = null;
                }
            } else {
                out._job = null; out._customer = null; out._contact = null; out._opportunity = null; out._vertical = null;
            }
            const { data: assignment } = await supabase.from("assignments").select("id, schedule_id, job_id, vendor_id, assignment_status_id, created_at").eq("schedule_id", id).maybeSingle();
            out._assignment = assignment ?? null;
            if (assignment) {
                const { data: vendor } = await supabase.from("vendors").select("id, name").eq("id", (assignment as { vendor_id: string }).vendor_id).single();
                out._vendor = vendor ?? null;
                const statusId = (assignment as { assignment_status_id?: string }).assignment_status_id;
                if (statusId) {
                    const { data: st } = await supabase.from("assignment_statuses").select("id, key, label").eq("id", statusId).single();
                    out._assignment_status = st ?? null;
                } else out._assignment_status = null;
            } else {
                out._vendor = null; out._assignment_status = null;
            }
            if (!out._assignment && jobId) {
                const job = out._job as { assigned_vendor_id?: string | null } | null;
                const jobVendorId = job?.assigned_vendor_id ?? null;
                if (jobVendorId) {
                    const { data: jobVendor } = await supabase.from("vendors").select("id, name").eq("id", jobVendorId).single();
                    out._job_assigned_vendor = jobVendor ?? null;
                } else {
                    out._job_assigned_vendor = null;
                }
            } else {
                out._job_assigned_vendor = null;
            }
            const effectiveLocationId = scheduleLocationId ?? (out._job as { location_id?: string | null } | null)?.location_id ?? null;
            out._location_id = effectiveLocationId ?? null;
            if (effectiveLocationId) {
                const { data: loc } = await supabase.from("locations").select("id, label, address1, city, state, postal_code").eq("id", effectiveLocationId).maybeSingle();
                if (loc) {
                    const l = loc as { label?: string | null; address1?: string | null; city?: string | null; postal_code?: string | null };
                    out._location_label = l.label ?? ([l.address1, l.city, l.postal_code].filter(Boolean).join(", ") || null);
                    out._location = loc;
                } else {
                    out._location_label = null;
                    out._location = null;
                }
            } else {
                out._location_label = null;
                out._location = null;
            }
            return NextResponse.json(out);
        }
        if (type === "locations") {
            const ctx = await getAdminContext();
            if (!ctx.ok) {
                return NextResponse.json(ctx.status === 401 ? "Unauthorized" : "Forbidden", { status: ctx.status });
            }
            const { data: location, error } = await supabase
                .from("locations")
                .select("*")
                .eq("id", id)
                .eq("org_id", ctx.orgId)
                .single();
            if (error || !location) {
                return NextResponse.json(error?.code === "PGRST116" ? "Not found" : error?.message ?? "Not found", { status: 404 });
            }
            const out: Record<string, unknown> = { ...location };
            const locationTypeId = (location as { location_type_id?: string | null }).location_type_id;
            if (locationTypeId) {
                const { data: typeRow } = await supabase.from("location_types").select("label").eq("id", locationTypeId).maybeSingle();
                out._location_type_label = (typeRow as { label?: string } | null)?.label ?? null;
            } else {
                out._location_type_label = null;
            }
            const customerId = (location as { customer_id: string }).customer_id;
            if (customerId) {
                const { data: cust } = await supabase.from("customers").select("id, name").eq("id", customerId).maybeSingle();
                out._customer = cust ?? null;
                out._customer_name = (cust as { name?: string | null } | null)?.name ?? null;
            } else {
                out._customer = null;
                out._customer_name = null;
            }
            return NextResponse.json(out);
        }
        if (type === "discount_redemptions") {
            const { data, error } = await supabase.from("discount_redemptions").select("*").eq("id", id).single();
            if (error || !data) return NextResponse.json(error?.message || "Not found", { status: error?.code === "PGRST116" ? 404 : 500 });
            return NextResponse.json(data);
        }
        if (type === "workflows") {
            if (id === "new") {
                return NextResponse.json({ _create: true });
            }
            const { data: wf, error: wErr } = await supabase.from("workflows").select("*").eq("id", id).single();
            if (wErr || !wf) return NextResponse.json(wErr?.message || "Not found", { status: wErr?.code === "PGRST116" ? 404 : 500 });
            const { data: cond } = await supabase.from("workflow_conditions").select("*").eq("workflow_id", id);
            const { data: acts } = await supabase.from("workflow_actions").select("*").eq("workflow_id", id).order("action_order", { ascending: true });
            return NextResponse.json({
                ...wf,
                _conditions: cond ?? [],
                _actions: acts ?? [],
            });
        }
        if (type === "vendors") {
            const { data: vendor, error: vErr } = await supabase.from("vendors").select("*").eq("id", id).single();
            if (vErr || !vendor) return NextResponse.json(vErr?.message || "Not found", { status: vErr?.code === "PGRST116" ? 404 : 500 });
            const out: Record<string, unknown> = { ...vendor };
            const statusId = (vendor as { vendor_status_id?: string }).vendor_status_id;
            if (statusId) {
                const { data: statusRow } = await supabase.from("vendor_statuses").select("key, label").eq("id", statusId).single();
                out._vendor_status_label = statusRow?.label ?? null;
            } else {
                out._vendor_status_label = null;
            }
            const { data: statusOptions } = await supabase.from("vendor_statuses").select("id, key, label").eq("is_active", true).order("position", { ascending: true });
            out._vendor_status_options = statusOptions ?? [];

            const JOBS_LIMIT = 25;
            const { data: vendorJobs } = await supabase
                .from("jobs")
                .select("id, created_at, title, scheduled_at, job_status_id, gross_price_cents, recurring_total_cents, opportunity_id")
                .eq("vendor_id", id)
                .order("created_at", { ascending: false })
                .limit(JOBS_LIMIT);
            out._vendor_jobs = vendorJobs ?? [];
            const jobIds = (vendorJobs ?? []).map((j: { id: string }) => j.id);
            const { data: vendorSchedules } = jobIds.length > 0
                ? await supabase
                    .from("schedules")
                    .select("id, job_id, start_at, end_at, timezone")
                    .in("job_id", jobIds)
                    .order("start_at", { ascending: false })
                : { data: [] as unknown[] };
            out._vendor_schedules = vendorSchedules ?? [];

            const { data: vendorContactsData } = await supabase
                .from("contacts")
                .select("id, first_name, last_name, email, phone, vendor_contact_role")
                .eq("vendor_id", id);
            out._vendor_contacts = vendorContactsData ?? [];

            if ((vendor as { primary_contact_id?: string }).primary_contact_id) {
                const pc = await supabase
                    .from("contacts")
                    .select("id, first_name, last_name, email, phone")
                    .eq("id", (vendor as { primary_contact_id: string }).primary_contact_id)
                    .single();
                out._primary_contact = pc.data ?? null;
            } else {
                out._primary_contact = null;
            }

            return NextResponse.json(out);
        }
        if (type === "subscriptions") {
            const { data: sub, error: subErr } = await supabase.from("customer_subscriptions").select("*").eq("id", id).single();
            if (subErr || !sub) return NextResponse.json(subErr?.message || "Not found", { status: subErr?.code === "PGRST116" ? 404 : 500 });
            const out: Record<string, unknown> = { ...sub };
            const cadence = (sub as { cadence?: string }).cadence ?? "month";
            const interval = Math.max(1, Number((sub as { interval?: number }).interval) || 1);
            const { formatFrequencyLabel } = await import("@/lib/adminFormatters");
            out._frequency_label = formatFrequencyLabel(cadence, interval);
            out._cadence = cadence;
            out._interval = interval;
            const customerId = (sub as { customer_id?: string }).customer_id;
            if (customerId) {
                const { data: cust } = await supabase.from("customers").select("name").eq("id", customerId).single();
                out._customer_name = cust?.name ?? null;
            }
            const { data: scheds } = await supabase
                .from("schedules")
                .select("id, job_id, start_at, end_at, timezone, subscription_sequence, rescheduled_from_schedule_id, canceled_at, canceled_by, cancel_reason")
                .eq("customer_subscription_id", id)
                .order("subscription_sequence", { ascending: true });
            out._schedules = scheds ?? [];
            return NextResponse.json(out);
        }

        if (type === "customer_members") {
            const ctx = await getAdminContext();
            if (!ctx.ok) {
                return NextResponse.json(ctx.status === 401 ? "Unauthorized" : "Forbidden", { status: ctx.status });
            }
            if (id === "new") {
                return NextResponse.json({ _create: true });
            }
            const { data: row, error: rowErr } = await supabase
                .from("customer_members")
                .select("*")
                .eq("id", id)
                .eq("org_id", ctx.orgId)
                .maybeSingle();
            if (rowErr || !row) {
                return NextResponse.json(rowErr?.code === "PGRST116" ? "Not found" : rowErr?.message ?? "Not found", { status: 404 });
            }
            const out: Record<string, unknown> = { ...row };
            const customerId = (row as { customer_id: string }).customer_id;
            if (customerId) {
                const { data: cust } = await supabase.from("customers").select("name").eq("id", customerId).maybeSingle();
                out._customer_name = (cust as { name?: string | null } | null)?.name ?? null;
            } else {
                out._customer_name = null;
            }
            return NextResponse.json(out);
        }

        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    } catch (e: unknown) {
        console.error("[ADMIN_ENTITY]", e);
        return NextResponse.json({ error: "Failed to fetch entity" }, { status: 500 });
    }
}
