/**
 * P5.S3 — Complete Tour / Mark No-show Tour terminal transitions.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
    canonicalCapabilityKeyForAlias,
    executionOwnerForCapability,
    getPlatformCapability,
} from "@/lib/platform/commands/capabilityRegistry";
import { executeCommandInvocation } from "@/lib/platform/commands/runtime/executeCommandInvocation";
import {
    isCommandRuntimeFacadeExecutionSupported,
    isTourDomainFacadeSupported,
} from "@/lib/platform/commands/runtime/commandRuntimeExecutionGate";
import {
    executeTourTerminalTransitionViaAdapter,
    resolveTourTerminalTransition,
} from "@/lib/platform/commands/runtime/adapters/tourTerminalTransitionAdapter";
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

function bookingRow(status = "completed") {
    return {
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
        status_key: status,
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
    };
}

describe("P5.S3 authority and aliases", () => {
    it("keeps complete and no-show as distinct tour_domain capabilities", () => {
        expect(executionOwnerForCapability("complete_tour")).toBe("tour_domain");
        expect(executionOwnerForCapability("no_show_tour")).toBe("tour_domain");
        expect(canonicalCapabilityKeyForAlias("mark_tour_no_show")).toBe("no_show_tour");
        expect(getPlatformCapability("mark_tour_no_show")?.canonicalCommandKey).toBe("no_show_tour");
        expect(resolveTourTerminalTransition("complete_tour")).toBe("complete");
        expect(resolveTourTerminalTransition("no_show_tour")).toBe("no_show");
        expect(resolveTourTerminalTransition("reschedule_tour")).toBeNull();
        expect(isTourDomainFacadeSupported("complete_tour")).toBe(true);
        expect(isTourDomainFacadeSupported("mark_tour_no_show")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("complete_tour")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("mark_tour_no_show")).toBe(true);
        expect(isCommandRuntimeFacadeExecutionSupported("schedule_tour")).toBe(false);
        expect(isCommandRuntimeFacadeExecutionSupported("reopen_tour")).toBe(false);
    });
});

describe("P5.S3 adapter", () => {
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

    it("delegates complete exactly once", async () => {
        const completeSpy = vi.fn(async () => bookingRow("completed"));
        const noShowSpy = vi.fn();
        const cap = getPlatformCapability("complete_tour")!;
        const result = await executeTourTerminalTransitionViaAdapter({
            capability: cap,
            commandKey: "complete_tour",
            invocation: baseInvocation({
                commandKey: "complete_tour",
                inputValues: { booking_id: "bk-1" },
            }),
            executionSubject: { entityType: "opportunity", entityId: "opp-1" },
            mode: "execute",
            supabase: {} as SupabaseClient,
            orgId: "org-1",
            userId: "user-1",
            invocationId: "inv-1",
            guard: makeGuard(),
            deps: {
                markTourBookingCompleted: completeSpy,
                markTourBookingNoShow: noShowSpy,
            },
        });
        expect(result.ok).toBe(true);
        expect(completeSpy).toHaveBeenCalledTimes(1);
        expect(noShowSpy).not.toHaveBeenCalled();
        if (result.ok && "result" in result) {
            expect(result.result.tour_result.transition).toBe("complete");
            expect(result.result.tour_result.capability_key).toBe("complete_tour");
        }
    });

    it("delegates no-show exactly once via alias key", async () => {
        const noShowSpy = vi.fn(async () => bookingRow("no_show"));
        const cap = getPlatformCapability("no_show_tour")!;
        const result = await executeTourTerminalTransitionViaAdapter({
            capability: cap,
            commandKey: "mark_tour_no_show",
            invocation: baseInvocation({
                commandKey: "mark_tour_no_show",
                inputValues: { booking_id: "bk-1" },
            }),
            executionSubject: { entityType: "opportunity", entityId: "opp-1" },
            mode: "execute",
            supabase: {} as SupabaseClient,
            orgId: "org-1",
            userId: "user-1",
            invocationId: "inv-1",
            guard: makeGuard(),
            deps: { markTourBookingNoShow: noShowSpy },
        });
        expect(result.ok).toBe(true);
        expect(noShowSpy).toHaveBeenCalledTimes(1);
        if (result.ok && "result" in result) {
            expect(result.result.tour_result.transition).toBe("no_show");
            expect(result.result.tour_result.capability_key).toBe("no_show_tour");
        }
    });

    it("preview does not call executors", async () => {
        const completeSpy = vi.fn();
        const cap = getPlatformCapability("complete_tour")!;
        const result = await executeTourTerminalTransitionViaAdapter({
            capability: cap,
            commandKey: "complete_tour",
            invocation: baseInvocation({
                commandKey: "complete_tour",
                inputValues: { booking_id: "bk-1" },
            }),
            executionSubject: { entityType: "opportunity", entityId: "opp-1" },
            mode: "preview",
            supabase: {} as SupabaseClient,
            orgId: "org-1",
            invocationId: "inv-1",
            guard: makeGuard(),
            deps: { markTourBookingCompleted: completeSpy },
        });
        expect(result.ok).toBe(true);
        expect(completeSpy).not.toHaveBeenCalled();
    });

    it("maps domain eligibility failures safely", async () => {
        const cap = getPlatformCapability("complete_tour")!;
        const result = await executeTourTerminalTransitionViaAdapter({
            capability: cap,
            commandKey: "complete_tour",
            invocation: baseInvocation({
                commandKey: "complete_tour",
                inputValues: { booking_id: "bk-1" },
            }),
            executionSubject: { entityType: "opportunity", entityId: "opp-1" },
            mode: "execute",
            supabase: {} as SupabaseClient,
            orgId: "org-1",
            invocationId: "inv-1",
            guard: makeGuard(),
            deps: {
                markTourBookingCompleted: async () => {
                    throw new Error("tour_bookings: complete only from confirmed or rescheduled");
                },
            },
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.code).toBe("transition_not_allowed");
            expect(result.delegated).toBe(true);
        }
    });

    it("adapter does not import persistence or sibling Tour mutations", () => {
        const source = readFileSync(
            resolve(
                process.cwd(),
                "lib/platform/commands/runtime/adapters/tourTerminalTransitionAdapter.ts"
            ),
            "utf8"
        );
        expect(source).toContain("markTourBookingCompleted");
        expect(source).toContain("markTourBookingNoShow");
        expect(source).not.toContain("cancelTourBooking");
        expect(source).not.toContain("rescheduleTourBooking");
        expect(source).not.toContain("orchestrateTourBooking");
        expect(source).not.toMatch(/\.from\(\s*[\"']tour_bookings[\"']\s*\)\s*\.update/);
    });
});

describe("P5.S3 executeCommandInvocation", () => {
    it("routes complete through facade once", async () => {
        const spy = vi.fn(async () => bookingRow("completed"));
        const result = await executeCommandInvocation({
            request: {
                mode: "execute",
                invocation: baseInvocation({
                    commandKey: "complete_tour",
                    inputValues: { booking_id: "bk-1" },
                }),
                executionSubject: { entityType: "opportunity", entityId: "opp-1" },
            },
            server: { orgId: "org-1", userId: "user-1", supabase: {} as SupabaseClient },
            deps: { markTourBookingCompleted: spy },
        });
        expect(result.ok).toBe(true);
        expect(spy).toHaveBeenCalledTimes(1);
        if (result.ok) {
            expect(result.executionOwner).toBe("tour_domain");
            expect(result.tourResult?.tour_result).toMatchObject({
                transition: "complete",
                booking_id: "bk-1",
            });
        }
    });

    it("routes mark_tour_no_show alias through facade once", async () => {
        const spy = vi.fn(async () => bookingRow("no_show"));
        const result = await executeCommandInvocation({
            request: {
                mode: "execute",
                invocation: baseInvocation({
                    commandKey: "mark_tour_no_show",
                    origin: "automation",
                    inputValues: { booking_id: "bk-1" },
                }),
                executionSubject: { entityType: "opportunity", entityId: "opp-1" },
            },
            server: { orgId: "org-1", userId: "user-1", supabase: {} as SupabaseClient },
            deps: { markTourBookingNoShow: spy },
        });
        expect(result.ok).toBe(true);
        expect(spy).toHaveBeenCalledTimes(1);
        if (result.ok) {
            expect(result.canonicalCapabilityKey).toBe("no_show_tour");
            expect(result.tourResult?.tour_result).toMatchObject({ transition: "no_show" });
        }
    });
});
