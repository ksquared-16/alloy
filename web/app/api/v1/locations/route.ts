/**
 * GET /api/v1/locations — the first canonical Alloy resource on the public API.
 *
 * Locations are the right first resource precisely because their ownership is
 * unambiguous: a site belongs to an organization and to nothing else. Children,
 * people and households carry identity and relationship-scope questions that
 * Thread 3 labelled `UNSAFE_OR_AMBIGUOUS`, and proving the boundary against those
 * first would mean debugging two problems at once.
 *
 * ── AUTHORITY IS APPLIED BEFORE THE ROWS EXIST ──
 *
 * This handler passes the principal's organization and boundary into
 * `list_external_locations`, which applies both INSIDE the select. The route
 * never filters a returned row for authority, so there is no ordering of
 * operations in which an unauthorized row is briefly in hand.
 *
 * Caller filters are passed separately and only ever narrow.
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
import {
    toPublicLocation,
    type CanonicalLocationRow,
} from "@/lib/platform/external/resources/locationResource";

export const dynamic = "force-dynamic";

const ROUTE = "/api/v1/locations";
const OPERATION_ID = "listLocations";
const ALLOWED_TYPES = new Set(["site", "unit"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    // The catalog decides, not this handler.
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

    const limitResult = resolveLimit(params.get("limit"));
    if (!limitResult.ok) {
        return finish(
            apiError({
                code: "invalid_limit", type: "invalid_request", message: limitResult.reason,
                requestId: identity.requestId, headers: identityHeaders(identity),
            }),
            { ...activityIds, errorCode: "invalid_limit" },
        );
    }

    const rawCursor = params.get("cursor");
    const cursor = rawCursor ? decodeCursor(rawCursor) : null;
    if (rawCursor && !cursor) {
        return finish(
            apiError({
                code: "invalid_cursor", type: "invalid_request",
                message: "The cursor is not valid. Restart pagination without one.",
                requestId: identity.requestId, headers: identityHeaders(identity),
            }),
            { ...activityIds, errorCode: "invalid_cursor" },
        );
    }

    const watermark = resolveUpdatedSince(params.get("updated_since"));
    if (!watermark.ok) {
        return finish(
            apiError({
                code: "invalid_updated_since", type: "invalid_request", message: watermark.reason,
                requestId: identity.requestId, headers: identityHeaders(identity),
            }),
            { ...activityIds, errorCode: "invalid_updated_since" },
        );
    }

    // Filters narrow. They are validated for SHAPE here and applied inside the
    // function alongside the boundary — never before it, and never instead of it.
    const typeParam = params.get("type");
    if (typeParam && !ALLOWED_TYPES.has(typeParam)) {
        return finish(
            apiError({
                code: "invalid_filter", type: "invalid_request",
                message: "type must be 'site' or 'unit'.",
                requestId: identity.requestId, headers: identityHeaders(identity),
            }),
            { ...activityIds, errorCode: "invalid_filter" },
        );
    }

    const parentId = params.get("parent_id");
    const locationId = params.get("location_id");
    for (const [name, value] of [["parent_id", parentId], ["location_id", locationId]] as const) {
        if (value && !UUID_RE.test(value)) {
            return finish(
                apiError({
                    code: "invalid_filter", type: "invalid_request",
                    message: `${name} must be a valid identifier.`,
                    requestId: identity.requestId, headers: identityHeaders(identity),
                }),
                { ...activityIds, errorCode: "invalid_filter" },
            );
        }
    }

    const boundary = ctx.resourceBoundary;
    const { data, error } = await supabase.rpc("list_external_locations", {
        p_org_id: ctx.organizationId,
        p_boundary_mode: boundary.mode,
        p_boundary: boundary.mode === "locations" ? [...boundary.locationIds] : [],
        // One extra row decides whether another page exists.
        p_limit: limitResult.limit + 1,
        p_cursor_sort: cursor?.sortKey ?? null,
        p_cursor_id: cursor?.id ?? null,
        p_types: typeParam ? [typeParam] : null,
        p_parent_id: parentId,
        p_location_ids: locationId ? [locationId] : null,
        p_updated_since: watermark.since,
    });

    if (error) {
        return finish(
            apiError({
                code: "internal_error", type: "internal_error",
                message: "Locations could not be read.",
                requestId: identity.requestId, headers: identityHeaders(identity),
            }),
            { ...activityIds, errorCode: "internal_error" },
        );
    }

    const rows = (data ?? []) as CanonicalLocationRow[];
    const page = buildPage(rows, limitResult.limit, (row) => ({ sortKey: row.sort_key, id: row.id }));

    const response = NextResponse.json(
        { data: page.data.map(toPublicLocation), next_cursor: page.next_cursor },
        { status: 200, headers: { ...identityHeaders(identity), ...limitHeaders, "Cache-Control": "no-store" } },
    );

    return finish(response, activityIds);
}
