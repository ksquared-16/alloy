import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { hasToursCapability, TOURS_CONFIGURE } from "@/lib/access/toursAuthority";
import { assertLocationInOrg } from "@/lib/tours/schedules/tourScheduleWrites";
import { readTourScheduleScopeLocation } from "@/lib/tours/schedules/tourScheduleRouteSupport";
import { resolvePublicBaseUrl } from "@/lib/tours/public/resolvePublicBaseUrl";
import { projectTourCalendarShareLinks, type TourCalendarShareLinkRow } from "@/lib/tours/publicCalendar/tourCalendarShare";

/**
 * GET /api/admin/tours/calendar-links?location_id=
 *
 * The location's intake links as Preview & Share rows: which one publishes the tour calendar, its
 * hosted address, and whether it may be framed. Read-only — publishing is the existing link PATCH
 * (`tour_calendar`), which keeps its own `tours.configure` + forms authority checks.
 */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const scope = readTourScheduleScopeLocation(new URL(request.url).searchParams.get("location_id"));
    if (!scope.ok || !scope.locationId) return NextResponse.json({ error: "A location_id is required" }, { status: 400 });

    const supabase = createAdminClient();
    if (!(await assertLocationInOrg(supabase, ctx.orgId, scope.locationId))) {
        return NextResponse.json({ error: "location_id not found for org" }, { status: 404 });
    }

    const { data: rows, error } = await supabase
        .from("form_public_links")
        .select("id, form_definition_id, is_active, expires_at, allowed_embed_origins, metadata")
        .eq("org_id", ctx.orgId)
        .eq("metadata->>default_location_id", scope.locationId)
        .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const linkRows = (rows ?? []) as TourCalendarShareLinkRow[];
    const formIds = [...new Set(linkRows.map((r) => r.form_definition_id))];
    const formTitles: Record<string, string> = {};
    if (formIds.length) {
        const { data: forms } = await supabase.from("form_definitions").select("id, name").eq("org_id", ctx.orgId).in("id", formIds);
        for (const f of (forms ?? []) as { id: string; name: string | null }[]) {
            if (f.name) formTitles[f.id] = f.name;
        }
    }

    const access = await getAdminAccessContextCached();
    return NextResponse.json({
        links: projectTourCalendarShareLinks(linkRows, { locationId: scope.locationId, baseUrl: resolvePublicBaseUrl(), formTitles }),
        can_publish: access.ok && hasToursCapability(access, TOURS_CONFIGURE),
    });
}
