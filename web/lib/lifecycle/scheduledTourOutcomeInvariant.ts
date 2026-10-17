/**
 * A TOUR THAT HAS AN ACCEPTED TERMINAL OUTCOME IS NO LONGER SCHEDULED.
 *
 * Recording a Tour outcome used to move the family (e.g. to Decision) and leave the booking exactly as
 * it was. Nothing in the outcome path wrote `tour_bookings`; the only link ran the other way (a confirmed
 * booking completes stage work). So a family could sit at Decision with "Tour Completed — Interested"
 * while its booking was still `confirmed` for next week: still in the Tours Work View, still on the card
 * as "Tour scheduled", still collecting reminders. Measured on staging (the Fifteen Family).
 *
 * Both halves of the rule are read from configuration, never from outcome text:
 *  - A TOUR outcome is one whose work template is bound to the platform work definition
 *    `record_tour_outcome` — the definition whose stated intent is "Tour outcome recorded".
 *  - It is TERMINAL when the same decision that closes the work says so
 *    (`shouldCloseWorkAfterStageOutcome`: successful, or the outcome leaves the stage / closes the
 *    record). "Needs follow-up, stay here" outcomes are configured as retries and leave the tour alone.
 *
 * How the booking closes is the booking's own canonical transition:
 *  - the tour's start has passed → `completed` (the operator is recording what happened);
 *  - the tour is still ahead → `canceled`, and only after the operator confirms. The family is not sent
 *    a cancellation notice by this path (the operator recorded an outcome, they did not call the visit
 *    off), but the pending reminders are stopped, because a reminder for a tour that is not happening
 *    is a false message.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveWorkDefinitionKeyFromTemplate } from "@/lib/lifecycle/resolveWorkDefinitionKeyFromTemplate";
import type { StageOperatingPlanV1, StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { CloseWorkAfterStageOutcomeDecision } from "@/lib/lifecycle/shouldCloseWorkAfterStageOutcome";
import { TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS } from "@/lib/tours/constants";
import type { TourBookingRow } from "@/lib/tours/bookings/types";

export const RECORD_TOUR_OUTCOME_WORK_DEFINITION_KEY = "record_tour_outcome" as const;

/** Validation code returned when a future tour would be closed without the operator's confirmation. */
export const TOUR_STILL_SCHEDULED_CODE = "tour_still_scheduled" as const;

const COMPLETABLE = new Set(["confirmed", "rescheduled"]);

export type ScheduledTourSummary = {
    booking_id: string;
    start_at: string;
    end_at: string;
    timezone: string | null;
    status_key: string;
};

export type ScheduledTourClosePlan =
    | { kind: "none" }
    | {
          kind: "close";
          booking: TourBookingRow;
          /** `complete` once the tour's start has passed; `cancel` while it is still ahead. */
          mode: "complete" | "cancel";
          /** True while the tour is still ahead: the operator must confirm closing it. */
          requires_confirmation: boolean;
          summary: ScheduledTourSummary;
      };

/** The work template an outcome belongs to: named on the outcome, else the template that lists it. */
export function templateForOutcome(
    plan: StageOperatingPlanV1,
    outcomeKey: string,
): StageWorkTemplateV1 | null {
    const key = outcomeKey.trim();
    const outcome = plan.outcomes.find((o) => o.outcome_key === key);
    const named = outcome?.work_template_key?.trim();
    if (named) return plan.work_templates.find((t) => t.template_key === named) ?? null;
    return plan.work_templates.find((t) => (t.outcome_refs ?? []).some((r) => r.outcome_ref === key)) ?? null;
}

/** Whether this outcome is a Tour outcome — its work is the platform "Record tour outcome" work. */
export function isTourOutcome(plan: StageOperatingPlanV1, outcomeKey: string): boolean {
    const template = templateForOutcome(plan, outcomeKey);
    if (!template) return false;
    const resolved = resolveWorkDefinitionKeyFromTemplate(template);
    return resolved.ok && resolved.work_definition_key === RECORD_TOUR_OUTCOME_WORK_DEFINITION_KEY;
}

/** Whether accepting this outcome must close the family's scheduled tour. Pure; configuration only. */
export function outcomeClosesScheduledTour(
    plan: StageOperatingPlanV1,
    outcomeKey: string,
    closeDecision: CloseWorkAfterStageOutcomeDecision,
): boolean {
    return closeDecision.shouldClose && isTourOutcome(plan, outcomeKey);
}

/** The family's active tour — the soonest active booking, the same one the card and Tours view show. */
export async function readActiveTourBooking(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
): Promise<TourBookingRow | null> {
    const { data, error } = await supabase
        .from("tour_bookings")
        .select("*")
        .eq("org_id", orgId)
        .eq("opportunity_id", opportunityId)
        .in("status_key", [...TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS])
        .order("start_at", { ascending: true })
        .limit(1);
    if (error) throw new Error(`active tour lookup: ${error.message}`);
    return ((data ?? []) as TourBookingRow[])[0] ?? null;
}

export function summarizeTour(booking: TourBookingRow): ScheduledTourSummary {
    return {
        booking_id: booking.id,
        start_at: booking.start_at,
        end_at: booking.end_at,
        timezone: booking.timezone ?? null,
        status_key: booking.status_key,
    };
}

/** Decide what recording this outcome does to the family's tour. Reads only. */
export async function planScheduledTourClose(input: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string | null | undefined;
    plan: StageOperatingPlanV1;
    outcomeKey: string;
    closeDecision: CloseWorkAfterStageOutcomeDecision;
    now?: Date;
}): Promise<ScheduledTourClosePlan> {
    const opportunityId = input.opportunityId?.trim();
    if (!opportunityId) return { kind: "none" };
    if (!outcomeClosesScheduledTour(input.plan, input.outcomeKey, input.closeDecision)) return { kind: "none" };

    const booking = await readActiveTourBooking(input.supabase, input.orgId, opportunityId);
    if (!booking) return { kind: "none" };

    const now = (input.now ?? new Date()).getTime();
    const start = new Date(booking.start_at).getTime();
    const ahead = Number.isFinite(start) && start > now;
    // A tour whose time has come and that was firm is completed; anything else (still ahead, or never
    // confirmed) is no longer going to happen as scheduled, so it is cancelled.
    const mode = !ahead && COMPLETABLE.has(booking.status_key) ? "complete" : "cancel";
    return { kind: "close", booking, mode, requires_confirmation: ahead, summary: summarizeTour(booking) };
}

/**
 * Close the tour through the booking's own transition — the same service the Tour commands use, so the
 * domain signal, the maintained tour facts, the lifecycle event and the reminders all follow.
 * Dynamically imported: the booking service reaches back into stage work on confirmation.
 */
export async function closeScheduledTour(input: {
    supabase: SupabaseClient;
    orgId: string;
    actorUserId: string;
    plan: Extract<ScheduledTourClosePlan, { kind: "close" }>;
    outcomeLabel: string;
    correlationId?: string | null;
}): Promise<TourBookingRow> {
    const { cancelTourBooking, markTourBookingCompleted } = await import("@/lib/tours/bookings/tourBookingService");
    const bookingId = input.plan.booking.id;
    if (input.plan.mode === "complete") {
        return markTourBookingCompleted(input.supabase, input.orgId, bookingId, {
            actorUserId: input.actorUserId,
            correlationId: input.correlationId ?? null,
        });
    }
    const row = await cancelTourBooking(input.supabase, input.orgId, bookingId, {
        canceledBy: input.actorUserId,
        cancelReason: `Closed by outcome: ${input.outcomeLabel}`,
        correlationId: input.correlationId ?? null,
        deferLifecycleComms: true,
    });
    const { cancelPendingTourSchedulingRemindersForBooking } = await import(
        "@/lib/tours/comms/tourSchedulingScheduledSends"
    );
    const stopped = await cancelPendingTourSchedulingRemindersForBooking({
        supabase: input.supabase,
        orgId: input.orgId,
        tourBookingId: bookingId,
        opportunityId: input.plan.booking.opportunity_id,
    });
    if (!stopped.ok) throw new Error(`stop tour reminders: ${stopped.message}`);
    return row;
}

/**
 * The inverse, for when a later step of the same outcome fails. Restores the booking's own fields and
 * re-derives the maintained tour facts from the bookings table, which is what makes the tour render as
 * active again. Reminders stopped by the close are not re-armed; that is reported, not hidden.
 */
export async function reopenClosedScheduledTour(input: {
    supabase: SupabaseClient;
    orgId: string;
    booking: TourBookingRow;
}): Promise<void> {
    const { error } = await input.supabase
        .from("tour_bookings")
        .update({
            status_key: input.booking.status_key,
            canceled_at: input.booking.canceled_at,
            canceled_by: input.booking.canceled_by,
            cancel_reason: input.booking.cancel_reason,
        })
        .eq("org_id", input.orgId)
        .eq("id", input.booking.id);
    if (error) throw new Error(`restore tour booking: ${error.message}`);
    const { error: factsError } = await input.supabase.rpc("maintain_opportunity_tour_facts", {
        p_org_id: input.orgId,
        p_opportunity_id: input.booking.opportunity_id,
    });
    if (factsError) throw new Error(`restore tour facts: ${factsError.message}`);
}

/** The confirmation the operator is asked, in the brief's words. */
export function scheduledTourConfirmationMessage(whenLabel: string): string {
    return `This Tour is still scheduled for ${whenLabel}. Recording this outcome will close the scheduled Tour. Continue?`;
}

/**
 * A RESCHEDULED TOUR MOVES ITS OUTCOME WORK WITH IT.
 *
 * The open "record tour outcome" work was anchored to the old end time; after a reschedule it would
 * go overdue before (or long after) the new visit. Each such task's due date moves by exactly the
 * amount the tour moved, so the configured offset is kept and nothing about it is re-invented here.
 */
export async function shiftTourOutcomeWorkDue(input: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    previousEndAt: string;
    nextEndAt: string;
}): Promise<{ shifted: number }> {
    const delta = new Date(input.nextEndAt).getTime() - new Date(input.previousEndAt).getTime();
    if (!Number.isFinite(delta) || delta === 0) return { shifted: 0 };
    const { data, error } = await input.supabase
        .from("operational_tasks")
        .select("id, due_at")
        .eq("org_id", input.orgId)
        .eq("entity_type", "opportunities")
        .eq("entity_id", input.opportunityId)
        .eq("status", "open")
        .filter("metadata->>work_definition_key", "eq", RECORD_TOUR_OUTCOME_WORK_DEFINITION_KEY);
    if (error) throw new Error(`tour outcome work lookup: ${error.message}`);
    let shifted = 0;
    for (const row of (data ?? []) as { id: string; due_at: string | null }[]) {
        if (!row.due_at) continue;
        const due = new Date(new Date(row.due_at).getTime() + delta).toISOString();
        const { error: updateError } = await input.supabase
            .from("operational_tasks")
            .update({ due_at: due, updated_at: new Date().toISOString() })
            .eq("org_id", input.orgId)
            .eq("id", row.id);
        if (updateError) throw new Error(`tour outcome work due: ${updateError.message}`);
        shifted += 1;
    }
    return { shifted };
}
