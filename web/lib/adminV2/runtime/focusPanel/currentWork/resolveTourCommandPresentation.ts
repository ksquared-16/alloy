/**
 * ONE TOUR CONCEPT, PRESENTED BY ITS CURRENT STATE.
 *
 * The Process card was rendering every Tour capability the published process configured —
 * Schedule Tour, Reschedule Tour, Cancel Tour, Send Tour Invitation — as unrelated flat
 * commands, so a scheduled tour still offered "Schedule Tour" beside "Cancel Tour" and the
 * operator had to infer the state from which buttons happened to be present.
 *
 * Current Work already grouped them, through `partitionTourGroupedActions` and
 * `CurrentWorkTourGroupedActions`. What it did NOT do is say anything about the state: its
 * trigger is the literal string "Tour ▾". So this module is the small piece neither surface
 * had — the label — and it deliberately reuses the existing partition rather than forking a
 * second notion of "which commands are Tour commands".
 *
 * ── WHAT THIS IS NOT ──
 *
 * It is not a Tour state store, and it does not decide availability. Durable truth stays in
 * `tour_bookings`; the Operational Context projects it as `signals.tour`; which operations are
 * offered is still decided upstream by `alignTourSupportingActionsForBookingState` and the
 * platform's own eligibility. This reads the projected state and the already-resolved command
 * list and returns how to LABEL the group. Nothing here can add, remove or enable a command.
 *
 * ── BRANCHING ON THE KEY, NEVER THE LABEL ──
 *
 * State comes from `statusKey` — the canonical `tour_bookings.status_key`. Branching on a
 * rendered string is the same class of defect as identifying an executable action by its
 * label, which is what put a blank Compose New behind Send Tour Invitation.
 */

import { partitionTourGroupedActions } from "@/lib/adminV2/runtime/focusPanel/currentWork/groupTourPresentationActions";
import type { OperationalTourSignal } from "@/lib/adminV2/runtime/operationalContext/types";
import type { TourBookingStatusKey } from "@/lib/tours/bookings/types";

/** How the Tour group should present itself right now. */
export type TourCommandPresentation = {
    /** True when the Tour commands should collapse into one state-bearing control. */
    grouped: boolean;
    /**
     * The control's label. `null` when there is nothing to collapse — the caller then renders
     * the Tour commands as it renders any other command, and the primary scheduling operation
     * simply stands on its own.
     */
    label: string | null;
    /** The canonical state the label describes, for tests and diagnostics. Never rendered raw. */
    statusKey: TourBookingStatusKey | null;
};

/**
 * The operator-facing stem per durable booking state.
 *
 * Terminal states are here now. They used to be unreachable: the drawer VM filtered bookings
 * to the non-terminal keys before the Operational Context saw them, so a completed tour
 * arrived as "no tour" and the card offered Schedule Tour as though the family had never
 * visited. `operator_relevant_tour_booking` carries the concluded booking through, and these
 * say what it was.
 */
const STATE_STEM: Partial<Record<TourBookingStatusKey, string>> = {
    requested: "Tour requested",
    pending_approval: "Tour pending approval",
    confirmed: "Tour scheduled",
    rescheduled: "Tour rescheduled",
    canceled: "Tour canceled",
    completed: "Tour completed",
    no_show: "Tour no-show",
};

/**
 * Whether the state's own time is worth printing beside it.
 *
 * A standing appointment is a time the operator is working toward, so it leads with one. A
 * concluded tour's instant is history: "Tour completed" is the operative fact, and pinning a
 * date to it invites reading a past tour as an upcoming one.
 */
const STATE_CARRIES_TIME = new Set<TourBookingStatusKey>([
    "requested",
    "pending_approval",
    "confirmed",
    "rescheduled",
]);

/** "Sep 8, 10:00 AM" in the viewer's zone. Null when there is no usable instant. */
export function formatTourControlWhen(
    startAt: string | null | undefined,
    timeZone?: string | null,
): string | null {
    const raw = (startAt ?? "").trim();
    if (!raw) return null;
    const at = new Date(raw);
    if (Number.isNaN(at.getTime())) return null;
    try {
        return at.toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            ...(timeZone ? { timeZone } : {}),
        });
    } catch {
        // An unusable zone must not cost the operator the whole control.
        return at.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    }
}

/**
 * Decide how a resolved command list should present its Tour operations. PURE.
 *
 * @param actions the already-resolved, already-aligned commands. Never re-filtered here.
 * @param tour    the projected Tour signal. Never re-fetched here.
 */
export function resolveTourCommandPresentation<T extends { key: string; handlerKey?: string | null }>(
    actions: readonly T[],
    tour: Pick<OperationalTourSignal, "scheduled" | "startAt" | "statusKey"> | null | undefined,
    opts?: { timeZone?: string | null },
): TourCommandPresentation & { tour: T[]; rest: T[] } {
    const { tour: tourActions, rest } = partitionTourGroupedActions(actions);

    // Nothing to collapse. One Tour command on its own is not a group, and pretending otherwise
    // would hide the primary scheduling operation behind a menu for no reason.
    if (tourActions.length < 2) {
        return { grouped: false, label: null, statusKey: tour?.statusKey ?? null, tour: tourActions, rest };
    }

    const statusKey = tour?.statusKey ?? null;
    const stem = statusKey ? STATE_STEM[statusKey] ?? null : null;

    // The family has never had a tour: the group is still worth collapsing, but there is no
    // state to announce and Schedule Tour inside it is the honest primary operation.
    if (!stem) {
        return { grouped: true, label: "Tour", statusKey, tour: tourActions, rest };
    }

    const when = STATE_CARRIES_TIME.has(statusKey!)
        ? formatTourControlWhen(tour?.startAt ?? null, opts?.timeZone ?? null)
        : null;
    return {
        grouped: true,
        label: when ? `${stem} · ${when}` : stem,
        statusKey,
        tour: tourActions,
        rest,
    };
}
