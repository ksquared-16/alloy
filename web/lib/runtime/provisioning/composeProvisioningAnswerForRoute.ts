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
import { resolveQueueRecordScopeConstraints } from "@/lib/admin/resolveQueueRecordScopeConstraints";
import { fetchEffectiveUserDisplayTimezoneCached } from "@/lib/admin/timezoneContract";
import {
    resolveWorkViewTotalsSeed,
    type WorkViewTotalsSeed,
} from "@/lib/runtime/provisioning/workViewTotalsSeed";
import { resolveFinancialSubjectId } from "@/lib/adminV2/runtime/focusPanel/financialSubjectIdentity";
import { resolveSoleEnrollmentParticipantForOpportunity } from "@/lib/adminV2/runtime/operationalContext/resolveParticipationSubjectForOpportunity";
import { projectFocusPanelCardProducers } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardProducers";
import { buildCommitCriticalOperationalContext } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromProvisioningAnswer";
import { loadOpportunityTourProjectionStrict } from "@/lib/adminV2/viewModel/drawer/opportunity/loadOpportunityActiveTourBookingsForViewModel";
import { buildTourSignalFromBookings } from "@/lib/adminV2/runtime/operationalContext/buildOperationalContext";
import type { TourBookingRow } from "@/lib/tours/bookings/types";
import { collectedRouteTiming, recordRouteTiming, routeTimingEnabled } from "@/lib/perf/routeTimingDiagnostic";
import {
    applyProvisioningSettlement,
    settlementNavigationForRequest,
    type ProvisioningSettlementPatch,
} from "@/lib/runtime/provisioning/provisioningSettlement";

export {
    applyProvisioningSettlement,
    settlementMatchesFrame,
    settlementNavigationForRequest,
    type ProvisioningSettlementPatch,
} from "@/lib/runtime/provisioning/provisioningSettlement";

export type RouteProvisioningResult =
    | {
          ok: true;
          answer: ProvisioningAnswer;
          /** Present only when `deferSettlement` was asked for; null on every settled path. */
          settlement?: Promise<ProvisioningSettlementPatch | null> | null;
          /**
           * THE OUTER SPANS, RETURNED RATHER THAN COLLECTED (OX Slice 8).
           *
           * `recordRouteTiming` writes into a collector scoped by React `cache()`, which the RSC
           * boundaries share and a ROUTE HANDLER does not provide — so the HTTP seam read an empty
           * collector and emitted nothing. That was measured, not predicted: the first deployed
           * samples carrying the emission came back with the field absent on every one.
           *
           * Returning them makes the seam independent of request-scoping it does not have. The
           * collector call is kept beside this, unchanged, because the RSC route still consumes it.
           * Null when the timing flag is off.
           */
          timingSpans?: Record<string, unknown> | null;
      }
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
    /**
     * PHASE 1 ONLY. Return as soon as the frame is composed and hand the capability settlement back
     * as a promise, instead of holding the answer until the producers finish. Only a caller that can
     * deliver a SECOND payload may ask for this.
     */
    deferSettlement?: boolean;
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
    /*
     * TWO WORK-VIEW IDENTITIES, AND THEY ARE NOT THE SAME FACT (P0-7.6 settlement lens identity).
     *
     * REQUESTED is what the caller addressed: the URL's `work_view_id`, null when none was given.
     * It is NAVIGATION IDENTITY — the thing the frame was registered under, and the thing a
     * settlement must be addressed to in order to find that frame again.
     *
     * RESOLVED is what CONTENT composes under, and it may be filled in below from the slug's implied
     * view. That default is correct for content and wrong for identity.
     *
     * These used to be one reassigned local called `requestedWorkViewId`, so the settlement was
     * addressed with the RESOLVED lens while `page.tsx` had registered the frame under the REQUESTED
     * one. `navigationKey` includes the lens, so on the ordinary path — no explicit lens, slug
     * implies a default — the keys differed, `frames.get` missed, and `applyFrameSettlement` returned
     * `no_frame`. The patch carrying Financials, Attendance and Health was discarded every time, and
     * Financials sat at `data-financials-empty="loading"` indefinitely.
     *
     * The capture is `const` on purpose: the defect was a reassignment, so the repair is a value that
     * cannot be reassigned, not a second careful reader.
     */
    const requestedWorkViewId: string | null = input.requestedWorkViewId ?? null;
    let resolvedWorkViewId: string | null = requestedWorkViewId;
    if (resolution && resolution.status === "resolved") {
        workUnitSlug = resolution.match.workUnitKey;
        // THE SLUG'S IMPLIED VIEW IS A SECOND PLACE A LENS GETS FILLED IN — and the one that would
        // have quietly defeated contextual focus. When the operator selected no cohort there is
        // nothing for the slug to imply on their behalf: they addressed a HOST, and the view the slug
        // happens to open by default is exactly the `New` this whole change exists to stop claiming.
        if (!resolvedWorkViewId && !contextual && resolution.match.initialWorkViewId) {
            resolvedWorkViewId = resolution.match.initialWorkViewId;
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
    /*
     * THE TOUR SIGNAL, RESOLVED BY THE ANSWER.
     *
     * Started beside the participant read rather than after it: the two are independent, and the
     * collapsed Business Process card needs this one. `null` here means NOT RESOLVED — a failed
     * read must never reach the surface as "no tour".
     */
    const tourRef: { run: Promise<{ active: TourBookingRow[]; operatorRelevant: TourBookingRow | null } | null> | null } =
        { run: null };
    /*
     * THE OVERLAP'S OWN INSTRUMENT — because the existing spans structurally cannot see it.
     *
     * `inner_compose_ms` and `card_producers_ms` measure two ADJACENT blocks. That was a complete
     * description while the producers ran after composition; they now run BESIDE it, so
     * `card_producers_ms` measures only whatever is left at the join, and the producers' real
     * start, duration and overlap have no observer at all. Reporting the shrunken join block as
     * "the producers got faster" would be the same class of error as calling `compose_wall_ms` a
     * prelude: a precise number for something other than the thing named.
     *
     * Counters, not only clocks. The acceptance condition for the matching path is ONE producer
     * invocation, and no duration can tell a reuse apart from a second run that happened to be
     * quick. Diagnostics only, behind the same flag, never load-bearing.
     */
    /*
     * THE WU-03 COUNT SEED, STARTED FROM THE COMPOSER'S ANNOUNCEMENT.
     *
     * Same shape as the producer overlap above and for the same reason: everything the counts need
     * is authoritative well before composition finishes, and the browser's second round trip
     * cannot begin until the document has ENDED. Starting here overlaps the remainder of
     * composition instead of queueing behind all of it.
     *
     * The route owns this rather than the composer because the scope constraints and the viewer
     * timezone come from the route GATE, which the composer deliberately does not receive.
     */
    const seedRef: { run: Promise<WorkViewTotalsSeed | null> | null } = { run: null };
    /*
     * OBSERVED, NOT AWAITED (Candidate A).
     *
     * Work View totals are FACTS, not geometry. Membership and order are decided by configuration
     * and are final at the frame; only the VALUES are outstanding. Measured on deployed 31fb4b0c,
     * waiting for them cost `join_wait_ms` P50 252ms of a 1,273ms frame — the largest remaining
     * bounded term, and the last one with a mechanism.
     *
     * Same shape the cohort enrichment, the children roster and the card producers already use: the
     * value is taken if it has landed by the commit boundary, and otherwise the field stays null,
     * which the client already reads as "resolve these yourself" — never as zero.
     */
    const seedSettled: { value: WorkViewTotalsSeed | null } = { value: null };
    const seedDiag = {
        announce_offset_ms: null as number | null,
        seed_ms: null as number | null,
        seed_end_offset_ms: null as number | null,
        compose_end_offset_ms: null as number | null,
        overlap_ms: null as number | null,
        join_wait_ms: null as number | null,
        /** 1 when the totals had landed by the commit boundary, 0 when they settle afterwards. */
        seed_at_commit: null as number | null,
        outcome: "no_announcement",
        groups: null as number | null,
        totals: null as number | null,
    };
    const overlapDiag = {
        announce_offset_ms: null as number | null,
        participant_ms: null as number | null,
        producers_ms: null as number | null,
        early_total_ms: null as number | null,
        early_end_offset_ms: null as number | null,
        compose_end_offset_ms: null as number | null,
        overlap_ms: null as number | null,
        tail_ms: null as number | null,
        outcome: "no_announcement",
        early_rejected: false,
        producer_invocations: 0,
        participant_reads: 0,
    };

    let answer = await composeWorkUnitProvisioningAnswer({
        onWorkViewCountTargetsResolved: (targets) => {
            if (seedRef.run) return;
            const tSeed = mark();
            seedDiag.announce_offset_ms = timing ? Math.round(tSeed - tInner) : null;
            seedDiag.groups = new Set(
                targets.countTargets.map((t) => `${t.hostWorkUnitId}::${t.baseQueueKey}`),
            ).size;
            seedRef.run = (async (): Promise<WorkViewTotalsSeed> => {
                /*
                 * Scope and timezone come from THIS request's gate, resolved here and nowhere
                 * else. They are the only two facts the seed needs that the composer does not
                 * already hold, and they are request-time by construction — no verdict is cached,
                 * persisted, or carried to another request.
                 */
                const [scopeBundle, viewerDisplayTimeZone] = await Promise.all([
                    resolveQueueRecordScopeConstraints(supabase, gate.orgId, gate.dim, null),
                    fetchEffectiveUserDisplayTimezoneCached(supabase, {
                        orgId: gate.orgId,
                        userId: gate.userId,
                    }),
                ]);
                const seed = await resolveWorkViewTotalsSeed({
                    supabase,
                    orgId: targets.orgId,
                    hostWorkUnitId: targets.hostWorkUnitId,
                    countTargets: targets.countTargets,
                    deptWorkUnits: targets.deptWorkUnits,
                    departmentMetadata: targets.departmentMetadata,
                    departmentId: targets.departmentId,
                    recordScopeConstraints: scopeBundle.recordScopeConstraints,
                    recordScopeImpossible: scopeBundle.recordScopeImpossible,
                    viewerDisplayTimeZone,
                });
                if (timing) {
                    const end = performance.now();
                    seedDiag.seed_ms = Math.round(end - tSeed);
                    seedDiag.seed_end_offset_ms = Math.round(end - tInner);
                }
                return seed;
            })().catch(() => {
                seedDiag.outcome = "seed_failed";
                return null;
            });
            // Records the value if and when it lands. Reading `.value` at the commit boundary asks
            // "did this arrive in time?" and nothing else.
            void seedRef.run.then((v) => {
                seedSettled.value = v;
            });
        },
        onSubjectResolved: ({ subjectId, orgId, customerId }) => {
            if (!tourRef.run && subjectId) {
                // Settled to null on failure, so the signal stays settlement-owned rather than
                // publishing an empty nobody established.
                tourRef.run = loadOpportunityTourProjectionStrict(supabase, orgId, subjectId)
                    .then((v) => v)
                    .catch(() => null);
            }
            if (earlyRef.run || !subjectId) return;
            /*
             * Participant, then producers — the whole prerequisite chain, started as soon as the
             * subject and household are known instead of after the answer exists. Settled here so
             * an unhandled rejection can never escape while composition is still assembling; the
             * join treats null as "no speculation" and falls back canonically.
             */
            const tAnnounce = mark();
            overlapDiag.announce_offset_ms = timing ? Math.round(tAnnounce - tInner) : null;
            earlyRef.run = (async (): Promise<EarlyProducerRun> => {
                const tEarlyParticipant = mark();
                overlapDiag.participant_reads += 1;
                const participant = await resolveSoleEnrollmentParticipantForOpportunity({
                    supabase,
                    orgId,
                    opportunityId: subjectId,
                });
                if (timing) {
                    overlapDiag.participant_ms = Math.round(performance.now() - tEarlyParticipant);
                }
                const tEarlyProducers = mark();
                overlapDiag.producer_invocations += 1;
                const cards = await projectFocusPanelCardProducers({
                    supabase,
                    orgId,
                    // Same origin as every other offset in `overlapDiag`, so producer `end` can be
                    // compared with `compose_end_offset_ms` to name the residual tail's owner.
                    timingOriginMs: tInner,
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
                if (timing) {
                    const tEarlyEnd = performance.now();
                    overlapDiag.producers_ms = Math.round(tEarlyEnd - tEarlyProducers);
                    overlapDiag.early_total_ms = Math.round(tEarlyEnd - tAnnounce);
                    overlapDiag.early_end_offset_ms = Math.round(tEarlyEnd - tInner);
                }
                return { subjectId, financialSubjectId: customerId, participant, cards };
            })().catch(() => {
                // Recorded, not swallowed: a speculative run that FAILED and one that never
                // started both produce `null`, and they call for different repairs.
                overlapDiag.early_rejected = true;
                return null;
            });
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
        // CONTENT resolution, so the slug's implied default still applies exactly as before. The
        // field's name is the composer request's, and it is fed the RESOLVED lens deliberately.
        requestedWorkViewId: resolvedWorkViewId,
        requestedSubjectId: input.requestedSubjectId,
        mode: contextual ? "contextual_focus" : "operational",
        requestedAspect: aspect ? { cardKey: aspect.card_key, itemId: aspect.item_id } : null,
        departmentConfigHeldIds: input.departmentConfigHeldIds ?? [],
        summaryConfigHeldIds: input.summaryConfigHeldIds ?? [],
    });
    const innerComposeMs = timing ? performance.now() - tInner : 0;
    overlapDiag.compose_end_offset_ms = timing ? Math.round(innerComposeMs) : null;
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
    /*
     * ── SETTLEMENT, SEPARATED FROM THE FRAME ────────────────────────────────────────────────────
     *
     * Everything below resolves FACTS — the participation identity, the tour signal, and the card
     * producers' attendance / health / financials answers. None of it selects geometry, and measured
     * on deployed a5eb2f29 the join cost `card_producers_ms` P50 740ms, which was the binder between
     * a decided geometry (144ms) and a committed frame (1,983ms).
     *
     * It is a CLOSURE rather than straight-line code so the same body can run two ways: awaited and
     * applied inline (the HTTP seam, whose caller expects one settled answer), or started and
     * handed back as a promise (the RSC route, which emits the frame first and streams this after).
     * One body, so the two paths cannot drift into two answers.
     *
     * It returns a PATCH instead of mutating `answer`, because by the time it resolves on the
     * deferred path the frame has already been serialized and sent.
     */
    let patch: ProvisioningSettlementPatch | null = null;
    const runSettlement = async (): Promise<ProvisioningSettlementPatch | null> => {
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
                  ? await (async () => {
                        overlapDiag.participant_reads += 1;
                        return resolveSoleEnrollmentParticipantForOpportunity({
                            supabase,
                            orgId: gate.orgId,
                            opportunityId: attentionId,
                        });
                    })()
                  : null;
            // COLLECTED, not written: the frame may already have been emitted.
            /*
             * Map through the ONE canonical mapping owner settlement uses, so the commit answer and the
             * settled answer cannot drift. Omitted entirely when the read did not resolve.
             */
            const tourProjection = tourRef.run ? await tourRef.run : null;
            const resolvedTour = tourProjection
                ? buildTourSignalFromBookings({
                      activeBookings: tourProjection.active,
                      operatorRelevantBooking: tourProjection.operatorRelevant,
                      truth: (answer.subjectIdentityTruth ?? {}) as Record<string, unknown>,
                  })
                : null;
            // COLLECTED, not written — see above.
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
                        resolvedTour,
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
            const settledCards = earlyRunUsable
                    ? early!.cards
                    : await (async () => {
                          overlapDiag.producer_invocations += 1;
                          return projectFocusPanelCardProducers({
                              supabase,
                              orgId: gate.orgId,
                              timingOriginMs: tInner,
                              // The route's OWN resolved authority — the same canonical bundle the
                              // endpoint uses.
                              access: gate.access,
                              context: commitContext,
                              financialSubjectId: canonicalFinancialSubjectId,
                          });
                      })();
            patch = {
                // IDENTITY, not content: one builder, so the two sites cannot drift apart again.
                navigation: settlementNavigationForRequest({
                    rawSlug: input.rawSlug,
                    requestedWorkViewId,
                    requestedSubjectId: input.requestedSubjectId ?? null,
                    cohort: input.cohort ?? null,
                    aspect: input.aspect ?? null,
                }),
                identity: {
                    subjectId: answer.recordOfAttention?.id ? String(answer.recordOfAttention.id) : null,
                    stageKey: answer.currentBusinessState?.stageKey ?? null,
                    workViewId: answer.contextFrame?.workViewId ?? null,
                },
                resolvedParticipant,
                resolvedTour,
                cards: settledCards,
            };
            cardProducersMs = timing ? performance.now() - tProducers : 0;
            /*
             * THE OUTCOME, NAMED BY THE JOIN THAT ACTUALLY DECIDED IT.
             *
             * The branches stay distinct because each implies a different repair: a subject mismatch
             * means the announcement fired on the wrong record, a customer mismatch means child-grain
             * household fallback moved underneath the speculation, and `early_failed` means the
             * speculative chain threw. Collapsing them into "not used" would hide which is happening,
             * and only one of the three would be worth fixing.
             */
            overlapDiag.outcome = !earlyRef.run
                ? "no_announcement"
                : overlapDiag.early_rejected || !early
                  ? "early_failed"
                  : !earlySubjectMatches
                    ? "subject_mismatch"
                    : !earlyRunUsable
                      ? "customer_mismatch"
                      : "used";
            if (
                timing &&
                overlapDiag.early_end_offset_ms != null &&
                overlapDiag.announce_offset_ms != null
            ) {
                const composeEnd = overlapDiag.compose_end_offset_ms ?? 0;
                /*
                 * Overlap is the part of the early run that ran WHILE composition was still running —
                 * announcement to whichever ended first. The tail is whatever ran after composition
                 * finished, clamped at zero: a run that finished early has no tail, not a negative one.
                 */
                overlapDiag.overlap_ms = Math.max(
                    0,
                    Math.round(
                        Math.min(overlapDiag.early_end_offset_ms, composeEnd) -
                            overlapDiag.announce_offset_ms,
                    ),
                );
                overlapDiag.tail_ms = Math.max(
                    0,
                    Math.round(overlapDiag.early_end_offset_ms - composeEnd),
                );
            }
        }
        return patch;
    };

    /*
     * THE FORK. `deferSettlement` is the RSC route saying "emit the frame now, stream the rest".
     * Every other caller — the HTTP seam most of all — still gets ONE fully settled answer, because
     * its consumer has no second delivery to wait for.
     */
    const settlementNavigation: ProvisioningSettlementPatch["navigation"] =
        settlementNavigationForRequest({
            rawSlug: input.rawSlug,
            requestedWorkViewId,
            requestedSubjectId: input.requestedSubjectId ?? null,
            cohort: input.cohort ?? null,
            aspect: input.aspect ?? null,
        });
    let deferredSettlement: Promise<ProvisioningSettlementPatch | null> | null = null;
    if (input.deferSettlement) {
        // Started, never awaited. The rejection handler keeps an unawaited failure from surfacing
        // as an unhandled rejection on a request that has already answered.
        deferredSettlement = runSettlement().catch(() => null);
    } else {
        const settled = await runSettlement();
        if (settled) answer = applyProvisioningSettlement(answer, settled, settlementNavigation);
    }

    /*
     * ── THE SEED, READ RATHER THAN AWAITED ──
     *
     * This used to await `seedRef.run`, and that wait was published honestly as `join_wait_ms` —
     * P50 252ms on deployed 31fb4b0c. The original slice existed to remove a ~1.6s post-document
     * round trip, and it still does: the seed is still computed, still started from the composer's
     * announcement, and still delivered whenever it has landed. What is gone is the frame waiting
     * for it.
     *
     * Still no grace and no timeout. A seed that has not landed leaves the field null, which is the
     * same honest state the client has always handled by resolving the counts itself. It is never
     * an authoritative zero.
     */
    const seed = seedSettled.value;
    if (timing) {
        // Zero by construction now: the frame does not wait here. Kept so a reintroduced await
        // shows up as a non-zero number in the deployed samples rather than silently.
        seedDiag.join_wait_ms = 0;
        seedDiag.seed_at_commit = seed ? 1 : 0;
        seedDiag.compose_end_offset_ms = Math.round(innerComposeMs);
        if (seedDiag.announce_offset_ms != null && seedDiag.seed_end_offset_ms != null) {
            // The part of the seed that ran while composition was still running.
            seedDiag.overlap_ms = Math.max(
                0,
                Math.round(
                    Math.min(seedDiag.seed_end_offset_ms, innerComposeMs) - seedDiag.announce_offset_ms,
                ),
            );
        }
    }
    if (seed && seed.status === "resolved") {
        answer.workViewTotalsSeed = seed;
        seedDiag.outcome = "resolved";
        seedDiag.totals = seed.totals.length;
    } else if (seed) {
        // UNAVAILABLE IS NOT AN EMPTY ANSWER. The field carries the unresolved shape, which has no
        // totals at all, so a client cannot mistake it for authoritative zeros.
        answer.workViewTotalsSeed = seed;
        seedDiag.outcome = seed.reason;
    } else if (seedRef.run) {
        answer.workViewTotalsSeed = null;
        if (seedDiag.outcome === "no_announcement") seedDiag.outcome = "seed_failed";
    } else {
        answer.workViewTotalsSeed = null;
    }

    if (cardProducersMs == null) {
        // The producers genuinely did not run, so no overlap branch was ever reachable. Reporting
        // "no_announcement" here would name a missing announcement that was never due.
        overlapDiag.outcome = "not_operational";
    }

    let outerSpans: Record<string, unknown> | null = null;
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
            outerSpans = {
                    ...(already ?? {}),
                    route_identity_ms: Math.round(routeIdentityMs),
                    admin_client_ms: Math.round(adminClientMs),
                    document_actor_ms: Math.round(documentActorMs),
                    inner_compose_ms: Math.round(innerComposeMs),
                    card_producers_ms: cardProducersMs == null ? null : Math.round(cardProducersMs),
                    work_view_totals_seed: {
                        announce_offset_ms: seedDiag.announce_offset_ms,
                        seed_ms: seedDiag.seed_ms,
                        seed_end_offset_ms: seedDiag.seed_end_offset_ms,
                        compose_end_offset_ms: seedDiag.compose_end_offset_ms,
                        overlap_ms: seedDiag.overlap_ms,
                        join_wait_ms: seedDiag.join_wait_ms,
                        seed_at_commit: seedDiag.seed_at_commit,
                        outcome: seedDiag.outcome,
                        groups: seedDiag.groups,
                        totals: seedDiag.totals,
                    },
                    overlap: {
                        announce_offset_ms: overlapDiag.announce_offset_ms,
                        participant_ms: overlapDiag.participant_ms,
                        producers_ms: overlapDiag.producers_ms,
                        early_total_ms: overlapDiag.early_total_ms,
                        early_end_offset_ms: overlapDiag.early_end_offset_ms,
                        compose_end_offset_ms: overlapDiag.compose_end_offset_ms,
                        overlap_ms: overlapDiag.overlap_ms,
                        tail_ms: overlapDiag.tail_ms,
                        outcome: overlapDiag.outcome,
                        producer_invocations: overlapDiag.producer_invocations,
                        participant_reads: overlapDiag.participant_reads,
                    },
            };
            // The RSC route still reads the collector; the HTTP seam reads the returned value.
            recordRouteTiming({ route_compose_spans: outerSpans as never });
        } catch {
            /* diagnostics are never load-bearing */
        }
    }

    return { ok: true, answer, settlement: deferredSettlement, timingSpans: outerSpans };
}
