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
import { hasProcessingCapability, PROCESSING_OPERATE } from "@/lib/access/processingAuthority";
import { createExecutorPorts } from "../executor";
import { OperatorServiceError, type OperatorReviewDeps } from "./operatorReviewService";

/**
 * The capability this shared context resolves — written as a literal, and checked against the
 * canonical constant by the compiler.
 *
 * Seven routes derive their authority here rather than each asking for themselves, which is the
 * right architecture and also the reason the route-capability lock cannot see it: that lock reads
 * the helper's own module for the capability it claims to enforce, and a module that only passes a
 * CONSTANT names nothing a reader or a scanner can check. `satisfies` makes this an assertion
 * rather than a decoration — rename or repoint `PROCESSING_OPERATE` and this stops compiling.
 */
const OPERATOR_CAPABILITY = PROCESSING_OPERATE satisfies "processing.operate";

export type ResolvedOperatorRoute = {
    deps: OperatorReviewDeps;
    caseId: string;
    ctx: AdminContextSuccess;
};

/**
 * Resolve `{ deps, caseId }` or a short-circuit `NextResponse` (401/403/400).
 *
 * `actorAuthorized` reflects the caller's `processing.operate` CAPABILITY for approval and
 * execution; read/decision steps do not require it.
 *
 * It used to read `ctx.role === "admin" || ctx.role === "ops"` — one line, governing seven routes,
 * and invisible to any scan that reads route files. That is what made it worth finding: the
 * architecture was already right (one decision point, enforced deep in `operatorReviewService` and
 * `plan/approval`), and only the QUESTION was wrong. An organization could not let someone work an
 * identity queue without also calling them an administrator or an operations user.
 *
 * The compatibility grants give `processing.operate` to exactly `admin` and `ops`, so every
 * principal authorized a moment before this change is authorized after it — and a custom role the
 * organization defines can now hold the same authority under any name it likes.
 */
export async function resolveOperatorRoute(
    rawCaseId: string | undefined,
): Promise<ResolvedOperatorRoute | NextResponse> {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const caseId = parseUuidParam(rawCaseId, "caseId");
    if (caseId instanceof NextResponse) return caseId;

    const supabase = createAdminClient();
    const actorAuthorized = hasProcessingCapability(ctx, OPERATOR_CAPABILITY);

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
