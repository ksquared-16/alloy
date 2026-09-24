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
import { collectedRouteTiming } from "@/lib/perf/routeTimingDiagnostic";
import {
    PHASED_CONTENT_TYPE,
    PHASED_QUERY_KEY,
    SETTLEMENT_LINE_KEY,
} from "@/lib/runtime/provisioning/provisioningTwoPhaseWire";

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
    /*
     * TWO-PHASE DELIVERY, ASKED FOR BY THE CLIENT (OX Slice 8).
     *
     * The client states whether it can consume a second delivery. A consumer that cannot must keep
     * receiving ONE fully settled answer, because a frame whose capability cards never arrive is a
     * worse answer than a slow one -- so this is opt-in per request rather than a flag day.
     */
    const phased = url.get(PHASED_QUERY_KEY) === "1";

    const result = await composeProvisioningAnswerForRoute({
        rawSlug,
        requestedWorkViewId: url.get("work_view_id"),
        requestedSubjectId: url.get("subject_id"),
        // Read STRICTLY — only the exact token. Any other value, stale or malformed, is "nothing was
        // stated", which is the pre-existing behaviour: resolve the configured default lens.
        cohort: url.get("cohort") === "none" ? "none" : null,
        aspect: url.get("aspect"),
        // S6-1. Read STRICTLY, like `cohort` above: only the exact token counts, so a stale or
        // malformed value means "the client stated nothing" and the answer embeds as it always has.
        // This is a CLIENT ASSERTION, never permission — the composer still decides whether this
        // subject's department configuration is actually the live one.
        // S5-3 — `id:version` pairs, parsed strictly. Anything malformed is "stated nothing".
        summaryConfigHeldIds: (url.get("summary_cfg") ?? "")
            .split(",")
            .map((v) => v.trim())
            .filter((v) => /^[0-9a-f-]{36}:\d{1,9}$/i.test(v))
            .slice(0, 8),
        departmentConfigHeldIds: (url.get("dept_config") ?? "")
            .split(",")
            .map((v) => v.trim())
            .filter((v) => /^[0-9a-f-]{36}$/i.test(v))
            .slice(0, 8),
        deferSettlement: phased,
    });
    if (!result.ok) return adminRouteGateFailureResponse(result.gate);

    // Terminal semantics survive the wire: an honest `error` is a 200 carrying a terminal outcome,
    // NOT an HTTP failure. K2 maps D1 terminals 1:1; an error surface is a workable place, so it must
    // arrive as an answer rather than as a transport fault the client has to interpret.
    /*
     * THE OUTER SPANS, CARRIED ON THE ANSWER THIS SEAM ACTUALLY RETURNS (OX Slice 8).
     *
     * `ProvisioningTimings` rides the answer already, but it measures only the INNER composer. The
     * outer awaits — route identity, and the settlement wait that `card_producers_ms` covers — are
     * recorded into the route-timing collector and then emitted on the ROUTE DOCUMENT, which this
     * seam never produces. So the one request J5 actually waits on was the one request whose outer
     * critical path had no observer, and the gap between `total_ms` and the observed round trip had
     * to be attributed by argument instead of measurement.
     *
     * Diagnostic only, and inert unless `ALLOY_ROUTE_TIMING=1`: `collectedRouteTiming()` returns
     * null when the flag is off, so the product payload is byte-identical. It is attached under a
     * reserved key rather than merged into the answer's own shape, because the answer is a contract
     * and a diagnostic must not be able to collide with a business field.
     */
    // Returned by the composer, because the route handler has no React `cache()` request scope to
    // share the collector through — measured: the collected form came back absent on every sample.
    const timing = result.timingSpans
        ? { route_compose_spans: result.timingSpans }
        : collectedRouteTiming();
    const body = timing ? { ...result.answer, __route_timing: timing } : result.answer;

    /*
     * PHASE 1 NOW, PHASE 2 WHEN IT SETTLES — on ONE request.
     *
     * Two lines of NDJSON rather than a second endpoint: a settlement endpoint would have to
     * recompose the whole answer to produce the patch, which is the same work twice and a second
     * authority for one business fact. Keeping it on this request also keeps the settlement bound to
     * the frame it belongs to, which is what lets the client's existing refusal guard drop a patch
     * whose navigation no longer matches.
     *
     * The frame line is byte-identical to what a non-phased caller receives, so phase 1 is not a
     * preview or a reduced shape -- it is the same canonical answer, minus only the capability
     * results that had not resolved yet, which the frame already reports as UNKNOWN.
     */
    if (!phased || !result.settlement) {
        return NextResponse.json(body, {
            status: 200,
            headers: { "cache-control": "no-store" },
        });
    }
    const settlement = result.settlement;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            try {
                controller.enqueue(encoder.encode(`${JSON.stringify(body)}\n`));
                // A settlement that throws is NOT an error terminal: the frame already answered. It
                // resolves to null, the client applies nothing, and the unresolved regions stay
                // UNKNOWN — never a fabricated empty.
                const patch = await settlement.catch(() => null);
                controller.enqueue(
                    encoder.encode(`${JSON.stringify({ [SETTLEMENT_LINE_KEY]: patch ?? null })}\n`),
                );
            } finally {
                controller.close();
            }
        },
    });
    return new Response(stream, {
        status: 200,
        headers: {
            "content-type": PHASED_CONTENT_TYPE,
            "cache-control": "no-store",
            // Chunks must reach the browser as they are written; a proxy that buffers would
            // reintroduce exactly the completion coupling this removes.
            "x-accel-buffering": "no",
        },
    });
}
