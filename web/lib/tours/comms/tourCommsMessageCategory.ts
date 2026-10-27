/**
 * Platform message category for Tour outbound.
 *
 * Confirmations, reminders, cancellations and other lifecycle notices are
 * transactional: a marketing opt-out must not suppress them.
 *
 * Tour invitations are operational (service coordination before a booking exists):
 * they are not marketing (no opt-in required) and are not transactional
 * (an operational opt-out may suppress invitation outreach).
 *
 * Classification is closed and explicit — never inferred from template copy.
 */

import type { MessageCategory } from "@/lib/communications/eligibility/types";
import type { TourCommsEventKey } from "@/lib/tours/comms/tourCommsConfig";

export const TOUR_COMMS_PURPOSE = "tour_coordination" as const;

export function messageCategoryForTourEvent(eventKey: TourCommsEventKey): MessageCategory {
    if (eventKey === "tour_invitation") return "operational";
    // Internal staff calendar traffic is classified at its own call site as
    // transactional + internal; parent-facing lifecycle keys are transactional.
    return "transactional";
}
