/**
 * Behavioural certification for tour invitation delivery — Slice D.
 *
 * Drives the REAL composition service and the REAL registered action. Only the
 * collaborators it composes (availability, minting, the comms orchestrator, the
 * recipient resolver) are doubled, so what is certified here is the composition's own
 * decisions — idempotency, recipient authority, operator-language failures — rather
 * than a restatement of the collaborators' behaviour.
 *
 * Fixtures are typed against the REAL exported types. Slice C shipped a defect where a
 * hand-written snake_case fake certified a permanently-rejecting path; typing the
 * fixture against `AvailableTourSlot` is what prevents a repeat.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AvailableTourSlot } from "@/lib/tours/availability/types";
import type { TourCommsParentRecipient } from "@/lib/tours/comms/resolveTourCommsRecipient";
import type { MintInvitationResult } from "@/lib/tours/invitation/mintTourInvitation";

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const OPP = "22222222-0000-4000-8000-00000000000c";
const LOC = "33333333-0000-4000-8000-00000000000d";
const PERSON = "11111111-0000-4000-8000-00000000000a";
const INVITATION = "55555555-0000-4000-8000-00000000000f";

const slotsMock = vi.fn();
const mintMock = vi.fn();
const supersedeMock = vi.fn();
const commsMock = vi.fn();
const recipientMock = vi.fn();
const eventMock = vi.fn();

vi.mock("@/lib/tours/availability/computeAvailableTourSlots", () => ({
    computeAvailableTourSlots: (...a: unknown[]) => slotsMock(...a),
}));
vi.mock("@/lib/tours/invitation/mintTourInvitation", async (orig) => ({
    ...(await orig<Record<string, unknown>>()),
    mintTourInvitation: (...a: unknown[]) => mintMock(...a),
    supersedeTourInvitation: (...a: unknown[]) => supersedeMock(...a),
}));
vi.mock("@/lib/tours/comms/tourCommsOrchestrator", () => ({
    orchestrateTourInvitationComms: (...a: unknown[]) => commsMock(...a),
}));
vi.mock("@/lib/tours/comms/resolveTourCommsRecipient", () => ({
    resolveTourCommsParentRecipient: (...a: unknown[]) => recipientMock(...a),
}));
vi.mock("@/lib/tours/comms/resolveTourCommsConfig", () => ({
    resolveTourCommsConfig: async () => ({ config: { channels: { email: true, sms: true }, templates: {} } }),
}));
vi.mock("@/lib/tours/events/recordTourEvent", () => ({
    recordTourEvent: (...a: unknown[]) => eventMock(...a),
}));

import { sendTourInvitation, tourOptionIdForSlot } from "@/lib/tours/invitation/sendTourInvitation";
import { sendTourInvitationAction } from "@/lib/adminV2/actions/definitions/sendTourInvitationAction";
import { getRegisteredAction, hasRegisteredHandler } from "@/lib/adminV2/actions/actionRegistry";

const slot = (over: Partial<AvailableTourSlot> = {}): AvailableTourSlot => ({
    startAt: "2026-08-10T16:00:00.000Z",
    endAt: "2026-08-10T17:00:00.000Z",
    timezone: "America/Los_Angeles",
    remainingCapacity: 3,
    ruleId: "rule-1",
    locationId: LOC,
    userId: null,
    ...over,
});

const recipient: TourCommsParentRecipient = {
    personId: PERSON,
    displayName: "Dana Reyes",
    email: "dana@example.invalid",
    smsTo: "+15555550123",
};

const mintOk: MintInvitationResult = {
    ok: true,
    invitationId: INVITATION,
    status: "active",
    idempotentReplay: false,
    actions: [
        { id: "a1", actionKind: "view_tour_slots", rawToken: "TOKEN_VIEW" },
        { id: "a2", actionKind: "select_tour_slot", rawToken: "TOKEN_SELECT" },
        { id: "a3", actionKind: "decline_tour", rawToken: "TOKEN_DECLINE" },
    ],
};

/** Minimal supabase double: only the reads the service performs. */
function fakeSupabase(over: { opportunity?: Record<string, unknown> | null } = {}) {
    const opportunity =
        over.opportunity === undefined
            ? { id: OPP, name: "Rowan Reyes", primary_person_id: PERSON, location_id: LOC, process_instance_id: null }
            : over.opportunity;
    return {
        from(table: string) {
            const row =
                table === "opportunities"
                    ? opportunity
                    : table === "locations"
                      ? { id: LOC, label: "Northwind — Downtown", address1: "1 Main St", city: "Springfield", state: "CA", postal_code: "90001" }
                      : table === "orgs"
                        ? { name: "Northwind Early Learning" }
                        : { metadata: {} };
            const chain: Record<string, unknown> = {
                select: () => chain,
                eq: () => chain,
                maybeSingle: async () => ({ data: row, error: null }),
            };
            return chain;
        },
    } as never;
}

const baseArgs = {
    orgId: ORG,
    opportunityId: OPP,
    baseUrl: "https://app.example.invalid",
    idempotencyKey: `send_tour_invitation:${ORG}:${OPP}`,
};

beforeEach(() => {
    vi.clearAllMocks();
    slotsMock.mockResolvedValue([slot(), slot({ startAt: "2026-08-11T16:00:00.000Z", ruleId: "rule-2" })]);
    mintMock.mockResolvedValue(mintOk);
    supersedeMock.mockResolvedValue(undefined);
    recipientMock.mockResolvedValue(recipient);
    commsMock.mockResolvedValue({
        ok: true,
        disabled: false,
        skippedReasons: [],
        immediate: [
            { channel: "email", eventKey: "tour_invitation", status: "sent", idempotencyKey: "k1" },
            { channel: "sms", eventKey: "tour_invitation", status: "sent", idempotencyKey: "k2" },
        ],
        reminders: { action: "none" },
    });
    eventMock.mockResolvedValue({ recorded: true });
});

describe("sendTourInvitation — composition", () => {
    it("sends over every reachable channel and reports what was sent", async () => {
        const res = await sendTourInvitation({ supabase: fakeSupabase(), ...baseArgs });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.invitationId).toBe(INVITATION);
        expect(res.sentChannels).toEqual(["email", "sms"]);
        expect(res.optionCount).toBe(2);
    });

    it("resolves the recipient server-side — never from the caller", async () => {
        await sendTourInvitation({ supabase: fakeSupabase(), ...baseArgs });
        expect(recipientMock).toHaveBeenCalledTimes(1);
        // The service passes no booking (none exists) and lets the opportunity party decide.
        const call = recipientMock.mock.calls[0][0] as Record<string, unknown>;
        expect(call.opportunity).toBeTruthy();
        expect((call.booking as Record<string, unknown>).primary_person_id).toBeNull();
    });

    it("mints one invitation under the caller's idempotency key", async () => {
        await sendTourInvitation({ supabase: fakeSupabase(), ...baseArgs });
        const mintArgs = mintMock.mock.calls[0][0] as Record<string, unknown>;
        expect(mintArgs.idempotencyKey).toBe(`send_tour_invitation:${ORG}:${OPP}`);
        expect(mintArgs.recipientPersonId).toBe(PERSON);
        expect(mintArgs.opportunityId).toBe(OPP);
        expect(mintArgs.locationId).toBe(LOC);
    });

    it("option ids are derived from the slot, so the same offer fingerprints identically", async () => {
        const a = tourOptionIdForSlot(slot());
        const b = tourOptionIdForSlot(slot());
        expect(a).toBe(b);
        expect(a).toBe(`rule-1:2026-08-10T16:00:00.000Z`);
    });

    it("surfaces an idempotent replay rather than claiming a new invitation", async () => {
        mintMock.mockResolvedValue({ ...mintOk, idempotentReplay: true });
        const res = await sendTourInvitation({ supabase: fakeSupabase(), ...baseArgs });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.idempotentReplay).toBe(true);
        expect(supersedeMock).not.toHaveBeenCalled();
    });

    it("reissues with fresh tokens when a prior invitation replays without credentials", async () => {
        const reissued: MintInvitationResult = {
            ...mintOk,
            invitationId: "66666666-0000-4000-8000-0000000000aa",
            idempotentReplay: false,
        };
        mintMock
            .mockResolvedValueOnce({
                ok: true,
                invitationId: INVITATION,
                status: "active",
                idempotentReplay: true,
                actions: [],
            })
            .mockResolvedValueOnce(reissued);

        const res = await sendTourInvitation({
            supabase: fakeSupabase(),
            ...baseArgs,
            mode: "prepare",
        });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(supersedeMock).toHaveBeenCalledWith(
            expect.objectContaining({ invitationId: INVITATION, orgId: ORG }),
        );
        expect(mintMock).toHaveBeenCalledTimes(2);
        const reissueKey = (mintMock.mock.calls[1][0] as { idempotencyKey: string }).idempotencyKey;
        expect(reissueKey).toContain(":reissue:");
        expect(res.invitationId).toBe(reissued.invitationId);
        expect(res.draft?.invitationActionUrl).toContain("TOKEN_VIEW");
        expect(res.idempotentReplay).toBe(false);
    });

    it("gives every option its own secure link and offers a decline link", async () => {
        await sendTourInvitation({ supabase: fakeSupabase(), ...baseArgs });
        const ctx = (commsMock.mock.calls[0][0] as Record<string, unknown>).context as Record<string, string>;
        expect(ctx.tourOptionsBlock).toContain("TOKEN_SELECT");
        expect(ctx.tourOptionsBlock).toContain("option=rule-1%3A2026-08-10T16%3A00%3A00.000Z");
        expect(ctx.invitationActionUrl).toContain("TOKEN_VIEW");
        expect(ctx.declineUrl).toContain("TOKEN_DECLINE");
        // Two offered times → two lines.
        expect(ctx.tourOptionsBlock.split("\n")).toHaveLength(2);
    });

    it("keys dispatch dedupe on the offered times", async () => {
        await sendTourInvitation({ supabase: fakeSupabase(), ...baseArgs });
        const token = (commsMock.mock.calls[0][0] as Record<string, string>).generationToken;
        expect(token).toContain(INVITATION);
        expect(token).toContain("rule-1:2026-08-10T16:00:00.000Z");
    });

    it("records the activation event without any credential material", async () => {
        await sendTourInvitation({ supabase: fakeSupabase(), ...baseArgs });
        const [, evt] = eventMock.mock.calls[0] as [unknown, Record<string, unknown>];
        expect(evt.event).toBe("tour_invitation_activated");
        expect(evt.invitationId).toBe(INVITATION);
        const detail = JSON.stringify(evt.detail);
        expect(detail).not.toContain("TOKEN_SELECT");
        expect(detail).not.toContain("TOKEN_VIEW");
    });
});

describe("sendTourInvitation — failures read in operator language", () => {
    it("no center on the record", async () => {
        const res = await sendTourInvitation({
            supabase: fakeSupabase({
                opportunity: { id: OPP, name: "Rowan", primary_person_id: PERSON, location_id: null },
            }),
            ...baseArgs,
        });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("missing_location");
        expect(res.message).toContain("center");
        expect(mintMock).not.toHaveBeenCalled();
    });

    it("no reachable parent contact", async () => {
        recipientMock.mockResolvedValue({ ...recipient, email: null, smsTo: null });
        const res = await sendTourInvitation({ supabase: fakeSupabase(), ...baseArgs });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("missing_recipient");
        expect(mintMock).not.toHaveBeenCalled();
    });

    it("no tour availability at the center", async () => {
        slotsMock.mockResolvedValue([]);
        const res = await sendTourInvitation({ supabase: fakeSupabase(), ...baseArgs });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("no_available_times");
        expect(res.message).toContain("availability");
        expect(mintMock).not.toHaveBeenCalled();
    });

    it("the record is gone", async () => {
        const res = await sendTourInvitation({ supabase: fakeSupabase({ opportunity: null }), ...baseArgs });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("missing_opportunity");
    });

    it("resolves a child process_instance entity id to the family opportunity", async () => {
        const PROCESS = "93722453-33e9-4207-8774-8931ee2c855d";
        const calls: string[] = [];
        const supabase = {
            from(table: string) {
                calls.push(table);
                if (table === "process_instances") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({
                                        data: {
                                            id: PROCESS,
                                            context_type: "opportunity",
                                            context_id: OPP,
                                        },
                                        error: null,
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "opportunities") {
                    let idFilter = "";
                    const chain: Record<string, unknown> = {
                        select: () => chain,
                        eq: (k: string, v: unknown) => {
                            if (k === "id") idFilter = String(v);
                            return chain;
                        },
                        maybeSingle: async () => {
                            if (idFilter === PROCESS) return { data: null, error: null };
                            if (idFilter === OPP) {
                                return {
                                    data: {
                                        id: OPP,
                                        name: "Rowan Reyes",
                                        primary_person_id: PERSON,
                                        location_id: LOC,
                                    },
                                    error: null,
                                };
                            }
                            return { data: null, error: null };
                        },
                    };
                    return chain;
                }
                const row =
                    table === "locations"
                        ? { id: LOC, label: "Northwind — Downtown", address1: "1 Main St", city: "Springfield", state: "CA", postal_code: "90001" }
                        : table === "orgs"
                          ? { name: "Northwind Early Learning" }
                          : { metadata: {} };
                const chain: Record<string, unknown> = {
                    select: () => chain,
                    eq: () => chain,
                    maybeSingle: async () => ({ data: row, error: null }),
                };
                return chain;
            },
        } as never;

        const res = await sendTourInvitation({
            supabase,
            ...baseArgs,
            opportunityId: PROCESS,
            mode: "prepare",
        });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(calls).toContain("process_instances");
        expect(mintMock.mock.calls[0][0]).toEqual(
            expect.objectContaining({ opportunityId: OPP }),
        );
    });

    it("invitation created but nothing could be delivered", async () => {
        commsMock.mockResolvedValue({
            ok: true,
            disabled: false,
            skippedReasons: ["missing_sms"],
            immediate: [{ channel: "email", eventKey: "tour_invitation", status: "skipped", reason: "empty_body" }],
            reminders: { action: "none" },
        });
        const res = await sendTourInvitation({ supabase: fakeSupabase(), ...baseArgs });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        // Reported as a delivery failure, not as a success — the invitation does exist.
        expect(res.code).toBe("nothing_sent");
    });

    it("a mint failure sends nothing", async () => {
        mintMock.mockResolvedValue({ ok: false, code: "idempotency_payload_changed", message: "changed" });
        const res = await sendTourInvitation({ supabase: fakeSupabase(), ...baseArgs });
        expect(res.ok).toBe(false);
        expect(commsMock).not.toHaveBeenCalled();
    });
});

describe("send_tour_invitation is a registered platform capability", () => {
    it("is registered, not a bespoke endpoint", () => {
        expect(hasRegisteredHandler("send_tour_invitation")).toBe(true);
        expect(getRegisteredAction("send_tour_invitation")).toBe(sendTourInvitationAction);
    });

    it("refuses a caller-supplied recipient", () => {
        const v = sendTourInvitationAction.validatePayload?.({
            message_text: " come visit ",
            recipient_person_id: "attacker-controlled",
            to: "attacker@example.invalid",
        });
        expect(v?.ok).toBe(true);
        const value = (v as { ok: true; value: Record<string, unknown> }).value;
        expect(value.recipient_person_id).toBeUndefined();
        expect(value.to).toBeUndefined();
        expect(value.message_text).toBe("come visit");
    });

    it("requires confirmation and targets an opportunity", () => {
        expect(sendTourInvitationAction.confirmationPolicy).toBe("required");
        expect(sendTourInvitationAction.supportedEntityTypes).toContain("opportunity");
        expect(sendTourInvitationAction.audit.mutates).toBe(true);
    });
});
