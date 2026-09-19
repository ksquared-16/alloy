import { NextRequest, NextResponse } from "next/server";

import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminRouteGateFailureResponse, loadAdminRouteGate } from "@/lib/admin/adminRouteGate";
import { composeOpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel";
import { resolveParticipationSubjectForOpportunity } from "@/lib/adminV2/runtime/operationalContext/resolveParticipationSubjectForOpportunity";
import { logDrawerVmRuntimeServer } from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerVmRuntimeLog";
import { logOpportunityDrawerViewModelComposeFailureShadowSummary } from "@/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelShadowServer";
import { logDrawerViewModelRuntimeFlagsServerSummary } from "@/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelRuntimeFlagsServer";
import { createAdminClient } from "@/lib/supabaseAdmin";

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
    const tAssert = Date.now();
    const oppOrg = await assertRowOrg(supabase, "opportunities", opportunityId, gate.orgId);
    routePhases.assert_row_org_ms = Date.now() - tAssert;
    if (!oppOrg.ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const sp = request.nextUrl.searchParams;
    logDrawerViewModelRuntimeFlagsServerSummary();
    logDrawerVmRuntimeServer("compose_start", {
        opportunity_id: opportunityId.trim(),
        department_id: (sp.get("department_id") ?? "").trim() || null,
        work_unit_id: (sp.get("work_unit_id") ?? "").trim() || null,
    });
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
