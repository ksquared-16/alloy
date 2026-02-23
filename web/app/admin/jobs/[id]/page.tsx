import { notFound, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import JobDetailClient from "./JobDetailClient";

export default async function AdminJobDetailPage({
    params,
}: {
    params: { id: string };
}) {
    const ctx = await getAdminContext();
    if (ctx instanceof NextResponse) {
        const status = ctx.status;
        if (status === 401) redirect("/login");
        redirect("/admin");
    }

    const { id } = params;
    if (!id) notFound();

    const supabase = createAdminClient();
    const { data: job, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .single();

    if (error || !job) notFound();

    const j = job as Record<string, unknown>;
    const customerId = j.customer_id as string | null | undefined;
    const vendorId = j.assigned_vendor_id as string | null | undefined;

    let _customer_name: string | null = null;
    let _assigned_vendor_name: string | null = null;
    if (customerId) {
        const { data: cust } = await supabase.from("customers").select("name").eq("id", customerId).maybeSingle();
        _customer_name = (cust as { name?: string | null } | null)?.name ?? null;
    }
    if (vendorId) {
        const { data: vendor } = await supabase.from("vendors").select("name").eq("id", vendorId).maybeSingle();
        _assigned_vendor_name = (vendor as { name?: string | null } | null)?.name ?? null;
    }

    const initialJob = { ...j, _customer_name, _assigned_vendor_name };

    return (
        <JobDetailClient
            jobId={id}
            initialJob={initialJob}
            role={ctx.role}
        />
    );
}
