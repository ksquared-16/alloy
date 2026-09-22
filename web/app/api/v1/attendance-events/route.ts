/**
 * GET /api/v1/attendance-events — canonical attendance facts, append-only.
 *
 * ── WHY THIS IS THE FIRST RESOURCE AFTER LOCATIONS ──
 *
 * Every other candidate resource needs an archive law first: a child who leaves, a placement that
 * ends, a room that closes — an incremental consumer must be told those happened, and the shipped
 * collection contract cannot say it. Attendance needs no such law, because nothing here is ever
 * removed. A mistake is corrected by appending a correction or a reversal that names the event it
 * supersedes, so the feed is complete by construction and a consumer that has read every page has
 * the whole truth.
 *
 * ── AUTHORITY IS THE SAME AUTHORITY AS LOCATIONS ──
 *
 * The site set comes from `resolveBoundarySites`, which calls `list_external_locations` — the same
 * function `GET /api/v1/locations` calls, applying the organization and the boundary inside the
 * select. This route therefore cannot reach a site that `GET /api/v1/locations` would not return
 * for the same installation. That is not a coincidence to be maintained; it is the same query.
 *
 * An installation whose boundary resolves to no site reads nothing. Empty means denied here, as it
 * does in the attendance authority adapter, and it is checked before any row is selected.
 *
 * ── FILTERS NARROW ──
 *
 * `site_id` is intersected with the authorized set rather than replacing it, so naming a site
 * outside the boundary narrows to nothing instead of widening to it. It answers with an empty page
 * rather than a refusal, because a refusal would confirm that the site exists.
 */

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { apiError, invalidCredential, rateLimited } from "@/lib/platform/external/apiErrors";
import { outcomeForStatus, recordApiActivity } from "@/lib/platform/external/apiActivity";
import {
    consumeRateLimit,
    installationBucket,
    RATE_LIMIT_POLICY,
} from "@/lib/platform/external/rateLimit";
import { identityHeaders, resolveRequestIdentity } from "@/lib/platform/external/requestContext";
import { requireExternalPrincipal } from "@/lib/platform/external/externalRequest";
import { requireOperationScope } from "@/lib/platform/external/scopeCatalog";
import {
    buildPage,
    decodeCursor,
    resolveLimit,
    resolveUpdatedSince,
} from "@/lib/platform/external/collection";
import { externalIdsForResources } from "@/lib/platform/external/integrationResourceRefs";
import {
    ATTENDANCE_EVENT_COLUMNS,
    toPublicAttendanceEvent,
    type CanonicalAttendanceEventRow,
} from "@/lib/platform/external/resources/attendanceEventResource";
import { resolveBoundarySites } from "@/lib/platform/principal/attendanceAuthorityAdapter";
import { ATTENDANCE_EVENT_KINDS } from "@/lib/childcareOperational/attendance/attendanceVocabulary";

export const dynamic = "force-dynamic";

const ROUTE = "/api/v1/attendance-events";
const OPERATION_ID = "listAttendanceEvents";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
    const startedAt = Date.now();
    const identity = resolveRequestIdentity(request.headers);
    const supabase = createAdminClient();

    const finish = async (response: NextResponse, extra: Record<string, unknown> = {}) => {
        await recordApiActivity(supabase, {
            requestId: identity.requestId,
            method: "GET",
            route: ROUTE,
            operationId: OPERATION_ID,
            statusCode: response.status,
            outcome: outcomeForStatus(response.status),
            latencyMs: Date.now() - startedAt,
            ...extra,
        });
        return response;
    };

    const auth = await requireExternalPrincipal(supabase, request.headers, identity.requestId);
    if (!auth.ok) {
        const response = invalidCredential(identity.requestId);
        for (const [k, v] of Object.entries(identityHeaders(identity))) response.headers.set(k, v);
        return finish(response, {
            orgId: auth.orgId ?? null,
            installationId: auth.installationId ?? null,
            tokenId: auth.tokenId ?? null,
            errorCode: "invalid_credential",
        });
    }

    const ctx = auth.context;
    const activityIds = {
        orgId: ctx.organizationId,
        applicationId: ctx.applicationId,
        installationId: ctx.installationId,
        tokenId: ctx.tokenId,
    };

    const scoped = requireOperationScope(ctx.principal, OPERATION_ID);
    if (!scoped.ok) {
        return finish(
            apiError({
                code: scoped.code,
                type: "forbidden_scope",
                message: scoped.message,
                requestId: identity.requestId,
                headers: identityHeaders(identity),
            }),
            { ...activityIds, errorCode: scoped.code },
        );
    }

    const decision = await consumeRateLimit(
        supabase,
        installationBucket(ctx.installationId),
        RATE_LIMIT_POLICY.authenticatedRead,
    );
    const limitHeaders = {
        "RateLimit-Limit": String(decision.limit),
        "RateLimit-Remaining": String(decision.remaining),
        "RateLimit-Reset": String(decision.resetSeconds),
    };
    if (!decision.allowed) {
        return finish(
            rateLimited(identity.requestId, decision.resetSeconds, {
                ...identityHeaders(identity),
                ...limitHeaders,
            }),
            { ...activityIds, errorCode: "rate_limited" },
        );
    }

    const params = request.nextUrl.searchParams;
    const fail = (code: string, message: string) =>
        finish(
            apiError({
                code, type: "invalid_request", message,
                requestId: identity.requestId, headers: identityHeaders(identity),
            }),
            { ...activityIds, errorCode: code },
        );

    const limitResult = resolveLimit(params.get("limit"));
    if (!limitResult.ok) return fail("invalid_limit", limitResult.reason);

    const rawCursor = params.get("cursor");
    const cursor = rawCursor ? decodeCursor(rawCursor) : null;
    if (rawCursor && !cursor) {
        return fail("invalid_cursor", "The cursor is not valid. Restart pagination without one.");
    }

    const watermark = resolveUpdatedSince(params.get("updated_since"));
    if (!watermark.ok) return fail("invalid_updated_since", watermark.reason);

    const siteId = params.get("site_id");
    const childId = params.get("child_id");
    for (const [name, value] of [["site_id", siteId], ["child_id", childId]] as const) {
        if (value && !UUID_RE.test(value)) {
            return fail("invalid_filter", `${name} must be a valid identifier.`);
        }
    }

    const eventKind = params.get("event_kind");
    if (eventKind && !(ATTENDANCE_EVENT_KINDS as readonly string[]).includes(eventKind)) {
        return fail("invalid_filter", `event_kind must be one of: ${ATTENDANCE_EVENT_KINDS.join(", ")}.`);
    }

    const serviceDateFrom = params.get("service_date_from");
    const serviceDateTo = params.get("service_date_to");
    for (const [name, value] of [
        ["service_date_from", serviceDateFrom],
        ["service_date_to", serviceDateTo],
    ] as const) {
        if (value && !ISO_DATE_RE.test(value)) {
            return fail("invalid_filter", `${name} must be a date in YYYY-MM-DD form.`);
        }
    }

    /*
     * THE BOUNDARY, BEFORE ANY ROW EXISTS.
     *
     * Resolved from the same SQL authority Locations uses. An installation with no site in its
     * boundary is denied by returning nothing — never by falling through to an unfiltered query.
     */
    const sites = await resolveBoundarySites(supabase, ctx.principal);
    if (!sites.ok) {
        return finish(
            apiError({
                code: "internal_error", type: "internal_error",
                message: "Attendance events could not be read.",
                requestId: identity.requestId, headers: identityHeaders(identity),
            }),
            { ...activityIds, errorCode: "internal_error" },
        );
    }

    // A caller-named site NARROWS the authorized set. It can never replace it.
    const authorizedSites = siteId
        ? sites.siteIds.filter((id) => id.toLowerCase() === siteId.toLowerCase())
        : sites.siteIds;

    if (authorizedSites.length === 0) {
        const empty = NextResponse.json(
            { data: [], next_cursor: null },
            { status: 200, headers: { ...identityHeaders(identity), ...limitHeaders, "Cache-Control": "no-store" } },
        );
        return finish(empty, activityIds);
    }

    /*
     * ORDERED BY WHEN ALLOY RECORDED IT, NOT WHEN IT HAPPENED.
     *
     * `(created_at, id)` is the checkpoint, matching the governed grammar's `(sort key, id)` shape.
     * The id tiebreak is not optional: two facts recorded in the same millisecond would otherwise
     * straddle a page boundary and be skipped or repeated forever. Rows are never updated, so for
     * this resource the recording time IS the last-modified time and `updated_since` is exact.
     */
    let query = supabase
        .from("child_attendance_events")
        .select(ATTENDANCE_EVENT_COLUMNS)
        .eq("org_id", ctx.organizationId)
        .in("site_location_id", authorizedSites)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(limitResult.limit + 1);

    if (childId) query = query.eq("customer_member_id", childId);
    if (eventKind) query = query.eq("event_kind", eventKind);
    if (serviceDateFrom) query = query.gte("service_date", serviceDateFrom);
    if (serviceDateTo) query = query.lte("service_date", serviceDateTo);
    if (watermark.since) query = query.gt("created_at", watermark.since);

    if (cursor) {
        // Strictly after the cursor position in (created_at, id) order.
        query = query.or(
            `created_at.gt.${cursor.sortKey},and(created_at.eq.${cursor.sortKey},id.gt.${cursor.id})`,
        );
    }

    const { data, error } = await query;
    if (error) {
        return finish(
            apiError({
                code: "internal_error", type: "internal_error",
                message: "Attendance events could not be read.",
                requestId: identity.requestId, headers: identityHeaders(identity),
            }),
            { ...activityIds, errorCode: "internal_error" },
        );
    }

    const rows = (data ?? []) as unknown as CanonicalAttendanceEventRow[];
    const page = buildPage(rows, limitResult.limit, (row) => ({
        sortKey: row.created_at,
        id: row.id,
    }));

    // Decoration, not authority: this installation's own names for the children on this page.
    const aliases = await externalIdsForResources({
        supabase,
        installationId: ctx.installationId,
        orgId: ctx.organizationId,
        resourceType: "child",
        alloyResourceIds: page.data.map((row) => row.customer_member_id),
    });

    const response = NextResponse.json(
        {
            data: page.data.map((row) =>
                toPublicAttendanceEvent(row, aliases.get(row.customer_member_id) ?? null),
            ),
            next_cursor: page.next_cursor,
        },
        { status: 200, headers: { ...identityHeaders(identity), ...limitHeaders, "Cache-Control": "no-store" } },
    );

    return finish(response, activityIds);
}
