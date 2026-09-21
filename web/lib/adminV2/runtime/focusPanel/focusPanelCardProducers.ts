/**
 * THE ROOT'S CARD PRODUCERS — the cards that used to boot their own runtime.
 *
 * Business Process and Current Work project synchronously from the operational context
 * (`focusPanelOperationalProjection`). Attendance, Health and Financials cannot: each needs its own
 * read, which is exactly why each grew a card-local `fetch` and its own loading state. Measured on
 * the live panel that produced 1 + 3 lifecycles and ~4s of cards arriving independently.
 *
 * So they join the SAME lifecycle here rather than getting one each. This module owns no business
 * logic: every producer calls the existing domain owner behind the endpoint it replaces, with the
 * arguments that endpoint used.
 *
 * ── CONCURRENT, AND INDEPENDENTLY FALLIBLE ──
 *
 * One lifecycle is not one sequential query. The producers run together, and each carries its own
 * readiness so a failure is bounded to its card: a Financials outage must not cost the operator
 * Process, Attendance or Household. `Promise.allSettled` is what makes that true rather than
 * intended.
 *
 * ── THE BOUNDARY ──
 *
 * Initial card truth only. The history a card opens on demand stays where it is — the endpoints are
 * NOT deleted, because the depth layers and other surfaces still call them. What ends is the Focus
 * Panel's initial bootstrap.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildAttendanceCardVM } from "@/lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM";
import type { AttendanceCardVM } from "@/lib/adminV2/runtime/focusPanel/attendance/buildAttendanceCardVM";
import { buildHealthSafetyCardVM } from "@/lib/adminV2/runtime/focusPanel/healthSafety/buildHealthSafetyCardVM";
import type { HealthSafetyCardVM } from "@/lib/adminV2/runtime/focusPanel/healthSafety/buildHealthSafetyCardVM";
import { buildFinancialsCardVM } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import type { FinancialsCardVM } from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";

import { assertFinancialsReadAllowed } from "@/lib/financials/financialsPermissions";
import { recordProducerSpans, producerClock } from "@/lib/perf/routeTimingDiagnostic";
import type { AdminAccessContextSuccess } from "@/lib/admin/getAdminAccessContext";
import type {
    FocusPanelCardProducerResults,
    ProducerResult,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelOperationalProjectionContract";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";


const unavailable = <T,>(): ProducerResult<T> => ({ state: "unavailable", data: null });

/**
 * THE INITIAL FINANCIAL ANSWER — the account summary, not the ledger.
 *
 * Measured on deployed staging: the full card view model was 21,573 B in the initial projection, of
 * which `payments` alone was **14,738 B for two rows** and `ledgerPeriods` a further 1,915 B. That is
 * receipts, refunds and the placed ledger — the deep detail this convergence is required to keep
 * lazy — travelling in BOTH frames, on every panel, for every operator, before anyone asks to see it.
 *
 * The summary reads neither: it renders from `reconciliation`, `pastDue`, `period`, `collectible`
 * and the CURRENT period's rows, and the money it shows comes from `reconciliation.paymentsCents`, a
 * scalar. Only the expanded ledger and the payment surfaces read the rows themselves, and those are
 * interactions — the card loads the full model from the endpoint that always owned it when one opens,
 * exactly as Attendance loads its depth window.
 *
 * `rows` is deliberately NOT trimmed: at 1,676 B it is not worth a second shape, and the summary
 * filters it to the current period itself.
 */
export function boundInitialFinancials(vm: FinancialsCardVM): FinancialsCardVM {
    return { ...vm, payments: [], ledgerPeriods: [] };
}

/**
 * How many days of history the COMPACT STRIP shows.
 *
 * The card's own request asked for 31, which is the depth layer's window — the summary renders five,
 * and the domain function defaults to five for exactly that reason. Carrying 31 into initial
 * provisioning would put a month of history on the critical path to draw a week of it.
 */
const INITIAL_RECENT_DAYS = 5;

/**
 * Run the root's card producers for one subject. CONCURRENT.
 *
 * Returns a bounded result per card. Never throws: a producer that fails reports `error` and the
 * rest of the panel is unaffected.
 */
/**
 * What the Financials branch carries back out of the parallel region.
 *
 * The gate's verdict has to travel with the VM because `forbidden` (the gate refused) and
 * `unavailable` (this household has no account) are different answers to the operator, and
 * collapsing them would make a refusal look like an absence.
 */
type FinancialsProducerOutcome = { gateOk: boolean; vm: FinancialsCardVM | null };

export async function projectFocusPanelCardProducers(input: {
    supabase: SupabaseClient;
    orgId: string;
    /*
     * ONLY `participantScope` — the producers below read `customerMemberId` and `displayName` and
     * nothing else on the context, and this type now says so.
     *
     * Stated as a Pick rather than the whole context because the drawer route starts these
     * producers as soon as the composer publishes those two fields, before the full operational
     * context exists. A wider parameter would have required casting the early contract to something
     * it is not, which is the kind of hole that survives review and then decides behaviour.
     */
    context: {
        participantScope?: Pick<
            NonNullable<OperationalContext["participantScope"]>,
            "customerMemberId" | "displayName"
        > | null;
    };
    /**
     * WHOSE MONEY — resolved by the caller, not dug out of a context here.
     *
     * This used to be `resolveFinancialSubjectId(context)`, which reached into `context.truth`. That
     * transitive read is why these producers appeared to need only two fields when they actually
     * needed the record as well. Naming it as an input is what lets the drawer route start them
     * before the view model exists, and it keeps the key precedence in its one owner.
     */
    financialSubjectId: string | null;
    /**
     * THE AUTHENTICATED CALLER'S RESOLVED AUTHORITY — the route's own, never the browser's.
     *
     * MOVING A READ FROM A CARD ENDPOINT INTO ROOT PROVISIONING MUST NOT CHANGE WHO IS AUTHORIZED
     * TO RECEIVE IT. Producer convergence changes where a read RUNS; it does not change who may see
     * the answer. Health is the first producer where that distinction has teeth: its endpoint
     * resolves the caller's grants and refuses without `health.view`, and route admission is
     * deliberately not the boundary — an operator who works Attendance holds that admission and must
     * not receive allergies, conditions and medications.
     *
     * This is `AdminAccessContextSuccess`, the SAME canonical resolution the endpoint performs,
     * from the same per-request cached bundle — not a second permission model and not a
     * Health-shaped one. The root route already holds it as `gate.access`, so nothing is resolved
     * twice and nothing new is trusted.
     *
     * It is deliberately the whole resolved authority rather than a plucked permission list:
     * Financials will need org/site scope from the same object, and a producer that received only
     * the fact it asked for would invite the next producer to invent its own channel.
     */
    access: AdminAccessContextSuccess;
    /**
     * The compose clock's origin, so producer offsets share the overlap block's frame.
     *
     * DIAGNOSTIC ONLY and optional: absent, the producer clock falls back to its own creation and
     * the spans stay self-consistent but are not comparable with `compose_end_offset_ms`. Callers
     * that want the residual tail ATTRIBUTED must pass it — see `producerClock`.
     */
    timingOriginMs?: number;
}): Promise<FocusPanelCardProducerResults> {
    const { supabase, orgId, context, access } = input;

    /*
     * The scoped participant, resolved by the context rather than by the card.
     *
     * `participantScopeFromChildSubjectTruth` already answers "which child is this panel about" for
     * both frames, and Attendance is keyed on that member. Absent is ordinary — a family row with no
     * scoped child has no attendance to show — and is `unavailable`, not an error.
     */
    const customerMemberId = context.participantScope?.customerMemberId ?? null;

    const displayName = context.participantScope?.displayName ?? null;

    /*
     * FINANCIALS IS THE HOUSEHOLD'S ACCOUNT, resolved by the shared rule rather than this module's
     * opinion of it. `resolveFinancialSubjectId` is the same function the card and the card registry
     * both call, which is what stops a card being admitted because an account "is available" and
     * then failing to find one in the very context that admitted it.
     */
    const financialSubjectId = (() => {
        /*
         * THE ORCHESTRATOR'S PROMISE IS ABSOLUTE: this function never throws, so one card can never
         * cost the operator the panel. That promise has to cover its own preamble too — a throw
         * HERE, before `Promise.allSettled`, would reject every producer at once, which is precisely
         * the blast radius the settled region exists to prevent.
         *
         * `OperationalContext.truth` is required by its type, so this should be unreachable. "Should
         * be unreachable" is the reason to catch it rather than the reason not to: the cost is one
         * card reporting no account, and the alternative cost is the whole Focus Panel.
         */
        return input.financialSubjectId;
    })();

    /*
     * FINANCIALS AUTHORIZATION IS NOT HEALTH'S, and assuming it was is the mistake this audit
     * existed to prevent.
     *
     * Health's domain owner evaluates the grant itself, from the caller's resolved permission keys.
     * Financials refuses OUTSIDE its VM builder, through `assertFinancialsReadAllowed`, which
     * resolves the actor's grants against the org with the service client and checks `fin.read` —
     * a different key, a different resolver, and a gate that runs BEFORE any figure is computed.
     * `buildFinancialsCardVM` takes no access argument at all, so calling it without this gate would
     * hand the household's balance to anyone the route admitted.
     *
     * So the producer calls the SAME canonical gate the endpoint calls, with the route-resolved org
     * and caller. It does not restate `fin.read`, and it does not re-resolve WHO the caller is —
     * `access.userId` is the identity the route already admitted.
     */
    /*
     * P0-7.6 SLICE 12D — THE FINANCIALS GATE NO LONGER SERIALIZES THE OTHER TWO PRODUCERS.
     *
     * `assertFinancialsReadAllowed` used to be AWAITED HERE, above `Promise.allSettled`, so a
     * permission round trip that only Financials needs ran to completion before Attendance and
     * Health were allowed to start. Measured on deployed `7e0d399ef`, this whole function is the
     * dominant wait on the document's critical path — median 2,791 ms of a 5,005 ms compose — and a
     * serial preamble in front of three parallel reads is the one part of it that no data dependency
     * requires.
     *
     * The gate now runs INSIDE the Financials branch. Nothing about the authorization changes: the
     * same canonical gate, with the same route-resolved org and caller, still runs BEFORE
     * `buildFinancialsCardVM`, a failed grant read is still a refusal rather than "no opinion", and
     * a denied caller still causes no ledger read at all. Only the scheduling changed — it now
     * overlaps Attendance and Health instead of preceding them.
     *
     * The verdict is carried out of the branch because the result mapping needs it to tell
     * `forbidden` (the gate said no) from `unavailable` (there is no account), which are different
     * answers and must not collapse into one.
     */
    const clock = producerClock(input.timingOriginMs);
    const [attendance, health, financials] = await Promise.allSettled([
        customerMemberId
            ? clock.time("attendance_ms", () =>
                  buildAttendanceCardVM(supabase, {
                      orgId,
                      customerMemberId,
                      displayName,
                      recentDays: INITIAL_RECENT_DAYS,
                  }),
              )
            : Promise.resolve(null),
        /*
         * The SAME domain owner the endpoint calls, with the SAME resolved authority.
         *
         * The refusal is not restated here: `buildHealthSafetyCardVM` evaluates `health.view` itself
         * and returns `permissionDenied`, exactly as it does for the endpoint. Re-deciding it in the
         * producer would be a second authorization model — the thing this convergence must not
         * create. A failed grant read reaches the resolver as a non-array and denies, so the
         * fail-closed behaviour is the endpoint's, inherited rather than reimplemented.
         */
        customerMemberId
            ? clock.time("health_ms", () =>
                  buildHealthSafetyCardVM(supabase, {
                      orgId,
                      customerMemberId,
                      displayName,
                      access: { permissionKeys: access.permissionKeys },
                  }),
              )
            : Promise.resolve(null),
        /*
         * Only reached when the gate ALLOWED. A denied caller never causes a ledger read at all,
         * which is both the authorization property and the cheaper answer.
         */
        financialSubjectId
            ? (async (): Promise<FinancialsProducerOutcome> => {
                  const gate = await clock.time("financials_gate_ms", () =>
                      assertFinancialsReadAllowed({
                          supabase,
                          orgId,
                          userId: access.userId,
                      }),
                  ).catch(() => ({
                      /*
                       * A FAILED GRANT READ IS A REFUSAL, not an empty grant set. The endpoint's
                       * gate rejects and the route never reaches the VM; the producer must not be
                       * the softer door by treating the failure as "no opinion" and reading the
                       * ledger anyway.
                       */
                      ok: false as const,
                  }));
                  // Only reached when the gate ALLOWED. A denied caller never causes a ledger read
                  // at all, which is both the authorization property and the cheaper answer.
                  if (!gate.ok) return { gateOk: false, vm: null };
                  const vm = await clock.time("financials_build_ms", () =>
                      buildFinancialsCardVM(supabase, {
                          orgId,
                          customerId: financialSubjectId,
                          // The child filter, when the surface is scoped to one. The ACCOUNT is
                          // still the household's — this narrows the view, not the subject.
                          customerMemberId,
                      }),
                  );
                  return { gateOk: true, vm: vm ?? null };
              })()
            : Promise.resolve(null),
    ]);

    recordProducerSpans(clock.spans(), clock.offsets());

    return {
        attendance:
            attendance.status === "rejected"
                ? { state: "error", data: null }
                : attendance.value
                  ? { state: "ready", data: attendance.value }
                  : unavailable<AttendanceCardVM>(),
        health:
            health.status === "rejected"
                ? { state: "error", data: null }
                : !health.value
                  ? unavailable<HealthSafetyCardVM>()
                  : health.value.permissionDenied
                    ? /*
                       * DENIED CARRIES NO DATA. The endpoint answers 403 with no `vm`, and the
                       * producer must not be the softer door: returning the VM and trusting the card
                       * to hide it would put health facts in the payload of a caller who may not see
                       * them, where a devtools network tab is enough to read them.
                       */
                      { state: "forbidden", data: null }
                    : { state: "ready", data: health.value },
        financials:
            financials.status === "rejected"
                ? { state: "error", data: null }
                : !financialSubjectId
                  ? /* No household, no account. Ordinary, and not a refusal. */
                    unavailable<FinancialsCardVM>()
                  : !financials.value?.gateOk
                    ? { state: "forbidden", data: null }
                    : financials.value.vm
                      ? { state: "ready", data: boundInitialFinancials(financials.value.vm) }
                      : unavailable<FinancialsCardVM>(),
    };
}
