import { describe, it, expect, vi } from "vitest";
import { applyOutboundProviderDeliveryPatch } from "@/lib/communications/providerDeliveryPersistence";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * P2 — receipt persistence through the shared helper:
 * append-only delivery event (idempotent) + per-recipient state upsert, with the message patch preserved.
 */
type EventRow = Record<string, unknown>;

function makeSupabase(opts: {
    messageRow: Record<string, unknown> | null;
    existingEvent?: EventRow | null;
}) {
    const inserts: EventRow[] = [];
    const recipientUpdates: EventRow[] = [];
    const messageUpdates: EventRow[] = [];

    const from = vi.fn((table: string) => {
        if (table === "communication_messages") {
            return {
                select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.messageRow, error: null }) }) }),
                update: (payload: EventRow) => {
                    messageUpdates.push(payload);
                    return { eq: async () => ({ error: null }) };
                },
            };
        }
        if (table === "communication_delivery_events") {
            return {
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            limit: () => ({
                                maybeSingle: async () => ({ data: opts.existingEvent ?? null, error: null }),
                            }),
                        }),
                    }),
                }),
                insert: async (payload: EventRow) => {
                    inserts.push(payload);
                    return { error: null };
                },
            };
        }
        if (table === "communication_message_recipients") {
            return {
                update: (payload: EventRow) => {
                    recipientUpdates.push(payload);
                    return { eq: async () => ({ error: null }) };
                },
            };
        }
        throw new Error("unexpected table " + table);
    });

    return { client: { from } as unknown as SupabaseClient, inserts, recipientUpdates, messageUpdates };
}

const outboundRow = {
    id: "msg-1",
    org_id: "org-1",
    direction: "outbound",
    metadata: {},
    status: "sent",
    delivered_at: null,
    opened_at: null,
    clicked_at: null,
    replied_at: null,
};

describe("applyOutboundProviderDeliveryPatch — receipt persistence", () => {
    it("records a delivery event and upserts recipient state for a delivered receipt", async () => {
        const sb = makeSupabase({ messageRow: { ...outboundRow } });
        const r = await applyOutboundProviderDeliveryPatch({
            supabase: sb.client,
            providerMessageId: "SM-abc",
            patch: {
                status: "delivered",
                delivered_at: "2026-06-13T10:00:00.000Z",
                metadata_event: { source: "twilio", status: "delivered" },
                receipt: {
                    provider: "twilio",
                    channel: "sms",
                    event_type: "delivered",
                    event_status: "delivered",
                    occurred_at: "2026-06-13T10:00:00.000Z",
                },
            },
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.event_recorded).toBe(true);
            expect(r.event_idempotent).toBe(false);
            expect(r.recipient_updated).toBe(true);
        }
        expect(sb.inserts).toHaveLength(1);
        expect(sb.inserts[0]).toMatchObject({
            org_id: "org-1",
            message_id: "msg-1",
            event_type: "delivered",
            provider: "twilio",
            channel: "sms",
            provider_message_id: "SM-abc",
            provider_event_id: "twilio:SM-abc:delivered",
        });
        expect(sb.recipientUpdates[0]).toMatchObject({
            status: "delivered",
            delivered_at: "2026-06-13T10:00:00.000Z",
            provider: "twilio",
            provider_message_id: "SM-abc",
        });
        expect(sb.messageUpdates[0]).toMatchObject({ status: "delivered" });
    });

    it("is idempotent: a duplicate provider event id records no second event", async () => {
        const sb = makeSupabase({ messageRow: { ...outboundRow }, existingEvent: { id: "evt-existing" } });
        const r = await applyOutboundProviderDeliveryPatch({
            supabase: sb.client,
            providerMessageId: "SM-abc",
            patch: {
                metadata_event: { source: "twilio", status: "delivered" },
                receipt: { provider: "twilio", channel: "sms", event_type: "delivered" },
            },
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.event_idempotent).toBe(true);
            expect(r.event_recorded).toBe(false);
        }
        expect(sb.inserts).toHaveLength(0);
        // recipient state is still reconciled (safe re-apply of same transition)
        expect(sb.recipientUpdates).toHaveLength(1);
    });

    it("stamps message opened_at on an open event and records the event", async () => {
        const sb = makeSupabase({ messageRow: { ...outboundRow } });
        const r = await applyOutboundProviderDeliveryPatch({
            supabase: sb.client,
            providerMessageId: "re-1",
            patch: {
                opened_at: "2026-06-13T11:00:00.000Z",
                metadata_event: { source: "resend", type: "email.opened" },
                receipt: {
                    provider: "resend",
                    channel: "email",
                    event_type: "opened",
                    provider_event_id: "evt_open_1",
                    // canonical: recipient timestamps use the provider event time, not local processing time
                    occurred_at: "2026-06-13T11:00:00.000Z",
                },
            },
        });
        expect(r.ok).toBe(true);
        expect(sb.messageUpdates[0]).toMatchObject({ opened_at: "2026-06-13T11:00:00.000Z" });
        expect(sb.inserts[0]).toMatchObject({ provider_event_id: "evt_open_1", event_type: "opened" });
        expect(sb.recipientUpdates[0]).toMatchObject({ status: "opened", opened_at: "2026-06-13T11:00:00.000Z" });
    });

    it("does NOT overwrite an already-set message receipt timestamp", async () => {
        const sb = makeSupabase({ messageRow: { ...outboundRow, opened_at: "2026-06-01T00:00:00.000Z" } });
        await applyOutboundProviderDeliveryPatch({
            supabase: sb.client,
            providerMessageId: "re-1",
            patch: {
                opened_at: "2026-06-13T11:00:00.000Z",
                receipt: { provider: "resend", channel: "email", event_type: "opened", provider_event_id: "evt_open_2" },
            },
        });
        expect(sb.messageUpdates[0]).not.toHaveProperty("opened_at");
    });

    it("safe on unknown provider_message_id: no event, no recipient write, ignorable reason", async () => {
        const sb = makeSupabase({ messageRow: null });
        const r = await applyOutboundProviderDeliveryPatch({
            supabase: sb.client,
            providerMessageId: "unknown-sid",
            patch: { status: "delivered", receipt: { provider: "twilio", channel: "sms", event_type: "delivered" } },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe("message_not_found_or_not_outbound");
        expect(sb.inserts).toHaveLength(0);
        expect(sb.recipientUpdates).toHaveLength(0);
    });

    it("legacy path (no receipt) behaves exactly as before — no event/recipient writes", async () => {
        const sb = makeSupabase({ messageRow: { ...outboundRow } });
        const r = await applyOutboundProviderDeliveryPatch({
            supabase: sb.client,
            providerMessageId: "re-1",
            patch: { status: "delivered", delivered_at: "2026-06-13T10:00:00.000Z", metadata_event: { source: "resend" } },
        });
        expect(r.ok).toBe(true);
        expect(sb.inserts).toHaveLength(0);
        expect(sb.recipientUpdates).toHaveLength(0);
        expect(sb.messageUpdates[0]).toMatchObject({ status: "delivered", delivered_at: "2026-06-13T10:00:00.000Z" });
    });
});
