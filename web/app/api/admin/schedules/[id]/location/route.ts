import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { assertScheduleInAccessScope, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { logAdminAudit } from "@/lib/adminAuth";
import { emitEvent } from "@/lib/emitEvent";

/** PATCH: set schedule location. Admin only. */
export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    if (!id) {
        return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    let body: { location_id?: string | null } = {};
    try {
        body = (await request.json()) as { location_id?: string | null };
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const locationIdRaw = body.location_id;
    const location_id: string | null =
        typeof locationIdRaw === "string" && locationIdRaw.trim()
            ? locationIdRaw.trim()
            : null;

    const supabase = createAdminClient();

    const { data: schedule, error: schedErr } = await supabase
        .from("schedules")
        .select("id, org_id, job_id, location_id")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (schedErr || !schedule) {
        return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    const access = await getAdminAccessContextCached();
    if (!access.ok) {
        return NextResponse.json(
            { error: access.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: access.status }
        );
    }
    const dim = scopeDimensionsFromAccess(access);
    const sch = schedule as { job_id?: string | null; location_id?: string | null };
    if (!(await assertScheduleInAccessScope(supabase, ctx.orgId, dim, { job_id: sch.job_id ?? null, location_id: sch.location_id ?? null }))) {
        return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    const proposedLoc = location_id ?? sch.location_id ?? null;
    if (!(await assertScheduleInAccessScope(supabase, ctx.orgId, dim, { job_id: sch.job_id ?? null, location_id: proposedLoc }))) {
        return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    if (location_id) {
        const { data: loc, error: locErr } = await supabase
            .from("locations")
            .select("id, org_id")
            .eq("id", location_id)
            .maybeSingle();
        if (locErr || !loc) {
            return NextResponse.json({ error: "Location not found" }, { status: 400 });
        }
        if ((loc as { org_id?: string }).org_id !== ctx.orgId) {
            return NextResponse.json({ error: "Location does not belong to your org" }, { status: 400 });
        }
    }

    const { data: updated, error: updateErr } = await supabase
        .from("schedules")
        .update({ location_id })
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .select("id, location_id")
        .single();

    if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }
    if (!updated) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    logAdminAudit({
        entity: "schedules",
        id,
        changed_fields: ["location_id"],
        actor_user_id: ctx.userId,
        role: ctx.role,
    });

    try {
        await emitEvent({
            org_id: ctx.orgId,
            event_type: "schedule_location_updated",
            entity_type: "schedule",
            entity_id: id,
            payload: {
                location_id,
                actor_user_id: ctx.userId,
            },
        });
    } catch (e) {
        console.warn("[schedules/location] emitEvent", e instanceof Error ? e.message : e);
    }

    return NextResponse.json({
        id: (updated as { id: string }).id,
        location_id: (updated as { location_id?: string | null }).location_id ?? null,
    });
}
