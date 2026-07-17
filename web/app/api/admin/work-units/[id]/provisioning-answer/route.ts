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
import {
    fetchWorkUnitsForSlugResolution,
    fetchDepartmentsForSlugResolution,
} from "@/lib/admin/fetchWorkUnitsForSlugResolution";
import { resolveWorkUnitByRouteSlug } from "@/lib/admin/resolveWorkUnitByRouteSlug";
import { workUnitRouteSlugToKey } from "@/lib/admin/workUnitRouteSlug";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    // U-P1 — one authorization + one scope resolve for the entire answer.
    const gate = await loadAdminRouteGate();
    if (!gate.ok) return adminRouteGateFailureResponse(gate);

    // The segment is named `[id]` to match the sibling work-unit routes (Next requires one slug
    // name per path position); the value is the canonical route SLUG.
    const { id: rawSlug } = await params;
    const url = request.nextUrl.searchParams;
    const supabase = createAdminClient();

    // ── CANONICAL ROUTE RESOLUTION — the operator route names a WORK VIEW, hosted on a work unit. ──
    // "work unit = work view": the operator-facing routing namespace IS the Work View. A view's route
    // slug (its label-derived key, e.g. "all-leads") must land on its HOST work unit, with the view as
    // the active lens — the same precedence (work_unit_key → work_view → queue_lane_key) the sibling
    // `by-slug` route and the seed route already use. Without this, a view slug whose route key does not
    // COINCIDENTALLY equal a work-unit key (e.g. "all-leads" vs a unit keyed "new_leads") resolves to
    // nothing and the answer is an honest "no work unit" error — which is what surfaced on staging.
    //
    // D1 composition is UNCHANGED: it still receives a work-unit slug + an active view. This only
    // resolves WHICH unit/view the operator's slug denotes, before composition. Resolution can never
    // fail the answer — an unresolvable slug is passed through so D1 returns the same honest error.
    let workUnitSlug = rawSlug;
    let requestedWorkViewId = url.get("work_view_id");
    const platformKey = workUnitRouteSlugToKey((rawSlug ?? "").trim());
    if (platformKey) {
        try {
            const { rows: workUnits } = await fetchWorkUnitsForSlugResolution({
                supabase,
                orgId: gate.orgId,
                dim: gate.dim,
                platformKey,
            });
            const departments = await fetchDepartmentsForSlugResolution({
                supabase,
                orgId: gate.orgId,
                departmentIds: workUnits.map((r) => r.department_id),
            });
            const resolved = resolveWorkUnitByRouteSlug({ slug: rawSlug, workUnits, departments });
            if (resolved.status === "resolved") {
                // Hand D1 the HOST unit's key. A `work_view` slug also selects its view — but an
                // explicit lens on the URL (K1's intent) always wins over the slug's implied view.
                workUnitSlug = resolved.match.workUnitKey;
                if (!requestedWorkViewId && resolved.match.initialWorkViewId) {
                    requestedWorkViewId = resolved.match.initialWorkViewId;
                }
            }
            // not_found / ambiguous → fall through with the raw slug; D1 emits the honest error.
        } catch {
            // Resolution I/O failure must never fail the answer; D1 still produces a terminal.
        }
    }

    // Attention is an INPUT carried by the request. The resource never derives it from the pathname:
    // K1 owns intent, and the URL is a projection of committed Focus, never its cause.
    const answer = await composeWorkUnitProvisioningAnswer({
        supabase,
        orgId: gate.orgId,
        currentUserId: gate.userId ?? null,
        workUnitSlug,
        requestedWorkViewId,
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
