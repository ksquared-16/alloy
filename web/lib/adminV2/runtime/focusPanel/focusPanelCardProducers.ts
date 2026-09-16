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
import type { AdminAccessContextSuccess } from "@/lib/admin/getAdminAccessContext";
import type {
    FocusPanelCardProducerResults,
    ProducerResult,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelOperationalProjectionContract";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";


const unavailable = <T,>(): ProducerResult<T> => ({ state: "unavailable", data: null });

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
export async function projectFocusPanelCardProducers(input: {
    supabase: SupabaseClient;
    orgId: string;
    context: OperationalContext;
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

    const [attendance, health] = await Promise.allSettled([
        customerMemberId
            ? buildAttendanceCardVM(supabase, {
                  orgId,
                  customerMemberId,
                  displayName,
                  recentDays: INITIAL_RECENT_DAYS,
              })
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
            ? buildHealthSafetyCardVM(supabase, {
                  orgId,
                  customerMemberId,
                  displayName,
                  access: { permissionKeys: access.permissionKeys },
              })
            : Promise.resolve(null),
    ]);

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
    };
}
