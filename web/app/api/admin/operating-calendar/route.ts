import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { locationAllowedUnderSiteScope, scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { fetchOperationalTimezoneForOrg } from "@/lib/admin/timezoneContract";
import { isCalendarDate, parseOperatingCalendarDraft } from "@/lib/operatingCalendar/operatingCalendarVocabulary";
import {
    calendarSiteFor,
    calendarTimezoneFor,
    loadSiteOperatingCalendar,
} from "@/lib/operatingCalendar/operatingCalendarServer";
import { listCalendarEntries } from "@/lib/operatingCalendar/operatingCalendarEntries";
import {
    canAuthorCalendarScope,
    commitCalendarAct,
    prepareCalendarAct,
    type CalendarAuthoringAction,
} from "@/lib/operatingCalendar/operatingCalendarAuthoring";
import { requireOperatingCalendarCapability } from "@/lib/access/operatingCalendarAuthority";
import { previewCalendarDates } from "@/lib/operatingCalendar/operatingCalendarImpact";
import { addCalendarDays, isValidIanaTimeZone, localDateOf } from "@/lib/operatingCalendar/operatingCalendarTime";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SPAN_DAYS = 400;

/**
 * GET /api/admin/operating-calendar?location_id=&from=&to=
 *
 * A location's Operating Calendar: the entries that reach it (organization defaults it
 * inherits, its own entries, and closures recorded in Attendance), the resolved days that
 * differ from an ordinary day, and what the caller may change. Read-only.
 */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const orgId = access.orgId;
    const dim = scopeDimensionsFromAccess(access);
    const supabase = createAdminClient();

    const sp = new URL(request.url).searchParams;
    const locationId = sp.get("location_id") ?? "";
    if (!UUID_RE.test(locationId)) return NextResponse.json({ error: "location_id is required" }, { status: 400 });
    if (!(await locationAllowedUnderSiteScope(supabase, orgId, dim, locationId))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const siteId = await calendarSiteFor(supabase, orgId, locationId);
    const { data: site } = await supabase
        .from("locations")
        .select("id, label")
        .eq("org_id", orgId)
        .eq("id", siteId)
        .maybeSingle();
    if (!site) return NextResponse.json({ error: "Location not found" }, { status: 404 });

    // Rooms below the site, so room closures recorded in Attendance are listed as rooms.
    const { data: rooms } = await supabase
        .from("locations")
        .select("id, label")
        .eq("org_id", orgId)
        .eq("parent_location_id", siteId);
    const roomRows = (rooms ?? []) as Array<{ id: string; label: string | null }>;
    const { data: grandRooms } =
        roomRows.length > 0
            ? await supabase
                  .from("locations")
                  .select("id, label")
                  .eq("org_id", orgId)
                  .in(
                      "parent_location_id",
                      roomRows.map((r) => r.id),
                  )
            : { data: [] };
    const allRooms = [...roomRows, ...((grandRooms ?? []) as Array<{ id: string; label: string | null }>)];

    const zone = await calendarTimezoneFor(supabase, orgId, siteId);
    const today = localDateOf(new Date(), zone.timezone);
    const fromDate = isCalendarDate(sp.get("from")) ? String(sp.get("from")) : addCalendarDays(today, -31);
    const toDate = isCalendarDate(sp.get("to")) ? String(sp.get("to")) : addCalendarDays(today, 365);
    if (toDate < fromDate) return NextResponse.json({ error: "to is before from" }, { status: 400 });
    const span = (Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000;
    if (span > MAX_SPAN_DAYS) return NextResponse.json({ error: `At most ${MAX_SPAN_DAYS} days` }, { status: 400 });

    const cal = await loadSiteOperatingCalendar(supabase, {
        orgId,
        locationId: siteId,
        fromDate,
        toDate,
        roomIds: allRooms.map((r) => r.id),
    });
    const org = await fetchOperationalTimezoneForOrg(supabase, orgId);
    const accessForAuthoring = { permissionKeys: access.permissionKeys, dim };

    return NextResponse.json({
        site_id: siteId,
        site_label: (site as { label: string | null }).label ?? "Location",
        timezone: cal.timezone,
        timezone_resolved: cal.timezoneResolved,
        organization_timezone: org.source === "utc_fallback" || !isValidIanaTimeZone(org.iana) ? null : org.iana,
        today,
        from: fromDate,
        to: toDate,
        rooms: allRooms.map((r) => ({ id: r.id, label: r.label ?? "Room" })),
        entries: listCalendarEntries({ orgId, siteId, rows: cal.rows }),
        days: [...cal.days.values()].filter(
            (d) =>
                d.status !== "open" ||
                d.designations.length > 0 ||
                d.roomClosures.length > 0 ||
                d.overridden.length > 0 ||
                d.conflicts.length > 0 ||
                d.applied.length > 0,
        ),
        can_edit_organization: await canAuthorCalendarScope(supabase, orgId, accessForAuthoring, "organization", null),
        can_edit_location: await canAuthorCalendarScope(supabase, orgId, accessForAuthoring, "location", siteId),
    });
}

const ACTIONS = new Set<CalendarAuthoringAction>(["create", "revise", "withdraw", "restore"]);

/**
 * POST /api/admin/operating-calendar
 *
 * `{ mode: "preview" | "commit", action, entry_id?, entry?, idempotency_key? }`
 *
 * One body for both steps: the preview prepares the act and resolves it unwritten; the
 * commit prepares the same act and authors it through the Operational Expectations
 * intake. Authority: `settings.manage`, plus unrestricted site scope for an
 * organization entry or the site in scope for a location entry.
 */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const denied = requireOperatingCalendarCapability(access);
    if (denied) return denied;
    const orgId = access.orgId;
    const supabase = createAdminClient();

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const mode = body.mode === "commit" ? "commit" : body.mode === "preview" ? "preview" : null;
    if (!mode) return NextResponse.json({ error: "mode must be preview or commit" }, { status: 400 });
    const action = String(body.action ?? "") as CalendarAuthoringAction;
    if (!ACTIONS.has(action)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    const entryId = typeof body.entry_id === "string" && UUID_RE.test(body.entry_id) ? body.entry_id : null;

    let draft = null;
    if (action === "create" || action === "revise") {
        const parsed = parseOperatingCalendarDraft(body.entry);
        if (!parsed.ok) return NextResponse.json({ error: parsed.message, field: parsed.field }, { status: 400 });
        draft = parsed.draft;
    }

    const idempotencyKey =
        typeof body.idempotency_key === "string" && body.idempotency_key.trim().length >= 8
            ? `operating_calendar:${body.idempotency_key.trim().slice(0, 120)}`
            : `operating_calendar:${randomUUID()}`;

    const prepared = await prepareCalendarAct({
        supabase,
        orgId,
        actorUserId: access.userId,
        access: { permissionKeys: access.permissionKeys, dim: scopeDimensionsFromAccess(access) },
        action,
        draft,
        entryId,
        idempotencyKey,
    });
    if (prepared.status === "refused") {
        return NextResponse.json(
            { error: prepared.message, code: prepared.code, field: prepared.field ?? null },
            { status: prepared.httpStatus },
        );
    }

    if (mode === "preview") {
        const preview = await previewCalendarDates(supabase, { orgId, prepared });
        return NextResponse.json({
            mode: "preview",
            timezone: prepared.timezone,
            from: preview.fromDate,
            to: preview.toDate,
            sites: preview.sites,
            sites_not_previewed: preview.sitesNotPreviewed,
            dates: preview.dates,
        });
    }

    const result = await commitCalendarAct(prepared, { orgId, actorUserId: access.userId });
    switch (result.status) {
        case "authored":
            return NextResponse.json({ mode: "commit", entry_id: result.act.id, idempotent: result.idempotent });
        case "disabled":
            return NextResponse.json(
                { error: "Operational expectations are switched off for this organization.", code: "not_enabled" },
                { status: 409 },
            );
        case "rejected":
            return NextResponse.json({ error: result.message, code: result.code, field: result.field ?? null }, { status: 400 });
        case "conflict":
            return NextResponse.json({ error: result.message, code: result.code }, { status: 409 });
        default:
            return NextResponse.json({ error: "The calendar entry could not be saved." }, { status: 500 });
    }
}
