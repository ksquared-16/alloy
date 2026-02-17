import { createAdminClient } from "@/lib/supabaseAdmin";
import SchedulesClient from "./SchedulesClient";

export default async function AdminSchedulesPage() {
    const supabase = createAdminClient();
    const { data: schedules, error } = await supabase
        .from("schedules")
        .select("id, job_id, start_at, end_at, timezone, canceled_at, canceled_by, cancel_reason, rescheduled_from_schedule_id, duration_minutes, org_id, customer_subscription_id, subscription_sequence")
        .order("start_at", { ascending: false })
        .limit(500);

    if (error) {
        return (
            <SchedulesClient initialData={[]} error={error.message} />
        );
    }

    const list = schedules ?? [];
    const jobIds = [...new Set(list.map((s) => s.job_id).filter(Boolean))] as string[];
    const scheduleIds = list.map((s) => s.id);

    const { data: jobs } = jobIds.length
        ? await supabase.from("jobs").select("id, title, customer_id, primary_contact_id, opportunity_id, vertical_id").in("id", jobIds)
        : { data: [] };
    const jobMap = new Map((jobs ?? []).map((j) => [j.id, j]));

    const customerIds = [...new Set((jobs ?? []).map((j) => j.customer_id).filter(Boolean))] as string[];
    const contactIds = [...new Set((jobs ?? []).map((j) => j.primary_contact_id).filter(Boolean))] as string[];
    const oppIds = [...new Set((jobs ?? []).map((j) => j.opportunity_id).filter(Boolean))] as string[];
    const verticalIds = [...new Set((jobs ?? []).map((j) => j.vertical_id).filter(Boolean))] as string[];

    const [
        { data: customers },
        { data: contacts },
        { data: opportunities },
        { data: verticals },
        { data: assignments },
    ] = await Promise.all([
        customerIds.length ? supabase.from("customers").select("id, name").in("id", customerIds) : { data: [] },
        contactIds.length ? supabase.from("contacts").select("id, phone, email").in("id", contactIds) : { data: [] },
        oppIds.length ? supabase.from("opportunities").select("id, name").in("id", oppIds) : { data: [] },
        verticalIds.length ? supabase.from("verticals").select("id, name, slug").in("id", verticalIds) : { data: [] },
        scheduleIds.length ? supabase.from("assignments").select("id, schedule_id, vendor_id, assignment_status_id").in("schedule_id", scheduleIds) : { data: [] },
    ]);

    const customerMap = new Map((customers ?? []).map((c) => [c.id, c]));
    const contactMap = new Map((contacts ?? []).map((c) => [c.id, c]));
    const oppMap = new Map((opportunities ?? []).map((o) => [o.id, o]));
    const verticalMap = new Map((verticals ?? []).map((v) => [v.id, v]));
    const assignmentBySchedule = new Map((assignments ?? []).map((a) => [a.schedule_id, a]));

    const vendorIds = [...new Set((assignments ?? []).map((a) => a.vendor_id).filter(Boolean))] as string[];
    const statusIds = [...new Set((assignments ?? []).map((a) => a.assignment_status_id).filter(Boolean))] as string[];
    const { data: vendors } = vendorIds.length ? await supabase.from("vendors").select("id, name").in("id", vendorIds) : { data: [] };
    const { data: statusRows } = statusIds.length ? await supabase.from("assignment_statuses").select("id, key, label").in("id", statusIds) : { data: [] };
    const vendorMap = new Map((vendors ?? []).map((v) => [v.id, v]));
    const statusMap = new Map((statusRows ?? []).map((s) => [s.id, s]));

    const rows = list.map((s) => {
        const job = s.job_id ? jobMap.get(s.job_id) : undefined;
        const customer = job?.customer_id ? customerMap.get(job.customer_id) : undefined;
        const contact = job?.primary_contact_id ? contactMap.get(job.primary_contact_id) : undefined;
        const opp = job?.opportunity_id ? oppMap.get(job.opportunity_id) : undefined;
        const vertical = job?.vertical_id ? verticalMap.get(job.vertical_id) : undefined;
        const assignment = assignmentBySchedule.get(s.id);
        const vendor = assignment?.vendor_id ? vendorMap.get(assignment.vendor_id) : undefined;
        const assignmentStatus = assignment?.assignment_status_id ? statusMap.get(assignment.assignment_status_id) : undefined;
        return {
            ...s,
            _job_title: job?.title ?? null,
            _customer_name: customer?.name ?? null,
            _contact_phone: (contact as { phone?: string })?.phone ?? null,
            _contact_email: (contact as { email?: string })?.email ?? null,
            _opportunity_name: (opp as { name?: string })?.name ?? null,
            _vertical_name: (vertical as { name?: string })?.name ?? (vertical as { slug?: string })?.slug ?? null,
            _assignment_status: assignmentStatus ? (assignmentStatus as { key?: string }).key ?? (assignmentStatus as { label?: string }).label : null,
            _vendor_name: (vendor as { name?: string })?.name ?? null,
        };
    });

    return (
        <SchedulesClient
            initialData={rows}
            error={undefined}
        />
    );
}
