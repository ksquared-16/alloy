/**
 * GET /api/v1/schedule-days — "who is expected on Tuesday?"
 *
 * ── A PROJECTION, AND SHAPED SO IT CANNOT BE MISTAKEN FOR ONE ──
 *
 * These rows are GENERATED from committed schedule assignments and their recurring patterns. They
 * are not stored, have never been stored, and have no independent change history. So this response
 * deliberately carries no `next_cursor`, no `sync_token` and no `updated_since`: a generated row
 * has no change clock, and publishing a watermark it could not honour would be the one thing the
 * exact-sync law forbids. A partner that needs change detection synchronises
 * `/api/v1/schedule-assignments`, which is the canonical authority these days are derived from.
 *
 * What it offers instead is a deterministic window: name a closed date range, receive the days
 * that range implies. The same window over the same committed authority always yields the same
 * rows in the same order.
 *
 * The window is bounded because an unbounded one is a denial-of-service with extra steps: a
 * hundred children times ten years is a request nobody meant to make.
 */

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { apiError, invalidCredential, rateLimited } from "@/lib/platform/external/apiErrors";
import { outcomeForStatus, recordApiActivity } from "@/lib/platform/external/apiActivity";
import { consumeRateLimit, installationBucket, RATE_LIMIT_POLICY } from "@/lib/platform/external/rateLimit";
import { identityHeaders, resolveRequestIdentity } from "@/lib/platform/external/requestContext";
import { requireExternalPrincipal } from "@/lib/platform/external/externalRequest";
import { requireOperationScope } from "@/lib/platform/external/scopeCatalog";
import { resolveBoundarySites } from "@/lib/platform/principal/attendanceAuthorityAdapter";
import { isoDateFilter, uuidFilter } from "@/lib/platform/external/collectionRoute";
import { toPublicScheduleDay } from "@/lib/platform/external/resources/serviceStateResources";

export const dynamic = "force-dynamic";

const ROUTE = "/api/v1/schedule-days";
const OPERATION_ID = "listScheduleDays";
/** Longer than any roster question a partner actually asks, short enough to stay a query. */
const MAX_WINDOW_DAYS = 92;

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
    const ids = {
        orgId: ctx.organizationId,
        applicationId: ctx.applicationId,
        installationId: ctx.installationId,
        tokenId: ctx.tokenId,
    };
    const fail = (code: string, type: "invalid_request" | "internal_error" | "forbidden_scope", message: string) =>
        finish(
            apiError({ code, type, message, requestId: identity.requestId, headers: identityHeaders(identity) }),
            { ...ids, errorCode: code },
        );

    const scoped = requireOperationScope(ctx.principal, OPERATION_ID);
    if (!scoped.ok) return fail(scoped.code, "forbidden_scope", scoped.message);

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
            rateLimited(identity.requestId, decision.resetSeconds, { ...identityHeaders(identity), ...limitHeaders }),
            { ...ids, errorCode: "rate_limited" },
        );
    }

    const params = request.nextUrl.searchParams;

    const from = isoDateFilter(params, "from");
    if (!from.ok) return fail(from.error.code, "invalid_request", from.error.message);
    const to = isoDateFilter(params, "to");
    if (!to.ok) return fail(to.error.code, "invalid_request", to.error.message);
    if (!from.value || !to.value) {
        return fail(
            "invalid_request", "invalid_request",
            "from and to are required. This is a windowed projection, not a collection.",
        );
    }
    const spanDays = (Date.parse(`${to.value}T00:00:00Z`) - Date.parse(`${from.value}T00:00:00Z`)) / 86_400_000;
    if (spanDays < 0) return fail("invalid_request", "invalid_request", "to must not be earlier than from.");
    if (spanDays + 1 > MAX_WINDOW_DAYS) {
        return fail("invalid_request", "invalid_request", `The window must not exceed ${MAX_WINDOW_DAYS} days.`);
    }

    const child = uuidFilter(params, "child_id");
    if (!child.ok) return fail(child.error.code, "invalid_request", child.error.message);
    const site = uuidFilter(params, "site_id");
    if (!site.ok) return fail(site.error.code, "invalid_request", site.error.message);

    const sites = await resolveBoundarySites(supabase, ctx.principal);
    if (!sites.ok) return fail("internal_error", "internal_error", "Schedule days could not be read.");

    const boundaryMode = ctx.principal.boundary.mode;
    const emptyBody = { data: [], from: from.value, to: to.value, derived_from: "schedule_assignments" };
    if (boundaryMode !== "org_wide" && sites.siteIds.length === 0) {
        return finish(
            NextResponse.json(emptyBody, {
                status: 200,
                headers: { ...identityHeaders(identity), ...limitHeaders, "Cache-Control": "no-store" },
            }),
            ids,
        );
    }

    const { data, error } = await supabase.rpc("project_external_schedule_days", {
        p_org_id: ctx.organizationId,
        p_boundary_mode: boundaryMode,
        p_site_ids: [...sites.siteIds],
        p_from: from.value,
        p_to: to.value,
        p_child_id: child.value,
        p_site_id: site.value,
    });
    if (error) return fail("internal_error", "internal_error", "Schedule days could not be read.");

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const response = NextResponse.json(
        {
            data: rows.map(toPublicScheduleDay),
            from: from.value,
            to: to.value,
            /*
             * Named in the payload so a partner reading a stored response months later can still
             * tell this was derived, and from what.
             */
            derived_from: "schedule_assignments",
        },
        {
            status: 200,
            headers: { ...identityHeaders(identity), ...limitHeaders, "Cache-Control": "no-store" },
        },
    );
    return finish(response, ids);
}
