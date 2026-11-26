/**
 * P5.S1 — Tour authority + reschedule_tour facade cutover.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
    executionOwnerForCapability,
    getPlatformCapability,
} from "@/lib/platform/commands/capabilityRegistry";
import { executeCommandInvocation } from "@/lib/platform/commands/runtime/executeCommandInvocation";
import {
    isCommandRuntimeFacadeExecutionSupported,
    isTourDomainFacadeSupported,
    TOUR_DOMAIN_FACADE_COMMAND_KEYS,
} from "@/lib/platform/commands/runtime/commandRuntimeExecutionGate";
import { prepareCommandInvocation } from "@/lib/platform/commands/runtime/prepareCommandInvocation";
import {
    assertDestructiveCommitAllowed,
    isDestructiveFacadeCommitAllowlisted,
} from "@/lib/platform/commands/runtime/destructive";
import {
    buildRescheduleTourPreviewSummary,
    executeRescheduleTourViaAdapter,
    resolveRescheduleTourInputs,
} from "@/lib/platform/commands/runtime/adapters/tourExecutionAdapter";
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

describe("P5.S1 Tour authority", () => {
    it("maps Tour family to expected owners", () => {
        expect(executionOwnerForCapability("schedule.create")).toBe("registered_action");
        expect(executionOwnerForCapability("confirm_tour")).toBe("registered_action");
        expect(executionOwnerForCapability("schedule_tour")).toBe("tour_domain");
        expect(executionOwnerForCapability("reschedule_tour")).toBe("tour_domain");
        expect(executionOwnerForCapability("cancel_tour")).toBe("tour_domain");
        expect(executionOwnerForCapability("complete_tour")).toBe("tour_domain");
        expect(executionOwnerForCapability("no_show_tour")).toBe("tour_domain");
        expect(getPlatformCapability("mark_tour_no_show")?.canonicalCommandKey).toBe("no_show_tour");
        expect(getPlatformCapability("reopen_tour")?.maturity).toBe("unavailable");
    });

    it("enables reschedule + terminal Tour facade keys", () => {
        expect(TOUR_DOMAIN_FACADE_COMMAND_KEYS).toEqual([
            "reschedule_tour",
            "complete_tour",
            "no_show_tour",
        ]);
        expect(isTourDomainFacadeSupported("reschedule_tour")).toBe(true);
        expect(isTourDomainFacadeSupported("mark_tour_no_show")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("reschedule_tour")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("complete_tour")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("no_show_tour")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("mark_tour_no_show")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("schedule_tour")).toBe(false);
        expect(isCommandRuntimeFacadeExecutionSupported("cancel_tour")).toBe(true);
        expect(isDestructiveFacadeCommitAllowlisted("cancel_tour")).toBe(true);
        expect(assertDestructiveCommitAllowed({ capabilityKey: "cancel_tour" }).allowed).toBe(
            true
        );
        expect(isCommandRuntimeFacadeExecutionSupported("reopen_tour")).toBe(false);
    });

    it("keeps schedule.create and confirm_tour on RegisteredAction facade", () => {
        expect(isCommandRuntimeFacadeExecutionSupported("schedule.create")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("confirm_tour")).toBe(true);
        expect(executionOwnerForCapability("schedule.create")).toBe("registered_action");
        expect(executionOwnerForCapability("confirm_tour")).toBe("registered_action");
    });
});

describe("P5.S1 reschedule inputs", () => {
    it("resolves booking id and times from payload", () => {
        const resolved = resolveRescheduleTourInputs({
            entityType: "opportunity",
            entityId: "opp-1",
            inputValues: {
                booking_id: "bk-1",
                start_at: "2026-08-01T15:00:00.000Z",
                end_at: "2026-08-01T15:30:00.000Z",
                timezone: "America/Los_Angeles",
            },
        });
        expect("error" in resolved).toBe(false);
        if ("error" in resolved) throw new Error(resolved.error);
        expect(resolved.bookingId).toBe("bk-1");
        expect(resolved.startAt.toISOString()).toBe("2026-08-01T15:00:00.000Z");
        expect(resolved.timezone).toBe("America/Los_Angeles");
    });

    it("accepts tour_booking entity grain", () => {
        const resolved = resolveRescheduleTourInputs({
            entityType: "tour_booking",
            entityId: "bk-9",
            inputValues: {
                start_at: "2026-08-01T15:00:00.000Z",
                end_at: "2026-08-01T15:30:00.000Z",
            },
        });
        expect("error" in resolved).toBe(false);
        if ("error" in resolved) throw new Error(resolved.error);
        expect(resolved.bookingId).toBe("bk-9");
    });

    it("builds non-mutating preview summary", () => {
        const preview = buildRescheduleTourPreviewSummary({
            bookingId: "bk-1",
            startAt: new Date("2026-08-01T15:00:00.000Z"),
            endAt: new Date("2026-08-01T15:30:00.000Z"),
            timezone: "America/Los_Angeles",
            locationId: null,
        });
        expect(preview.kind).toBe("tour");
        expect(preview.summary.booking_id).toBe("bk-1");
    });
});

describe("P5.S1 adapter", () => {
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

    it("delegates exactly once to rescheduleTourBooking", async () => {
        const spy = vi.fn(async () => ({
            id: "bk-1",
            org_id: "org-1",
            opportunity_id: "opp-1",
            location_id: "loc-1",
            primary_person_id: null,
            primary_contact_id: null,
            requested_by_user_id: null,
            start_at: "2026-08-01T15:00:00.000Z",
            end_at: "2026-08-01T15:30:00.000Z",
            timezone: "America/Los_Angeles",
            status_key: "confirmed",
            source: "admin",
            form_submission_id: null,
            form_public_link_id: null,
            canceled_at: null,
            canceled_by: null,
            cancel_reason: null,
            rescheduled_from_booking_id: null,
            metadata: {},
            created_at: "2026-07-01T00:00:00.000Z",
            updated_at: "2026-08-01T00:00:00.000Z",
        }));

        const cap = getPlatformCapability("reschedule_tour")!;
        const g = makeGuard();
        const result = await executeRescheduleTourViaAdapter({
            capability: cap,
            commandKey: "reschedule_tour",
            invocation: baseInvocation({
                commandKey: "reschedule_tour",
                inputValues: {
                    booking_id: "bk-1",
                    start_at: "2026-08-01T15:00:00.000Z",
                    end_at: "2026-08-01T15:30:00.000Z",
                    timezone: "America/Los_Angeles",
                },
            }),
            executionSubject: { entityType: "opportunity", entityId: "opp-1" },
            mode: "execute",
            supabase: {} as SupabaseClient,
            orgId: "org-1",
            userId: "user-1",
            invocationId: "inv-1",
            guard: g,
            deps: { rescheduleTourBooking: spy },
        });

        expect(result.ok).toBe(true);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(g.hasDelegated()).toBe(true);
        if (result.ok && "result" in result) {
            expect(result.result.kind).toBe("tour");
            expect(result.result.tour_result.booking_id).toBe("bk-1");
        }
    });

    it("preview does not call executor", async () => {
        const spy = vi.fn();
        const cap = getPlatformCapability("reschedule_tour")!;
        const result = await executeRescheduleTourViaAdapter({
            capability: cap,
            commandKey: "reschedule_tour",
            invocation: baseInvocation({
                commandKey: "reschedule_tour",
                inputValues: {
                    booking_id: "bk-1",
                    start_at: "2026-08-01T15:00:00.000Z",
                    end_at: "2026-08-01T15:30:00.000Z",
                },
            }),
            executionSubject: { entityType: "opportunity", entityId: "opp-1" },
            mode: "preview",
            supabase: {} as SupabaseClient,
            orgId: "org-1",
            invocationId: "inv-1",
            guard: makeGuard(),
            deps: { rescheduleTourBooking: spy },
        });
        expect(result.ok).toBe(true);
        expect(spy).not.toHaveBeenCalled();
    });

    it("adapter does not import booking persistence helpers", () => {
        const source = readFileSync(
            resolve(process.cwd(), "lib/platform/commands/runtime/adapters/tourExecutionAdapter.ts"),
            "utf8"
        );
        expect(source).toContain("rescheduleTourBooking");
        expect(source).not.toContain("from(\"tour_bookings\").update");
        expect(source).not.toContain("orchestrateTourBookingRescheduled");
        expect(source).not.toContain("executeMutation");
        expect(source).not.toContain("executeRelationshipAction");
        expect(source).not.toContain("runRegisteredAction");
    });
});

describe("P5.S1 executeCommandInvocation", () => {
    it("automation origin cannot bypass missing booking id", async () => {
        const result = await executeCommandInvocation({
            request: {
                mode: "execute",
                invocation: baseInvocation({
                    commandKey: "reschedule_tour",
                    origin: "automation",
                    inputValues: {
                        start_at: "2026-08-01T15:00:00.000Z",
                        end_at: "2026-08-01T15:30:00.000Z",
                    },
                }),
                executionSubject: { entityType: "opportunity", entityId: "opp-1" },
            },
            server: {
                orgId: "org-1",
                userId: "user-1",
                supabase: {} as SupabaseClient,
            },
            deps: {
                rescheduleTourBooking: async () => {
                    throw new Error("should not run");
                },
            },
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe("invalid_inputs");
    });

    it("preview then commit through facade once", async () => {
        const spy = vi.fn(async () => ({
            id: "bk-1",
            org_id: "org-1",
            opportunity_id: "opp-1",
            location_id: "loc-1",
            primary_person_id: null,
            primary_contact_id: null,
            requested_by_user_id: null,
            start_at: "2026-08-01T16:00:00.000Z",
            end_at: "2026-08-01T16:30:00.000Z",
            timezone: "America/Los_Angeles",
            status_key: "confirmed",
            source: "admin",
            form_submission_id: null,
            form_public_link_id: null,
            canceled_at: null,
            canceled_by: null,
            cancel_reason: null,
            rescheduled_from_booking_id: null,
            metadata: {},
            created_at: "2026-07-01T00:00:00.000Z",
            updated_at: "2026-08-01T00:00:00.000Z",
        }));

        const previewed = await executeCommandInvocation({
            request: {
                mode: "preview",
                invocation: baseInvocation({
                    commandKey: "reschedule_tour",
                    inputValues: {
                        booking_id: "bk-1",
                        start_at: "2026-08-01T16:00:00.000Z",
                        end_at: "2026-08-01T16:30:00.000Z",
                        timezone: "America/Los_Angeles",
                    },
                }),
                executionSubject: { entityType: "opportunity", entityId: "opp-1" },
            },
            server: { orgId: "org-1", userId: "user-1", supabase: {} as SupabaseClient },
            deps: { rescheduleTourBooking: spy },
        });
        expect(previewed.ok).toBe(true);
        expect(spy).not.toHaveBeenCalled();

        const committed = await executeCommandInvocation({
            request: {
                mode: "execute",
                invocation: baseInvocation({
                    commandKey: "reschedule_tour",
                    inputValues: {
                        booking_id: "bk-1",
                        start_at: "2026-08-01T16:00:00.000Z",
                        end_at: "2026-08-01T16:30:00.000Z",
                        timezone: "America/Los_Angeles",
                    },
                }),
                executionSubject: { entityType: "opportunity", entityId: "opp-1" },
            },
            server: { orgId: "org-1", userId: "user-1", supabase: {} as SupabaseClient },
            deps: { rescheduleTourBooking: spy },
        });
        expect(committed.ok).toBe(true);
        expect(spy).toHaveBeenCalledTimes(1);
        if (committed.ok) {
            expect(committed.executionOwner).toBe("tour_domain");
            expect(committed.tourResult?.tour_result.booking_id).toBe("bk-1");
        }
    });

    it("preparation reports tour destination for reschedule", () => {
        const snap = prepareCommandInvocation(baseInvocation({ commandKey: "reschedule_tour" }));
        expect(snap.snapshot.executionOwner).toBe("tour_domain");
        expect(snap.snapshot.confirmationPolicy).toBe("domain_owned");
    });
});
