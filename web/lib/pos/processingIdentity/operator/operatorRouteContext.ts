/**
 * Shared server-route glue for the D3 operator workflow.
 *
 * Every /api/admin/processing/cases/[caseId]/identity/* route resolves the admin
 * context (org + actor + portal role), builds a service-role client, and wires the
 * production executor ports — then delegates to the canonical operatorReviewService.
 * Routes never touch tables or commands directly.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    adminContextFailureResponse,
    getAdminContextCached,
    type AdminContextSuccess,
} from "@/lib/admin/getAdminContext";
import { parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { createExecutorPorts } from "../executor";
import { OperatorServiceError, type OperatorReviewDeps } from "./operatorReviewService";

export type ResolvedOperatorRoute = {
    deps: OperatorReviewDeps;
    caseId: string;
    ctx: AdminContextSuccess;
};

/**
 * Resolve `{ deps, caseId }` or a short-circuit `NextResponse` (401/403/400).
 * `actorAuthorized` reflects a privileged operator role (admin or ops) for
 * approval + execution; read/decision steps do not require it.
 */
export async function resolveOperatorRoute(
    rawCaseId: string | undefined,
): Promise<ResolvedOperatorRoute | NextResponse> {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const caseId = parseUuidParam(rawCaseId, "caseId");
    if (caseId instanceof NextResponse) return caseId;

    const supabase = createAdminClient();
    const actorAuthorized = ctx.role === "admin" || ctx.role === "ops";

    return {
        ctx,
        caseId,
        deps: {
            supabase,
            orgId: ctx.orgId,
            actorId: ctx.userId,
            actorAuthorized,
            executorPorts: createExecutorPorts(supabase),
        },
    };
}

/** Map service errors to HTTP status codes; unknown errors are 500. */
export function operatorErrorResponse(e: unknown): NextResponse {
    if (e instanceof OperatorServiceError) {
        const status =
            e.code === "actor_not_authorized" ? 403
            : e.code.endsWith("_not_found") ? 404
            : e.code === "no_executable_operations" || e.code === "not_ready_for_approval" ? 409
            : 400;
        return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    return NextResponse.json(
        { error: e instanceof Error ? e.message : "operator request failed" },
        { status: 500 },
    );
}
