/**
 * P5.S2 — Cancel Tour destructive preview + cutover.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { executeCommandInvocation } from "@/lib/platform/commands/runtime/executeCommandInvocation";
import { isCommandRuntimeFacadeExecutionSupported } from "@/lib/platform/commands/runtime/commandRuntimeExecutionGate";
import { prepareCommandInvocation } from "@/lib/platform/commands/runtime/prepareCommandInvocation";
import {
    assertDestructiveCommitAllowed,
    isDestructiveFacadeCommitAllowlisted,
} from "@/lib/platform/commands/runtime/destructive";
import {
    buildCancelTourDomainVersion,
    buildCancelTourImpactPreview,
    commitCancelTourViaAdapter,
    previewCancelTourViaAdapter,
    type CancelTourBookingSnapshot,
    type CancelTourPreviewState,
} from "@/lib/platform/commands/runtime/adapters/cancelTourAdapter";
import type { CommandInvocationRequest } from "@/lib/platform/commands/runtime/commandRuntimeTypes";
import type { SupabaseClient } from "@supabase/supabase-js";

function baseInvocation(
    partial: Partial<CommandInvocationRequest> & Pick<CommandInvocationRequest, "commandKey">
): CommandInvocationRequest {
    return {
        origin: "operator",
        operationalContext: "focus_panel",
        surface: "record_header",
        ...partial,
    };
}

function sampleBooking(
    overrides: Partial<CancelTourBookingSnapshot> = {}
): CancelTourBookingSnapshot {
    return {
        id: "bk-1",
        opportunity_id: "opp-1",
        location_id: "loc-1",
        start_at: "2026-08-01T15:00:00.000Z",
        end_at: "2026-08-01T15:30:00.000Z",
        timezone: "America/Los_Angeles",
        status_key: "confirmed",
        requested_by_user_id: "user-host",
        location_label: "Main Site",
        ...overrides,
    };
}

function sampleState(
    overrides: Partial<CancelTourPreviewState> = {}
): CancelTourPreviewState {
    const booking = overrides.booking ?? sampleBooking();
    return {
        bookingId: booking.id,
        booking,
        cancelReason: null,
        domainVersion: buildCancelTourDomainVersion(booking),
        alreadyTerminal: false,
        terminalKind: null,
        ...overrides,
    };
}

describe("P5.S2 cancel_tour gate", () => {
    it("allowlists cancel_tour for destructive facade commit", () => {
        expect(isDestructiveFacadeCommitAllowlisted("cancel_tour")).toBe(true);
        expect(assertDestructiveCommitAllowed({ capabilityKey: "cancel_tour" }).allowed).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("cancel_tour")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("schedule_tour")).toBe(false);
        expect(isCommandRuntimeFacadeExecutionSupported("reopen_tour")).toBe(false);
    });
});

describe("P5.S2 preview", () => {
    it("builds cancel preview with retained history and schedule_new recovery", () => {
        const preview = buildCancelTourImpactPreview({
            orgId: "org-1",
            state: sampleState(),
        });
        expect(preview.impactClass).toBe("cancel");
        expect(preview.confirmation.policy).toBe("strong_confirm");
        expect(preview.recovery.kind).toBe("schedule_new");
        expect(preview.warnings.some((w) => w.code === "history_retained")).toBe(true);
        expect(preview.warnings.some((w) => w.code === "lead_retained")).toBe(true);
        expect(preview.warnings.some((w) => w.code === "reminders_canceled")).toBe(true);
        expect(preview.previewToken).toBeTruthy();
    });

    it("blocks completed and already canceled in preview", () => {
        const completed = buildCancelTourImpactPreview({
            orgId: "org-1",
            state: sampleState({
                booking: sampleBooking({ status_key: "completed" }),
                alreadyTerminal: true,
                terminalKind: "completed",
            }),
        });
        expect(completed.blockers.some((b) => b.code === "already_completed")).toBe(true);

        const canceled = buildCancelTourImpactPreview({
            orgId: "org-1",
            state: sampleState({
                booking: sampleBooking({ status_key: "canceled" }),
                alreadyTerminal: true,
                terminalKind: "canceled",
            }),
        });
        expect(canceled.blockers.some((b) => b.code === "already_canceled")).toBe(true);
    });
});

describe("P5.S2 commit adapter", () => {
    const makeGuard = () => {
        let delegated = false;
        return {
            invocationId: "inv-1",
            hasDelegated: () => delegated,
            markDelegated: () => {
                if (delegated) throw new Error("duplicate");
                delegated = true;
            },
        };
    };

    it("requires confirmation and calls cancelTourBooking once", async () => {
        const booking = sampleBooking();
        const state = sampleState({ booking });
        const impact = buildCancelTourImpactPreview({ orgId: "org-1", state });
        const cancelSpy = vi.fn(async () => ({
            id: "bk-1",
            org_id: "org-1",
            opportunity_id: "opp-1",
            location_id: "loc-1",
            primary_person_id: null,
            primary_contact_id: null,
            requested_by_user_id: null,
            start_at: booking.start_at,
            end_at: booking.end_at,
            timezone: booking.timezone,
            status_key: "canceled",
            source: "admin",
            form_submission_id: null,
            form_public_link_id: null,
            canceled_at: "2026-07-27T00:00:00.000Z",
            canceled_by: "user-1",
            cancel_reason: null,
            rescheduled_from_booking_id: null,
            metadata: {},
            created_at: "2026-07-01T00:00:00.000Z",
            updated_at: "2026-07-27T00:00:00.000Z",
        }));
        const readSpy = vi.fn(async () => booking);

        const missing = await commitCancelTourViaAdapter({
            orgId: "org-1",
            userId: "user-1",
            supabase: {} as SupabaseClient,
            entityType: "opportunity",
            entityId: "opp-1",
            inputValues: { booking_id: "bk-1" },
            previewToken: impact.previewToken,
            confirmation: { confirmed: false },
            trustedServerContext: true,
            guard: makeGuard(),
            deps: { readCancelTourBookingSnapshot: readSpy, cancelTourBooking: cancelSpy },
        });
        expect(missing.ok).toBe(false);
        if (!missing.ok) expect(missing.code).toBe("confirmation_required");
        expect(cancelSpy).not.toHaveBeenCalled();

        const g = makeGuard();
        const ok = await commitCancelTourViaAdapter({
            orgId: "org-1",
            userId: "user-1",
            supabase: {} as SupabaseClient,
            entityType: "opportunity",
            entityId: "opp-1",
            inputValues: { booking_id: "bk-1" },
            previewToken: impact.previewToken,
            confirmation: { confirmed: true },
            trustedServerContext: true,
            guard: g,
            deps: { readCancelTourBookingSnapshot: readSpy, cancelTourBooking: cancelSpy },
        });
        expect(ok.ok).toBe(true);
        expect(cancelSpy).toHaveBeenCalledTimes(1);
        expect(g.hasDelegated()).toBe(true);
    });

    it("rejects stale preview when schedule changes", async () => {
        const booking = sampleBooking();
        const impact = buildCancelTourImpactPreview({
            orgId: "org-1",
            state: sampleState({ booking }),
        });
        const stale = sampleBooking({ start_at: "2026-08-02T15:00:00.000Z" });
        const cancelSpy = vi.fn();
        const result = await commitCancelTourViaAdapter({
            orgId: "org-1",
            userId: "user-1",
            supabase: {} as SupabaseClient,
            entityType: "opportunity",
            entityId: "opp-1",
            inputValues: { booking_id: "bk-1" },
            previewToken: impact.previewToken,
            confirmation: { confirmed: true },
            trustedServerContext: true,
            guard: makeGuard(),
            deps: {
                readCancelTourBookingSnapshot: async () => stale,
                cancelTourBooking: cancelSpy,
            },
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.code).toBe("stale_preview");
        expect(cancelSpy).not.toHaveBeenCalled();
    });

    it("adapter does not reimplement cancel writes or comms", () => {
        const source = readFileSync(
            resolve(process.cwd(), "lib/platform/commands/runtime/adapters/cancelTourAdapter.ts"),
            "utf8"
        );
        expect(source).toContain("cancelTourBooking");
        expect(source).not.toContain("orchestrateTourBookingCanceled");
        expect(source).not.toContain("rescheduleTourBooking");
        expect(source).not.toMatch(/\.from\(\s*[\"']tour_bookings[\"']\s*\)\s*\.update/);
        expect(source).not.toContain("executeMutation");
    });
});

describe("P5.S2 executeCommandInvocation", () => {
    it("BOS cannot bypass strong confirmation", async () => {
        const booking = sampleBooking();
        const result = await executeCommandInvocation({
            request: {
                mode: "execute",
                invocation: baseInvocation({
                    commandKey: "cancel_tour",
                    origin: "bos",
                    inputValues: { booking_id: "bk-1" },
                }),
                confirmation: { confirmed: false },
                previewToken: "tok",
                executionSubject: { entityType: "opportunity", entityId: "opp-1" },
            },
            server: {
                orgId: "org-1",
                userId: "user-1",
                supabase: {} as SupabaseClient,
            },
            deps: {
                readCancelTourBookingSnapshot: async () => booking,
                cancelTourBooking: async () => {
                    throw new Error("should not run");
                },
            },
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(
                result.error.code === "confirmation_required" ||
                    result.error.code === "preview_token_required" ||
                    result.error.code === "stale_preview"
            ).toBe(true);
        }
    });

    it("preview then commit through facade exactly once", async () => {
        const booking = sampleBooking();
        const cancelSpy = vi.fn(async () => ({
            id: "bk-1",
            org_id: "org-1",
            opportunity_id: "opp-1",
            location_id: "loc-1",
            primary_person_id: null,
            primary_contact_id: null,
            requested_by_user_id: null,
            start_at: booking.start_at,
            end_at: booking.end_at,
            timezone: booking.timezone,
            status_key: "canceled",
            source: "admin",
            form_submission_id: null,
            form_public_link_id: null,
            canceled_at: "2026-07-27T00:00:00.000Z",
            canceled_by: "user-1",
            cancel_reason: "family request",
            rescheduled_from_booking_id: null,
            metadata: {},
            created_at: "2026-07-01T00:00:00.000Z",
            updated_at: "2026-07-27T00:00:00.000Z",
        }));

        const previewed = await executeCommandInvocation({
            request: {
                mode: "preview",
                invocation: baseInvocation({
                    commandKey: "cancel_tour",
                    inputValues: { booking_id: "bk-1", cancel_reason: "family request" },
                }),
                executionSubject: { entityType: "opportunity", entityId: "opp-1" },
            },
            server: { orgId: "org-1", userId: "user-1", supabase: {} as SupabaseClient },
            deps: {
                readCancelTourBookingSnapshot: async () => booking,
                cancelTourBooking: cancelSpy,
            },
        });
        expect(previewed.ok).toBe(true);
        expect(cancelSpy).not.toHaveBeenCalled();
        if (!previewed.ok) throw new Error("preview failed");

        const committed = await executeCommandInvocation({
            request: {
                mode: "execute",
                invocation: baseInvocation({
                    commandKey: "cancel_tour",
                    inputValues: { booking_id: "bk-1", cancel_reason: "family request" },
                }),
                confirmation: { confirmed: true },
                previewToken: previewed.impactPreview!.previewToken,
                executionSubject: { entityType: "opportunity", entityId: "opp-1" },
            },
            server: { orgId: "org-1", userId: "user-1", supabase: {} as SupabaseClient },
            deps: {
                readCancelTourBookingSnapshot: async () => booking,
                cancelTourBooking: cancelSpy,
            },
        });
        expect(committed.ok).toBe(true);
        expect(cancelSpy).toHaveBeenCalledTimes(1);
        if (committed.ok) {
            expect(committed.cancelTourResult?.kind).toBe("tour_cancel");
            expect(committed.executionOwner).toBe("tour_domain");
        }
    });

    it("preparation reports facade commit enabled for cancel_tour", () => {
        const snap = prepareCommandInvocation(baseInvocation({ commandKey: "cancel_tour" }));
        expect(snap.snapshot.destructivePreparation?.facadeCommitEnabled).toBe(true);
        expect(snap.snapshot.confirmationPolicy).toBe("strong_confirm");
    });

    it("previewCancelTourViaAdapter performs no cancel", async () => {
        const cancelSpy = vi.fn();
        const result = await previewCancelTourViaAdapter({
            orgId: "org-1",
            supabase: {} as SupabaseClient,
            entityType: "tour_booking",
            entityId: "bk-1",
            trustedServerContext: true,
            deps: {
                readCancelTourBookingSnapshot: async () => sampleBooking(),
                cancelTourBooking: cancelSpy,
            },
        });
        expect(result.ok).toBe(true);
        expect(cancelSpy).not.toHaveBeenCalled();
    });
});
