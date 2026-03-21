import { notFound, redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolveStatusLabel } from "@/lib/admin/statusDefinitionsResolve";
import JobDetailClient from "./JobDetailClient";

export default async function Page({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        if (ctx.status === 401) redirect("/login");
        redirect("/admin");
    }

    const { id } = await params;
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
    const primaryPersonId = j.primary_person_id as string | null | undefined;
    const primaryContactId = j.primary_contact_id as string | null | undefined;

    let _customer_name: string | null = null;
    let _assigned_vendor_name: string | null = null;
    let _primary_person_name: string | null = null;
    let _primary_contact_name: string | null = null;
    if (customerId) {
        const { data: cust } = await supabase.from("customers").select("name").eq("id", customerId).maybeSingle();
        _customer_name = (cust as { name?: string | null } | null)?.name ?? null;
    }
    if (vendorId) {
        const { data: vendor } = await supabase.from("vendors").select("name").eq("id", vendorId).maybeSingle();
        _assigned_vendor_name = (vendor as { name?: string | null } | null)?.name ?? null;
    }
    if (primaryPersonId) {
        const { data: person } = await supabase.from("persons").select("first_name, last_name").eq("id", primaryPersonId).maybeSingle();
        if (person) {
            const p = person as { first_name?: string | null; last_name?: string | null };
            _primary_person_name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null;
        }
    }
    if (primaryContactId) {
        const { data: contact } = await supabase.from("contacts").select("first_name, last_name").eq("id", primaryContactId).maybeSingle();
        if (contact) {
            const c = contact as { first_name?: string | null; last_name?: string | null };
            _primary_contact_name = [c.first_name, c.last_name].filter(Boolean).join(" ") || null;
        }
    }

    const sk = j.status_key as string | null | undefined;
    const _status_display = sk ? await resolveStatusLabel(supabase, ctx.orgId, "jobs", sk) : null;

    const initialJob = { ...j, _customer_name, _assigned_vendor_name, _primary_person_name, _primary_contact_name, _status_display };

    return (
        <JobDetailClient
            jobId={id}
            initialJob={initialJob}
            role={ctx.role}
        />
    );
}
