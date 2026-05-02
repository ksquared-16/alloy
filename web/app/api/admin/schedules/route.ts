import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { assertAllowedStatusKey, fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import {
  fetchScheduleStatusKeyByFk,
  effectiveScheduleStatusKey,
  resolveScheduleStatusRowByKey,
} from "@/lib/admin/scheduleEffectiveStatusKey";
import { resolveScheduledOnBounds } from "@/lib/admin/orgLocalDayBounds";
import { fetchOperationalTimezoneForOrg, type OperationalTimezoneSource } from "@/lib/admin/timezoneContract";
import { emitEvent } from "@/lib/emitEvent";
import { executeWorkflowRun } from "@/lib/workflowRun";

/** GET: list schedules for current org. Admin/ops. Exclude canceled by default. */
export async function GET(request: NextRequest) {
  const ctx = await getAdminContextCached();
  if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (supabaseUrl) console.log("SUPABASE_URL_HOST", new URL(supabaseUrl).host);

  const { searchParams } = new URL(request.url);
  const includeCanceled = searchParams.get("include_canceled") === "true";
  const jobId = (searchParams.get("job_id") ?? "").trim();
  const statusKey = (searchParams.get("status_key") ?? "").trim();
  const from = (searchParams.get("from") ?? "").trim();
  const to = (searchParams.get("to") ?? "").trim();
  /** Org operational calendar day: `today` or `YYYY-MM-DD` (IANA from org_settings.metadata; see meta.calendar_type). */
  const scheduledOnRaw = (searchParams.get("scheduled_on") ?? "").trim();
  const limit = Math.min(Number(searchParams.get("limit")) || 200, 200);

  const supabase = createAdminClient();

  if (scheduledOnRaw && (from || to)) {
    return NextResponse.json(
      { error: "Use either scheduled_on or from/to, not both" },
      { status: 400 }
    );
  }

  let dayMeta:
    | {
        scheduled_on: string;
        /** @deprecated Use meta.timezone_effective */
        timezone: string;
        timezone_effective: string;
        timezone_source: OperationalTimezoneSource;
        calendar_type: "operational_day";
      }
    | undefined;

  let rows: unknown[] | null = null;
  let queryError: { message: string } | null = null;
  let count: number | null = null;

  if (scheduledOnRaw) {
    const so = scheduledOnRaw.toLowerCase();
    if (so !== "today" && !/^\d{4}-\d{2}-\d{2}$/.test(scheduledOnRaw)) {
      return NextResponse.json({ error: "scheduled_on must be `today` or YYYY-MM-DD" }, { status: 400 });
    }
    let bounds: { dayStartUtc: Date; dayEndExclusiveUtc: Date };
    let tz: string;
    let tzSource: OperationalTimezoneSource;
    try {
      const op = await fetchOperationalTimezoneForOrg(supabase, ctx.orgId);
      tz = op.iana;
      tzSource = op.source;
      bounds = resolveScheduledOnBounds(scheduledOnRaw, tz);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Invalid scheduled_on" },
        { status: 400 }
      );
    }
    dayMeta = {
      scheduled_on: scheduledOnRaw,
      timezone: tz,
      timezone_effective: tz,
      timezone_source: tzSource,
      calendar_type: "operational_day",
    };
    /** Inner join non-archived jobs so totals and rows match the former jobs-based “today” lane. */
    let dayQ = supabase
      .from("schedules")
      .select(
        `id, job_id, org_id, location_id, schedule_number, start_at, end_at, timezone, status_key, schedule_status_id, assigned_vendor_id, created_at, canceled_at, canceled_by, cancel_reason, duration_minutes,
        jobs!inner(archived_at)`,
        { count: "exact" }
      )
      .eq("org_id", ctx.orgId)
      .gte("start_at", bounds.dayStartUtc.toISOString())
      .lt("start_at", bounds.dayEndExclusiveUtc.toISOString())
      .is("jobs.archived_at", null)
      .order("start_at", { ascending: true })
      .limit(limit);
    if (!includeCanceled) {
      dayQ = dayQ.is("canceled_at", null);
    }
    if (jobId) dayQ = dayQ.eq("job_id", jobId);
    if (statusKey) dayQ = dayQ.eq("status_key", statusKey);
    const res = await dayQ;
    rows = res.data as unknown[] | null;
    queryError = res.error;
    count = res.count ?? null;
  } else {
    let q = supabase
      .from("schedules")
      .select(
        "id, job_id, org_id, location_id, schedule_number, start_at, end_at, timezone, status_key, schedule_status_id, assigned_vendor_id, created_at, canceled_at, canceled_by, cancel_reason, duration_minutes",
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

    const res = await q;
    rows = res.data as unknown[] | null;
    queryError = res.error;
    count = res.count ?? null;
  }

  if (queryError) return NextResponse.json({ error: queryError.message }, { status: 500 });

  const listRaw = rows ?? [];
  const list = listRaw.map((row) => {
    const r = row as Record<string, unknown>;
    if ("jobs" in r) {
      const { jobs: _drop, ...rest } = r;
      return rest;
    }
    return r;
  });

  const scheduleIds = list.map((s) => (s as { id: string }).id);
  const jobIds = [...new Set(list.map((s) => (s as { job_id: string }).job_id).filter(Boolean))] as string[];
  const { data: jobs } = jobIds.length
    ? await supabase.from("jobs").select("id, title, service_key, customer_id, assigned_vendor_id").in("id", jobIds)
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

  const scheduleStatusFkIds = list.map((s) => (s as { schedule_status_id?: string | null }).schedule_status_id);
  const scheduleKeyByFk = await fetchScheduleStatusKeyByFk(supabase, scheduleStatusFkIds);

  const schedules = list.map((s) => {
    const job = (s as { job_id: string }).job_id ? jobMap.get((s as { job_id: string }).job_id) : undefined;
    const customerId = job ? (job as { customer_id?: string }).customer_id : null;
    const scheduleVendorId = assignmentVendorBySchedule.get((s as { id: string }).id);
    const jobVendorId = job ? (job as { assigned_vendor_id?: string }).assigned_vendor_id : null;
    const vendorId = scheduleVendorId ?? jobVendorId;
    const _assigned_vendor_name = vendorId ? vendorMap.get(vendorId) ?? null : null;
    const locId = (s as { location_id?: string | null }).location_id;
    const _location_label = locId ? locationMap.get(locId) ?? null : null;
    const statusRow = s as { status_key?: string | null; schedule_status_id?: string | null };
    const effectiveSk = effectiveScheduleStatusKey(statusRow, scheduleKeyByFk);
    const _status_display = effectiveSk ? (scheduleDefLabelByKey.get(effectiveSk) ?? effectiveSk) : null;
    return {
      ...s,
      status_key: effectiveSk,
      _job_title: job ? (job as { title: string | null }).title ?? null : null,
      _service_key: job ? (job as { service_key?: string | null }).service_key ?? null : null,
      _customer_name: customerId ? customerMap.get(customerId) ?? null : null,
      _assigned_vendor_name,
      _location_label,
      _status_display,
    };
  });

  const payload: {
    schedules: typeof schedules;
    total: number;
    meta?: NonNullable<typeof dayMeta>;
  } = {
    schedules,
    total: count ?? schedules.length,
  };
  if (dayMeta) payload.meta = dayMeta;
  return NextResponse.json(payload);
}

/** POST: create schedule. Admin only. job_id required; job must belong to org. */
export async function POST(request: NextRequest) {
  const ctx = await getAdminContextCached();
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
  if (body_status_key) {
    row.status_key = body_status_key;
    const st = await resolveScheduleStatusRowByKey(supabase, body_status_key);
    if (st) {
      row.schedule_status_id = st.id;
    } else {
      console.warn("[ADMIN_POST_SCHEDULE] status_key has no matching schedule_statuses row", { body_status_key });
    }
  }

  if (!body_status_key) {
    const defaultSched = await resolveScheduleStatusRowByKey(supabase, "scheduled");
    if (defaultSched) {
      row.schedule_status_id = defaultSched.id;
      row.status_key = defaultSched.key;
    }
  }

  const durationMs = new Date(end_at).getTime() - new Date(start_at).getTime();
  const duration_minutes = Math.round(durationMs / 60000);
  if (duration_minutes > 0) row.duration_minutes = duration_minutes;

  const { data, error } = await supabase.from("schedules").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const newId = (data as { id: string }).id;

  const { data: jobRow } = await supabase.from("jobs").select("id, assigned_vendor_id").eq("id", job_id).eq("org_id", ctx.orgId).single();
  let wq = supabase.from("workflows").select("id").eq("enabled", true).eq("event_type", "schedule_created").eq("entity_type", "schedule");
  wq = wq.or(`org_id.eq.${ctx.orgId},org_id.is.null`);
  const { data: wfs } = await wq;
  const { data: newScheduleRow } = await supabase.from("schedules").select("*").eq("id", newId).eq("org_id", ctx.orgId).single();
  const occurredAt = new Date().toISOString();
  const eventPayload: Record<string, unknown> = {
    event_type: "schedule_created",
    occurred_at: occurredAt,
    org_id: ctx.orgId,
    schedule_id: newId,
    job_id,
    job: jobRow ?? null,
    schedule: newScheduleRow ?? { id: newId, job_id },
  };
  let eventId: string | null = null;
  try {
    eventId = await emitEvent({
      org_id: ctx.orgId,
      event_type: "schedule_created",
      entity_type: "schedule",
      entity_id: newId,
      action_type: null,
      occurred_at: occurredAt,
      payload: {
        ...eventPayload,
        actor_user_id: ctx.userId ?? null,
      },
    });
  } catch (emitErr) {
    console.error("[ADMIN_POST_SCHEDULE] emitEvent", emitErr);
    eventId = null;
  }
  for (const wf of wfs ?? []) {
    try {
      await executeWorkflowRun(supabase, (wf as { id: string }).id, eventPayload, {
        event_id: eventId,
        org_id: ctx.orgId,
      });
    } catch {
      // continue — same as reschedule route
    }
  }

  return NextResponse.json(data);
}
