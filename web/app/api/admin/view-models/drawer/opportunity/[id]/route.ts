import { NextRequest, NextResponse } from "next/server";

import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { composeOpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel";
import { resolveParticipationSubjectForOpportunity } from "@/lib/adminV2/runtime/operationalContext/resolveParticipationSubjectForOpportunity";
import { logDrawerVmRuntimeServer } from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerVmRuntimeLog";
import { logOpportunityDrawerViewModelComposeFailureShadowSummary } from "@/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelShadowServer";
import { logDrawerViewModelRuntimeFlagsServerSummary } from "@/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelRuntimeFlagsServer";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    CARRIER_LINE_KEY,
    DRAWER_VIEW_MODEL_LINE_KEY,
    PHASED_CONTENT_TYPE,
    PHASED_QUERY_KEY,
    type ActionableDrawerCarrier,
} from "@/lib/adminV2/viewModel/drawer/opportunity/actionableDrawerCarrier";

/**
 * GET — Server-composed opportunity drawer View Model.
 * Canonical path: /api/admin/view-models/drawer/opportunity/[id]
 * Legacy alias:   /api/admin/v2/view-models/drawer/opportunity/[id] (next.config rewrite)
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    /*
     * THE ROUTE'S OWN PHASES.
     *
     * compose_ms covers a median 2,288ms of a 3,698ms endpoint wall. Network accounts for ~384ms,
     * leaving ~935ms — 25% of the endpoint — inside this handler but outside the composer, and
     * that block carries most of the run-to-run variance. Everything in it is here: the gate, the
     * org assertion, the participant resolve and the card producers, which run AFTER compose and
     * are first-order for Attendance and Health. Without this split the largest unexplained cost
     * on the settlement path can only be guessed at, and this programme has already spent slices
     * on a guess. Four Date.now() reads and three headers; no new timing framework.
     */
    const routeT0 = Date.now();
    const routePhases: Record<string, number> = {};
    const gate = await loadAdminRouteGate();
    routePhases.gate_ms = Date.now() - routeT0;
    if (!gate.ok) return adminRouteGateFailureResponse(gate);

    const { id: opportunityId } = await context.params;
    if (!opportunityId?.trim()) {
        return NextResponse.json({ error: "Missing opportunity id" }, { status: 400 });
    }

    const supabase = createAdminClient();
    /*
     * THE ORG ASSERTION STARTS HERE AND IS AWAITED WHERE IT IS NEEDED.
     *
     * Measured across 40 phased requests on deployed 97623416: this one query costs a median 118ms
     * and up to 3,807ms, entirely ahead of a compose whose own first act is the same predicate on
     * the same table -- `select ... from opportunities where id = ? and org_id = ?` -- which
     * short-circuits to `opportunity_not_found` when it matches nothing. So the boundary is asserted
     * twice in series, and the second assertion is the one that actually guards every downstream
     * read.
     *
     * It is NOT removed. It still decides the response, and the phased path writes NOTHING until it
     * has resolved -- the carrier is held rather than emitted. What changes is only that compose may
     * begin while it is in flight, which is safe because the single query compose starts first is
     * scoped by the gate's own org and the untrusted id reaches nothing else until that select has
     * returned a row belonging to this org.
     *
     * The unphased path below still awaits it exactly where it always did, so every consumer that
     * does not opt into two-phase delivery is byte-identical, 404 included.
     */
    const tAssert = Date.now();
    const oppOrgPromise = assertRowOrg(supabase, "opportunities", opportunityId, gate.orgId).then((r) => {
        routePhases.assert_row_org_ms = Date.now() - tAssert;
        return r;
    });

    const sp = request.nextUrl.searchParams;
    logDrawerViewModelRuntimeFlagsServerSummary();
    logDrawerVmRuntimeServer("compose_start", {
        opportunity_id: opportunityId.trim(),
        department_id: (sp.get("department_id") ?? "").trim() || null,
        work_unit_id: (sp.get("work_unit_id") ?? "").trim() || null,
    });
    /*
     * TWO PHASES, ONE REQUEST — and only when the client says it can read them.
     *
     * Phase 1 is the actionable carrier: subject identity, canonical execution arguments and the
     * resolved header actions, flushed the moment action authority exists (~390ms into a ~2,288ms
     * compose). Phase 2 is this route's unchanged answer. NDJSON, one JSON document per line, by the
     * same contract the provisioning seam already ships — not a second streaming protocol.
     *
     * OPT-IN, for the reason the provisioning wire states: a consumer that cannot read a second
     * delivery must keep receiving ONE complete answer. Without `?phased=1` every byte below is
     * bypassed and the handler behaves exactly as it did.
     */
    const phased = sp.get(PHASED_QUERY_KEY) === "1";
    if (phased) {
        return streamPhasedDrawerViewModel({
            request,
            supabase,
            gate,
            opportunityId: opportunityId.trim(),
            sp,
            routeT0,
            routePhases,
            oppOrgPromise,
        });
    }

    const oppOrg = await oppOrgPromise;
    if (!oppOrg.ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    try {
        const attentionSubjectId = (sp.get("attention_subject_id") ?? "").trim() || null;

        /*
         * TWO STAGES, ONE COMPOSE.
         *
         * The producers below need exactly two fields — customerMemberId and displayName — and both
         * are settled once the children shell has run, a median 1,355ms before the view model is
         * finished. They used to wait for all of it. Now stage one hands over those two fields, the
         * producers start, and the remaining composition runs alongside them; both are joined
         * before the response is assembled, so the response itself is unchanged.
         */
        const result = await composeOpportunityDrawerViewModel({
            supabase,
            gate,
            opportunityId: opportunityId.trim(),
            departmentId: (sp.get("department_id") ?? "").trim() || null,
            workUnitId: (sp.get("work_unit_id") ?? "").trim() || null,
            hintOperTrustHeadline: (sp.get("hint_oper_trust_headline") ?? "").trim() || null,
            hintOperTrustUrgency: (sp.get("hint_oper_trust_urgency") ?? "").trim() || null,
            // The Activity embedded workspace lazily loads (and idle-prewarms) the family
            // communications preview, so it must not block the record's first paint. Opt out
            // unless a caller explicitly requests the seeded preview (`comms_preview=1`).
            deferCommunicationsPreview: sp.get("comms_preview") !== "1",
            /*
             * Stage work composes INLINE, always. `stage_work=0` is gone.
             *
             * It restored a deferred contract in which the route answered `stage_work: {status:
             * "pending"}` and the browser patched the region in place afterwards. Nothing ever sent
             * it: `buildOpportunityDrawerViewModelUrl` is the only place this URL's query is built
             * and it sets department, work unit and attention subject — never this. So the deferred
             * branch was unreachable from the product while remaining fully alive in the code.
             *
             * That mattered because the patch merges stage-work truth into the view model WITHOUT
             * refreshing `operational_projection`. A frame that took it would have shown Current
             * Work and the cards decided from one stage-work runtime beside a `stage_work_runtime`
             * from a later one — two operational truths in one payload, reachable by adding four
             * characters to a URL.
             */
            /*
             * NOT TRUSTED — RESOLVED. This is handed to the canonical participant resolver, which
             * refuses a participation that does not belong to this record (`not_found`) rather than
             * answering with somebody else's child. So naming another family's participation yields
             * no scope and no child-scoped projection, which is the authorization boundary here.
             */
            attentionSubjectId: attentionSubjectId,
            /*
             * THE SAME ID, ACTUALLY RESOLVED.
             *
             * The comment above described this resolution as the authorization boundary, and the
             * intent was right — but on a child lens the id is a `process_instances.id` while the
             * composer's only candidate set (`truth._inquiry_children`) is intake metadata keyed by
             * inquiry-child id. Different id spaces, so it answered `not_found` for EVERY child and
             * the settled `participantScope` was null. Attendance and Health are both gated on that
             * scope, so they reported `unavailable` for a child the commit frame had described in
             * full. Resolving against `process_instances` — scoped to this org AND this opportunity —
             * is what makes the refusal above real instead of universal.
             *
             * It runs HERE rather than inside the composer because it queries the database and the
             * composer is reachable from a client component, exactly as the producers below are.
             */
            resolvedParticipant: await (async () => {
                const t = Date.now();
                const r = await resolveParticipationSubjectForOpportunity({
                    supabase,
                    orgId: gate.orgId,
                    opportunityId: opportunityId.trim(),
                    participationId: attentionSubjectId,
                });
                routePhases.participant_resolve_ms = Date.now() - t;
                return r;
            })(),
        });

        /*
         * START THE PRODUCERS, DO NOT AWAIT THEM YET.
         *
         * Awaiting stage one costs only what the children shell already costs. The producers then
         * run against the remaining compose rather than after it. `access` is the route's own
         * resolved authority, exactly as before — the grants come from `loadAdminRouteGate` at the
         * top of this handler, so starting earlier cannot outrun authorization.
         */
        /*
         * THE DRAWER NO LONGER PRODUCES FIRST-ORDER CARD TRUTH.
         *
         * These producers ran here AND in the document, with the same authority against the same
         * subject, and measured on f67114ca4 the second run owned nothing: Financials arrived as
         * an identical rerender and Attendance/Health as recomputations of answers the document
         * had already made. The duplicate cost a median 772ms on the settlement path.
         *
         * It could not simply be deleted before now. The settled operational context substituted
         * its own `operational_projection` wholesale, so removing this run would have left
         * `cards` absent at settlement — which the contract defines as "provisioning", not "no
         * attendance" — and the cards would have blanked. The browser now states that the
         * DOCUMENT owns first-order producer truth for the navigation
         * (`firstOrderProducerCards`), so there is nothing left for this run to be the source of.
         *
         * The endpoint keeps everything else: the view model, `businessProcess` and `currentWork`
         * projections, and all second-order enrichment. Only the duplicate first-order producer
         * execution is retired.
         */
        routePhases.participant_contract_ready_ms = Date.now() - routeT0;

        routePhases.full_compose_end_ms = Date.now() - routeT0;

        if (!result.ok) {
            logDrawerVmRuntimeServer("compose_skip", {
                opportunity_id: opportunityId.trim(),
                reason: result.skipped.reason,
            });
            return NextResponse.json(result.skipped, {
                status: 422,
                headers: {
                    "X-Alloy-Drawer-VM-Structure-Settled": "false",
                    "X-Alloy-Server-Duration": String(Date.now() - routeT0),
                },
            });
        }

        logDrawerVmRuntimeServer("compose_ok", {
            opportunity_id: opportunityId.trim(),
            generation: result.viewModel.generation,
            compose_ms: result.viewModel.timing.compose_ms,
        });

        /*
         * THE SETTLED FRAME'S CARD PRODUCERS RUN HERE, ABOVE THE CONTRACT BOUNDARY.
         *
         * The commit frame has run them since the module-boundary repair; the settled frame could
         * not, because until the subject of attention travelled with the request there was no way to
         * know which child the surface was scoped to — a producer run then would have resolved the
         * sole participant and attributed one child's attendance to another. Running them in BOTH
         * frames is what makes settlement a change of TRANSPORT rather than of AUTHORITY: a card
         * whose truth exists only in the commit frame goes blank when the drawer VM takes over.
         *
         * They run in the ROUTE, not in the composer. `buildAttendanceCardVM` is `server-only`, and a
         * client component reaches the composer through the `lib/layout/runtime` barrel — so an edge
         * there puts a `server-only` module in the browser graph and the production build fails. It
         * did, with all thirteen required checks green, because none of them runs a real `next build`.
         * An App Route cannot be imported by a client component, so this is the correct owner.
         *
         * The context is the composer's own, not a second derivation, so the two frames cannot
         * disagree about the subject. Producer failure is bounded by `Promise.allSettled` inside the
         * producer module: an Attendance outage costs the operator Attendance, not the drawer.
         */
        /*
         * JOIN. The producers ran ONCE, started early; this is where their answer is folded in.
         * The guard is unchanged apart from requiring the producers' own result, so a frame that
         * produced no cards before produces none now.
         *
         * `tProducers` is NOT declared here any more: it is stamped where the producers actually
         * start, above. Keeping staging's declaration would have measured the join, not the work.
         */
        /*
         * No producer join: the document owns first-order card truth for this navigation, so the
         * settled projection ships WITHOUT `cards` and the browser keeps the document's.
         */
        const viewModel = result.viewModel;
        // `card_producers_ms` is deliberately NOT reported any more: this route runs no producers,
        // and emitting a zero would read as "they were free" rather than "they are gone".
        routePhases.full_compose_end_ms = Date.now() - routeT0;

        return NextResponse.json(viewModel, {
            headers: {
                "X-Alloy-Drawer-VM-Structure-Settled": "true",
                "X-Alloy-Drawer-VM-Generation": result.viewModel.generation,
                "X-Alloy-Drawer-VM-Compose-Ms": String(result.viewModel.timing.compose_ms),
                "X-Alloy-Drawer-VM-Route-Phases": JSON.stringify(routePhases),
                "X-Alloy-Server-Duration": String(Date.now() - routeT0),
            },
        });
    } catch (e) {
        logDrawerVmRuntimeServer("compose_error", {
            opportunity_id: opportunityId.trim(),
            message: e instanceof Error ? e.message : "unknown",
        });
        logOpportunityDrawerViewModelComposeFailureShadowSummary(opportunityId.trim(), Date.now() - routeT0);
        const msg = e instanceof Error ? e.message : "Drawer view model compose failed";
        const status = /not found/i.test(msg) ? 404 : 500;
        return NextResponse.json({ error: msg }, { status });
    }
}

/**
 * THE PHASED DELIVERY.
 *
 * Deliberately a separate function rather than a branch woven through the handler above: the
 * unphased path is the one every existing consumer takes, and it must stay byte-identical. Nothing
 * here changes what is composed — only WHEN the operator is told what they may do.
 *
 * STATUS CODES BECOME LINES. A streamed response commits its status before the composer has
 * answered, so the 422 "structure not settled" and the 5xx failure both arrive as their own JSON
 * line instead. The client maps them back to the same two outcomes, so `loadOpportunityDrawerViaViewModel`
 * still distinguishes `not_structure_settled` from `fetch_failed`.
 */
function streamPhasedDrawerViewModel(args: {
    request: NextRequest;
    supabase: ReturnType<typeof createAdminClient>;
    gate: Extract<Awaited<ReturnType<typeof loadAdminRouteGate>>, { ok: true }>;
    opportunityId: string;
    sp: URLSearchParams;
    routeT0: number;
    routePhases: Record<string, number>;
    oppOrgPromise: Promise<{ ok: boolean }>;
}): NextResponse {
    const { supabase, gate, opportunityId, sp, routeT0, routePhases, oppOrgPromise } = args;
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            let closed = false;
            let carrierSent = false;
            const write = (value: unknown) => {
                if (closed) return;
                try {
                    controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
                } catch {
                    // The operator navigated away mid-stream. Nothing to repair; stop writing.
                    closed = true;
                }
            };
            /*
             * AT MOST ONE CARRIER PER REQUEST. The composer already promises to call this once, but
             * the guard is here too: a second phase-1 line would be a second action authority on the
             * wire, and the client would have no canonical rule for which one wins.
             */
            /*
             * HELD UNTIL THE ORG ASSERTION HAS PASSED.
             *
             * Compose may now run while that query is in flight, so the carrier can be ready before
             * the boundary has answered. It is stored, never written: a subject's action set must not
             * reach a caller whose right to this record is still unestablished. In practice the
             * assertion resolves at a median 118ms and the carrier is ready at a median 374ms into
             * compose, so this holds nothing in the ordinary case -- it exists for the case where the
             * assertion is the slow one, which measured up to 3,807ms.
             */
            let authorized = false;
            let heldCarrier: ActionableDrawerCarrier | null = null;
            const sendCarrier = (carrier: ActionableDrawerCarrier) => {
                if (carrierSent) return;
                if (!authorized) {
                    heldCarrier = carrier;
                    return;
                }
                carrierSent = true;
                // Route-relative, on the carrier's OWN line. `flushed_at_ms` is compose-relative, so
                // by itself it cannot say how much of the operator's wait was spent before compose
                // even started; and the route phases ride the phase-2 line, which on a slow sample
                // arrives long after the thing being attributed.
                write({ [CARRIER_LINE_KEY]: carrier, __carrier_route_ms: Date.now() - routeT0 });
            };

            try {
                const attentionSubjectId = (sp.get("attention_subject_id") ?? "").trim() || null;
                const composePromise = composeOpportunityDrawerViewModel({
                    supabase,
                    gate,
                    opportunityId,
                    departmentId: (sp.get("department_id") ?? "").trim() || null,
                    workUnitId: (sp.get("work_unit_id") ?? "").trim() || null,
                    hintOperTrustHeadline: (sp.get("hint_oper_trust_headline") ?? "").trim() || null,
                    hintOperTrustUrgency: (sp.get("hint_oper_trust_urgency") ?? "").trim() || null,
                    deferCommunicationsPreview: sp.get("comms_preview") !== "1",
                    attentionSubjectId,
                    resolvedParticipant: await (async () => {
                        const t = Date.now();
                        const r = await resolveParticipationSubjectForOpportunity({
                            supabase,
                            orgId: gate.orgId,
                            opportunityId,
                            participationId: attentionSubjectId,
                        });
                        routePhases.participant_resolve_ms = Date.now() - t;
                        return r;
                    })(),
                    onActionableCarrier: sendCarrier,
                });
                /*
                 * A rejection here is handled below by the await. Attaching a no-op catch now stops
                 * it being an unhandled rejection during the window where the org assertion is the
                 * thing being awaited instead.
                 */
                composePromise.catch(() => {});

                const oppOrg = await oppOrgPromise;
                if (!oppOrg.ok) {
                    // The same refusal the unphased path returns as a 404. A streamed response has
                    // already sent its status, so it travels as its own line and the client maps it
                    // back -- exactly as the 422 and the compose failure below already do.
                    write({ __not_found: true });
                    return;
                }
                authorized = true;
                if (heldCarrier && !carrierSent) {
                    carrierSent = true;
                    write({ [CARRIER_LINE_KEY]: heldCarrier, __carrier_route_ms: Date.now() - routeT0 });
                }

                const result = await composePromise;

                routePhases.full_compose_end_ms = Date.now() - routeT0;

                if (!result.ok) {
                    logDrawerVmRuntimeServer("compose_skip", {
                        opportunity_id: opportunityId,
                        reason: result.skipped.reason,
                    });
                    write({ __skipped: result.skipped });
                    return;
                }

                logDrawerVmRuntimeServer("compose_ok", {
                    opportunity_id: opportunityId,
                    generation: result.viewModel.generation,
                    compose_ms: result.viewModel.timing.compose_ms,
                });
                write({
                    [DRAWER_VIEW_MODEL_LINE_KEY]: result.viewModel,
                    // The unphased path ships these as headers; a streamed response has already sent
                    // its headers by now, so the same measurements ride the phase-2 line instead.
                    __route_phases: routePhases,
                    __server_duration_ms: Date.now() - routeT0,
                });
            } catch (e) {
                logDrawerVmRuntimeServer("compose_error", {
                    opportunity_id: opportunityId,
                    message: e instanceof Error ? e.message : "unknown",
                });
                logOpportunityDrawerViewModelComposeFailureShadowSummary(opportunityId, Date.now() - routeT0);
                write({ __error: e instanceof Error ? e.message : "Drawer view model compose failed" });
            } finally {
                closed = true;
                try {
                    controller.close();
                } catch {
                    /* already closed by the client disconnecting */
                }
            }
        },
    });

    return new NextResponse(stream, {
        headers: {
            "Content-Type": PHASED_CONTENT_TYPE,
            "Cache-Control": "no-store",
            "X-Alloy-Drawer-VM-Phased": "1",
        },
    });
}
