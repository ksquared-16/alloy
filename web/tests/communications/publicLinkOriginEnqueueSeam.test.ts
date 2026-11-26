/**
 * The public-link origin guard, proven AT THE SEAM rather than in isolation.
 *
 * The pure function is covered in `publicLinkOriginAuthority.test.ts`. That proves the
 * function; it does not prove the wiring. These tests drive the real
 * `enqueueCanonicalOutboundMessage` and read the row that would actually be handed to the
 * dispatch poller — which is the only thing a recipient's link is ever built from.
 *
 * They are also the LOCAL POSITIVE CONTROL for the promotion: a sanctioned local /
 * certification send must keep its local origin and must NOT be forcibly re-anchored onto
 * staging. A fix that quietly rewrote localhost everywhere would break local development
 * while looking, in a hosted test, exactly like a correct fix.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const PERSON = "11111111-0000-4000-8000-000000000001";
const THREAD = "77777777-0000-4000-8000-000000000001";

/** Rows handed to communication_messages.insert(), captured per test. */
let messageInserts: Array<Record<string, unknown>> = [];

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
                limit: async () => ({ data: [], error: null }),
                maybeSingle: async () => {
                    if (table === "communication_preferences") return { data: null, error: null };
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

const TOUR_LINK_LOCAL = "http://localhost:3013/a/AbCdEf12";

function enqueue(over: Record<string, unknown> = {}) {
    return enqueueCanonicalOutboundMessage({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: fakeSupabase() as any,
        orgId: ORG,
        primaryEntityType: "persons",
        primaryEntityId: PERSON,
        channelRaw: "email",
        toRaw: "parent@example.invalid",
        bodyRaw: `Choose a tour time: ${TOUR_LINK_LOCAL}`,
        metadata: {},
        recipientPersonId: PERSON,
        category: "operational",
        emitMessageQueued: false,
        ...over,
    });
}

/** The row the dispatch poller can actually pick up. */
function queuedRow(): Record<string, unknown> {
    const queued = messageInserts.filter((r) => r.status === "queued");
    expect(queued).toHaveLength(1);
    return queued[0]!;
}

describe("public link origin at the canonical enqueue seam", () => {
    beforeEach(() => {
        messageInserts = [];
        vi.clearAllMocks();
        vi.unstubAllEnvs();
    });

    it("LOCAL POSITIVE CONTROL: a local-stack send keeps its local origin", async () => {
        // Local database, local origin. Nothing about this send can reach a stranger, and
        // rewriting it onto staging would break every developer's tour link.
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54421");
        vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3013");
        vi.stubEnv("ALLOY_AGENT_ENV", "1");

        const res = await enqueue();
        expect(res.skippedReason).toBeUndefined();
        const row = queuedRow();
        expect(String(row.body)).toContain(TOUR_LINK_LOCAL);
        expect(String(row.body)).not.toContain("staging.workwithalloy.com");
    });

    it("LOCAL POSITIVE CONTROL: a certification send keeps the certification origin", async () => {
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54421");
        vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3911");

        const res = await enqueue({ bodyRaw: "Choose a tour time: http://localhost:3911/a/AbCdEf12" });
        expect(res.skippedReason).toBeUndefined();
        expect(String(queuedRow().body)).toContain("http://localhost:3911/a/AbCdEf12");
    });

    it("hosted staging re-anchors a link authored by another runtime", async () => {
        vi.stubEnv("VERCEL_ENV", "preview");
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ikaxilmwmrmbagoidedu.supabase.co");
        vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://staging.workwithalloy.com");

        const res = await enqueue();
        expect(res.skippedReason).toBeUndefined();
        const body = String(queuedRow().body);
        expect(body).toContain("https://staging.workwithalloy.com/a/AbCdEf12");
        expect(body).not.toContain("localhost");
        expect(body).not.toContain("127.0.0.1");
        expect(body).not.toMatch(/:301\d/);
    });

    it("production re-anchors onto the production origin", async () => {
        vi.stubEnv("VERCEL_ENV", "production");
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://vslwnntzzgpnmrpjipat.supabase.co");
        vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://workwithalloy.com");

        await enqueue();
        expect(String(queuedRow().body)).toContain("https://workwithalloy.com/a/AbCdEf12");
    });

    it("a slot writing into the DEPLOYED database creates NO sendable row", async () => {
        // The observed defect. The slot's dev server enqueues, a hosted worker sends. There
        // is no deliverable origin available here, so the seam refuses — and the refusal is
        // a workflow_event, never a communication_messages row, because the poller selects
        // from that table.
        vi.stubEnv("ALLOY_AGENT_ENV", "1");
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ikaxilmwmrmbagoidedu.supabase.co");
        vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3014");

        const res = await enqueue();
        expect(res.communicationMessageId).toBeNull();
        expect(res.skippedReason).toBe("link_origin_blocked:loopback_in_hosted_runtime");
        expect(messageInserts).toHaveLength(0);
        expect(emitEventMock).toHaveBeenCalledWith(
            expect.objectContaining({ event_type: "message_link_origin_blocked" }),
        );
    });

    it("a hosted runtime with no configured origin creates NO sendable row", async () => {
        vi.stubEnv("VERCEL_ENV", "preview");
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ikaxilmwmrmbagoidedu.supabase.co");

        const res = await enqueue({ bodyRaw: "No links in this one." });
        expect(res.communicationMessageId).toBeNull();
        expect(res.skippedReason).toBe("link_origin_blocked:missing");
        expect(messageInserts).toHaveLength(0);
    });

    it("a slot on the deployed database can still send a message carrying no links", async () => {
        vi.stubEnv("ALLOY_AGENT_ENV", "1");
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ikaxilmwmrmbagoidedu.supabase.co");
        vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3014");

        const res = await enqueue({ bodyRaw: "Thanks — we have your paperwork." });
        expect(res.skippedReason).toBeUndefined();
        expect(String(queuedRow().body)).toContain("Thanks");
    });
});
