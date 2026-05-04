import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { assertExistingScheduleMutableInAdminScope, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { maybeCreateCancellationFeeCharge } from "@/lib/charges/cancellationFeeCharge";
import { assertAllowedStatusKey } from "@/lib/admin/statusDefinitionsResolve";
import { emitStatusChangedEvent } from "@/lib/admin/emitStatusChangedEvent";
import {
  effectiveScheduleStatusKey,
  fetchScheduleStatusKeyByFk,
  resolveScheduleStatusRowByKey,
} from "@/lib/admin/scheduleEffectiveStatusKey";

/** POST: cancel visit — canceled_at, canceled_by, cancel_reason, status_key, schedule_status_id; fee when applicable. Admin only. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const ctx = await getAdminContextCached();
  if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // ignore
  }
  const cancel_reason = typeof body.cancel_reason === "string" ? body.cancel_reason.trim() : null;

  const supabase = createAdminClient();

  const { data: before, error: fetchErr } = await supabase
    .from("schedules")
    .select("id, job_id, org_id, location_id, start_at, canceled_at, status_key, schedule_status_id, assigned_vendor_id")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ((before as { canceled_at?: string | null }).canceled_at) {
    return NextResponse.json({ error: "Schedule is already canceled" }, { status: 400 });
  }

  const access = await getAdminAccessContextCached();
  if (!access.ok) return NextResponse.json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, { status: access.status });
  const scopeDim = scopeDimensionsFromAccess(access);
  if (!(await assertExistingScheduleMutableInAdminScope(supabase, ctx.orgId, scopeDim, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const b = before as {
    job_id?: string | null;
    start_at?: string | null;
    status_key?: string | null;
    schedule_status_id?: string | null;
    assigned_vendor_id?: string | null;
  };

  const keyByFkPrev = await fetchScheduleStatusKeyByFk(supabase, [b.schedule_status_id]);
  const previousEffective = effectiveScheduleStatusKey(
    { status_key: b.status_key, schedule_status_id: b.schedule_status_id },
    keyByFkPrev
  );

  const canceledStatusRow =
    (await resolveScheduleStatusRowByKey(supabase, "canceled")) ??
    (await resolveScheduleStatusRowByKey(supabase, "cancelled"));
  const newStatusKey = canceledStatusRow?.key ?? "canceled";
  const newScheduleStatusId = canceledStatusRow?.id ?? null;

  const allowed = await assertAllowedStatusKey(supabase, ctx.orgId, "schedules", newStatusKey);
  if (!allowed.ok) {
    return NextResponse.json({ error: allowed.message }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("schedules")
    .update({
      canceled_at: nowIso,
      canceled_by: ctx.userId,
      cancel_reason: cancel_reason && cancel_reason.length > 0 ? cancel_reason : null,
      status_key: newStatusKey,
      schedule_status_id: newScheduleStatusId,
    })
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const jobId = b.job_id;
  const canceledAtIso = String((data as { canceled_at?: string | null }).canceled_at ?? "").trim();
  if (jobId && canceledAtIso) {
    const fee = await maybeCreateCancellationFeeCharge({
      supabase,
      orgId: ctx.orgId,
      jobId,
      scheduleId: id,
      visitStartAt: b.start_at ?? null,
      canceledAtIso,
    });
    if (!fee.ok) {
      console.warn("[schedule/cancel] cancellation fee charge:", fee.error);
    }
  }

  try {
    const metadata: Record<string, unknown> = {};
    if (jobId) metadata.job_id = jobId;
    if (b.assigned_vendor_id != null) metadata.assigned_vendor_id = b.assigned_vendor_id;
    if (b.start_at) metadata.start_at = b.start_at;
    await emitStatusChangedEvent({
      supabase,
      orgId: ctx.orgId,
      entityType: "schedules",
      entityId: id,
      oldStatusKey: previousEffective ?? null,
      newStatusKey,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    });
  } catch (e) {
    console.warn("[schedule/cancel] emitStatusChangedEvent:", e);
  }

  return NextResponse.json(data);
}
