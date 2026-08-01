/**
 * Phase 1 Slice 1 — the canonical send command.
 *
 * Behavioural throughout: every case drives the real `canonicalSend` with the
 * enqueue mocked at the module boundary, so what is proven is the command's own
 * pipeline — classification before resolution, resolution before render, and
 * no provider-bound row on any refusal path.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueueMock = vi.fn();
vi.mock("@/lib/communications/canonicalOutboundEnqueue", () => ({
    enqueueCanonicalOutboundMessage: (...args: unknown[]) => enqueueMock(...args),
}));

import {
    canonicalSend,
    filterMetadata,
    payloadFingerprint,
    type CanonicalSendRequest,
} from "@/lib/communications/send/canonicalSend";
import type { TypedRecipient } from "@/lib/communications/recipients/typedRecipient";

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const PERSON = "11111111-0000-4000-8000-00000000000a";
const USER = "22222222-0000-4000-8000-00000000000b";

const personRow = (over: Record<string, unknown> = {}) => ({
    id: PERSON,
    org_id: ORG,
    email: "dana@example.com",
    phone: "+15035550123",
    full_name: "Dana Reyes",
    ...over,
});

/** Fake supabase: persons / user_roles lookups + the idempotency probe. */
function supa(opts: { person?: Record<string, unknown> | null; priorMessage?: Record<string, unknown> | null } = {}) {
    return {
        from: (table: string) => {
            const b: Record<string, unknown> = {
                select: () => b,
                eq: () => b,
                limit: () => b,
                maybeSingle: async () => {
                    if (table === "communication_messages") return { data: opts.priorMessage ?? null, error: null };
                    if (table === "user_roles") return { data: { user_id: USER, org_id: ORG, role: "ops" }, error: null };
                    return { data: opts.person === undefined ? personRow() : opts.person, error: null };
                },
            };
            return b;
        },
    } as never;
}

const base = (over: Partial<CanonicalSendRequest> = {}): CanonicalSendRequest =>
    ({
        supabase: supa(),
        orgId: ORG,
        authorizingUserId: USER,
        sourceCapability: "communications.send",
        recipient: { kind: "person", personId: PERSON } as TypedRecipient,
        audience: "external",
        category: "operational",
        purpose: "operator_direct_message",
        channel: "email",
        primaryEntityType: "persons",
        primaryEntityId: PERSON,
        bodyRaw: "Hello there.",
        subjectRaw: "Hi",
        userAuthored: true,
        idempotencyKey: "key-1",
        ...over,
    }) as CanonicalSendRequest;

beforeEach(() => {
    enqueueMock.mockReset();
    enqueueMock.mockResolvedValue({ communicationMessageId: "msg-1", threadId: "thr-1" });
});

describe("happy paths", () => {
    it("queues a valid Person email", async () => {
        const r = await canonicalSend(base());
        expect(r.outcome).toBe("sent_to_queue");
        expect(r.messageId).toBe("msg-1");
        expect(enqueueMock).toHaveBeenCalledTimes(1);
    });

    it("queues a valid Person SMS", async () => {
        const r = await canonicalSend(base({ channel: "sms", subjectRaw: null }));
        expect(r.outcome).toBe("sent_to_queue");
        expect(enqueueMock.mock.calls[0][0].toRaw).toBe("+15035550123");
    });

    it("queues an allowlisted external operational recipient", async () => {
        const r = await canonicalSend(
            base({
                recipient: {
                    kind: "external_operational_recipient",
                    displayName: "Ace Plumbing",
                    channel: "sms",
                    address: "+15035550199",
                    recipientRole: "vendor",
                    reason: "Emergency repair.",
                } as TypedRecipient,
                channel: "sms",
                purpose: "vendor_coordination",
                subjectRaw: null,
            })
        );
        expect(r.outcome).toBe("sent_to_queue");
        const call = enqueueMock.mock.calls[0][0];
        expect(call.recipientPersonId).toBeNull();
        expect(call.metadata.recipient_role).toBe("vendor");
        expect(call.metadata.external_recipient_reason).toBe("Emergency repair.");
    });
});

describe("classification is mandatory and checked BEFORE anything else", () => {
    it.each([
        ["audience", { audience: undefined }],
        ["category", { category: undefined }],
        ["purpose", { purpose: undefined }],
    ])("rejects a missing %s and never enqueues", async (_label, over) => {
        const r = await canonicalSend(base(over as Partial<CanonicalSendRequest>));
        expect(r.outcome).toBe("invalid");
        expect(enqueueMock).not.toHaveBeenCalled();
    });

    it("never infers transactional", async () => {
        const r = await canonicalSend(base({ category: undefined }));
        expect(r.reason).toBe("missing_category");
    });

    it("rejects an unknown purpose (fails closed)", async () => {
        const r = await canonicalSend(base({ purpose: "whatever_i_want" }));
        expect(r.outcome).toBe("invalid");
        expect(r.reason).toBe("purpose_unknown");
        expect(enqueueMock).not.toHaveBeenCalled();
    });

    it("rejects marketing to an external operational recipient", async () => {
        const r = await canonicalSend(
            base({
                recipient: {
                    kind: "external_operational_recipient",
                    displayName: "Ace",
                    channel: "sms",
                    address: "+15035550199",
                    recipientRole: "vendor",
                    reason: "x",
                } as TypedRecipient,
                channel: "sms",
                category: "marketing",
                purpose: "vendor_coordination",
            })
        );
        expect(r.outcome).toBe("invalid");
        expect(r.reason).toBe("marketing_prohibited");
        expect(enqueueMock).not.toHaveBeenCalled();
    });

    it("a route cannot override the registry", async () => {
        // form_delivery is transactional + platform-composed. Asking for
        // operator-authored marketing under it fails regardless of caller.
        const r = await canonicalSend(base({ purpose: "form_delivery", category: "marketing" }));
        expect(r.outcome).toBe("invalid");
        expect(enqueueMock).not.toHaveBeenCalled();
    });
});

describe("recipient resolution failures produce no provider-bound row", () => {
    it("blocks an unresolvable person", async () => {
        const r = await canonicalSend(base({ supabase: supa({ person: null }) }));
        expect(r.outcome).toBe("blocked");
        expect(enqueueMock).not.toHaveBeenCalled();
    });

    it("returns needs_selection when the channel is ambiguous", async () => {
        const r = await canonicalSend(base({ channel: undefined as never }));
        expect(r.outcome).toBe("needs_selection");
        expect(r.availableChannels).toEqual(["email", "sms"]);
        expect(enqueueMock).not.toHaveBeenCalled();
    });

    it("never falls back to an external operational recipient", async () => {
        const r = await canonicalSend(base({ supabase: supa({ person: null }) }));
        expect(r.outcome).toBe("blocked");
        expect(JSON.stringify(r)).not.toMatch(/external_operational/);
    });
});

describe("eligibility block creates no row", () => {
    it("reports blocked with the operator-safe reason", async () => {
        enqueueMock.mockResolvedValue({
            communicationMessageId: null,
            threadId: "thr-1",
            skippedReason: "recipient_opted_out",
            blockedMessage: "This person has opted out of operational texts.",
        });
        const r = await canonicalSend(base());
        expect(r.outcome).toBe("blocked");
        expect(r.reason).toBe("recipient_opted_out");
        expect(r.messageId).toBeUndefined();
    });
});

describe("idempotency", () => {
    it("an identical retry returns the existing message and does not enqueue twice", async () => {
        const req = base();
        const fingerprintRow = {
            id: "msg-existing",
            metadata: { idempotency_key: "key-1", idempotency_fingerprint: payloadFingerprint(req, "dana@example.com") },
        };
        const r = await canonicalSend(base({ supabase: supa({ priorMessage: fingerprintRow }) }));
        expect(r.outcome).toBe("duplicate");
        expect(r.messageId).toBe("msg-existing");
        expect(enqueueMock).not.toHaveBeenCalled();
    });

    it("the same key with changed content is REJECTED, not silently re-sent", async () => {
        const r = await canonicalSend(
            base({
                supabase: supa({
                    priorMessage: {
                        id: "msg-existing",
                        metadata: { idempotency_key: "key-1", idempotency_fingerprint: "a-different-payload" },
                    },
                }),
            })
        );
        expect(r.outcome).toBe("invalid");
        expect(r.reason).toBe("idempotency_payload_changed");
        expect(enqueueMock).not.toHaveBeenCalled();
    });

    it("writes the key and fingerprint so a later retry can find them", async () => {
        await canonicalSend(base());
        const meta = enqueueMock.mock.calls[0][0].metadata;
        expect(meta.idempotency_key).toBe("key-1");
        expect(meta.idempotency_fingerprint).toBeTruthy();
    });
});

describe("the command does not call a provider", () => {
    it("reaches only the enqueue", async () => {
        await canonicalSend(base());
        // The single outbound effect is the enqueue. Dispatch is Python's job.
        expect(enqueueMock).toHaveBeenCalledTimes(1);
    });

    it("returns an operator-safe message when the enqueue throws", async () => {
        enqueueMock.mockRejectedValue(new Error("select * from secret_table failed"));
        const r = await canonicalSend(base());
        expect(r.outcome).toBe("failed");
        expect(r.message).not.toMatch(/select|secret_table|Error/);
    });
});

describe("metadata is allowlisted", () => {
    it("drops keys a route tried to smuggle through", () => {
        const out = filterMetadata({ form_id: "f1", evil: "x", org_id: "spoof" } as Record<string, unknown>);
        expect(out).toEqual({ form_id: "f1" });
    });
});

