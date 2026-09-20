import "server-only";

/**
 * SHARED ROUTE COMPOSITION for the bounded Provisioning Answer.
 *
 * Extracted verbatim from `GET /api/admin/work-units/[id]/provisioning-answer` so the two callers —
 * the HTTP seam K2 fetches, and the RSC route bootstrap that SEEDS the answer (Runtime V1 Realization)
 * — resolve IDENTICALLY: same gate, same slug→view resolution, same `composeWorkUnitProvisioningAnswer`
 * inputs. One resolver, one composition; the seed and any client fallback can never diverge.
 *
 * U-P1: authorization + tenant scope resolved ONCE, by the canonical route gate; the composer never
 * re-resolves them. Slug→host-unit resolution can never fail the answer — an unresolvable slug is passed
 * through so the composer returns the same honest terminal error.
 */
import { createAdminClient } from "@/lib/supabaseAdmin";
import { documentActorFromAdminGate } from "@/lib/documents/projectPersonProfilePhotos";
import { type AdminRouteGateFailure } from "@/lib/admin/adminRouteGate";
import {
    composeWorkUnitProvisioningAnswer,
    type ProvisioningAnswer,
} from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import { makeWorkUnitHeaderKpiResolver } from "@/lib/runtime/provisioning/workUnitHeaderKpiResolution";
import { resolveWorkUnitRouteIdentity } from "@/lib/admin/resolveWorkUnitRouteIdentity";
import { parseCardFocusAspect } from "@/lib/runtime/kernel/attentionCardFocus";
import { hasPortalAdminMutateAccess } from "@/lib/admin/adminPortalRolePick";
import { resolveFinancialSubjectId } from "@/lib/adminV2/runtime/focusPanel/financialSubjectIdentity";
import { resolveSoleEnrollmentParticipantForOpportunity } from "@/lib/adminV2/runtime/operationalContext/resolveParticipationSubjectForOpportunity";
import { projectFocusPanelCardProducers } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardProducers";
import { buildCommitCriticalOperationalContext } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromProvisioningAnswer";
import { collectedRouteTiming, recordRouteTiming, routeTimingEnabled } from "@/lib/perf/routeTimingDiagnostic";

export type RouteProvisioningResult =
    | { ok: true; answer: ProvisioningAnswer }
    | { ok: false; gate: AdminRouteGateFailure };

/**
 * Resolve the operator route slug → host Work Unit + active view, then compose the ONE bounded answer.
 * `requestedWorkViewId` / `requestedSubjectId` are the URL-carried attention inputs (K1 owns intent).
 */
export async function composeProvisioningAnswerForRoute(input: {
    rawSlug: string;
    requestedWorkViewId: string | null;
    requestedSubjectId: string | null;
    /**
     * `"none"` — the operator selected NO cohort. Carried from `?cohort=none`, which is how attention
     * projects contextual focus so it survives a reload.
     */
    cohort?: "none" | null;
    /** The kernel's ASPECT (`card:…|item:…`), for a contextual answer's card + row. */
    aspect?: string | null;
    /** S6-1 — the client states it already holds this department's published configuration. */
    departmentConfigHeldIds?: readonly string[];
    /** S5-3 — published Summary records the client states it holds (`id:version`). */
    summaryConfigHeldIds?: readonly string[];
}): Promise<RouteProvisioningResult> {
    // U-P1 — one authorization + one scope resolve for the entire answer. The slug→identity resolution
    // is request-memoized (Phase 3 dedup): the work-unit layout's route-meta seed and this provisioning
    // seed share ONE resolution instead of each running the same DB reads.
    /*
     * SLICE 12C — THE OUTER COMPOSE'S OWN AWAITS, MEASURED.
     *
     * Slice 12B could see only `compose_wall_ms` minus the inner composer's `total_ms`: ~3,869 ms of
     * one opaque block, which it named a "prelude". Source tracing showed that name was wrong — the
     * gap straddles the inner composer, because `projectFocusPanelCardProducers` runs AFTER it and
     * does its own reads. These spans name the three real awaits so the dominant one can be chosen
     * from measurement rather than from the suspect list.
     *
     * Every clock is behind the flag, and the spans are reported through the EXISTING route-timing
     * collector — no second instrumentation authority.
     */
    const timing = routeTimingEnabled();
    const mark = () => (timing ? performance.now() : 0);
    const tIdentity = mark();
    const { gate, resolution } = await resolveWorkUnitRouteIdentity(input.rawSlug);
    const routeIdentityMs = timing ? performance.now() - tIdentity : 0;
    if (!gate.ok) return { ok: false, gate };

    const tClient = mark();
    const supabase = createAdminClient();
    const adminClientMs = timing ? performance.now() - tClient : 0;

    // ── CANONICAL ROUTE RESOLUTION — the operator route names a WORK VIEW, hosted on a work unit. ──
    // Same precedence (work_unit_key → work_view → queue_lane_key) the API route and seed route use.
    // An explicit lens on the URL (K1's intent) always wins over the slug's implied view.
    // not_found / ambiguous / unresolved → fall through with the raw slug; the composer emits the honest error.
    const contextual = input.cohort === "none";
    let workUnitSlug = input.rawSlug;
    let requestedWorkViewId = input.requestedWorkViewId;
    if (resolution && resolution.status === "resolved") {
        workUnitSlug = resolution.match.workUnitKey;
        // THE SLUG'S IMPLIED VIEW IS A SECOND PLACE A LENS GETS FILLED IN — and the one that would
        // have quietly defeated contextual focus. When the operator selected no cohort there is
        // nothing for the slug to imply on their behalf: they addressed a HOST, and the view the slug
        // happens to open by default is exactly the `New` this whole change exists to stop claiming.
        if (!requestedWorkViewId && !contextual && resolution.match.initialWorkViewId) {
            requestedWorkViewId = resolution.match.initialWorkViewId;
        }
    }

    const aspect = contextual ? parseCardFocusAspect(input.aspect ?? null) : null;
    // Timed only to MEASURE that it is local derivation rather than I/O, instead of assuming it.
    const tActor = mark();
    const documentActor = documentActorFromAdminGate(gate);
    const documentActorMs = timing ? performance.now() - tActor : 0;

    const tInner = mark();
    /*
     * THE PARTICIPANT READ, STARTED WHEN THE SUBJECT IS KNOWN RATHER THAN WHEN THE ANSWER IS DONE.
     *
     * This route has exactly three serial awaits — route identity ~170ms, composition ~742ms, card
     * producers ~858ms — and measured on deployed d1b8f1319 they sum to the 2,022ms document wall.
     * The producers' participant read needs only the SUBJECT, which composition resolves before it
     * runs the ~616ms children shell, so queueing that read behind the finished answer spent real
     * wall clock waiting for facts it did not need.
     *
     * The composer announces the subject; this starts the read and joins it below. If the
     * announcement never fires the join falls back to the original inline read, so behaviour is
     * unchanged on any path that does not reach a subject.
     */
    type EarlyProducerRun = {
        subjectId: string;
        financialSubjectId: string | null;
        participant: Awaited<ReturnType<typeof resolveSoleEnrollmentParticipantForOpportunity>>;
        cards: Awaited<ReturnType<typeof projectFocusPanelCardProducers>>;
    };
    /*
     * Held in a ref, not a bare `let`: the assignment happens inside the composer's callback, which
     * control-flow analysis cannot see, so a plain binding narrows to `null` at the join.
     */
    const earlyRef: { run: Promise<EarlyProducerRun | null> | null } = { run: null };

    const answer = await composeWorkUnitProvisioningAnswer({
        onSubjectResolved: ({ subjectId, orgId, customerId }) => {
            if (earlyRef.run || !subjectId) return;
            /*
             * Participant, then producers — the whole prerequisite chain, started as soon as the
             * subject and household are known instead of after the answer exists. Settled here so
             * an unhandled rejection can never escape while composition is still assembling; the
             * join treats null as "no speculation" and falls back canonically.
             */
            earlyRef.run = (async (): Promise<EarlyProducerRun> => {
                const participant = await resolveSoleEnrollmentParticipantForOpportunity({
                    supabase,
                    orgId,
                    opportunityId: subjectId,
                });
                const cards = await projectFocusPanelCardProducers({
                    supabase,
                    orgId,
                    access: gate.access,
                    /*
                     * The producers' declared input is already this narrowed shape — not a full
                     * OperationalContext — so nothing partial is being fabricated to fit it.
                     */
                    /*
                     * The same shape the settled frame builds from a resolved participant: the id
                     * the producers key on, and a display name the resolver does not carry. Stated
                     * explicitly rather than passed through, so the two paths cannot drift.
                     */
                    context: {
                        participantScope: participant
                            ? { customerMemberId: participant.customerMemberId, displayName: null }
                            : null,
                    },
                    financialSubjectId: customerId,
                });
                return { subjectId, financialSubjectId: customerId, participant, cards };
            })().catch(() => null);
        },
        supabase,
        orgId: gate.orgId,
        currentUserId: gate.userId ?? null,
        // Child-grain queue rows carry a Person-owned avatar, minted per actor per request and never
        // persisted. Without the actor the rows reach the queue with no image and fall back to
        // initials for children who do have a photo (R-019).
        documentActor: documentActor,
        /*
         * THE HEADER KPI RESOLVER, OWNED BY THE ROUTE.
         *
         * Injected rather than imported by the composer: its analytics gate reaches `next/headers`
         * and the composer sits in a client-reachable graph, so a value import there fails the
         * production build. Same ownership reason the drawer route runs its own producers.
         */
        resolveHeaderKpis: makeWorkUnitHeaderKpiResolver({ supabase, orgId: gate.orgId }),
        /*
         * THE SAME VERDICT THE BROWSER WOULD HAVE REACHED.
         *
         * `useAdminAuth` computes `hasPortalAdminMutateAccess(roleKeys)` from this same gate, and the
         * operational projections read it — an outcome cannot be completed without edit access. The
         * server now projects, so the server must state it, and it states it from the gate rather
         * than re-deriving so the two answers cannot drift apart.
         *
         * A later Settlement may NARROW this for a closed record (`status_can_mutate` on the drawer
         * VM). That narrowing is unchanged by this migration: at commit the browser used
         * `authCanMutate` too, because the drawer VM has not arrived yet.
         */
        canMutate: hasPortalAdminMutateAccess(gate.roleKeys ?? []),
        workUnitSlug,
        requestedWorkViewId,
        requestedSubjectId: input.requestedSubjectId,
        mode: contextual ? "contextual_focus" : "operational",
        requestedAspect: aspect ? { cardKey: aspect.card_key, itemId: aspect.item_id } : null,
        departmentConfigHeldIds: input.departmentConfigHeldIds ?? [],
        summaryConfigHeldIds: input.summaryConfigHeldIds ?? [],
    });
    const innerComposeMs = timing ? performance.now() - tInner : 0;
    let cardProducersMs: number | null = null;

    /*
     * SERVER-ONLY PRODUCER EXECUTION LIVES HERE, ABOVE THE CONTRACT BOUNDARY.
     *
     * Attendance needs a database read, so its domain owner carries `import "server-only"`. Running
     * it from `workUnitProvisioningAnswer` put that value graph under a module whose TYPES the
     * browser imports (`ProvisioningAnswer`), and the bundler followed it: Ecmascript parse failure
     * at `buildAttendanceCardVM.ts:1`, the Focus Panel rendering nothing, and all thirteen required
     * checks green. Twice.
     *
     * This module is `server-only` itself and no client type-imports it, so it is the correct owner.
     * The rule it enforces: CONTRACTS may cross to the browser, SERVER IMPLEMENTATIONS may not.
     *
     * The context is rebuilt from the ANSWER — the same fields, through the same builder the browser
     * used — rather than threaded out of the assembler, so the assembler keeps no producer edge.
     */
    const tProducers = mark();
    if (answer.terminal === "operational" && answer.focusPanelOperationalProjection) {
        /*
         * THE PARTICIPANT, RESOLVED HERE SO THE PRODUCERS BELOW CAN ANSWER.
         *
         * These producers already ran on this path; measured on deployed 50f2601be they cost 674ms
         * and produced Financials ONLY, because `attendance_ms` and `health_ms` were null on every
         * sample — no authoritative participantScope existed at commit, so both returned
         * `unavailable` and the browser had to wait for a second round trip to learn a fact the
         * database already held.
         *
         * One read, through the existing owner, scoped to this org and this opportunity. It
         * refuses to guess: two enrolled children resolve to nothing rather than to the first.
         */
        const attentionId = answer.recordOfAttention?.id ? String(answer.recordOfAttention.id) : null;
        /*
         * JOIN — AND THE SPECULATION IS VERIFIED, NEVER ASSUMED.
         *
         * The early run was keyed to the subject and household the composer announced before the
         * children shell. Two things can still change underneath it: the answer can settle on a
         * different record, and on a CHILD-GRAIN surface the household id can fall back to
         * `childComposition.family.customerId`, which resolves later than the subject row.
         *
         * Both are checked against the composed truth below. Any mismatch discards the whole
         * speculative run — participant AND producer cards together, never half of it — and the
         * canonical path runs for the real identities. An early answer for one customer must never
         * describe another.
         */
        const early = earlyRef.run ? await earlyRef.run : null;
        const earlySubjectMatches = !!early && !!attentionId && early.subjectId === attentionId;
        /*
         * CARRIED TO THE BROWSER. The producers below consume this server-side; the browser needs
         * the same identity to decide that Attendance, Health and Children are mountable at all.
         * Without it the answer ships their CONTENT and the client still reserves their cells.
         */
        const resolvedParticipant = earlySubjectMatches
            ? early!.participant
            : attentionId
              ? await resolveSoleEnrollmentParticipantForOpportunity({
                    supabase,
                    orgId: gate.orgId,
                    opportunityId: attentionId,
                })
              : null;
        answer.resolvedParticipant = resolvedParticipant;
        const commitContext = buildCommitCriticalOperationalContext({
                    mode: "work",
                    subjectId: answer.recordOfAttention?.id ?? "",
                    title: "",
                    statusLabel: answer.currentBusinessState?.stageLabel ?? null,
                    statusKey: answer.currentBusinessState?.stageKey ?? null,
                    canMutate: hasPortalAdminMutateAccess(gate.roleKeys ?? []),
                    perspective: null,
                    stageWorkRuntime: answer.focusPanelStageWork?.stage_work_runtime ?? null,
                    situation: answer.currentBusinessState
                        ? {
                              stageKey: answer.currentBusinessState.stageKey,
                              stageLabel: answer.currentBusinessState.stageLabel,
                              purpose: answer.currentBusinessState.purpose ?? null,
                          }
                        : null,
                    primaryAction: answer.primaryAction
                        ? { actionRef: answer.primaryAction.actionRef, label: answer.primaryAction.label }
                        : null,
                    subjectIdentityTruth: answer.subjectIdentityTruth ?? null,
                    subjectGrain: answer.subjectGrain,
                    resolvedParticipant,
        });
        /*
         * The canonical household answer, from the composed truth. This is the value the early run
         * gambled on; comparing them is what makes the gamble safe on child grain, where
         * `householdCustomerId` can fall back to the family row after the subject row is read.
         */
        const canonicalFinancialSubjectId = (() => {
            // Same promise as the settled frame: a malformed truth costs Financials, not the answer.
            try {
                return resolveFinancialSubjectId(commitContext);
            } catch {
                return null;
            }
        })();
        const earlyRunUsable =
            earlySubjectMatches && early!.financialSubjectId === canonicalFinancialSubjectId;
        answer.focusPanelOperationalProjection = {
            ...answer.focusPanelOperationalProjection,
            cards: earlyRunUsable
                ? early!.cards
                : await projectFocusPanelCardProducers({
                      supabase,
                      orgId: gate.orgId,
                      // The route's OWN resolved authority — same canonical bundle as the endpoint.
                      access: gate.access,
                      context: commitContext,
                      financialSubjectId: canonicalFinancialSubjectId,
                  }),
        };
        cardProducersMs = timing ? performance.now() - tProducers : 0;
    }

    if (timing) {
        // Never let a diagnostic break the product path. The collector is request-scoped through
        // React `cache()`, which the HTTP seam's route handler does not necessarily provide.
        try {
            /*
             * DEEPER BOUNDARIES STASH THEIR SPANS ON THIS SAME FIELD WHILE THEY RUN, AND
             * `recordRouteTiming` REPLACES WHOLE FIELDS — so this must preserve EVERYTHING it
             * finds, not the fields it happens to know about.
             *
             * It used to restate `producers` by name. Slice 12E added `financials` one level
             * deeper, the build recorded it correctly, and this line silently dropped it: the
             * deployed payload carried `financials: null` for every sample. Nineteen local gates
             * passed, because they proved the spans were RECORDED and nothing proved they were
             * EMITTED. A spread keeps the next one too, whatever it is called.
             */
            const already = collectedRouteTiming()?.route_compose_spans;
            recordRouteTiming({
                route_compose_spans: {
                    ...(already ?? {}),
                    route_identity_ms: Math.round(routeIdentityMs),
                    admin_client_ms: Math.round(adminClientMs),
                    document_actor_ms: Math.round(documentActorMs),
                    inner_compose_ms: Math.round(innerComposeMs),
                    card_producers_ms: cardProducersMs == null ? null : Math.round(cardProducersMs),
                },
            });
        } catch {
            /* diagnostics are never load-bearing */
        }
    }

    return { ok: true, answer };
}
