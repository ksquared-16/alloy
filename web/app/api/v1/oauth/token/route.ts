/**
 * POST /api/v1/oauth/token — the one door into the public API.
 *
 * Exchanges a long-lived installation credential for a short-lived bearer token,
 * so that the credential itself is not replayed into every proxy log, error
 * tracker and support ticket on every call. This is the only unauthenticated
 * endpoint the public API has, and it is therefore the one that gets the tightest
 * budget.
 *
 * ── ORDER MATTERS HERE ──
 *
 * Rate limiting runs BEFORE credential verification. Verification is a database
 * lookup; letting an unauthenticated caller drive it without a budget is how a
 * credential-stuffing run gets free work out of us. The limiter is keyed on the
 * presented client_id and the caller's hashed address — never on the secret,
 * because keying on the value being guessed hands every wrong guess a fresh
 * budget.
 */

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabaseAdmin";
import { issueAccessToken } from "@/lib/platform/principal/accessToken";
import { resolveApplicationPrincipal } from "@/lib/platform/principal/resolveApplicationPrincipal";
import { recordSecurityAudit } from "@/lib/platform/principal/securityAudit";
import { apiError, invalidCredential, rateLimited } from "@/lib/platform/external/apiErrors";
import { outcomeForStatus, recordApiActivity } from "@/lib/platform/external/apiActivity";
import {
    consumeRateLimit,
    RATE_LIMIT_POLICY,
    tokenExchangeBucket,
} from "@/lib/platform/external/rateLimit";
import {
    clientIpHash,
    identityHeaders,
    resolveRequestIdentity,
} from "@/lib/platform/external/requestContext";

export const dynamic = "force-dynamic";

const ROUTE = "/api/v1/oauth/token";
const OPERATION_ID = "issueAccessToken";

function rateLimitHeaders(d: { limit: number; remaining: number; resetSeconds: number }) {
    return {
        "RateLimit-Limit": String(d.limit),
        "RateLimit-Remaining": String(d.remaining),
        "RateLimit-Reset": String(d.resetSeconds),
    };
}

export async function POST(request: NextRequest) {
    const startedAt = Date.now();
    const identity = resolveRequestIdentity(request.headers);
    const supabase = createAdminClient();

    const finish = async (response: NextResponse, extra: Record<string, unknown> = {}) => {
        await recordApiActivity(supabase, {
            requestId: identity.requestId,
            method: "POST",
            route: ROUTE,
            operationId: OPERATION_ID,
            statusCode: response.status,
            outcome: outcomeForStatus(response.status),
            latencyMs: Date.now() - startedAt,
            ...extra,
        });
        return response;
    };

    let clientId = "";
    let clientSecret = "";
    let grantType = "";

    try {
        const contentType = request.headers.get("content-type") ?? "";
        if (contentType.includes("application/x-www-form-urlencoded")) {
            const form = await request.formData();
            grantType = String(form.get("grant_type") ?? "");
            clientId = String(form.get("client_id") ?? "");
            clientSecret = String(form.get("client_secret") ?? "");
        } else {
            const body = (await request.json()) as Record<string, unknown>;
            grantType = String(body.grant_type ?? "");
            clientId = String(body.client_id ?? "");
            clientSecret = String(body.client_secret ?? "");
        }
    } catch {
        return finish(
            apiError({
                code: "invalid_request",
                type: "invalid_request",
                message: "Request body could not be parsed.",
                requestId: identity.requestId,
                headers: identityHeaders(identity),
            }),
        );
    }

    if (grantType !== "client_credentials") {
        return finish(
            apiError({
                code: "unsupported_grant_type",
                type: "invalid_request",
                message: "Only grant_type=client_credentials is supported.",
                requestId: identity.requestId,
                headers: identityHeaders(identity),
            }),
        );
    }

    // Budget first — see the header.
    const decision = await consumeRateLimit(
        supabase,
        tokenExchangeBucket(clientId, clientIpHash(request.headers)),
        RATE_LIMIT_POLICY.tokenExchange,
    );
    if (!decision.allowed) {
        return finish(
            rateLimited(identity.requestId, decision.resetSeconds, {
                ...identityHeaders(identity),
                ...rateLimitHeaders(decision),
            }),
        );
    }

    const resolved = await resolveApplicationPrincipal(supabase, { clientId, clientSecret });

    if (!resolved.ok) {
        // Specific in the audit, which the tenant owns; coarse on the wire, which
        // a prober reads.
        await recordSecurityAudit(supabase, {
            eventType: "authentication.rejected",
            outcome: "denied",
            orgId: resolved.orgId ?? null,
            installationId: resolved.installationId ?? null,
            credentialId: resolved.credentialId ?? null,
            reasonCode: resolved.auditReason,
            correlationId: identity.requestId,
            clientIpHash: clientIpHash(request.headers),
        });

        const response = invalidCredential(identity.requestId);
        for (const [k, v] of Object.entries({ ...identityHeaders(identity), ...rateLimitHeaders(decision) })) {
            response.headers.set(k, v);
        }
        return finish(response, {
            orgId: resolved.orgId ?? null,
            installationId: resolved.installationId ?? null,
            errorCode: "invalid_credential",
        });
    }

    const principal = resolved.principal;
    const issued = await issueAccessToken(supabase, {
        credentialId: principal.credentialId,
        installationId: principal.installationId,
    });

    if (!issued.ok) {
        return finish(
            apiError({
                code: "internal_error",
                type: "internal_error",
                message: "The access token could not be issued.",
                requestId: identity.requestId,
                headers: identityHeaders(identity),
            }),
            { orgId: principal.orgId, installationId: principal.installationId, errorCode: "internal_error" },
        );
    }

    await recordSecurityAudit(supabase, {
        eventType: "authentication.succeeded",
        outcome: "allowed",
        orgId: principal.orgId,
        applicationId: principal.applicationId,
        installationId: principal.installationId,
        credentialId: principal.credentialId,
        correlationId: identity.requestId,
        clientIpHash: clientIpHash(request.headers),
    });

    const response = NextResponse.json(
        {
            access_token: issued.issued.accessToken,
            token_type: "Bearer",
            expires_in: issued.issued.expiresInSeconds,
            // What the installation currently grants. Informational: the token
            // carries no authority of its own and these are re-read on every call.
            scope: principal.grantedScopes.join(" "),
        },
        {
            status: 200,
            headers: {
                ...identityHeaders(identity),
                ...rateLimitHeaders(decision),
                // A bearer token must never sit in a shared cache.
                "Cache-Control": "no-store",
            },
        },
    );

    return finish(response, {
        orgId: principal.orgId,
        applicationId: principal.applicationId,
        installationId: principal.installationId,
        tokenId: issued.issued.tokenId,
    });
}
