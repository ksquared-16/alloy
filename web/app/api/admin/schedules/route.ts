import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { assertAllowedStatusKey, fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";

/** GET: list schedules for current org. Admin/ops. Exclude canceled by default. */
export async function GET(request: NextRequest) {
  const ctx = await getAdminContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (supabaseUrl) console.log("SUPABASE_URL_HOST", new URL(supabaseUrl).host);

  const { searchParams } = new URL(request.url);
  const includeCanceled = searchParams.get("include_canceled") === "true";
  const jobId = (searchParams.get("job_id") ?? "").trim();
  const statusKey = (searchParams.get("status_key") ?? "").trim();
  const from = (searchParams.get("from") ?? "").trim();
  const to = (searchParams.get("to") ?? "").trim();
  const limit = Math.min(Number(searchParams.get("limit")) || 200, 200);

  const supabase = createAdminClient();
  let q = supabase
    .from("schedules")
    .select(
      "id, job_id, org_id, location_id, start_at, end_at, timezone, status_key, schedule_status_id, assigned_vendor_id, created_at, canceled_at, canceled_by, cancel_reason, duration_minutes",
      { count: "exact" }
    )
    .eq("org_id", ctx.orgId)
    .order("start_at", { ascending: false })
    .limit(limit);

  if (!includeCanceled) {
    q = q.is("canceled_at", null);
  }
  if (jobId) q = q.eq("job_id", jobId);
  if (statusKey) q = q.eq("status_key", statusKey);
  if (from) q = q.gte("start_at", from);
  if (to) q = q.lte("start_at", to);

  const { data: rows, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = rows ?? [];
  const scheduleIds = list.map((s) => (s as { id: string }).id);
  const jobIds = [...new Set(list.map((s) => (s as { job_id: string }).job_id).filter(Boolean))] as string[];
  const { data: jobs } = jobIds.length
    ? await supabase.from("jobs").select("id, title, customer_id, assigned_vendor_id").in("id", jobIds)
    : { data: [] };
  const jobMap = new Map((jobs ?? []).map((j) => [(j as { id: string }).id, j]));
  const customerIds = [...new Set((jobs ?? []).map((j) => (j as { customer_id?: string }).customer_id).filter(Boolean))] as string[];
  const { data: customers } = customerIds.length
    ? await supabase.from("customers").select("id, name").in("id", customerIds)
    : { data: [] };
  const customerMap = new Map((customers ?? []).map((c) => [(c as { id: string }).id, (c as { name: string | null }).name ?? null]));

  const locationIds = [...new Set(list.map((s) => (s as { location_id?: string | null }).location_id).filter(Boolean))] as string[];
  const { data: locationRows } = locationIds.length
    ? await supabase.from("locations").select("id, label, address1, city, postal_code").in("id", locationIds)
    : { data: [] };
  const locationMap = new Map((locationRows ?? []).map((loc) => {
    const l = loc as { id: string; label?: string | null; address1?: string | null; city?: string | null; postal_code?: string | null };
    const summary = l.label ?? ([l.address1, l.city, l.postal_code].filter(Boolean).join(", ") || null);
    return [l.id, summary];
  }));

  const { data: assignments } = scheduleIds.length
    ? await supabase.from("assignments").select("schedule_id, vendor_id").in("schedule_id", scheduleIds)
    : { data: [] };
  const assignmentVendorBySchedule = new Map((assignments ?? []).map((a) => [(a as { schedule_id: string }).schedule_id, (a as { vendor_id: string }).vendor_id]));
  const jobVendorIds = [...new Set((jobs ?? []).map((j) => (j as { assigned_vendor_id?: string }).assigned_vendor_id).filter(Boolean))] as string[];
  const assignVendorIds = [...new Set((assignments ?? []).map((a) => (a as { vendor_id: string }).vendor_id).filter(Boolean))] as string[];
  const allVendorIds = [...new Set([...jobVendorIds, ...assignVendorIds])];
  const { data: vendorRows } = allVendorIds.length
    ? await supabase.from("vendors").select("id, name").in("id", allVendorIds)
    : { data: [] };
  const vendorMap = new Map((vendorRows ?? []).map((v) => [(v as { id: string }).id, (v as { name: string | null }).name ?? null]));

  let scheduleDefLabelByKey = new Map<string, string>();
  try {
    const defs = await fetchEffectiveStatusDefinitions(supabase, ctx.orgId, "schedules", { activeOnly: true });
    scheduleDefLabelByKey = new Map(defs.map((d) => [d.status_key, (d.status_label && d.status_label.trim()) || d.status_key]));
  } catch {
    scheduleDefLabelByKey = new Map();
  }

  const schedules = list.map((s) => {
    const job = (s as { job_id: string }).job_id ? jobMap.get((s as { job_id: string }).job_id) : undefined;
    const customerId = job ? (job as { customer_id?: string }).customer_id : null;
    const scheduleVendorId = assignmentVendorBySchedule.get((s as { id: string }).id);
    const jobVendorId = job ? (job as { assigned_vendor_id?: string }).assigned_vendor_id : null;
    const vendorId = scheduleVendorId ?? jobVendorId;
    const _assigned_vendor_name = vendorId ? vendorMap.get(vendorId) ?? null : null;
    const locId = (s as { location_id?: string | null }).location_id;
    const _location_label = locId ? locationMap.get(locId) ?? null : null;
    const sk = (s as { status_key?: string | null }).status_key;
    const skTrim = sk && String(sk).trim() ? String(sk).trim() : null;
    const _status_display = skTrim ? (scheduleDefLabelByKey.get(skTrim) ?? skTrim) : null;
    return {
      ...s,
      _job_title: job ? (job as { title: string | null }).title ?? null : null,
      _customer_name: customerId ? customerMap.get(customerId) ?? null : null,
      _assigned_vendor_name,
      _location_label,
      _status_display,
    };
  });

  return NextResponse.json({ schedules, total: count ?? schedules.length });
}

/** POST: create schedule. Admin only. job_id required; job must belong to org. */
export async function POST(request: NextRequest) {
  const ctx = await getAdminContext();
  if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
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
    .select("id, org_id, location_id")
    .eq("id", job_id)
    .maybeSingle();
  if (!job || (job as { org_id?: string }).org_id !== ctx.orgId) {
    return NextResponse.json({ error: "Job not found or does not belong to your org" }, { status: 400 });
  }

  let location_id: string | null = typeof body.location_id === "string" && body.location_id.trim() ? body.location_id.trim() : null;
  if (!location_id && (job as { location_id?: string | null }).location_id) {
    location_id = (job as { location_id: string }).location_id;
  }
  if (location_id) {
    const { data: loc } = await supabase.from("locations").select("id, org_id").eq("id", location_id).maybeSingle();
    if (!loc || (loc as { org_id?: string }).org_id !== ctx.orgId) {
      return NextResponse.json({ error: "Location not found or does not belong to your org" }, { status: 400 });
    }
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
  const body_status_key = typeof body.status_key === "string" && body.status_key.trim() ? body.status_key.trim() : null;
  if (body_status_key) {
    const chk = await assertAllowedStatusKey(supabase, ctx.orgId, "schedules", body_status_key);
    if (!chk.ok) return NextResponse.json({ error: chk.message }, { status: 400 });
  }
  const row: Record<string, unknown> = {
    org_id: ctx.orgId,
    job_id,
    start_at,
    end_at,
    timezone: typeof body.timezone === "string" ? body.timezone : null,
    metadata,
  };
  if (location_id) row.location_id = location_id;
  if (typeof body.visit_type === "string") row.visit_type = body.visit_type;
  if (body_status_key) row.status_key = body_status_key;

  const durationMs = new Date(end_at).getTime() - new Date(start_at).getTime();
  const duration_minutes = Math.round(durationMs / 60000);
  if (duration_minutes > 0) row.duration_minutes = duration_minutes;

  const { data, error } = await supabase.from("schedules").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
