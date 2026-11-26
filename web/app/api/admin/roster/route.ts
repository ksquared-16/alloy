/**
 * Combined Daily Roster — read-only projection.
 *
 * One day, one site. Composes certified child expectations and certified staff
 * supply; persists nothing and authors no facts. This is not Attendance: nothing
 * here records who actually showed up.
 */

import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import {
    operationalEnrollmentErrorResponse,
    resolveOperationalEnrollmentTodayYmd,
} from "@/lib/childcareOperational/operationalEnrollmentApi";
import { buildCombinedRoster } from "@/lib/roster/buildCombinedRoster";
import { createAdminClient } from "@/lib/supabaseAdmin";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { searchParams } = new URL(request.url);
    const siteLocationId = (searchParams.get("site_location_id") ?? "").trim();
    if (!siteLocationId) {
        return NextResponse.json(
            { error: "site_location_id is required", code: "invalid_input" },
            { status: 400 }
        );
    }

    const supabase = createAdminClient();
    try {
        const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
        const requested = (searchParams.get("date") ?? "").trim();
        const date = ISO_DATE_RE.test(requested) ? requested : todayYmd;

        const roster = await buildCombinedRoster(supabase, {
            orgId: ctx.orgId,
            siteLocationId,
            date,
        });
        return NextResponse.json({ roster, todayYmd });
    } catch (e) {
        return operationalEnrollmentErrorResponse(e);
    }
}
