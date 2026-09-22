/**
 * One handler for every governed public operation.
 *
 * ── WHAT A GOVERNED OPERATION IS ──
 *
 * A named intent — "start this enrollment", "move this child's room" — delegated to the canonical
 * service that already performs it internally. The adapter translates and authorizes; it never
 * re-implements. If Alloy's domain rules refuse, the partner sees the refusal rather than a
 * second, more permissive path around it.
 *
 * ── THE ORDER IS THE SECURITY ORDER ──
 *
 * Credential, then scope, then write budget, then the boundary, and only then the canonical
 * service. Every operation inherits that sequence by construction rather than by review, which is
 * the same argument the collection factory makes for reads.
 *
 * ── IDEMPOTENCY IS DOMAIN-NATIVE ──
 *
 * These operations carry no partner-supplied key, because they do not need one: the canonical
 * services read current state before acting, so starting an enrollment that already exists
 * converges on the existing one rather than creating a second. That is a stronger guarantee than
 * a key, since it also holds for a partner that never retried and simply asked twice.
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
import type { ApplicationPrincipal } from "@/lib/platform/principal/platformPrincipalTypes";

export type OperationContext = {
    readonly supabase: SupabaseClient;
    readonly principal: ApplicationPrincipal;
    readonly organizationId: string;
    readonly installationId: string;
    /** Resolved through the same query `GET /api/v1/locations` answers. Never re-derived. */
    readonly siteIds: readonly string[];
    readonly boundaryMode: "org_wide" | "locations";
    /** Provenance for the canonical service's audit trail. */
    readonly actorLabel: string;
    /** Today, in the organization's terms, as the canonical services expect it. */
    readonly todayYmd: string;
};

export type OperationRefusal = { code: string; message: string; status?: 400 | 403 | 404 | 409 | 422 };

export type OperationDefinition<TResult> = {
    route: string;
    operationId: PublicOperationId;
    /** What could not be done, in the one sentence a partner reads on an internal failure. */
    subject: string;
    /**
     * Parse and authorize the request, then perform the intent through canonical authority.
     *
     * Returning a refusal produces a governed error. Throwing is treated as an internal failure and
     * never leaks its message: canonical services raise errors carrying table and constraint names.
     */
    perform: (
        body: Record<string, unknown>,
        ctx: OperationContext,
    ) => Promise<{ ok: true; status: 200 | 201; result: TResult } | { ok: false; error: OperationRefusal }>;
};

/** Domain refusals a partner can act on, mapped to governed public codes. */
const DOMAIN_CODE_STATUS: Record<string, 400 | 404 | 409 | 422> = {
    invalid_input: 400,
    validation_failed: 422,
    invalid_state: 409,
    conflict: 409,
    not_found: 404,
};

export function classifyDomainError(error: unknown): OperationRefusal | null {
    if (typeof error !== "object" || error === null) return null;
    const code = (error as { code?: unknown }).code;
    if (typeof code !== "string" || !(code in DOMAIN_CODE_STATUS)) return null;
    const message = (error as { message?: unknown }).message;
    return {
        code,
        // The canonical services write these for operators and they are safe to forward: they name
        // the domain rule, not the storage. Anything unrecognised is NOT forwarded.
        message: typeof message === "string" && message.length > 0 ? message : "The operation was refused.",
        status: DOMAIN_CODE_STATUS[code],
    };
}

export function externalOperationRoute<TResult>(def: OperationDefinition<TResult>) {
    return async function POST(request: NextRequest) {
        const startedAt = Date.now();
        const identity = resolveRequestIdentity(request.headers);
        const supabase = createAdminClient();

        const finish = async (response: NextResponse, extra: Record<string, unknown> = {}) => {
            await recordApiActivity(supabase, {
                requestId: identity.requestId,
                method: "POST",
                route: def.route,
                operationId: def.operationId,
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
        const fail = (
            code: string,
            type: "invalid_request" | "internal_error" | "forbidden_scope" | "conflict",
            message: string,
            status?: number,
        ) =>
            finish(
                apiError({ code, type, message, requestId: identity.requestId, headers: identityHeaders(identity), status }),
                { ...ids, errorCode: code },
            );

        const scoped = requireOperationScope(ctx.principal, def.operationId);
        if (!scoped.ok) return fail(scoped.code, "forbidden_scope", scoped.message);

        // The WRITE budget, which is smaller than the read budget on purpose.
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
                rateLimited(identity.requestId, decision.resetSeconds, { ...identityHeaders(identity), ...limitHeaders }),
                { ...ids, errorCode: "rate_limited" },
            );
        }

        let body: Record<string, unknown>;
        try {
            const parsed: unknown = await request.json();
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
                return fail("invalid_request", "invalid_request", "The request body must be a JSON object.");
            }
            body = parsed as Record<string, unknown>;
        } catch {
            return fail("invalid_request", "invalid_request", "The request body must be valid JSON.");
        }

        const sites = await resolveBoundarySites(supabase, ctx.principal);
        if (!sites.ok) return fail("internal_error", "internal_error", `${def.subject} could not be completed.`);

        const boundaryMode = ctx.principal.boundary.mode;
        if (boundaryMode !== "org_wide" && sites.siteIds.length === 0) {
            // An installation with no site reaches nothing, and an operation is not an exception.
            return fail(
                "outside_boundary",
                "forbidden_scope",
                "This installation has no authorized location.",
            );
        }

        const operationCtx: OperationContext = {
            supabase,
            principal: ctx.principal,
            organizationId: ctx.organizationId,
            installationId: ctx.installationId,
            siteIds: sites.siteIds,
            boundaryMode,
            actorLabel: ctx.principal.applicationSlug,
            todayYmd: new Date().toISOString().slice(0, 10),
        };

        let outcome: Awaited<ReturnType<typeof def.perform>>;
        try {
            outcome = await def.perform(body, operationCtx);
        } catch (error) {
            const domain = classifyDomainError(error);
            if (domain) {
                return fail(
                    domain.code,
                    domain.status === 409 ? "conflict" : "invalid_request",
                    domain.message,
                    domain.status,
                );
            }
            /*
             * Everything else is internal. Canonical services raise errors carrying table and
             * constraint names, and those are not a partner's business — the request id is how the
             * two halves of the story are joined.
             */
            return fail("internal_error", "internal_error", `${def.subject} could not be completed.`);
        }

        if (!outcome.ok) {
            const { code, message, status } = outcome.error;
            return fail(code, status === 403 ? "forbidden_scope" : status === 409 ? "conflict" : "invalid_request", message, status);
        }

        const response = NextResponse.json(outcome.result, {
            status: outcome.status,
            headers: { ...identityHeaders(identity), ...limitHeaders, "Cache-Control": "no-store" },
        });
        return finish(response, ids);
    };
}
