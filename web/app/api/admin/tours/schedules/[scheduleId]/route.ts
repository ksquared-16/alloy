import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { TOURS_CONFIGURE, requireToursCapability } from "@/lib/access/toursAuthority";
import { validateTourScheduleDraft } from "@/lib/tours/schedules/tourWeeklySchedule";
import { deleteTourSchedule, updateTourSchedule } from "@/lib/tours/schedules/tourScheduleWrites";
import { readTourScheduleScopeLocation } from "@/lib/tours/schedules/tourScheduleRouteSupport";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


/**
 * PUT /api/admin/tours/schedules/[scheduleId] — reconcile the schedule's rules to the submitted
 * shape. `location_id` names the scope the operator is editing; a schedule owned by another scope
 * (an inherited organization schedule seen from a location) is not found here, by construction.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ scheduleId: string }> }) {
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const capDenied = requireToursCapability(access, TOURS_CONFIGURE);
    if (capDenied) return capDenied;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const { scheduleId } = await params;
    if (!UUID_RE.test(String(scheduleId ?? ""))) return NextResponse.json({ error: "Invalid schedule id" }, { status: 400 });

    let body: { location_id?: unknown; schedule?: unknown };
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const scope = readTourScheduleScopeLocation(body.location_id);
    if (!scope.ok) return NextResponse.json({ error: "Invalid location_id" }, { status: 400 });
    const draft = validateTourScheduleDraft(body.schedule);
    if (!draft.ok) return NextResponse.json({ error: draft.error }, { status: 400 });

    const result = await updateTourSchedule(
        createAdminClient(),
        { orgId: ctx.orgId, locationId: scope.locationId },
        scheduleId,
        draft.draft
    );
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ schedule_id: result.scheduleId, rules: result.rules, overlaps: result.overlaps });
}

/** DELETE /api/admin/tours/schedules/[scheduleId]?location_id= — removes the schedule's rules (bookings untouched). */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ scheduleId: string }> }) {
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const capDenied = requireToursCapability(access, TOURS_CONFIGURE);
    if (capDenied) return capDenied;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const { scheduleId } = await params;
    if (!UUID_RE.test(String(scheduleId ?? ""))) return NextResponse.json({ error: "Invalid schedule id" }, { status: 400 });
    const scope = readTourScheduleScopeLocation(new URL(request.url).searchParams.get("location_id"));
    if (!scope.ok) return NextResponse.json({ error: "Invalid location_id" }, { status: 400 });

    const result = await deleteTourSchedule(createAdminClient(), { orgId: ctx.orgId, locationId: scope.locationId }, scheduleId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, deleted: result.deleted });
}
