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
 * U-P1: authorization and tenant scope are resolved ONCE, here, by the canonical route gate — the
 * composer never re-resolves them.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { loadAdminRouteGate, adminRouteGateFailureResponse } from "@/lib/admin/adminRouteGate";
import { composeWorkUnitProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ workUnitSlug: string }> },
) {
    // U-P1 — one authorization + one scope resolve for the entire answer.
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);

    const { workUnitSlug } = await params;
    const url = request.nextUrl.searchParams;

    // Attention is an INPUT carried by the request. The resource never derives it from the pathname:
    // K1 owns intent, and the URL is a projection of committed Focus, never its cause.
    const answer = await composeWorkUnitProvisioningAnswer({
        supabase: createAdminClient(),
        orgId: gate.orgId,
        currentUserId: gate.userId ?? null,
        workUnitSlug,
        requestedWorkViewId: url.get("work_view_id"),
        requestedSubjectId: url.get("subject_id"),
    });

    // Terminal semantics survive the wire: an honest `error` is a 200 carrying a terminal outcome,
    // NOT an HTTP failure. K2 maps D1 terminals 1:1; an error surface is a workable place, so it must
    // arrive as an answer rather than as a transport fault the client has to interpret.
    return NextResponse.json(answer, {
        status: 200,
        headers: { "cache-control": "no-store" },
    });
}
