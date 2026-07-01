import { describe, expect, it, vi, beforeEach } from "vitest";

import {
    cancelCommunicationScheduledSend,
    processDueCommunicationScheduledSends,
    releaseStaleClaimedCommunicationScheduledSends,
    STALE_CLAIM_RELEASE_MINIMUM_AGE_MS,
    updateCommunicationScheduledSend,
    validateCommunicationScheduledSendCreateBody,
    validateCommunicationScheduledSendUpdateBody,
} from "@/lib/communications/communicationScheduledSendsService";
import { executeCommunicationsSend } from "@/lib/communications/executeCommunicationsSend";

vi.mock("@/lib/communications/executeCommunicationsSend", () => ({
    executeCommunicationsSend: vi.fn(),
}));

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const oppId = "33333333-3333-4333-8333-333333333333";
const personId = "44444444-4444-4444-8444-444444444444";
const sendId = "55555555-5555-4555-8555-555555555555";
const claimTok = "66666666-6666-4666-8666-666666666666";

function baseRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: sendId,
        org_id: orgId,
        created_by: userId,
        proposal_id: null,
        entity_type: "opportunities",
        entity_id: oppId,
        recipient_person_id: personId,
        channel: "sms",
        subject_snapshot: null,
        body_snapshot: "hi",
        communication_provider_binding_id: null,
        scheduled_for: "2026-12-01T12:00:00.000Z",
        status: "claimed",
        approved_at: "2026-05-01T12:00:00.000Z",
        approved_by: userId,
        communication_message_id: null,
        source: "task_assist",
        metadata: {},
        claimed_at: "2026-12-01T12:00:00.000Z",
        claim_token: claimTok,
        created_at: "2026-05-01T12:00:00.000Z",
        updated_at: "2026-05-01T12:00:00.000Z",
        ...overrides,
    };
}

describe("validateCommunicationScheduledSendCreateBody", () => {
    const baseBody = () => ({
        entity_type: "opportunities",
        entity_id: oppId,
        recipient_person_id: personId,
        channel: "sms" as const,
        body_snapshot: "Hello",
        scheduled_for: new Date(Date.now() + 3_600_000).toISOString(),
        source: "task_assist",
    });

    it("rejects scheduled_for in the past", () => {
        const past = new Date(Date.now() - 120_000).toISOString();
        const r = validateCommunicationScheduledSendCreateBody(
            { ...baseBody(), scheduled_for: past },
            { nowMs: Date.now() },
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("SCHEDULED_FOR_NOT_FUTURE");
    });

    it("requires subject for email", () => {
        const r = validateCommunicationScheduledSendCreateBody(
            {
                ...baseBody(),
                channel: "email",
                subject_snapshot: "",
                scheduled_for: new Date(Date.now() + 3_600_000).toISOString(),
            },
            { nowMs: Date.now() },
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("SUBJECT_REQUIRED");
    });
});

describe("validateCommunicationScheduledSendUpdateBody", () => {
    it("requires future scheduled_for", () => {
        const row = baseRow({ status: "pending" }) as ReturnType<typeof baseRow>;
        const r = validateCommunicationScheduledSendUpdateBody(
            {
                scheduled_for: new Date(Date.now() - 60_000).toISOString(),
                body_snapshot: "hi",
            },
            mapRowTyped(row),
            { nowMs: Date.now() }
        );
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("SCHEDULED_FOR_NOT_FUTURE");
    });
});

function mapRowTyped(data: Record<string, unknown>) {
    return {
        id: String(data.id),
        org_id: String(data.org_id),
        created_by: String(data.created_by),
        proposal_id: data.proposal_id != null ? String(data.proposal_id) : null,
        entity_type: String(data.entity_type),
        entity_id: String(data.entity_id),
        recipient_person_id: String(data.recipient_person_id),
        channel: data.channel === "email" ? ("email" as const) : ("sms" as const),
        subject_snapshot: data.subject_snapshot != null ? String(data.subject_snapshot) : null,
        body_snapshot: String(data.body_snapshot),
        communication_provider_binding_id:
            data.communication_provider_binding_id != null ? String(data.communication_provider_binding_id) : null,
        scheduled_for: String(data.scheduled_for),
        status: String(data.status),
        approved_at: String(data.approved_at),
        approved_by: String(data.approved_by),
        communication_message_id: data.communication_message_id != null ? String(data.communication_message_id) : null,
        source: String(data.source),
        metadata: (data.metadata as Record<string, unknown>) ?? {},
        claimed_at: data.claimed_at != null ? String(data.claimed_at) : null,
        claim_token: data.claim_token != null ? String(data.claim_token) : null,
        created_at: String(data.created_at),
        updated_at: String(data.updated_at),
    };
}

describe("updateCommunicationScheduledSend", () => {
    it("rejects edit when queued", async () => {
        const supabase = {
            from() {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({
                                    data: baseRow({ status: "queued", communication_message_id: personId }),
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            },
        } as never;

        const r = await updateCommunicationScheduledSend({
            supabase,
            orgId,
            id: sendId,
            input: {
                scheduled_for_iso: new Date(Date.now() + 3600_000).toISOString(),
                body_snapshot: "updated",
                subject_snapshot: null,
            },
            nowIso: new Date().toISOString(),
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("INVALID_STATUS");
    });
});

describe("cancelCommunicationScheduledSend", () => {
    it("rejects cancel when not pending", async () => {
        const supabase = {
            from() {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({
                                    data: baseRow({ status: "queued", communication_message_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            },
        } as never;

        const r = await cancelCommunicationScheduledSend({ supabase, orgId, id: sendId });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("INVALID_STATUS");
    });
});

describe("processDueCommunicationScheduledSends", () => {
    beforeEach(() => {
        vi.mocked(executeCommunicationsSend).mockReset();
    });

    it("calls executeCommunicationsSend once for a claimed row", async () => {
        const row = baseRow();
        vi.mocked(executeCommunicationsSend).mockResolvedValue({
            ok: true,
            communication_message_id: "msg-11111111-1111-4111-8111-111111111111",
            thread_id: null,
            channel: "sms",
            process_trigger_attempted_note: "queued",
        });

        const maybeSingleSelect = vi.fn().mockResolvedValue({ data: row, error: null });
        const maybeSingleUpdate = vi.fn().mockResolvedValue({
            data: { ...row, status: "queued", communication_message_id: "msg-11111111-1111-4111-8111-111111111111" },
            error: null,
        });

        const supabase = {
            rpc: vi.fn().mockResolvedValue({ data: [row], error: null }),
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        maybeSingle: maybeSingleSelect,
                    })),
                })),
                update: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                is: vi.fn(() => ({
                                    select: vi.fn(() => ({
                                        maybeSingle: maybeSingleUpdate,
                                    })),
                                })),
                            })),
                        })),
                    })),
                })),
            })),
        } as never;

        const res = await processDueCommunicationScheduledSends({
            supabase,
            limit: 5,
            now: new Date("2026-12-02T00:00:00.000Z"),
            orgIdFilter: null,
        });

        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.result.claimed).toBe(1);
            expect(res.result.succeeded).toBe(1);
            expect(res.result.failed).toBe(0);
        }
        expect(executeCommunicationsSend).toHaveBeenCalledOnce();
        expect(executeCommunicationsSend).toHaveBeenCalledWith(
            expect.objectContaining({
                textRaw: "hi",
                sendMetadataAugment: {
                    communication_scheduled_send_id: sendId,
                    task_assist_scheduled_send: true,
                },
            })
        );
    });

    it("passes tour scheduling metadata for tour_scheduling source rows", async () => {
        const row = baseRow({
            source: "tour_scheduling",
            channel: "email",
            subject_snapshot: "Reminder subject",
            body_snapshot: "Rendered reminder body from Batch 5",
            metadata: {
                tour_booking_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                reminder_key: "tour_reminder_24h",
                schedule_generation: 7,
                event_key: "tour_reminder",
                tour_start_at: "2026-06-16T12:00:00.000Z",
                location_id: "loc-1",
            },
        });
        vi.mocked(executeCommunicationsSend).mockResolvedValue({
            ok: true,
            communication_message_id: "msg-11111111-1111-4111-8111-111111111111",
            thread_id: null,
            channel: "email",
            process_trigger_attempted_note: "queued",
        });

        const maybeSingleSelect = vi.fn().mockResolvedValue({ data: row, error: null });
        const maybeSingleUpdate = vi.fn().mockResolvedValue({
            data: { ...row, status: "queued", communication_message_id: "msg-11111111-1111-4111-8111-111111111111" },
            error: null,
        });

        const supabase = {
            rpc: vi.fn().mockResolvedValue({ data: [row], error: null }),
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        maybeSingle: maybeSingleSelect,
                    })),
                })),
                update: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                is: vi.fn(() => ({
                                    select: vi.fn(() => ({
                                        maybeSingle: maybeSingleUpdate,
                                    })),
                                })),
                            })),
                        })),
                    })),
                })),
            })),
        } as never;

        const res = await processDueCommunicationScheduledSends({
            supabase,
            limit: 5,
            now: new Date("2026-12-02T00:00:00.000Z"),
            orgIdFilter: null,
        });

        expect(res.ok).toBe(true);
        expect(executeCommunicationsSend).toHaveBeenCalledWith(
            expect.objectContaining({
                textRaw: "Rendered reminder body from Batch 5",
                subjectRawEmail: "Reminder subject",
                sendMetadataAugment: expect.objectContaining({
                    communication_scheduled_send_id: sendId,
                    source: "tour_scheduling",
                    tour_booking_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                    reminder_key: "tour_reminder_24h",
                    schedule_generation: 7,
                    event_key: "tour_reminder",
                }),
            })
        );
        const augment = vi.mocked(executeCommunicationsSend).mock.calls[0]?.[0]?.sendMetadataAugment as Record<
            string,
            unknown
        >;
        expect(augment?.task_assist_scheduled_send).toBeUndefined();
    });

    it("skips enqueue when communication_message_id already set", async () => {
        const row = baseRow({ communication_message_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
        vi.mocked(executeCommunicationsSend).mockResolvedValue({
            ok: true,
            communication_message_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            thread_id: null,
            channel: "sms",
            process_trigger_attempted_note: "x",
        });

        const maybeSingleSelect = vi.fn().mockResolvedValue({ data: row, error: null });

        const supabase = {
            rpc: vi.fn().mockResolvedValue({ data: [baseRow()], error: null }),
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        maybeSingle: maybeSingleSelect,
                    })),
                })),
                update: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        eq: vi.fn(() => Promise.resolve({ error: null })),
                    })),
                })),
            })),
        } as never;

        const res = await processDueCommunicationScheduledSends({
            supabase,
            limit: 5,
            now: new Date("2026-12-02T00:00:00.000Z"),
            orgIdFilter: null,
        });

        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.result.skipped).toBe(1);
            expect(res.result.succeeded).toBe(0);
        }
        expect(executeCommunicationsSend).not.toHaveBeenCalled();
    });

    it("marks failed when executeCommunicationsSend fails", async () => {
        const row = baseRow();
        vi.mocked(executeCommunicationsSend).mockResolvedValue({
            ok: false,
            status: 422,
            error: "channel_unavailable",
            code: "channel_unavailable",
        });

        const maybeSingleSelect = vi.fn().mockResolvedValue({ data: row, error: null });

        const supabase = {
            rpc: vi.fn().mockResolvedValue({ data: [row], error: null }),
            from: vi.fn(() => ({
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        maybeSingle: maybeSingleSelect,
                    })),
                })),
                update: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                is: vi.fn(() => Promise.resolve({ error: null })),
                            })),
                        })),
                    })),
                })),
            })),
        } as never;

        const res = await processDueCommunicationScheduledSends({
            supabase,
            limit: 5,
            now: new Date("2026-12-02T00:00:00.000Z"),
            orgIdFilter: null,
        });

        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.result.failed).toBe(1);
            expect(res.result.succeeded).toBe(0);
        }
        expect(executeCommunicationsSend).toHaveBeenCalledOnce();
    });

    it("does nothing when RPC returns no rows", async () => {
        const fromSpy = vi.fn();
        const supabase = {
            rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
            from: fromSpy,
        } as never;

        const res = await processDueCommunicationScheduledSends({
            supabase,
            limit: 5,
            now: new Date("2026-12-02T00:00:00.000Z"),
            orgIdFilter: null,
        });

        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.result.claimed).toBe(0);
            expect(res.result.processed).toBe(0);
        }
        expect(executeCommunicationsSend).not.toHaveBeenCalled();
        expect(fromSpy).not.toHaveBeenCalled();
    });
});

describe("releaseStaleClaimedCommunicationScheduledSends", () => {
    it("rejects olderThan within minimum age window", async () => {
        const now = new Date("2026-12-02T12:00:00.000Z");
        const olderThan = new Date(now.getTime() - STALE_CLAIM_RELEASE_MINIMUM_AGE_MS + 60_000);
        const res = await releaseStaleClaimedCommunicationScheduledSends({
            supabase: {} as never,
            now,
            olderThan,
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.error).toBe("OLDER_THAN_TOO_RECENT");
    });

    it("selects stale ids and updates them to pending", async () => {
        const now = new Date("2026-12-02T12:00:00.000Z");
        const olderThan = new Date(now.getTime() - STALE_CLAIM_RELEASE_MINIMUM_AGE_MS - 60_000);

        const selChain: Record<string, ReturnType<typeof vi.fn>> = {
            eq: vi.fn(),
            is: vi.fn(),
            lt: vi.fn(),
            limit: vi.fn(),
        };
        selChain.eq.mockReturnValue(selChain);
        selChain.is.mockReturnValue(selChain);
        selChain.lt.mockReturnValue(selChain);
        selChain.limit.mockResolvedValue({ data: [{ id: sendId }], error: null });

        const updChain: Record<string, ReturnType<typeof vi.fn>> = {
            in: vi.fn(),
            eq: vi.fn(),
            is: vi.fn(),
            lt: vi.fn(),
            select: vi.fn(),
        };
        updChain.in.mockReturnValue(updChain);
        updChain.eq.mockReturnValue(updChain);
        updChain.is.mockReturnValue(updChain);
        updChain.lt.mockReturnValue(updChain);
        updChain.select.mockResolvedValue({ data: [{ id: sendId }], error: null });

        const supabase = {
            from: vi.fn(() => ({
                select: vi.fn(() => selChain),
                update: vi.fn(() => updChain),
            })),
        } as never;

        const res = await releaseStaleClaimedCommunicationScheduledSends({
            supabase,
            now,
            olderThan,
            limit: 10,
        });

        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.result.released).toBe(1);
            expect(res.result.ids).toEqual([sendId]);
        }
    });
});
