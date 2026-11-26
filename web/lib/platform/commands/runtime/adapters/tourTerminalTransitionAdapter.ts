/**
 * Tour terminal transitions — complete_tour / no_show_tour (P5.S3).
 *
 * Distinct capability identities; shared thin adapter over domain executors:
 * - complete_tour → markTourBookingCompleted
 * - no_show_tour (+ alias mark_tour_no_show) → markTourBookingNoShow
 *
 * Eligibility, reminders, communications, and events remain Tour-domain owned.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    markTourBookingCompleted,
    markTourBookingNoShow,
} from "@/lib/tours/bookings/tourBookingService";
import type { TourBookingRow } from "@/lib/tours/bookings/types";
import type { PlatformCapabilityDefinition } from "@/lib/platform/commands/capabilityTypes";
import type {
    CommandExecutionSubject,
    InvocationDelegationGuard,
} from "@/lib/platform/commands/runtime/commandExecutionTypes";
import { isTourDomainFacadeSupported } from "@/lib/platform/commands/runtime/commandRuntimeExecutionGate";
import type { CommandInvocationRequest } from "@/lib/platform/commands/runtime/commandRuntimeTypes";

function trim(v: unknown): string {
    return String(v ?? "").trim();
}

export type TourTerminalTransition = "complete" | "no_show";

export function resolveTourTerminalTransition(
    canonicalCommandKey: string
): TourTerminalTransition | null {
    const key = trim(canonicalCommandKey);
    if (key === "complete_tour") return "complete";
    if (key === "no_show_tour") return "no_show";
    return null;
}

export function resolveTourTerminalBookingId(input: {
    entityType: string;
    entityId: string;
    inputValues?: Record<string, unknown> | null;
}): string | { error: string } {
    const values = input.inputValues ?? {};
    const fromPayload =
        trim(values.booking_id) ||
        trim(values.bookingId) ||
        trim(values.tour_booking_id) ||
        trim(values.tourBookingId);
    const entityType = trim(input.entityType).toLowerCase();
    const entityId = trim(input.entityId);
    if (
        entityType === "tour_booking" ||
        entityType === "tour_bookings" ||
        entityType === "booking" ||
        entityType === "bookings"
    ) {
        return fromPayload || entityId || { error: "booking_id is required." };
    }
    if (fromPayload) return fromPayload;
    return { error: "booking_id is required." };
}

export type TourTerminalResult = {
    kind: "tour";
    tour_result: {
        transition: TourTerminalTransition;
        capability_key: "complete_tour" | "no_show_tour";
        booking_id: string;
        opportunity_id: string;
        status_key: string;
        start_at: string;
        end_at: string;
        timezone: string;
        location_id: string;
        message: string;
    };
};

export type TourTerminalExecutionDeps = {
    markTourBookingCompleted?: typeof markTourBookingCompleted;
    markTourBookingNoShow?: typeof markTourBookingNoShow;
};

export type TourTerminalExecutionInput = {
    capability: PlatformCapabilityDefinition;
    commandKey: string;
    invocation: CommandInvocationRequest;
    executionSubject: CommandExecutionSubject;
    mode: "preview" | "execute";
    supabase: SupabaseClient;
    orgId: string;
    userId?: string | null;
    invocationId: string;
    guard: InvocationDelegationGuard;
    deps?: TourTerminalExecutionDeps;
};

export function buildTourTerminalPreviewSummary(input: {
    bookingId: string;
    transition: TourTerminalTransition;
    capabilityKey: "complete_tour" | "no_show_tour";
}): {
    kind: "tour";
    summary: {
        booking_id: string;
        transition: TourTerminalTransition;
        capability_key: string;
        message: string;
    };
} {
    const message =
        input.transition === "complete"
            ? "Mark this tour as completed."
            : "Mark this tour as a no-show.";
    return {
        kind: "tour",
        summary: {
            booking_id: input.bookingId,
            transition: input.transition,
            capability_key: input.capabilityKey,
            message,
        },
    };
}

function mapRow(
    transition: TourTerminalTransition,
    capabilityKey: "complete_tour" | "no_show_tour",
    booking: TourBookingRow
): TourTerminalResult {
    return {
        kind: "tour",
        tour_result: {
            transition,
            capability_key: capabilityKey,
            booking_id: booking.id,
            opportunity_id: booking.opportunity_id,
            status_key: booking.status_key,
            start_at: booking.start_at,
            end_at: booking.end_at,
            timezone: booking.timezone,
            location_id: booking.location_id,
            message:
                transition === "complete" ? "Tour completed." : "Tour marked as no-show.",
        },
    };
}

export async function executeTourTerminalTransitionViaAdapter(
    input: TourTerminalExecutionInput
): Promise<
    | { ok: true; delegated: true; result: TourTerminalResult }
    | {
          ok: true;
          delegated: false;
          preview: ReturnType<typeof buildTourTerminalPreviewSummary>;
      }
    | { ok: false; code: string; operatorMessage: string; delegated: boolean }
> {
    const transition = resolveTourTerminalTransition(input.capability.canonicalCommandKey);
    if (!transition) {
        return {
            ok: false,
            code: "unsupported_tour_command",
            operatorMessage: "This Tour command is not available through the Command Runtime yet.",
            delegated: false,
        };
    }

    const capabilityKey =
        transition === "complete" ? ("complete_tour" as const) : ("no_show_tour" as const);

    if (!isTourDomainFacadeSupported(capabilityKey)) {
        return {
            ok: false,
            code: "tour_facade_disabled",
            operatorMessage: "This Tour command is not available through the Command Runtime yet.",
            delegated: false,
        };
    }

    // Client cannot select target status / executor.
    void input.invocation;
    void input.commandKey;

    const bookingId = resolveTourTerminalBookingId({
        entityType: input.executionSubject.entityType,
        entityId: input.executionSubject.entityId,
        inputValues: input.invocation.inputValues,
    });
    if (typeof bookingId !== "string") {
        return {
            ok: false,
            code: "invalid_inputs",
            operatorMessage: bookingId.error,
            delegated: false,
        };
    }

    if (input.mode === "preview") {
        return {
            ok: true,
            delegated: false,
            preview: buildTourTerminalPreviewSummary({
                bookingId,
                transition,
                capabilityKey,
            }),
        };
    }

    input.guard.markDelegated();

    try {
        const opts = {
            actorUserId: input.userId ?? null,
            correlationId: input.invocationId,
        };
        const booking =
            transition === "complete"
                ? await (input.deps?.markTourBookingCompleted ?? markTourBookingCompleted)(
                      input.supabase,
                      input.orgId,
                      bookingId,
                      opts
                  )
                : await (input.deps?.markTourBookingNoShow ?? markTourBookingNoShow)(
                      input.supabase,
                      input.orgId,
                      bookingId,
                      opts
                  );

        return {
            ok: true,
            delegated: true,
            result: mapRow(transition, capabilityKey, booking),
        };
    } catch (e) {
        const message = e instanceof Error ? e.message : "Tour transition failed";
        const notFound = /not found/i.test(message);
        const eligibility = /only from|not allowed/i.test(message);
        return {
            ok: false,
            code: notFound
                ? "booking_not_found"
                : eligibility
                  ? "transition_not_allowed"
                  : "domain_failure",
            operatorMessage: message.replace(/^tour_bookings:\s*/i, "") || message,
            delegated: true,
        };
    }
}
