import { notFound, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import ScheduleDetailClient from "./ScheduleDetailClient";

export default async function AdminScheduleDetailPage({
    params,
}: {
    params: { id: string };
}) {
    const ctx = await getAdminContext();
    if (ctx instanceof NextResponse) {
        if (ctx.status === 401) redirect("/login");
        redirect("/admin");
    }

    const { id } = params;
    if (!id) notFound();

    const supabase = createAdminClient();
    const { data: schedule, error } = await supabase
        .from("schedules")
        .select("*")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .single();

    if (error || !schedule) notFound();

    const s = schedule as Record<string, unknown>;
    const jobId = s.job_id as string | null | undefined;
    let _job_title: string | null = null;
    let _customer_name: string | null = null;
    let _assigned_vendor_name: string | null = null;

    if (jobId) {
        const { data: job } = await supabase.from("jobs").select("id, title, customer_id, assigned_vendor_id").eq("id", jobId).maybeSingle();
        if (job) {
            const j = job as { title?: string | null; customer_id?: string | null; assigned_vendor_id?: string | null };
            _job_title = j.title ?? null;
            const customerId = j.customer_id ?? null;
            if (customerId) {
                const { data: cust } = await supabase.from("customers").select("name").eq("id", customerId).maybeSingle();
                _customer_name = (cust as { name?: string | null } | null)?.name ?? null;
            }
            const jobVendorId = j.assigned_vendor_id ?? null;
            const { data: assign } = await supabase.from("assignments").select("vendor_id").eq("schedule_id", id).maybeSingle();
            const scheduleVendorId = (assign as { vendor_id?: string } | null)?.vendor_id ?? null;
            const vendorId = scheduleVendorId ?? jobVendorId;
            if (vendorId) {
                const { data: vendor } = await supabase.from("vendors").select("name").eq("id", vendorId).maybeSingle();
                _assigned_vendor_name = (vendor as { name?: string | null } | null)?.name ?? null;
            }
        }
    }

    const initialSchedule = { ...s, _job_title, _customer_name, _assigned_vendor_name };

    return (
        <ScheduleDetailClient
            scheduleId={id}
            initialSchedule={initialSchedule}
            role={ctx.role}
        />
    );
}
