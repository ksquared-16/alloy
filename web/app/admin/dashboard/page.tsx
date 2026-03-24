import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getFinancialSnapshot } from "@/lib/financials";
import DashboardClient, { type DashboardData } from "./DashboardClient";

export const dynamic = "force-dynamic";

async function getDashboardData(orgId: string): Promise<DashboardData> {
    const supabase = createAdminClient();
    const now = new Date().toISOString();
    const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
        jobsRes,
        opportunitiesRes,
        vendorsRes,
        upcomingSchedulesRes,
        assignmentsForUpcomingRes,
        assignmentStatusesRes,
        canceledCountRes,
        upcomingTotalRes,
        failedRunsRes,
        outboxFailuresRes,
    ] = await Promise.all([
        supabase.from("jobs").select("id, assigned_vendor_id").eq("org_id", orgId),
        supabase.from("opportunities").select("id, status, status_key").eq("org_id", orgId),
        supabase.from("vendors").select("id, status_key").eq("org_id", orgId),
        supabase
            .from("schedules")
            .select("id, job_id, start_at, end_at")
            .eq("org_id", orgId)
            .is("canceled_at", null)
            .gte("start_at", now)
            .lte("start_at", in7Days)
            .order("start_at", { ascending: true })
            .limit(50),
        (async () => {
            const u = await supabase
                .from("schedules")
                .select("id")
                .eq("org_id", orgId)
                .is("canceled_at", null)
                .gte("start_at", now)
                .lte("start_at", in7Days)
                .limit(500);
            const ids = (u.data ?? []).map((s) => s.id);
            if (ids.length === 0) return { data: [] as { schedule_id: string; assignment_status_id: string }[] };
            return supabase.from("assignments").select("schedule_id, assignment_status_id").eq("org_id", orgId).in("schedule_id", ids);
        })(),
        supabase.from("assignment_statuses").select("id, key"),
        supabase
            .from("schedules")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .not("canceled_at", "is", null),
        supabase
            .from("schedules")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .is("canceled_at", null)
            .gte("start_at", now),
        supabase.from("workflow_runs").select("id", { count: "exact", head: true }).eq("status", "failed").eq("org_id", orgId),
        supabase.from("messages_outbox").select("id", { count: "exact", head: true }).eq("status", "failed").eq("org_id", orgId),
    ]);

    const jobs = jobsRes.data ?? [];
    const opportunities = opportunitiesRes.data ?? [];
    const vendors = vendorsRes.data ?? [];
    const upcomingSchedules = upcomingSchedulesRes.data ?? [];
    const assignmentsForUpcoming = (assignmentsForUpcomingRes.data ?? []) as { schedule_id: string; assignment_status_id: string }[];
    const statusRows = (assignmentStatusesRes.data ?? []) as { id: string; key: string }[];
    const statusKeyById = new Map(statusRows.map((s) => [s.id, s.key]));

    const jobsWithVendor = jobs.filter((j) => (j as { assigned_vendor_id?: string | null }).assigned_vendor_id).length;
    const booked = opportunities.filter((o) => (o.status ?? "").toLowerCase() === "closed").length;
    const byStage: Record<string, number> = {};
    opportunities.forEach((o) => {
        const raw = (o as { status_key?: string | null }).status_key;
        const key = raw && String(raw).trim() ? String(raw).trim().toLowerCase().replace(/\s+/g, "_") : "none";
        byStage[key] = (byStage[key] ?? 0) + 1;
    });
    if (Object.keys(byStage).length === 0) {
        byStage.open = opportunities.filter((o) => (o.status ?? "").toLowerCase() !== "closed").length;
        byStage.booked = booked;
    }

    const assignmentBySchedule = new Map(assignmentsForUpcoming.map((a) => [a.schedule_id, a]));
    let unassigned = 0;
    let offered = 0;
    let accepted = 0;
    upcomingSchedules.forEach((s) => {
        const a = assignmentBySchedule.get(s.id);
        const key = a?.assignment_status_id ? statusKeyById.get(a.assignment_status_id) : null;
        if (!key) unassigned++;
        else if (key === "offered") offered++;
        else if (key === "accepted") accepted++;
    });
    const upcomingTotal = typeof (upcomingTotalRes as { count?: number }).count === "number" ? (upcomingTotalRes as { count: number }).count : upcomingSchedules.length;
    const canceled = typeof (canceledCountRes as { count?: number }).count === "number" ? (canceledCountRes as { count: number }).count : 0;
    const upcoming = upcomingTotal;

    const vendorCounts = { pending: 0, approved: 0, suspended: 0 };
    vendors.forEach((v) => {
        const k = String((v as { status_key?: string | null }).status_key ?? "")
            .trim()
            .toLowerCase();
        if (k === "pending") vendorCounts.pending++;
        else if (k === "approved") vendorCounts.approved++;
        else if (k === "suspended") vendorCounts.suspended++;
    });

    const jobIdsUpcoming = [...new Set(upcomingSchedules.map((s) => (s as { job_id: string }).job_id).filter(Boolean))] as string[];
    const { data: jobsUpcoming } = jobIdsUpcoming.length
        ? await supabase.from("jobs").select("id, title").in("id", jobIdsUpcoming).eq("org_id", orgId)
        : { data: [] };
    const { data: assignmentsUpcoming } = upcomingSchedules.length
        ? await supabase
              .from("assignments")
              .select("schedule_id, assignment_status_id")
              .eq("org_id", orgId)
              .in(
                  "schedule_id",
                  upcomingSchedules.map((s) => s.id)
              )
        : { data: [] };
    const { data: statusUpcoming } = assignmentsUpcoming?.length
        ? await supabase
              .from("assignment_statuses")
              .select("id, key")
              .in("id", [...new Set((assignmentsUpcoming ?? []).map((a) => (a as { assignment_status_id?: string }).assignment_status_id).filter(Boolean))])
        : { data: [] };
    const jobMap = new Map((jobsUpcoming ?? []).map((j) => [j.id, j]));
    const assignMap = new Map(
        (assignmentsUpcoming ?? []).map((a) => [(a as { schedule_id: string }).schedule_id, a as { assignment_status_id: string }])
    );
    const statusKeyMap = new Map((statusUpcoming ?? []).map((s) => [(s as { id: string }).id, (s as { key: string }).key]));

    const customerIds =
        jobIdsUpcoming.length ? (await supabase.from("jobs").select("id, customer_id").in("id", jobIdsUpcoming).eq("org_id", orgId)).data ?? [] : [];
    const custIds = [...new Set(customerIds.map((j) => (j as { customer_id?: string }).customer_id).filter(Boolean))] as string[];
    const { data: customersUpcoming } = custIds.length
        ? await supabase.from("customers").select("id, name").in("id", custIds).eq("org_id", orgId)
        : { data: [] };
    const customerMap = new Map((customersUpcoming ?? []).map((c) => [c.id, c]));
    const jobToCustomer = new Map(customerIds.map((j) => [(j as { id: string }).id, (j as { customer_id?: string }).customer_id]));

    const upcomingRows = upcomingSchedules.map((s) => {
        const job = jobMap.get((s as { job_id: string }).job_id);
        const assign = assignMap.get(s.id);
        const statusKey = assign?.assignment_status_id ? statusKeyMap.get(assign.assignment_status_id) : null;
        const customerId = job ? jobToCustomer.get((job as { id: string }).id) : null;
        const customer = customerId ? customerMap.get(customerId) : undefined;
        return {
            id: s.id,
            start_at: (s as { start_at: string }).start_at,
            end_at: (s as { end_at: string }).end_at,
            _job_title: (job as { title?: string } | undefined)?.title ?? null,
            _customer_name: (customer as { name?: string } | undefined)?.name ?? null,
            _assignment_status: statusKey ?? null,
        };
    });

    let financialSnapshot = null;
    try {
        financialSnapshot = await getFinancialSnapshot(supabase, orgId);
    } catch (e) {
        console.error("Dashboard financial snapshot:", e);
    }

    return {
        jobs: { total: jobs.length, withDefaultVendor: jobsWithVendor },
        opportunities: { total: opportunities.length, booked, notBooked: opportunities.length - booked, byStage },
        schedules: { upcoming, unassigned, offered, accepted, canceled },
        vendors: vendorCounts,
        attention: {
            unassignedSchedules: unassigned,
            offeredNotAccepted: offered,
            failedWorkflowRuns: typeof (failedRunsRes as { count?: number }).count === "number" ? (failedRunsRes as { count: number }).count : 0,
            messageOutboxFailures: typeof (outboxFailuresRes as { count?: number }).count === "number" ? (outboxFailuresRes as { count: number }).count : 0,
        },
        upcomingSchedules: upcomingRows,
        financialSnapshot,
    };
}

export default async function AdminDashboardPage() {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        if (ctx.status === 401) redirect("/login");
        redirect("/admin");
    }

    let data: DashboardData = {
        jobs: { total: 0, withDefaultVendor: 0 },
        opportunities: { total: 0, booked: 0, notBooked: 0, byStage: {} },
        schedules: { upcoming: 0, unassigned: 0, offered: 0, accepted: 0, canceled: 0 },
        vendors: { pending: 0, approved: 0, suspended: 0 },
        attention: { unassignedSchedules: 0, offeredNotAccepted: 0, failedWorkflowRuns: 0, messageOutboxFailures: 0 },
        upcomingSchedules: [],
        financialSnapshot: null,
    };
    try {
        data = await getDashboardData(ctx.orgId);
    } catch (e) {
        console.error("Admin dashboard data:", e);
    }
    return <DashboardClient data={data} />;
}
