/**
 * Cancel Tour — destructive preview/commit adapter (P5.S2).
 *
 * Domain authority: cancelTourBooking (in-place status → canceled; booking retained).
 * Shared destructive runtime does not write tour_bookings; this adapter delegates once.
 */

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cancelTourBooking } from "@/lib/tours/bookings/tourBookingService";
import type { TourBookingRow } from "@/lib/tours/bookings/types";
import type { InvocationDelegationGuard } from "@/lib/platform/commands/runtime/commandExecutionTypes";
import type { CommandImpactPreview } from "@/lib/platform/commands/runtime/destructive/commandImpactPreviewTypes";
import { assertDestructivePreviewInvariants } from "@/lib/platform/commands/runtime/destructive/destructiveCommandInvariants";
import { evaluateDestructivePermissionClass } from "@/lib/platform/commands/runtime/destructive/destructivePermissionSeam";
import {
    getDestructiveCommandPolicy,
    requireDestructiveCommandPolicy,
} from "@/lib/platform/commands/runtime/destructive/destructivePolicyRegistry";
import {
    issueDestructivePreviewToken,
    validateDestructivePreviewToken,
} from "@/lib/platform/commands/runtime/destructive/destructivePreviewToken";

function trim(v: unknown): string {
    return String(v ?? "").trim();
}

const TERMINAL_NO_CANCEL = new Set(["canceled", "completed", "no_show"]);

export type CancelTourBookingSnapshot = {
    id: string;
    opportunity_id: string;
    location_id: string;
    start_at: string;
    end_at: string;
    timezone: string;
    status_key: string;
    requested_by_user_id: string | null;
    location_label?: string | null;
};

export function resolveCancelTourBookingId(input: {
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
        return fromPayload || entityId || { error: "booking_id is required to cancel a tour." };
    }
    if (fromPayload) return fromPayload;
    return { error: "booking_id is required to cancel a tour." };
}

export function resolveCancelTourReason(
    inputValues?: Record<string, unknown> | null
): string | null {
    const values = inputValues ?? {};
    const raw = values.cancel_reason ?? values.cancelReason ?? values.reason;
    if (raw == null) return null;
    const s = trim(raw);
    return s || null;
}

export function buildCancelTourDomainVersion(booking: CancelTourBookingSnapshot): string {
    const payload = [
        `bk:${booking.id}`,
        `st:${booking.status_key}`,
        `start:${booking.start_at}`,
        `end:${booking.end_at}`,
        `tz:${booking.timezone}`,
        `loc:${booking.location_id}`,
    ].join("|");
    return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

export function operatorTourLabel(booking: CancelTourBookingSnapshot): string {
    const when = booking.start_at ? booking.start_at.replace("T", " ").slice(0, 16) : "tour";
    const loc = trim(booking.location_label) || "location";
    return `Tour ${when} (${loc})`.slice(0, 80);
}

export type CancelTourPreviewState = {
    bookingId: string;
    booking: CancelTourBookingSnapshot;
    cancelReason: string | null;
    domainVersion: string;
    alreadyTerminal: boolean;
    terminalKind: "canceled" | "completed" | "no_show" | null;
};

export async function readCancelTourBookingSnapshot(
    supabase: SupabaseClient,
    orgId: string,
    bookingId: string
): Promise<CancelTourBookingSnapshot | null> {
    const { data, error } = await supabase
        .from("tour_bookings")
        .select(
            "id, opportunity_id, location_id, start_at, end_at, timezone, status_key, requested_by_user_id"
        )
        .eq("org_id", orgId)
        .eq("id", bookingId)
        .maybeSingle();
    if (error || !data) return null;
    const row = data as Omit<CancelTourBookingSnapshot, "location_label">;
    let location_label: string | null = null;
    const locId = trim(row.location_id);
    if (locId) {
        const { data: loc } = await supabase
            .from("locations")
            .select("name")
            .eq("org_id", orgId)
            .eq("id", locId)
            .maybeSingle();
        location_label = loc && typeof (loc as { name?: string }).name === "string"
            ? trim((loc as { name: string }).name) || null
            : null;
    }
    return { ...row, location_label };
}

export function buildCancelTourImpactPreview(input: {
    orgId: string;
    state: CancelTourPreviewState;
}): CommandImpactPreview {
    const policy = requireDestructiveCommandPolicy("cancel_tour");
    const { state } = input;
    const booking = state.booking;
    const label = operatorTourLabel(booking);

    const { previewId, token, claims } = issueDestructivePreviewToken({
        capabilityKey: policy.capabilityKey,
        subjectType: "tour_booking",
        subjectId: state.bookingId,
        orgId: input.orgId,
        impactClass: policy.impactClass,
        confirmation: policy.confirmation,
        version: state.domainVersion,
        ttlSeconds:
            policy.previewFreshness.mode === "ttl" ? policy.previewFreshness.seconds : 300,
    });

    const affectedRecords: Array<CommandImpactPreview["affectedRecords"][number]> = [
        {
            type: "tour_booking",
            id: state.bookingId,
            label,
            effect: "cancelled",
        },
    ];

    const warnings: Array<{ code: string; message: string }> = [
        {
            code: "history_retained",
            message: "The booking record remains for history; it is not deleted.",
        },
        {
            code: "lead_retained",
            message: "The opportunity/lead and participants are not deleted or withdrawn.",
        },
        {
            code: "no_auto_reschedule",
            message: "Cancellation does not create a replacement booking.",
        },
        {
            code: "reminders_canceled",
            message: "Active tour reminders for this booking will be canceled.",
        },
        {
            code: "cancel_communication",
            message: "A cancellation notice may be sent to the family (domain-owned).",
        },
    ];

    const blockers: Array<{ code: string; message: string }> = [];
    if (state.terminalKind === "canceled") {
        blockers.push({
            code: "already_canceled",
            message: "This tour is already canceled.",
        });
    } else if (state.terminalKind === "completed") {
        blockers.push({
            code: "already_completed",
            message: "Completed tours cannot be canceled.",
        });
    } else if (state.terminalKind === "no_show") {
        blockers.push({
            code: "already_no_show",
            message: "No-show tours cannot be canceled.",
        });
    }

    const preview: CommandImpactPreview = {
        previewId,
        capabilityKey: policy.capabilityKey,
        generatedAt: new Date(claims.iat * 1000).toISOString(),
        subject: {
            type: "tour_booking",
            id: state.bookingId,
            label,
        },
        impactClass: policy.impactClass,
        reversibility: policy.reversibility,
        affectedRecords,
        warnings,
        blockers,
        downstreamEffects: [
            {
                type: "status",
                description: `Booking status becomes canceled (current: ${booking.status_key}).`,
            },
            {
                type: "reminders",
                description: "Reminder jobs for this booking are canceled (domain orchestrator).",
            },
            {
                type: "communications",
                description: "Tour cancellation communication is orchestrated by the Tour domain.",
            },
            {
                type: "event",
                description: "tour_canceled lifecycle event is emitted by the Tour domain.",
            },
        ],
        confirmation: {
            policy: policy.confirmation,
        },
        recovery: {
            kind: "schedule_new",
            description: "Schedule a new Tour. Reopen Tour is not available.",
        },
        freshness: {
            strategy:
                policy.previewFreshness.mode === "version_match"
                    ? "version_match"
                    : policy.previewFreshness.mode === "same_request"
                      ? "same_request"
                      : "ttl",
            version: state.domainVersion,
            expiresAt: new Date(claims.exp * 1000).toISOString(),
        },
        previewToken: token,
    };

    assertDestructivePreviewInvariants(preview, policy);
    return preview;
}

export type CancelTourResult = {
    kind: "tour_cancel";
    booking_id: string;
    opportunity_id: string;
    status_key: string;
    start_at: string;
    end_at: string;
    timezone: string;
    location_id: string;
    cancel_reason: string | null;
    idempotent: boolean;
    message: string;
};

export type CancelTourAdapterDeps = {
    readCancelTourBookingSnapshot?: typeof readCancelTourBookingSnapshot;
    cancelTourBooking?: typeof cancelTourBooking;
};

export async function previewCancelTourViaAdapter(input: {
    orgId: string;
    supabase: SupabaseClient;
    entityType: string;
    entityId: string;
    inputValues?: Record<string, unknown> | null;
    trustedServerContext: boolean;
    deps?: CancelTourAdapterDeps;
}): Promise<
    | { ok: true; preview: CommandImpactPreview; state: CancelTourPreviewState }
    | { ok: false; code: string; operatorMessage: string }
> {
    const policy = getDestructiveCommandPolicy("cancel_tour");
    if (!policy || policy.impactClass !== "cancel") {
        return {
            ok: false,
            code: "missing_destructive_policy",
            operatorMessage: "This command is not available.",
        };
    }

    const permission = evaluateDestructivePermissionClass({
        capabilityKey: "cancel_tour",
        trustedServerContext: input.trustedServerContext,
        clientPermissionClass: null,
    });
    if (!permission.allowed) {
        return {
            ok: false,
            code: permission.reasonCode ?? "permission_denied",
            operatorMessage: "You do not have permission to run this command.",
        };
    }

    const bookingId = resolveCancelTourBookingId({
        entityType: input.entityType,
        entityId: input.entityId,
        inputValues: input.inputValues,
    });
    if (typeof bookingId !== "string") {
        return { ok: false, code: "invalid_inputs", operatorMessage: bookingId.error };
    }

    const read = input.deps?.readCancelTourBookingSnapshot ?? readCancelTourBookingSnapshot;
    const booking = await read(input.supabase, input.orgId, bookingId);
    if (!booking) {
        return {
            ok: false,
            code: "booking_not_found",
            operatorMessage: "Tour booking not found.",
        };
    }

    const status = trim(booking.status_key);
    const terminalKind = TERMINAL_NO_CANCEL.has(status)
        ? (status as "canceled" | "completed" | "no_show")
        : null;

    const state: CancelTourPreviewState = {
        bookingId,
        booking,
        cancelReason: resolveCancelTourReason(input.inputValues),
        domainVersion: buildCancelTourDomainVersion(booking),
        alreadyTerminal: terminalKind != null,
        terminalKind,
    };
    const preview = buildCancelTourImpactPreview({ orgId: input.orgId, state });
    return { ok: true, preview, state };
}

export async function commitCancelTourViaAdapter(input: {
    orgId: string;
    userId?: string | null;
    supabase: SupabaseClient;
    entityType: string;
    entityId: string;
    inputValues?: Record<string, unknown> | null;
    previewToken: string;
    confirmation: { confirmed: boolean; confirmationValue?: string };
    trustedServerContext: boolean;
    clientPermissionClass?: string | null;
    clientImpactClass?: string | null;
    invocationId?: string;
    guard: InvocationDelegationGuard;
    deps?: CancelTourAdapterDeps;
}): Promise<
    | { ok: true; result: CancelTourResult; delegated: true }
    | { ok: false; code: string; operatorMessage: string; delegated: boolean }
> {
    void input.clientPermissionClass;
    void input.clientImpactClass;
    void input.confirmation.confirmationValue;

    const policy = getDestructiveCommandPolicy("cancel_tour");
    if (!policy || policy.impactClass !== "cancel") {
        return {
            ok: false,
            code: "missing_destructive_policy",
            operatorMessage: "This command is not available.",
            delegated: false,
        };
    }

    const permission = evaluateDestructivePermissionClass({
        capabilityKey: "cancel_tour",
        trustedServerContext: input.trustedServerContext,
        clientPermissionClass: input.clientPermissionClass,
    });
    if (!permission.allowed) {
        return {
            ok: false,
            code: permission.reasonCode ?? "permission_denied",
            operatorMessage: "You do not have permission to run this command.",
            delegated: false,
        };
    }

    if (input.confirmation.confirmed !== true) {
        return {
            ok: false,
            code: "confirmation_required",
            operatorMessage: "Confirm before continuing.",
            delegated: false,
        };
    }

    const bookingId = resolveCancelTourBookingId({
        entityType: input.entityType,
        entityId: input.entityId,
        inputValues: input.inputValues,
    });
    if (typeof bookingId !== "string") {
        return {
            ok: false,
            code: "invalid_inputs",
            operatorMessage: bookingId.error,
            delegated: false,
        };
    }

    const read = input.deps?.readCancelTourBookingSnapshot ?? readCancelTourBookingSnapshot;
    const booking = await read(input.supabase, input.orgId, bookingId);
    if (!booking) {
        return {
            ok: false,
            code: "booking_not_found",
            operatorMessage: "Tour booking not found.",
            delegated: false,
        };
    }

    const status = trim(booking.status_key);
    if (status === "completed") {
        return {
            ok: false,
            code: "already_completed",
            operatorMessage: "Completed tours cannot be canceled.",
            delegated: false,
        };
    }
    if (status === "no_show") {
        return {
            ok: false,
            code: "already_no_show",
            operatorMessage: "No-show tours cannot be canceled.",
            delegated: false,
        };
    }
    if (status === "canceled") {
        return {
            ok: false,
            code: "already_canceled",
            operatorMessage: "This tour is already canceled.",
            delegated: false,
        };
    }

    const domainVersion = buildCancelTourDomainVersion(booking);
    const tokenValidation = validateDestructivePreviewToken({
        token: input.previewToken,
        expected: {
            capabilityKey: "cancel_tour",
            subjectType: "tour_booking",
            subjectId: bookingId,
            orgId: input.orgId,
            impactClass: "cancel",
            confirmation: "strong_confirm",
            version: domainVersion,
        },
    });
    if (!tokenValidation.ok) {
        return {
            ok: false,
            code:
                tokenValidation.code === "expired" || tokenValidation.code === "claim_mismatch"
                    ? "stale_preview"
                    : tokenValidation.code,
            operatorMessage:
                tokenValidation.code === "expired" || tokenValidation.code === "claim_mismatch"
                    ? "Preview is stale. Generate a new preview."
                    : "Preview token is invalid.",
            delegated: false,
        };
    }

    const actorUserId = trim(input.userId) || "admin";
    const cancelReason = resolveCancelTourReason(input.inputValues);

    input.guard.markDelegated();

    const runCancel = input.deps?.cancelTourBooking ?? cancelTourBooking;
    try {
        const row: TourBookingRow = await runCancel(input.supabase, input.orgId, bookingId, {
            canceledBy: actorUserId,
            cancelReason,
            correlationId: input.invocationId ?? null,
        });

        const idempotent = trim(row.status_key) === "canceled" && status === "canceled";
        return {
            ok: true,
            delegated: true,
            result: {
                kind: "tour_cancel",
                booking_id: row.id,
                opportunity_id: row.opportunity_id,
                status_key: row.status_key,
                start_at: row.start_at,
                end_at: row.end_at,
                timezone: row.timezone,
                location_id: row.location_id,
                cancel_reason: row.cancel_reason,
                idempotent,
                message: "Tour canceled.",
            },
        };
    } catch (e) {
        const message = e instanceof Error ? e.message : "Cancel failed";
        return {
            ok: false,
            code: /not found/i.test(message) ? "booking_not_found" : "domain_failure",
            operatorMessage: message.replace(/^tour_bookings:\s*/i, "") || message,
            delegated: true,
        };
    }
}
