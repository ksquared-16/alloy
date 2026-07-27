/**
 * Tour-domain execution adapter (P5.S1).
 *
 * Exact facade key: reschedule_tour → rescheduleTourBooking.
 * Tour booking identity, availability, timezone, reminders, and communications
 * remain Tour-domain owned. Adapter does not write tour_bookings directly.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    assertBookingLocationMatchesOpportunity,
    fetchOpportunityForTourAdmin,
} from "@/lib/tours/admin/opportunityTourContext";
import { rescheduleTourBooking } from "@/lib/tours/bookings/tourBookingService";
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

function parseDate(v: unknown): Date | null {
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
    if (typeof v === "string" && v.trim()) {
        const d = new Date(v.trim());
        if (!Number.isNaN(d.getTime())) return d;
    }
    return null;
}

export type TourRescheduleResolvedInputs = {
    bookingId: string;
    startAt: Date;
    endAt: Date;
    timezone: string | null;
    locationId: string | null;
    correlationId: string | null;
};

/**
 * Resolve booking id + schedule fields from subject + payload.
 * Client cannot supply org/actor/status as authority.
 */
export function resolveRescheduleTourInputs(input: {
    entityType: string;
    entityId: string;
    inputValues?: Record<string, unknown> | null;
}): TourRescheduleResolvedInputs | { error: string } {
    const values = input.inputValues ?? {};
    const entityType = trim(input.entityType).toLowerCase();
    const entityId = trim(input.entityId);

    const fromPayload =
        trim(values.booking_id) ||
        trim(values.bookingId) ||
        trim(values.tour_booking_id) ||
        trim(values.tourBookingId);

    let bookingId = fromPayload;
    if (
        entityType === "tour_booking" ||
        entityType === "tour_bookings" ||
        entityType === "booking" ||
        entityType === "bookings"
    ) {
        bookingId = bookingId || entityId;
    }

    if (!bookingId) {
        return { error: "booking_id is required to reschedule a tour." };
    }

    const startAt =
        parseDate(values.start_at) ||
        parseDate(values.startAt) ||
        parseDate(values.new_start_at) ||
        parseDate(values.newStartAt);
    const endAt =
        parseDate(values.end_at) ||
        parseDate(values.endAt) ||
        parseDate(values.new_end_at) ||
        parseDate(values.newEndAt);

    if (!startAt || !endAt) {
        return { error: "start_at and end_at are required to reschedule a tour." };
    }

    const timezoneRaw = values.timezone ?? values.time_zone ?? values.timeZone;
    const timezone =
        timezoneRaw == null || trim(timezoneRaw) === "" ? null : trim(timezoneRaw);

    const locationRaw = values.location_id ?? values.locationId;
    const locationId =
        locationRaw == null || trim(locationRaw) === "" ? null : trim(locationRaw);

    const correlationId =
        trim(values.correlation_id) ||
        trim(values.correlationId) ||
        null;

    return {
        bookingId,
        startAt,
        endAt,
        timezone,
        locationId,
        correlationId: correlationId || null,
    };
}

export type TourRescheduleResult = {
    kind: "tour";
    tour_result: {
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

export type TourExecutionDeps = {
    rescheduleTourBooking?: typeof rescheduleTourBooking;
};

export type TourExecutionInput = {
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
    deps?: TourExecutionDeps;
};

/**
 * Preview for reschedule is a normalized summary only — Tour domain has no
 * separate read-only impact preview API. Validation remains authoritative at execute.
 */
export function buildRescheduleTourPreviewSummary(input: {
    bookingId: string;
    startAt: Date;
    endAt: Date;
    timezone: string | null;
    locationId: string | null;
}): {
    kind: "tour";
    summary: {
        booking_id: string;
        start_at: string;
        end_at: string;
        timezone: string | null;
        location_id: string | null;
        message: string;
    };
} {
    return {
        kind: "tour",
        summary: {
            booking_id: input.bookingId,
            start_at: input.startAt.toISOString(),
            end_at: input.endAt.toISOString(),
            timezone: input.timezone,
            location_id: input.locationId,
            message: "Reschedule will update this tour booking to the new time.",
        },
    };
}

export async function executeRescheduleTourViaAdapter(
    input: TourExecutionInput
): Promise<
    | { ok: true; delegated: true; result: TourRescheduleResult; booking: TourBookingRow }
    | { ok: true; delegated: false; preview: ReturnType<typeof buildRescheduleTourPreviewSummary> }
    | { ok: false; code: string; operatorMessage: string; delegated: boolean }
> {
    const canonical = input.capability.canonicalCommandKey;
    if (canonical !== "reschedule_tour") {
        return {
            ok: false,
            code: "unsupported_tour_command",
            operatorMessage: "This Tour command is not available through the Command Runtime yet.",
            delegated: false,
        };
    }

    if (!isTourDomainFacadeSupported("reschedule_tour")) {
        return {
            ok: false,
            code: "tour_facade_disabled",
            operatorMessage: "This Tour command is not available through the Command Runtime yet.",
            delegated: false,
        };
    }

    // Client cannot select executor / spoof owner.
    void input.invocation;
    void input.commandKey;

    const resolved = resolveRescheduleTourInputs({
        entityType: input.executionSubject.entityType,
        entityId: input.executionSubject.entityId,
        inputValues: input.invocation.inputValues,
    });
    if ("error" in resolved) {
        return {
            ok: false,
            code: "invalid_inputs",
            operatorMessage: resolved.error,
            delegated: false,
        };
    }

    if (input.mode === "preview") {
        return {
            ok: true,
            delegated: false,
            preview: buildRescheduleTourPreviewSummary(resolved),
        };
    }

    // Optional location pin check (parity with dedicated reschedule route).
    if (resolved.locationId) {
        const { data: bookingMeta, error: bookingErr } = await input.supabase
            .from("tour_bookings")
            .select("id, opportunity_id")
            .eq("org_id", input.orgId)
            .eq("id", resolved.bookingId)
            .maybeSingle();
        if (bookingErr || !bookingMeta) {
            return {
                ok: false,
                code: "booking_not_found",
                operatorMessage: "Tour booking not found.",
                delegated: false,
            };
        }
        const opportunityId = trim(
            (bookingMeta as { opportunity_id?: string }).opportunity_id
        );
        const opp = await fetchOpportunityForTourAdmin(
            input.supabase,
            input.orgId,
            opportunityId
        );
        if (!opp.ok) {
            return {
                ok: false,
                code: "opportunity_not_found",
                operatorMessage: opp.message,
                delegated: false,
            };
        }
        const locOk = assertBookingLocationMatchesOpportunity(opp.row, resolved.locationId);
        if (!locOk.ok) {
            return {
                ok: false,
                code: "location_mismatch",
                operatorMessage: locOk.message,
                delegated: false,
            };
        }
        const { data: locRow } = await input.supabase
            .from("locations")
            .select("id")
            .eq("id", resolved.locationId)
            .eq("org_id", input.orgId)
            .maybeSingle();
        if (!locRow) {
            return {
                ok: false,
                code: "location_not_found",
                operatorMessage: "Location not found for org",
                delegated: false,
            };
        }
    }

    input.guard.markDelegated();

    const run = input.deps?.rescheduleTourBooking ?? rescheduleTourBooking;
    try {
        const booking = await run(input.supabase, input.orgId, resolved.bookingId, {
            startAt: resolved.startAt,
            endAt: resolved.endAt,
            timezone: resolved.timezone,
            locationId: resolved.locationId,
            correlationId: resolved.correlationId ?? input.invocationId,
        });

        return {
            ok: true,
            delegated: true,
            booking,
            result: {
                kind: "tour",
                tour_result: {
                    booking_id: booking.id,
                    opportunity_id: booking.opportunity_id,
                    status_key: booking.status_key,
                    start_at: booking.start_at,
                    end_at: booking.end_at,
                    timezone: booking.timezone,
                    location_id: booking.location_id,
                    message: "Tour rescheduled.",
                },
            },
        };
    } catch (e) {
        const message = e instanceof Error ? e.message : "Reschedule failed";
        const notFound = /not found/i.test(message);
        return {
            ok: false,
            code: notFound ? "booking_not_found" : "domain_failure",
            operatorMessage: message.replace(/^tour_bookings:\s*/i, "") || message,
            delegated: true,
        };
    }
}
