/**
 * What a confirmed family send means for open Business Process work — DECLARED BY THE CALLER.
 *
 * Sending a message and completing a work item are two different facts. `family-send` used to
 * treat every confirmed send that carried an `opportunity_id` as a Contact Family attempt, so any
 * message composed against an opportunity — from Manage, from Activity, from a queue row — closed
 * whatever Contact Family work happened to be open. That is the "existence of open work" inference:
 * the work item was completed because it existed, not because the operator was doing it.
 *
 * The consequence is now carried explicitly from the entry point that represents performing the
 * work (Current Work → Contact Family / Send Message / Tour Invitation). Every other composer sends
 * nothing here and the send stays a send. The server never infers it from the opportunity, the
 * route, the action label or the recipient.
 *
 * `opportunity_id` keeps its other meaning — send metadata and the Tour Invitation anchor — and is
 * no longer the trigger.
 */

export const FAMILY_SEND_WORK_CONSEQUENCES = ["contact_family_work"] as const;

export type FamilySendWorkConsequence = (typeof FAMILY_SEND_WORK_CONSEQUENCES)[number];

/** Request field on `POST /api/admin/communications/family-send`. */
export const FAMILY_SEND_WORK_CONSEQUENCE_FIELD = "work_consequence" as const;

/** Unknown, absent or malformed values are no consequence — never a default to completion. */
export function parseFamilySendWorkConsequence(raw: unknown): FamilySendWorkConsequence | null {
    if (typeof raw !== "string") return null;
    const value = raw.trim();
    return (FAMILY_SEND_WORK_CONSEQUENCES as readonly string[]).includes(value)
        ? (value as FamilySendWorkConsequence)
        : null;
}
