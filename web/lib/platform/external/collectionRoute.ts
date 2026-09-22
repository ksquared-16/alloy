/**
 * One handler for every authority-bound public collection.
 *
 * ── WHY A FACTORY AND NOT EIGHT ROUTES ──
 *
 * Locations and Attendance each hand-wrote the same sequence: resolve identity, resolve the
 * principal, ask the catalog for the scope, consume the rate budget, parse the collection grammar,
 * apply the boundary, page, record activity. Two copies was a reasonable price for proving the
 * shape. Eight more would be how the tenth resource quietly forgets `updated_since`, or orders by
 * the wrong column, or — the one that actually matters — resolves its boundary slightly
 * differently from the resource beside it.
 *
 * The order below is the security order and it is not negotiable: a caller with no credential is
 * refused before the scope is consulted, a caller with the wrong scope is refused before any
 * budget is spent, and the boundary is resolved before a single row is requested. Every resource
 * inherits that sequence by construction rather than by review.
 *
 * What a resource still owns is what only it can know: which SQL authority answers for it, which
 * filters narrow it, and how one of its rows becomes a public object.
 */

import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

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
import { requireOperationScope, type PublicOperationId } from "@/lib/platform/external/scopeCatalog";
import { resolveBoundarySites } from "@/lib/platform/principal/attendanceAuthorityAdapter";
import {
    buildPage,
    resolveLimit,
    resolvePosition,
    resolveUpdatedSince,
} from "@/lib/platform/external/collection";
import type { ApplicationPrincipal } from "@/lib/platform/principal/platformPrincipalTypes";

/** A row as the SQL authority returns it: whatever the function selects, plus the two page keys. */
export type CollectionRow = { id: string; sort_key: string } & Record<string, unknown>;

export type FilterFailure = { code: string; message: string };

export type CollectionContext = {
    readonly principal: ApplicationPrincipal;
    readonly organizationId: string;
    readonly installationId: string;
    /**
     * The sites this installation may reach, already resolved through the SAME query
     * `GET /api/v1/locations` answers. A resource never derives its own territory.
     */
    readonly siteIds: readonly string[];
    readonly boundaryMode: "org_wide" | "locations";
};

export type CollectionDefinition<TPublic> = {
    route: string;
    operationId: PublicOperationId;
    /** Plural, lowercase, for the one error sentence a partner sees when the read fails. */
    subject: string;
    /** The SQL authority. Boundary and filters are applied inside it, never after it. */
    rpc: string;
    /**
     * Resource-specific parameters, including the caller's filters.
     *
     * Returning a failure refuses the request BEFORE the query runs — a malformed filter is a
     * caller error, not an empty page. Filters may only narrow: the boundary arguments are added
     * by the factory afterwards and cannot be overwritten from here.
     */
    params: (
        params: URLSearchParams,
        ctx: CollectionContext,
    ) => { ok: true; values: Record<string, unknown> } | { ok: false; error: FilterFailure };
    /**
     * One row of SQL truth into one public object. The allow-list lives here.
     *
     * Receives the request context because some resources publish different SHAPES to different
     * grants — Relationships omits the contact keys entirely without `relationships.contact.read`,
     * so a partner can tell "not granted" from "granted but empty".
     */
    toPublic: (row: CollectionRow, ctx: CollectionContext) => TPublic;
};

/**
 * Build the GET handler for an authority-bound collection.
 */
export function externalCollectionRoute<TPublic>(def: CollectionDefinition<TPublic>) {
    return async function GET(request: NextRequest) {
        const startedAt = Date.now();
        const identity = resolveRequestIdentity(request.headers);
        const supabase: SupabaseClient = createAdminClient();

        const finish = async (response: NextResponse, extra: Record<string, unknown> = {}) => {
            await recordApiActivity(supabase, {
                requestId: identity.requestId,
                method: "GET",
                route: def.route,
                operationId: def.operationId,
                statusCode: response.status,
                outcome: outcomeForStatus(response.status),
                latencyMs: Date.now() - startedAt,
                ...extra,
            });
            return response;
        };

        /* See the operation factory: the budget travels on refusals too, not only on success. */
        let budgetHeaders: Record<string, string> = {};
        const fail = (code: string, type: "invalid_request" | "internal_error" | "forbidden_scope", message: string, ids: Record<string, unknown>) =>
            finish(
                apiError({
                    code, type, message,
                    requestId: identity.requestId,
                    headers: { ...identityHeaders(identity), ...budgetHeaders },
                }),
                { ...ids, errorCode: code },
            );

        // 1. Who is calling. No credential, no further questions.
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
        const ids = {
            orgId: ctx.organizationId,
            applicationId: ctx.applicationId,
            installationId: ctx.installationId,
            tokenId: ctx.tokenId,
        };

        // 2. The catalog decides the scope, not this handler.
        const scoped = requireOperationScope(ctx.principal, def.operationId);
        if (!scoped.ok) return fail(scoped.code, "forbidden_scope", scoped.message, ids);

        // 3. Budget, after authorization so an unauthorized caller cannot drain it.
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
        budgetHeaders = limitHeaders;
        if (!decision.allowed) {
            return finish(
                rateLimited(identity.requestId, decision.resetSeconds, {
                    ...identityHeaders(identity),
                    ...limitHeaders,
                }),
                { ...ids, errorCode: "rate_limited" },
            );
        }

        const search = request.nextUrl.searchParams;

        const limitResult = resolveLimit(search.get("limit"));
        if (!limitResult.ok) return fail("invalid_limit", "invalid_request", limitResult.reason, ids);

        const positioned = resolvePosition(search.get("cursor"), search.get("since_token"));
        if (!positioned.ok) {
            const code = positioned.field === "cursor" ? "invalid_cursor" : "invalid_since_token";
            return fail(
                code, "invalid_request",
                positioned.field === "cursor"
                    ? "The cursor is not valid. Restart pagination without one."
                    : "The sync token is not valid. Restart with a full read.",
                ids,
            );
        }
        const cursor = positioned.position;

        const watermark = resolveUpdatedSince(search.get("updated_since"));
        if (!watermark.ok) return fail("invalid_updated_since", "invalid_request", watermark.reason, ids);

        /*
         * 4. The territory, resolved once and from one place.
         *
         * `resolveBoundarySites` runs `list_external_locations`, so what a resource may reach can
         * never exceed what `GET /api/v1/locations` would return for the same installation. An
         * installation whose boundary contains no site gets an empty page, never an unfiltered query.
         */
        const sites = await resolveBoundarySites(supabase, ctx.principal);
        if (!sites.ok) {
            return fail("internal_error", "internal_error", `${capitalize(def.subject)} could not be read.`, ids);
        }

        const boundaryMode = ctx.principal.boundary.mode;
        const collectionCtx: CollectionContext = {
            principal: ctx.principal,
            organizationId: ctx.organizationId,
            installationId: ctx.installationId,
            siteIds: sites.siteIds,
            boundaryMode,
        };

        if (boundaryMode !== "org_wide" && sites.siteIds.length === 0) {
            return finish(emptyPage(identity, limitHeaders), ids);
        }

        const extra = def.params(search, collectionCtx);
        if (!extra.ok) return fail(extra.error.code, "invalid_request", extra.error.message, ids);

        const { data, error } = await supabase.rpc(def.rpc, {
            p_org_id: ctx.organizationId,
            p_boundary_mode: boundaryMode,
            p_site_ids: [...sites.siteIds],
            // One extra row decides whether another page exists.
            p_limit: limitResult.limit + 1,
            p_cursor_sort: cursor?.sortKey ?? null,
            p_cursor_id: cursor?.id ?? null,
            p_updated_since: watermark.since,
            ...extra.values,
        });

        if (error) {
            return fail("internal_error", "internal_error", `${capitalize(def.subject)} could not be read.`, ids);
        }

        const rows = (data ?? []) as CollectionRow[];
        const page = buildPage(rows, limitResult.limit, (row) => ({ sortKey: row.sort_key, id: row.id }));

        const response = NextResponse.json(
            {
                data: page.data.map((row) => def.toPublic(row, collectionCtx)),
                next_cursor: page.next_cursor,
                sync_token: page.sync_token,
            },
            {
                status: 200,
                headers: { ...identityHeaders(identity), ...limitHeaders, "Cache-Control": "no-store" },
            },
        );
        return finish(response, ids);
    };
}

function emptyPage(identity: ReturnType<typeof resolveRequestIdentity>, limitHeaders: Record<string, string>) {
    return NextResponse.json(
        { data: [], next_cursor: null, sync_token: null },
        {
            status: 200,
            headers: { ...identityHeaders(identity), ...limitHeaders, "Cache-Control": "no-store" },
        },
    );
}

function capitalize(subject: string): string {
    return subject.charAt(0).toUpperCase() + subject.slice(1);
}

/** Shared filter parsing, so "what is a valid id" has one answer across every resource. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidFilter(
    params: URLSearchParams,
    name: string,
): { ok: true; value: string | null } | { ok: false; error: FilterFailure } {
    const raw = params.get(name);
    if (raw === null) return { ok: true, value: null };
    if (!UUID_RE.test(raw)) {
        return { ok: false, error: { code: "invalid_filter", message: `${name} must be a valid identifier.` } };
    }
    return { ok: true, value: raw };
}

export function isoDateFilter(
    params: URLSearchParams,
    name: string,
): { ok: true; value: string | null } | { ok: false; error: FilterFailure } {
    const raw = params.get(name);
    if (raw === null) return { ok: true, value: null };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) {
        return { ok: false, error: { code: "invalid_filter", message: `${name} must be a date in YYYY-MM-DD form.` } };
    }
    return { ok: true, value: raw };
}
