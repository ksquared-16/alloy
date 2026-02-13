import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";

const LIMIT = 25;

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ entity: string; id: string }> }
) {
    const { entity, id } = await params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    try {
        const supabase = createAdminClient();

        if (entity === "contact") {
            const [oppRes, jobsRes] = await Promise.all([
                supabase.from("opportunities").select("id, created_at, name, status, job_date, quote_total").eq("primary_contact_id", id).order("created_at", { ascending: false }).limit(LIMIT),
                supabase.from("jobs").select("id, created_at, title, scheduled_at, opportunity_id").eq("primary_contact_id", id).order("created_at", { ascending: false }).limit(LIMIT),
            ]);
            const jobIds = (jobsRes.data ?? []).map((j) => j.id);
            const schedulesRes = jobIds.length > 0
                ? await supabase.from("schedules").select("id, job_id, start_at, end_at, timezone").in("job_id", jobIds).order("start_at", { ascending: false }).limit(LIMIT)
                : { data: [] as any[] };
            return NextResponse.json({
                opportunities: oppRes.data ?? [],
                jobs: jobsRes.data ?? [],
                schedules: schedulesRes.data ?? [],
            });
        }

        if (entity === "customer") {
            const [contactsRes, oppRes, jobsRes] = await Promise.all([
                supabase.from("contacts").select("id, created_at, first_name, last_name, email, phone").eq("customer_id", id).order("created_at", { ascending: false }).limit(LIMIT),
                supabase.from("opportunities").select("id, created_at, name, status, job_date, quote_total").eq("customer_id", id).order("created_at", { ascending: false }).limit(LIMIT),
                supabase.from("jobs").select("id, created_at, title, scheduled_at, opportunity_id").eq("customer_id", id).order("created_at", { ascending: false }).limit(LIMIT),
            ]);
            const jobIds = (jobsRes.data ?? []).map((j) => j.id);
            const schedulesRes = jobIds.length > 0
                ? await supabase.from("schedules").select("id, job_id, start_at, end_at, timezone").in("job_id", jobIds).order("start_at", { ascending: false }).limit(LIMIT)
                : { data: [] as any[] };
            return NextResponse.json({
                contacts: contactsRes.data ?? [],
                opportunities: oppRes.data ?? [],
                jobs: jobsRes.data ?? [],
                schedules: schedulesRes.data ?? [],
            });
        }

        if (entity === "opportunity") {
            const jobsRes = await supabase.from("jobs").select("id, created_at, title, scheduled_at").eq("opportunity_id", id).order("created_at", { ascending: false }).limit(LIMIT);
            return NextResponse.json({
                jobs: jobsRes.data ?? [],
            });
        }

        if (entity === "job") {
            const schedulesRes = await supabase.from("schedules").select("id, job_id, start_at, end_at, timezone").eq("job_id", id).order("start_at", { ascending: false }).limit(LIMIT);
            return NextResponse.json({
                schedules: schedulesRes.data ?? [],
            });
        }

        if (entity === "vendor") {
            const [jobsRes, vcRes] = await Promise.all([
                supabase.from("jobs").select("id, created_at, title, scheduled_at, job_status_id, gross_price_cents, recurring_total_cents, opportunity_id").eq("vendor_id", id).order("created_at", { ascending: false }).limit(LIMIT),
                supabase.from("vendor_contacts").select("id, contact_id, role").eq("vendor_id", id),
            ]);
            const jobIds = (jobsRes.data ?? []).map((j: { id: string }) => j.id);
            const schedulesRes = jobIds.length > 0
                ? await supabase.from("schedules").select("id, job_id, start_at, end_at, timezone").in("job_id", jobIds).order("start_at", { ascending: false })
                : { data: [] as { id: string; job_id: string; start_at: string; end_at: string; timezone: string }[] };
            const contactIds = (vcRes.data ?? []).map((r: { contact_id: string }) => r.contact_id);
            const contactsRes = contactIds.length > 0
                ? await supabase.from("contacts").select("id, first_name, last_name, email, phone").in("id", contactIds)
                : { data: [] as { id: string; first_name: string; last_name: string; email: string; phone: string }[] };
            const contactsWithRole = (contactsRes.data ?? []).map((c) => {
                const link = (vcRes.data ?? []).find((r: { contact_id: string }) => r.contact_id === c.id) as { role?: string } | undefined;
                return { ...c, _role: link?.role ?? null };
            });
            return NextResponse.json({
                jobs: jobsRes.data ?? [],
                schedules: schedulesRes.data ?? [],
                contacts: contactsWithRole,
            });
        }

        return NextResponse.json({ error: "Invalid entity" }, { status: 400 });
    } catch (e: unknown) {
        console.error("[ADMIN_RELATED]", e);
        return NextResponse.json({ error: "Failed to fetch related" }, { status: 500 });
    }
}
