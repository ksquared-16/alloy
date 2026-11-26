import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { TOURS_CONFIGURE, requireToursCapability } from "@/lib/access/toursAuthority";
import { validateTourScheduleDraft } from "@/lib/tours/schedules/tourWeeklySchedule";
import { assertLocationInOrg, createTourSchedule } from "@/lib/tours/schedules/tourScheduleWrites";
import {
    readTourScheduleScopeLocation,
    resolveTourScheduleDefaultTimezone,
} from "@/lib/tours/schedules/tourScheduleRouteSupport";

/**
 * GET /api/admin/tours/schedules?location_id=
 *
 * The default zone for a new schedule at this scope (location → organization), so the editor never
 * starts from the browser's zone. Rules themselves are read from `availability-rules`.
 */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const scope = readTourScheduleScopeLocation(new URL(request.url).searchParams.get("location_id"));
    if (!scope.ok) return NextResponse.json({ error: "Invalid location_id" }, { status: 400 });

    const supabase = createAdminClient();
    if (scope.locationId && !(await assertLocationInOrg(supabase, ctx.orgId, scope.locationId))) {
        return NextResponse.json({ error: "location_id not found for org" }, { status: 404 });
    }
    const timezone = await resolveTourScheduleDefaultTimezone(supabase, ctx.orgId, scope.locationId);
    return NextResponse.json({ timezone });
}

/**
 * POST /api/admin/tours/schedules — create a weekly schedule: one rule per weekday × window, tagged
 * with one schedule id. Body: `{ location_id: uuid | null, schedule: TourScheduleDraft }`.
 * Duplicating a schedule is this call with the copied configuration — it inserts rules and nothing else.
 */
export async function POST(request: NextRequest) {
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const capDenied = requireToursCapability(access, TOURS_CONFIGURE);
    if (capDenied) return capDenied;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

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

    const supabase = createAdminClient();
    if (scope.locationId && !(await assertLocationInOrg(supabase, ctx.orgId, scope.locationId))) {
        return NextResponse.json({ error: "location_id not found for org" }, { status: 400 });
    }
    const result = await createTourSchedule(supabase, { orgId: ctx.orgId, locationId: scope.locationId }, draft.draft);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(
        { schedule_id: result.scheduleId, rules: result.rules, overlaps: result.overlaps },
        { status: 201 }
    );
}
