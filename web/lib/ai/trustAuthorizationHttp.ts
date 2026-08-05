/**
 * HTTP adapter for a Trust authorization refusal.
 *
 * One place turns a refusal into the response the route has always returned.
 * The status, error code and message all come from the decision, so this adapter
 * chooses nothing — it only shapes.
 *
 * Two response shapes exist today and both are preserved:
 *
 *   - context failures answer `{ error }`, matching `adminContextFailureResponse`;
 *   - every other refusal answers `{ ok: false, error, message }`, matching the
 *     pre-convergence route bodies.
 *
 * @see lib/ai/resolveTrustAuthorization.ts
 */

import { NextResponse } from "next/server";

import type { TrustAuthorizationDecision } from "@/lib/trust/authorization/trustAuthorizationDecision";

/** Categories answered by `adminContextFailureResponse` before this slice. */
const CONTEXT_FAILURE_CATEGORIES = new Set(["unauthenticated", "organization_context_unavailable"]);

/**
 * Shapes a refusal. Callers pass a decision they have already checked is a
 * refusal; a permitted decision returns `null` so a caller cannot accidentally
 * answer a successful authorization with an error.
 */
export function trustAuthorizationRefusalResponse(decision: TrustAuthorizationDecision): NextResponse | null {
    if (decision.permitted) return null;
    const { refusal } = decision;

    // A context failure that carried no message is the admin-context shape.
    if (CONTEXT_FAILURE_CATEGORIES.has(refusal.category) && refusal.message === null) {
        return NextResponse.json({ error: refusal.error_code }, { status: refusal.http_status });
    }

    return NextResponse.json(
        { ok: false, error: refusal.error_code, message: refusal.message },
        { status: refusal.http_status },
    );
}
