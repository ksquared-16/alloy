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
    resolveLimit,
    resolvePosition,
    resolveUpdatedSince,
} from "@/lib/platform/external/collection";
import { externalIdsForResources } from "@/lib/platform/external/integrationResourceRefs";
import {
    ATTENDANCE_EVENT_COLUMNS,
    toPublicAttendanceEvent,
    type CanonicalAttendanceEventRow,
} from "@/lib/platform/external/resources/attendanceEventResource";
import {
    attendanceAuthorityForPrincipal,
    resolveBoundarySites,
} from "@/lib/platform/principal/attendanceAuthorityAdapter";
import { ingestExternalAttendanceEvent } from "@/lib/childcareOperational/attendance/integration/ingestExternalAttendance";
import {
    parseSubmission,
    toPublicOutcome,
    type PublicItemOutcome,
} from "@/lib/platform/external/resources/attendanceSubmission";
import { ATTENDANCE_EVENT_KINDS } from "@/lib/childcareOperational/attendance/attendanceVocabulary";

export const dynamic = "force-dynamic";

const ROUTE = "/api/v1/attendance-events";
const OPERATION_ID = "listAttendanceEvents";
const SUBMIT_OPERATION_ID = "submitAttendanceEvents";
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

    // One position, from whichever token the caller supplied — a cursor within a pass, a sync
    // token between passes. They are compared identically, so they resolve to one concept.
    const positioned = resolvePosition(params.get("cursor"), params.get("since_token"));
    if (!positioned.ok) {
        return positioned.field === "cursor"
            ? fail("invalid_cursor", "The cursor is not valid. Restart pagination without one.")
            : fail("invalid_since_token", "The sync token is not valid. Restart with a full read.");
    }
    const cursor = positioned.position;

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
            { data: [], next_cursor: null, sync_token: null },
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
            sync_token: page.sync_token,
        },
        { status: 200, headers: { ...identityHeaders(identity), ...limitHeaders, "Cache-Control": "no-store" } },
    );

    return finish(response, activityIds);
}


/**
 * POST /api/v1/attendance-events — submit canonical attendance facts.
 *
 * ── THE SAME RESOURCE, AUTHORED ──
 *
 * A fact is submitted to the collection it will appear in, so a partner learns one noun and one
 * address. It is not a PATCH and there is no update: attendance is a ledger, and a mistake is
 * fixed by submitting a correction that names the fact it supersedes, or a reversal that voids one.
 *
 * ── THIS HANDLER DECIDES NOTHING ──
 *
 * Every judgement — is this identifier a child, is that child's site within reach, has this event
 * already been applied, does the correction target exist — belongs to
 * `ingestExternalAttendanceEvent`, which Alloy already uses for exactly this. The handler proves
 * the principal, converts it to attendance authority through the one-way adapter, validates the
 * SHAPE of the request, and translates vocabulary on the way back. A second opinion on any of those
 * questions would be a second answer.
 *
 * ── PER ITEM, NOT PER BATCH ──
 *
 * The authority is per event: each one gets its own durable evidence row and its own disposition,
 * and one unmapped identifier does not discard the fifty facts either side of it. So the response
 * is a result per item and the status is 200 whenever the batch was processed — including when
 * every item was refused. A partner reads outcomes, not a status code.
 */
export async function POST(request: NextRequest) {
    const startedAt = Date.now();
    const identity = resolveRequestIdentity(request.headers);
    const supabase = createAdminClient();

    const finish = async (response: NextResponse, extra: Record<string, unknown> = {}) => {
        await recordApiActivity(supabase, {
            requestId: identity.requestId,
            method: "POST",
            route: ROUTE,
            operationId: SUBMIT_OPERATION_ID,
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

    const scoped = requireOperationScope(ctx.principal, SUBMIT_OPERATION_ID);
    if (!scoped.ok) {
        return finish(
            apiError({
                code: scoped.code, type: "forbidden_scope", message: scoped.message,
                requestId: identity.requestId, headers: identityHeaders(identity),
            }),
            { ...activityIds, errorCode: scoped.code },
        );
    }

    // The platform's write class, not an attendance one. A batch spends one unit.
    const decision = await consumeRateLimit(
        supabase,
        installationBucket(ctx.installationId),
        RATE_LIMIT_POLICY.authenticatedWrite,
    );
    const limitHeaders = {
        "RateLimit-Limit": String(decision.limit),
        "RateLimit-Remaining": String(decision.remaining),
        "RateLimit-Reset": String(decision.resetSeconds),
    };
    if (!decision.allowed) {
        return finish(
            rateLimited(identity.requestId, decision.resetSeconds, {
                ...identityHeaders(identity), ...limitHeaders,
            }),
            { ...activityIds, errorCode: "rate_limited" },
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        body = null;
    }
    const parsed = parseSubmission(body);
    if (!parsed.ok) {
        return finish(
            apiError({
                code: parsed.code, type: "invalid_request", message: parsed.message,
                requestId: identity.requestId, headers: { ...identityHeaders(identity), ...limitHeaders },
            }),
            { ...activityIds, errorCode: parsed.code },
        );
    }

    /*
     * AUTHORITY BEFORE ANY EVENT IS CONSIDERED.
     *
     * The adapter resolves the installation's sites from the same SQL the read uses, and grants
     * nothing the installation does not already hold. An installation whose boundary reaches no
     * site is refused here rather than per item: it cannot author anywhere, and saying so once is
     * clearer than saying it two hundred times.
     */
    const authority = await attendanceAuthorityForPrincipal(supabase, ctx.principal);
    if (!authority.ok) {
        const noSites = authority.code === "no_sites_in_boundary";
        return finish(
            apiError({
                code: noSites ? "no_authorized_locations" : "internal_error",
                type: noSites ? "forbidden_resource" : "internal_error",
                message: noSites
                    ? "This installation is not authorized for any location, so it cannot record attendance."
                    : "Attendance could not be submitted.",
                requestId: identity.requestId,
                headers: { ...identityHeaders(identity), ...limitHeaders },
            }),
            { ...activityIds, errorCode: noSites ? "no_authorized_locations" : "internal_error" },
        );
    }

    const author = {
        kind: "installation" as const,
        installationId: ctx.installationId,
        orgId: ctx.organizationId,
        producerKey: ctx.principal.producerKey,
        /*
         * The author's label, from the application's own slug.
         *
         * It becomes `actor_label` on the evidence row an operator reads, so it has to name the
         * integration rather than a person. The canonical attendance fact does not carry it — the
         * public read publishes `actor_type` and `source`, never a named actor.
         */
        label: ctx.principal.applicationSlug || "external-integration",
        authority: authority.authority,
    };

    const results: PublicItemOutcome[] = [];
    for (const event of parsed.events) {
        /*
         * Sequential on purpose. The evidence inbox is keyed by (producer, event id, installation),
         * so two events in one batch never contend — but a correction naming an original EARLIER IN
         * THE SAME BATCH must find it committed, and only ordered application guarantees that.
         */
        const outcome = await ingestExternalAttendanceEvent({
            supabase,
            providerKey: author.producerKey,
            author,
            event: {
                externalEventId: event.externalEventId,
                eventKind: event.eventKind,
                externalChildId: event.externalChildId,
                externalRoomId: event.externalRoomId,
                externalFromRoomId: event.externalFromRoomId,
                externalToRoomId: event.externalToRoomId,
                physicalEventAt: event.occurredAt,
                providerRecordedAt: event.recordedAt,
                correctsExternalEventId: event.correctsExternalEventId,
                correctionMode: event.correctionMode,
            },
        });
        results.push(toPublicOutcome(event.externalEventId, outcome));
    }

    const response = NextResponse.json(
        { results },
        {
            status: 200,
            headers: { ...identityHeaders(identity), ...limitHeaders, "Cache-Control": "no-store" },
        },
    );
    return finish(response, activityIds);
}
