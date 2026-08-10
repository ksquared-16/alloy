/**
 * Tour communications must carry canonical recipient IDENTITY, not just an address.
 *
 * The defect this pins: the orchestrator resolved the parent to a canonical person and
 * then recorded that person only in outbound `metadata`, never passing it as the typed
 * `recipientPersonId` the canonical enqueue takes. Eligibility therefore saw `null` and
 * failed closed with `RECIPIENT_UNRESOLVED` — correctly, because an external send with
 * no resolved identity cannot be evaluated for opt-out, suppression, or channel
 * usability.
 *
 * Every tour message is an EXTERNAL send to a family, so this is the difference between
 * "we checked whether we may contact this person" and "we posted an address at a
 * provider". Metadata is telemetry; the typed field is authority.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { TOUR_COMMS_EVENT_KEYS, TOUR_COMMS_OUTBOUND_METADATA } from "@/lib/tours/comms/tourCommsConfig";
import { getDefaultTourCommsTemplateSet, normalizeTourCommsEventKey, renderTourCommsTemplate } from "@/lib/tours/comms/tourCommsTemplates";
import { orchestrateTourInvitationComms } from "@/lib/tours/comms/tourCommsOrchestrator";
import { TOUR_COMMS_CALL_SITE } from "@/lib/tours/comms/tourCommsClassification";
import type { TourCommsParentRecipient } from "@/lib/tours/comms/resolveTourCommsRecipient";

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const OPP = "22222222-0000-4000-8000-00000000000c";
const LOC = "33333333-0000-4000-8000-00000000000d";
const INV = "44444444-0000-4000-8000-00000000000e";
const PERSON = "11111111-0000-4000-8000-00000000000a";

const recipient: TourCommsParentRecipient = {
    personId: PERSON,
    displayName: "Dana Reyes",
    email: "dana@example.invalid",
    smsTo: "+15555550123",
};

// Templates come from the resolved config in production; an empty set renders an
// empty body and the send is skipped before it ever reaches the enqueue.
const config = {
    enabled: true,
    channels: { email: true, sms: true },
    templates: getDefaultTourCommsTemplateSet(),
} as never;

let enqueueCalls: Array<Record<string, unknown>>;

function deps() {
    return {
        enqueueImmediate: async (args: Record<string, unknown>) => {
            enqueueCalls.push(args);
            return { communicationMessageId: `msg-${enqueueCalls.length}` };
        },
        triggerQueue: async () => undefined,
        hasExistingImmediateSend: async () => false,
    } as never;
}

async function run() {
    return orchestrateTourInvitationComms({
        supabase: {} as never,
        orgId: ORG,
        invitationId: INV,
        opportunityId: OPP,
        locationId: LOC,
        config,
        context: {
            orgName: "Northwind",
            locationName: "Downtown",
            parentName: "Dana",
            childName: "Rowan",
            // The invitation templates are mostly tokens; without these the optional
            // lines are stripped and the body renders empty, which skips the send.
            tourOptionsBlock: "• Monday, August 10 · 9:00 AM — https://x.invalid/t/abc",
            invitationActionUrl: "https://x.invalid/t/view",
            declineUrl: "https://x.invalid/t/decline",
        },
        recipient,
        generationToken: "gen-1",
        deps: deps(),
    });
}

beforeEach(() => {
    enqueueCalls = [];
});

describe("canonical classification reaches the enqueue", () => {
    it("classifies every send explicitly, on every channel", async () => {
        await run();

        expect(enqueueCalls.length).toBeGreaterThan(0);
        for (const call of enqueueCalls) {
            const where = `channel ${String(call.channelRaw)}`;
            // Passing neither is what put every tour message through the counted
            // `canonicalOutboundEnqueue:unspecified` category fallback — and
            // category is what decides whether opt-out and quiet hours apply.
            expect(call.category, `${where} was not classified`).toBe("operational");
            expect(call.audience, `${where} had no declared audience`).toBe("external");
        }
    });

    it("names its call site, so any residual fallback is attributable", async () => {
        await run();

        for (const call of enqueueCalls) {
            expect(call.callSite).toBe(TOUR_COMMS_CALL_SITE);
        }
    });

    it("passes no purpose while the declared one contradicts the category", async () => {
        // `tour_coordination` names this call site but declares `transactional`
        // only. Sending it would make validatePurpose reject every tour send the
        // moment purpose validation reaches this path.
        await run();

        for (const call of enqueueCalls) {
            expect(call.purpose ?? null).toBeNull();
        }
    });
});

describe("canonical recipient identity reaches the enqueue", () => {
    it("passes recipientPersonId as a typed field on every channel", async () => {
        await run();

        expect(enqueueCalls.length).toBeGreaterThan(0);
        for (const call of enqueueCalls) {
            expect(call.recipientPersonId, `channel ${String(call.channelRaw)} sent no resolved identity`).toBe(PERSON);
        }
    });

    it("does not rely on metadata to carry identity", async () => {
        await run();

        // Metadata may ALSO carry it for telemetry, but the typed field is what
        // eligibility reads. Asserting both keeps the distinction explicit.
        for (const call of enqueueCalls) {
            const md = call.metadata as Record<string, unknown>;
            expect(md[TOUR_COMMS_OUTBOUND_METADATA.recipientPersonId]).toBe(PERSON);
            expect(call.recipientPersonId).toBe(PERSON);
        }
    });

    it("sends the address and the identity together, never an address alone", async () => {
        await run();

        const email = enqueueCalls.find((c) => c.channelRaw === "email");
        const sms = enqueueCalls.find((c) => c.channelRaw === "sms");

        expect(email?.toRaw).toBe(recipient.email);
        expect(email?.recipientPersonId).toBe(PERSON);
        expect(sms?.toRaw).toBe(recipient.smsTo);
        expect(sms?.recipientPersonId).toBe(PERSON);
    });

    it("keeps the send scoped to the opportunity it is about", async () => {
        await run();
        for (const call of enqueueCalls) {
            expect(call.primaryEntityType).toBe("opportunities");
            expect(call.primaryEntityId).toBe(OPP);
            expect(call.contextLocationId).toBe(LOC);
        }
    });
});

describe("every declared event key is actually renderable", () => {
    it("normalizes and renders a body for each key in TOUR_COMMS_EVENT_KEYS", () => {
        // The alias map had drifted from the key list, so `tour_invitation` and
        // `tour_pending_internal` normalized to null and rendered nothing — the send
        // was skipped as `empty_body` with no loud failure anywhere. Adding an event
        // key must never again mean "declared but unrenderable".
        const context = {
            orgName: "Northwind",
            locationName: "Downtown",
            parentName: "Dana",
            childName: "Rowan",
            opportunityName: "Rowan Reyes",
            tourDisplayLabel: "Monday, August 10 · 9:00 AM",
            tourOptionsBlock: "• Monday, August 10 · 9:00 AM — https://x.invalid/t/abc",
            invitationActionUrl: "https://x.invalid/t/view",
            declineUrl: "https://x.invalid/t/decline",
            publicBookingUrl: "https://x.invalid/t/book",
            addToCalendarUrl: "https://x.invalid/cal",
            rescheduleUrl: "https://x.invalid/t/resched",
        };

        for (const key of TOUR_COMMS_EVENT_KEYS) {
            expect(normalizeTourCommsEventKey(key), `${key} does not normalize`).toBe(key);

            const anyChannelRenders = (["email", "sms"] as const).some((channel) => {
                const rendered = renderTourCommsTemplate({ eventKey: key, channel, context, templateOverrides: undefined });
                if (!rendered) return false;
                const body = rendered.channel === "email" ? rendered.bodyText : rendered.body;
                return Boolean(body && body.trim());
            });

            expect(anyChannelRenders, `${key} renders no body on any channel`).toBe(true);
        }
    });
});
