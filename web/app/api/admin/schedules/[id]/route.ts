import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";

const ALLOWED_KEYS = ["start_at", "end_at", "timezone", "status", "metadata"] as const;

/** GET: single schedule by id, org-scoped. Returns schedule + _job_title, _customer_name, _assigned_vendor_name. */
export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: schedule, error } = await supabase
        .from("schedules")
        .select("*")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .single();

    if (error || !schedule) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

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

    return NextResponse.json({
        ...s,
        _job_title,
        _customer_name,
        _assigned_vendor_name,
    });
}

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    try {
        const body = (await request.json()) as Record<string, unknown>;
        if ("metadata" in body && body.metadata == null) body.metadata = {};
        const updates: Record<string, unknown> = {};
        for (const key of ALLOWED_KEYS) {
            if (body[key] === undefined) continue;
            if (key === "metadata") {
                updates[key] = body.metadata != null && typeof body.metadata === "object" ? body.metadata : {};
                continue;
            }
            updates[key] = body[key];
        }
        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: "No allowed fields to update" }, { status: 400 });
        }

        const startAt = (updates.start_at as string) ?? body.start_at;
        const endAt = (updates.end_at as string) ?? body.end_at;
        if (startAt && endAt && new Date(endAt) <= new Date(startAt)) {
            return NextResponse.json({ error: "end_at must be after start_at" }, { status: 400 });
        }

        const supabase = createAdminClient();
        const { data: schedule, error: fetchErr } = await supabase
            .from("schedules")
            .select("job_id, start_at, end_at")
            .eq("id", id)
            .eq("org_id", ctx.orgId)
            .single();
        if (fetchErr || !schedule) {
            return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
        }

        const finalStart = (updates.start_at as string) ?? (schedule as { start_at?: string }).start_at;
        const finalEnd = (updates.end_at as string) ?? (schedule as { end_at?: string }).end_at;
        if (finalStart && finalEnd) {
            const durationMs = new Date(finalEnd).getTime() - new Date(finalStart).getTime();
            const durationMinutes = Math.round(durationMs / 60000);
            if (durationMinutes > 0) updates.duration_minutes = durationMinutes;
        }

        const { data, error } = await supabase
            .from("schedules")
            .update(updates)
            .eq("id", id)
            .eq("org_id", ctx.orgId)
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

        const jobId = (schedule as { job_id?: string }).job_id;
        if (jobId && updates.start_at) {
            await supabase.from("jobs").update({ scheduled_at: updates.start_at }).eq("id", jobId);
        }

        logAdminAudit({
            entity: "schedules",
            id,
            changed_fields: Object.keys(updates),
            actor_user_id: ctx.userId,
            role: ctx.role,
        });
        return NextResponse.json(data);
    } catch (e: unknown) {
        console.error("[ADMIN_PATCH_SCHEDULE]", e);
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
