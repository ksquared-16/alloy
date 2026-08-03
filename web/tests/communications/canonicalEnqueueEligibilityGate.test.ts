/**
 * Phase 0 / P0-1 (2b) — eligibility enforced at the canonical enqueue choke point.
 *
 * `enqueueCanonicalOutboundMessage` is the only TypeScript path that inserts an
 * outbound communication_messages row. These tests prove that a blocked send
 * creates NO row — there is nothing for the worker to pick up — and that the
 * decision is recorded on rows that do get created.
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

vi.mock("@/lib/emitEvent", () => ({ emitEvent: vi.fn().mockResolvedValue(undefined) }));

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
                    if (table === "communication_messages") {
                        messageInserts.push(rows as Record<string, unknown>);
                    }
                    return {
                        select: () => ({ maybeSingle: async () => ({ data: { id: "msg-1" }, error: null }) }),
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

describe("enqueue gate — blocked sends create no row", () => {
    beforeEach(() => {
        messageInserts = [];
        preferenceState = null;
        suppressionHit = false;
        resetCategoryFallbackReport();
        vi.clearAllMocks();
    });

    it("blocks an opted-out operational send and inserts nothing", async () => {
        preferenceState = "opted_out";

        const res = await enqueue();

        expect(res.communicationMessageId).toBeNull();
        expect(res.skippedReason).toBe("eligibility_blocked:OPTED_OUT");
        expect(messageInserts).toHaveLength(0);
    });

    it("blocks when the recipient cannot be resolved — the old total bypass", async () => {
        const res = await enqueue({ recipientPersonId: null });

        expect(res.skippedReason).toBe("eligibility_blocked:RECIPIENT_UNRESOLVED");
        expect(messageInserts).toHaveLength(0);
    });

    it("blocks a marketing send without opt-in", async () => {
        const res = await enqueue({ category: "marketing" });

        expect(res.skippedReason).toBe("eligibility_blocked:MARKETING_REQUIRES_OPT_IN");
        expect(messageInserts).toHaveLength(0);
    });

    it("blocks emergency without the permission", async () => {
        const res = await enqueue({ category: "emergency", emergencyPermitted: false });

        expect(res.skippedReason).toBe("eligibility_blocked:EMERGENCY_NOT_PERMITTED");
        expect(messageInserts).toHaveLength(0);
    });

    it("blocks a suppressed address", async () => {
        suppressionHit = true;

        const res = await enqueue();

        expect(res.skippedReason).toBe("eligibility_blocked:SUPPRESSED");
        expect(messageInserts).toHaveLength(0);
    });

    it("blocks an internal-audience message on a provider channel", async () => {
        const res = await enqueue({ audience: "internal", channelRaw: "email" });

        expect(res.skippedReason).toBe("eligibility_blocked:INTERNAL_TO_PROVIDER");
        expect(messageInserts).toHaveLength(0);
    });
});

describe("enqueue gate — permitted sends record their decision", () => {
    beforeEach(() => {
        messageInserts = [];
        preferenceState = null;
        suppressionHit = false;
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
