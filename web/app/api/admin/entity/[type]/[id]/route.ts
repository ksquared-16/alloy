import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";

const ENTITY_TYPES = ["jobs", "opportunities", "contacts", "customers", "schedules", "discount_redemptions", "workflows", "vendors"] as const;

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
            const { data, error } = await supabase.from("contacts").select("*").eq("id", id).single();
            if (error || !data) return NextResponse.json(error?.message || "Not found", { status: error?.code === "PGRST116" ? 404 : 500 });
            return NextResponse.json(data);
        }
        if (type === "customers") {
            const { data, error } = await supabase.from("customers").select("*").eq("id", id).single();
            if (error || !data) return NextResponse.json(error?.message || "Not found", { status: error?.code === "PGRST116" ? 404 : 500 });
            return NextResponse.json(data);
        }
        if (type === "schedules") {
            const { data, error } = await supabase.from("schedules").select("*").eq("id", id).single();
            if (error || !data) return NextResponse.json(error?.message || "Not found", { status: error?.code === "PGRST116" ? 404 : 500 });
            return NextResponse.json(data);
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

            const { data: vcRows } = await supabase
                .from("vendor_contacts")
                .select("id, contact_id, role")
                .eq("vendor_id", id);
            const contactIds = (vcRows ?? []).map((r: { contact_id: string }) => r.contact_id);
            const { data: linkedContacts } = contactIds.length > 0
                ? await supabase
                    .from("contacts")
                    .select("id, first_name, last_name, email, phone")
                    .in("id", contactIds)
                : { data: [] as unknown[] };
            const contactsWithRole = (linkedContacts ?? []).map((c: { id: string; first_name?: string; last_name?: string; email?: string; phone?: string }) => {
                const link = (vcRows ?? []).find((r: { contact_id: string }) => r.contact_id === c.id) as { role?: string } | undefined;
                return { ...c, _role: link?.role ?? null };
            });
            out._vendor_contacts = contactsWithRole;

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

        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    } catch (e: unknown) {
        console.error("[ADMIN_ENTITY]", e);
        return NextResponse.json({ error: "Failed to fetch entity" }, { status: 500 });
    }
}
