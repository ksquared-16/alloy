/**
 * THE D1 ENTRY RESOURCE — the one HTTP seam for the bounded Provisioning Answer.
 *
 * Governing: docs/platform/runtime/runtime-implementation-authorization.md — Preparation Contract
 * U-P1…U-P7 (:137-148). "One round-trip per Preparation Contract. A dependent chain across a network
 * is a design error, not a latency problem" (Kernel §K2).
 *
 * This is the ONLY network call on the operational critical path. It replaces a four-request client
 * waterfall (`fetchWorkUnitSurfaceConfigBundle`: 3 parallel + 1 serial, plus the queue-rows and
 * right-rail fetches), because U-P7 composition now resolves server-side inside the same answer.
 *
 * K2 (browser) calls this at GESTURE TIME — not at route commit, not at destination mount. The
 * answer it returns is terminal: `operational | empty | error`. There is no partial response and no
 * follow-up request needed to render the first operational frame.
 *
 * Composition is shared with the RSC route bootstrap (Runtime V1 Realization): both call
 * `composeProvisioningAnswerForRoute` so the HTTP answer and the server-SEEDED answer are identical.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminRouteGateFailureResponse } from "@/lib/admin/adminRouteGate";
import { composeProvisioningAnswerForRoute } from "@/lib/runtime/provisioning/composeProvisioningAnswerForRoute";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    // The segment is named `[id]` to match the sibling work-unit routes (Next requires one slug
    // name per path position); the value is the canonical route SLUG.
    const { id: rawSlug } = await params;
    const url = request.nextUrl.searchParams;

    // Attention is an INPUT carried by the request. The resource never derives it from the pathname:
    // K1 owns intent, and the URL is a projection of committed Focus, never its cause.
    const result = await composeProvisioningAnswerForRoute({
        rawSlug,
        requestedWorkViewId: url.get("work_view_id"),
        requestedSubjectId: url.get("subject_id"),
        // Read STRICTLY — only the exact token. Any other value, stale or malformed, is "nothing was
        // stated", which is the pre-existing behaviour: resolve the configured default lens.
        cohort: url.get("cohort") === "none" ? "none" : null,
        aspect: url.get("aspect"),
    });
    if (!result.ok) return adminRouteGateFailureResponse(result.gate);

    // Terminal semantics survive the wire: an honest `error` is a 200 carrying a terminal outcome,
    // NOT an HTTP failure. K2 maps D1 terminals 1:1; an error surface is a workable place, so it must
    // arrive as an answer rather than as a transport fault the client has to interpret.
    return NextResponse.json(result.answer, {
        status: 200,
        headers: { "cache-control": "no-store" },
    });
}
