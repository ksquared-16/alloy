/**
 * SPECULATION MAY PREPARE. OPERATOR INTENT MAY MUTATE.
 *
 * Hover, focus and visibility are not decisions. Measured on staging, the Send Tour Invitation
 * warmer POSTed the registered-action execute endpoint with `confirmation: { confirmed: true }` and
 * a fresh `crypto.randomUUID()` idempotency key per call, so every pass of the pointer across the
 * action row minted a durable tour invitation and its PUBLIC booking tokens — and the random key
 * defeated the server's replay dedupe, so they accumulated. The drafts were twice misread, first as
 * QA litter and then as a dispatch defect. They were neither.
 *
 * These assert REQUESTS, not source text: a guard that greps for a call site passes happily while
 * the mutation moves one function away.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { warmCurrentWorkCapabilityOnIntent, warmCurrentWorkCapabilitiesForActions } from
    "@/lib/adminV2/runtime/focusPanel/currentWork/warmCurrentWorkCapabilities";
import { speculativeFetch, SpeculativeMutationError } from
    "@/lib/adminV2/runtime/speculation/speculativeFetch";
import type { CurrentWorkActionVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

const OPP = "opp-spec-1";

function context(): OperationalContext {
    return {
        grain: "case",
        subject: { type: "opportunity", id: OPP, label: "A Family" },
        businessProcess: { key: "enrollment", label: "enrollment", stageKey: "tour" },
        perspective: null,
        truth: { id: OPP },
        stageWorkRuntime: null,
        signals: {
            work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: null },
            attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
            tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
            communications: { scheduledSendCount: 0, nextFollowUpAt: null, hasOutreach: false, nextScheduledSendId: null },
            billing: { billingConfigured: false, billingContactName: null, billingContactEmail: null, tuitionRateLabel: null, feeBalanceCents: null },
        },
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
    } as unknown as OperationalContext;
}

const tourInvitationAction = {
    key: "send_tour_invitation",
    actionRef: "send_tour_invitation",
    handlerKey: "send_tour_invitation",
    label: "Send Tour Invitation",
    category: "communication",
    placement: "current_work_supporting",
} as unknown as CurrentWorkActionVM;

let calls: { url: string; method: string }[] = [];

beforeEach(() => {
    calls = [];
    vi.stubGlobal("fetch", vi.fn(async (input: unknown, init?: RequestInit) => {
        calls.push({
            url: typeof input === "string" ? input : String((input as { url?: string })?.url ?? input),
            method: String(init?.method ?? "GET").toUpperCase(),
        });
        return { ok: true, status: 200, json: async () => ({ ok: true, data: {} }) } as unknown as Response;
    }));
    vi.stubGlobal("window", globalThis as unknown as Window & typeof globalThis);
});
afterEach(() => { vi.unstubAllGlobals(); });

const mutating = () => calls.filter((c) => c.method !== "GET" && c.method !== "HEAD");

describe("warming the Tour invitation capability", () => {
    it("makes no mutating request on intent — the regression, stated as a request count", () => {
        warmCurrentWorkCapabilityOnIntent(tourInvitationAction, context());
        expect(mutating()).toEqual([]);
    });

    it("never reaches the registered-action execute endpoint", () => {
        // The old warmer POSTed exactly this, with confirmation.confirmed = true.
        warmCurrentWorkCapabilityOnIntent(tourInvitationAction, context());
        expect(calls.filter((c) => c.url.includes("/api/admin/actions/execute"))).toEqual([]);
    });

    it("stays silent however many times focus crosses the row", () => {
        for (let i = 0; i < 12; i++) warmCurrentWorkCapabilityOnIntent(tourInvitationAction, context());
        expect(mutating()).toEqual([]);
    });

    it("still warms the composer's read-only context, so warming was not simply deleted", () => {
        warmCurrentWorkCapabilityOnIntent(tourInvitationAction, context());
        expect(calls.some((c) => c.url.includes("family-workspace"))).toBe(true);
        expect(calls.every((c) => c.method === "GET")).toBe(true);
    });

    it("warms every visible action at once without a single mutation", () => {
        // This is the path that made the defect fire without any hover at all: What's Next warms
        // every executable action as soon as it renders.
        warmCurrentWorkCapabilitiesForActions([tourInvitationAction, tourInvitationAction], context());
        expect(mutating()).toEqual([]);
    });
});

describe("the speculative fetch primitive", () => {
    it("permits reads", async () => {
        await speculativeFetch("/api/admin/thing");
        expect(calls).toEqual([{ url: "/api/admin/thing", method: "GET" }]);
    });

    it("refuses a mutation instead of quietly downgrading it", async () => {
        await expect(speculativeFetch("/api/admin/actions/execute", { method: "POST" }))
            .rejects.toBeInstanceOf(SpeculativeMutationError);
        // Nothing was sent. A downgrade would have produced a confusing 405 far from the cause.
        expect(calls).toEqual([]);
    });

    it("refuses every mutating verb, not just POST", async () => {
        for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
            await expect(speculativeFetch("/api/x", { method })).rejects.toBeInstanceOf(SpeculativeMutationError);
        }
        expect(calls).toEqual([]);
    });
});
