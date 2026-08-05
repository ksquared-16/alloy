/**
 * Phase 0 / P0-1 (2b) — eligibility enforced at the canonical enqueue choke point.
 *
 * `enqueueCanonicalOutboundMessage` is the only TypeScript path that inserts an
 * outbound communication_messages row.
 *
 * The safety property is NOT "a blocked send writes nothing" — that is what made
 * a refusal indistinguishable from silence. It is "a blocked send writes nothing
 * the dispatcher can pick up": the poller selects `status in.(queued,deferred)`,
 * so a `blocked` row is durable and unsendable at the same time. These tests
 * assert that property directly, and that a refusal is never reported to a
 * caller as a message going out.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const PERSON = "11111111-0000-4000-8000-000000000001";
const THREAD = "77777777-0000-4000-8000-000000000001";

/** Rows handed to communication_messages.insert(), captured per test. */
let messageInserts: Array<Record<string, unknown>> = [];
/** Preference row the fake DB will return. */
let preferenceState: string | null = null;
/** Whether the suppression probe reports a bounce/complaint. */
let suppressionHit = false;
/** Forces the communication_messages insert to fail, for the dangling-event case. */
let messageInsertFails = false;

const emitEventMock = vi.fn().mockResolvedValue("event-1");
vi.mock("@/lib/emitEvent", () => ({ emitEvent: (...args: unknown[]) => emitEventMock(...args) }));

function fakeSupabase() {
    return {
        from(table: string) {
            const builder: Record<string, unknown> = {
                select: () => builder,
                eq: () => builder,
                is: () => builder,
                in: () => builder,
                order: () => builder,
                limit: async () => ({ data: suppressionHit ? [{ id: "m1" }] : [], error: null }),
                maybeSingle: async () => {
                    if (table === "communication_preferences") {
                        return { data: preferenceState ? { state: preferenceState } : null, error: null };
                    }
                    if (table === "communication_threads") return { data: { id: THREAD }, error: null };
                    return { data: { id: "row" }, error: null };
                },
                upsert: () => builder,
                insert: (rows: unknown) => {
                    const failing = table === "communication_messages" && messageInsertFails;
                    if (table === "communication_messages") {
                        messageInserts.push(rows as Record<string, unknown>);
                    }
                    return {
                        select: () => ({
                            maybeSingle: async () =>
                                failing
                                    ? { data: null, error: { message: "insert exploded", code: "XX000" } }
                                    : { data: { id: "msg-1" }, error: null },
                        }),
                    };
                },
            };
            return builder;
        },
    };
}

import { enqueueCanonicalOutboundMessage } from "@/lib/communications/canonicalOutboundEnqueue";
import { resetCategoryFallbackReport, categoryFallbackReport } from "@/lib/communications/eligibility/types";

function enqueue(over: Record<string, unknown> = {}) {
    return enqueueCanonicalOutboundMessage({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: fakeSupabase() as any,
        orgId: ORG,
        primaryEntityType: "persons",
        primaryEntityId: PERSON,
        channelRaw: "email",
        toRaw: "parent@example.invalid",
        bodyRaw: "Hello",
        metadata: {},
        recipientPersonId: PERSON,
        category: "operational",
        emitMessageQueued: false,
        ...over,
    });
}

describe("enqueue gate — blocked sends create no SENDABLE row", () => {
    beforeEach(() => {
        messageInserts = [];
        preferenceState = null;
        suppressionHit = false;
        messageInsertFails = false;
        resetCategoryFallbackReport();
        vi.clearAllMocks();
    });

    /** Every refusal must land as exactly one terminal row the poller cannot reach. */
    function expectSingleBlockedRow(code: string) {
        expect(messageInserts).toHaveLength(1);
        const row = messageInserts[0];
        expect(row.status).toBe("blocked");
        expect(row.status).not.toBe("queued");
        expect(row.error).toBe(`policy:${code}`);
        const audit = row.eligibility_decision as Record<string, unknown>;
        expect(audit.outcome).toBe("blocked");
        expect(audit.reason).toBe(code);
        expect(audit.stage).toBe("enqueue");
        expect(audit.defer_until).toBeNull();
        expect(typeof audit.operator_message).toBe("string");
        return row;
    }

    it("blocks an opted-out operational send and records it as blocked", async () => {
        preferenceState = "opted_out";

        const res = await enqueue();

        expect(res.communicationMessageId).toBeNull();
        expect(res.skippedReason).toBe("eligibility_blocked:OPTED_OUT");
        expect(res.blockedCommunicationMessageId).toBe("msg-1");
        expectSingleBlockedRow("OPTED_OUT");
    });

    it("blocks when the recipient cannot be resolved — the old total bypass", async () => {
        const res = await enqueue({ recipientPersonId: null });

        expect(res.skippedReason).toBe("eligibility_blocked:RECIPIENT_UNRESOLVED");
        expectSingleBlockedRow("RECIPIENT_UNRESOLVED");
    });

    it("blocks a marketing send without opt-in", async () => {
        const res = await enqueue({ category: "marketing" });

        expect(res.skippedReason).toBe("eligibility_blocked:MARKETING_REQUIRES_OPT_IN");
        expectSingleBlockedRow("MARKETING_REQUIRES_OPT_IN");
    });

    it("blocks emergency without the permission", async () => {
        const res = await enqueue({ category: "emergency", emergencyPermitted: false });

        expect(res.skippedReason).toBe("eligibility_blocked:EMERGENCY_NOT_PERMITTED");
        expectSingleBlockedRow("EMERGENCY_NOT_PERMITTED");
    });

    it("blocks a suppressed address — the live Tour failure", async () => {
        suppressionHit = true;

        const res = await enqueue();

        expect(res.skippedReason).toBe("eligibility_blocked:SUPPRESSED");
        const row = expectSingleBlockedRow("SUPPRESSED");
        // The refusal is explainable: classification, recipient and the rendered
        // body an operator needs to judge it are all on the row.
        expect(row.category).toBe("operational");
        expect(row.to_address).toBe("parent@example.invalid");
        expect(row.body).toBe("Hello");
        expect((row.eligibility_snapshot as { decision: { allowed: boolean } }).decision.allowed).toBe(false);
    });

    it("blocks an internal-audience message on a provider channel", async () => {
        const res = await enqueue({ audience: "internal", channelRaw: "email" });

        expect(res.skippedReason).toBe("eligibility_blocked:INTERNAL_TO_PROVIDER");
        expectSingleBlockedRow("INTERNAL_TO_PROVIDER");
    });

    it("never reports a blocked message as one that is going out", async () => {
        preferenceState = "opted_out";

        const res = await enqueue();

        // Callers test `!res.communicationMessageId` to decide a send failed to
        // enqueue. Persisting the decision must not flip that judgement.
        expect(res.communicationMessageId).toBeNull();
        expect(res.blockedMessage).toBeTruthy();
    });
});

describe("enqueue gate — a refusal reaches the operator's activity feed", () => {
    beforeEach(() => {
        messageInserts = [];
        preferenceState = null;
        suppressionHit = false;
        messageInsertFails = false;
        resetCategoryFallbackReport();
        vi.clearAllMocks();
    });

    it("emits message_blocked against the caller's entity, not the org", async () => {
        preferenceState = "opted_out";

        await enqueue({ emitMessageQueued: true, primaryEntityType: "opportunities", primaryEntityId: THREAD });

        expect(emitEventMock).toHaveBeenCalledTimes(1);
        const arg = emitEventMock.mock.calls[0][0] as Record<string, unknown>;
        expect(arg.event_type).toBe("message_blocked");
        // loadOpportunityActivityEvents filters entity_type="opportunities" on the
        // opportunity id. Emitting against the org id — as the dispatcher does —
        // produces a durable event no operator surface can reach.
        expect(arg.entity_type).toBe("opportunities");
        expect(arg.entity_id).toBe(THREAD);

        const payload = arg.payload as Record<string, unknown>;
        expect(payload.communication_message_id).toBe("msg-1");
        expect(payload.channel).toBe("email");
        expect(payload.direction).toBe("outbound");
        expect(payload.reason).toBe("OPTED_OUT");
        expect(typeof payload.operator_message).toBe("string");
    });

    it("emits nothing when the durable row could not be written", async () => {
        preferenceState = "opted_out";
        messageInsertFails = true;

        const res = await enqueue({ emitMessageQueued: true });

        // An event pointing at a message row that does not exist is worse than
        // no event: it is a dangling reference on an operator surface.
        expect(res.blockedCommunicationMessageId).toBeNull();
        expect(emitEventMock).not.toHaveBeenCalled();
    });
});

describe("enqueue gate — permitted sends record their decision", () => {
    beforeEach(() => {
        messageInserts = [];
        preferenceState = null;
        suppressionHit = false;
        messageInsertFails = false;
        resetCategoryFallbackReport();
        vi.clearAllMocks();
    });

    it("persists classification and the eligibility snapshot", async () => {
        const res = await enqueue();

        expect(res.communicationMessageId).toBe("msg-1");
        expect(messageInserts).toHaveLength(1);

        const row = messageInserts[0];
        expect(row.audience).toBe("external");
        expect(row.category).toBe("operational");
        expect(row.status).toBe("queued");

        const snapshot = row.eligibility_snapshot as Record<string, unknown>;
        expect(snapshot.policyVersion).toBeTruthy();
        expect(snapshot.category).toBe("operational");
        expect((snapshot.decision as { allowed: boolean }).allowed).toBe(true);
        expect(snapshot.consentInputs).toEqual([{ category: "email_operational", state: "unset" }]);
    });

    it("permits a transactional send to an opted-out recipient", async () => {
        preferenceState = "opted_out";

        const res = await enqueue({ category: "transactional" });

        expect(res.communicationMessageId).toBe("msg-1");
        expect(messageInserts).toHaveLength(1);
    });

    it("permits an internal note on the in-app channel without consulting consent", async () => {
        preferenceState = "opted_out";

        const res = await enqueue({ audience: "internal", channelRaw: "in_app" });

        expect(res.communicationMessageId).toBe("msg-1");
        expect((messageInserts[0].eligibility_snapshot as { consentInputs: unknown[] }).consentInputs).toEqual([]);
    });
});

describe("enqueue gate — the category fallback is bounded and observable", () => {
    beforeEach(() => {
        messageInserts = [];
        preferenceState = null;
        suppressionHit = false;
        messageInsertFails = false;
        resetCategoryFallbackReport();
        vi.clearAllMocks();
    });

    it("records the call site when a caller omits the category", async () => {
        await enqueue({ category: undefined, callSite: "test:unclassified" });

        // Direction: a fallback must be narrowly bounded and OBSERVABLE. It is
        // never silent — the call site is counted so it can be migrated away.
        expect(categoryFallbackReport()).toMatchObject({ "test:unclassified": 1 });
        expect(messageInserts[0].category).toBe("operational");
    });

    it("does not fall back when the caller classifies explicitly", async () => {
        await enqueue({ category: "transactional" });
        expect(categoryFallbackReport()).toEqual({});
    });
});
