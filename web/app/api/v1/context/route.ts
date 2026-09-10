/**
 * GET /api/v1/context — the first authenticated external read, and deliberately
 * the smallest one possible.
 *
 * It returns the caller's own installation context and touches no domain data at
 * all. That is the point: it proves the whole boundary — token verification,
 * tenant derivation, scope and boundary resolution, error shape, correlation,
 * activity logging — while being structurally incapable of leaking a child, a
 * family or another tenant. A boundary defect found here is visible; the same
 * defect found first through a resource endpoint would be hiding behind domain
 * complexity.
 *
 * It is also the right first call for an integrator: it answers "which tenant am
 * I and what may I do" before anything depends on the answer.
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

export const dynamic = "force-dynamic";

const ROUTE = "/api/v1/context";
const OPERATION_ID = "getContext";

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
        // `installation_suspended` and `installation_revoked` are safe to name:
        // the token verified before that state was consulted, so the caller has
        // already proven possession and learns nothing it could not confirm.
        const named = auth.refusal === "installation_suspended" || auth.refusal === "installation_revoked";
        const response = named
            ? apiError({
                  code: auth.refusal,
                  type: "unauthenticated",
                  message: "This installation is not currently active.",
                  requestId: identity.requestId,
                  headers: identityHeaders(identity),
              })
            : invalidCredential(identity.requestId);

        for (const [k, v] of Object.entries(identityHeaders(identity))) response.headers.set(k, v);

        return finish(response, {
            orgId: auth.orgId ?? null,
            installationId: auth.installationId ?? null,
            tokenId: auth.tokenId ?? null,
            errorCode: named ? auth.refusal : "invalid_credential",
        });
    }

    const ctx = auth.context;

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
            {
                orgId: ctx.organizationId,
                applicationId: ctx.applicationId,
                installationId: ctx.installationId,
                tokenId: ctx.tokenId,
                errorCode: "rate_limited",
            },
        );
    }

    // Only what proves who the caller is and what it may do. No internal
    // permission keys, no roles, no credential or token material, no
    // organization configuration, and nothing about any person.
    const response = NextResponse.json(
        {
            application: {
                id: ctx.principal.applicationId,
                slug: ctx.principal.applicationSlug,
                environment: ctx.principal.environment,
            },
            installation: {
                id: ctx.installationId,
                status: "active",
            },
            organization: {
                id: ctx.organizationId,
            },
            scopes: ctx.scopes,
            resource_boundary:
                ctx.resourceBoundary.mode === "org_wide"
                    ? { mode: "org_wide" }
                    : { mode: "locations", location_ids: ctx.resourceBoundary.locationIds },
        },
        { status: 200, headers: { ...identityHeaders(identity), ...limitHeaders, "Cache-Control": "no-store" } },
    );

    return finish(response, {
        orgId: ctx.organizationId,
        applicationId: ctx.applicationId,
        installationId: ctx.installationId,
        tokenId: ctx.tokenId,
    });
}
