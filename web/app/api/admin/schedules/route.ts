import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

/** GET: list schedules for current org. Admin/ops. Exclude canceled by default. */
export async function GET(request: NextRequest) {
  const ctx = await getAdminContext();
  if (ctx instanceof NextResponse) return ctx;

  const { searchParams } = new URL(request.url);
  const includeCanceled = searchParams.get("include_canceled") === "true";
  const jobId = (searchParams.get("job_id") ?? "").trim();
  const from = (searchParams.get("from") ?? "").trim();
  const to = (searchParams.get("to") ?? "").trim();
  const limit = Math.min(Number(searchParams.get("limit")) || 200, 200);

  const supabase = createAdminClient();
  let q = supabase
    .from("schedules")
    .select(
      "id, job_id, org_id, start_at, end_at, timezone, canceled_at, canceled_by, cancel_reason, duration_minutes",
      { count: "exact" }
    )
    .eq("org_id", ctx.orgId)
    .order("start_at", { ascending: false })
    .limit(limit);

  if (!includeCanceled) {
    q = q.is("canceled_at", null);
  }
  if (jobId) q = q.eq("job_id", jobId);
  if (from) q = q.gte("start_at", from);
  if (to) q = q.lte("start_at", to);

  const { data: rows, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = rows ?? [];
  const jobIds = [...new Set(list.map((s) => (s as { job_id: string }).job_id).filter(Boolean))] as string[];
  const { data: jobs } = jobIds.length
    ? await supabase.from("jobs").select("id, title, customer_id").in("id", jobIds)
    : { data: [] };
  const jobMap = new Map((jobs ?? []).map((j) => [(j as { id: string }).id, j]));
  const customerIds = [...new Set((jobs ?? []).map((j) => (j as { customer_id?: string }).customer_id).filter(Boolean))] as string[];
  const { data: customers } = customerIds.length
    ? await supabase.from("customers").select("id, name").in("id", customerIds)
    : { data: [] };
  const customerMap = new Map((customers ?? []).map((c) => [(c as { id: string }).id, (c as { name: string | null }).name ?? null]));

  const schedules = list.map((s) => {
    const job = (s as { job_id: string }).job_id ? jobMap.get((s as { job_id: string }).job_id) : undefined;
    const customerId = job ? (job as { customer_id?: string }).customer_id : null;
    return {
      ...s,
      _job_title: job ? (job as { title: string | null }).title ?? null : null,
      _customer_name: customerId ? customerMap.get(customerId) ?? null : null,
    };
  });

  return NextResponse.json({ schedules, total: count ?? schedules.length });
}

/** POST: create schedule. Admin only. job_id required; job must belong to org. */
export async function POST(request: NextRequest) {
  const ctx = await getAdminContext();
  if (ctx instanceof NextResponse) return ctx;
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // ignore
  }

  const job_id = typeof body.job_id === "string" ? body.job_id.trim() : null;
  if (!job_id) {
    return NextResponse.json({ error: "job_id is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("id, org_id")
    .eq("id", job_id)
    .maybeSingle();
  if (!job || (job as { org_id?: string }).org_id !== ctx.orgId) {
    return NextResponse.json({ error: "Job not found or does not belong to your org" }, { status: 400 });
  }

  const start_at = typeof body.start_at === "string" ? body.start_at : null;
  const end_at = typeof body.end_at === "string" ? body.end_at : null;
  if (!start_at || !end_at) {
    return NextResponse.json({ error: "start_at and end_at are required" }, { status: 400 });
  }
  if (new Date(end_at) <= new Date(start_at)) {
    return NextResponse.json({ error: "end_at must be after start_at" }, { status: 400 });
  }

  const metadata = body.metadata != null && typeof body.metadata === "object" ? body.metadata : {};
  const row: Record<string, unknown> = {
    org_id: ctx.orgId,
    job_id,
    start_at,
    end_at,
    timezone: typeof body.timezone === "string" ? body.timezone : null,
    metadata,
  };
  if (typeof body.visit_type === "string") row.visit_type = body.visit_type;
  if (typeof body.schedule_status_id === "string" && body.schedule_status_id) row.schedule_status_id = body.schedule_status_id;

  const durationMs = new Date(end_at).getTime() - new Date(start_at).getTime();
  const duration_minutes = Math.round(durationMs / 60000);
  if (duration_minutes > 0) row.duration_minutes = duration_minutes;

  const { data, error } = await supabase.from("schedules").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
