import { describe, it, expect, vi } from "vitest";
import { applyOutboundProviderDeliveryPatch } from "@/lib/communications/providerDeliveryPersistence";

function mockSupabaseForOutboundRow(mockRow: Record<string, unknown> | null, updateError: { message: string } | null = null) {
    const updatePayloads: Record<string, unknown>[] = [];
    const builder = {
        select: vi.fn(() => ({
            eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: mockRow, error: null })),
            })),
        })),
        update: vi.fn((payload: Record<string, unknown>) => {
            updatePayloads.push(payload);
            return {
                eq: vi.fn(() => Promise.resolve({ error: updateError })),
            };
        }),
    };
    return {
        from: vi.fn(() => builder),
        updatePayloads,
    };
}

describe("applyOutboundProviderDeliveryPatch", () => {
    it("sets delivered_at and status for email.delivered-style patch", async () => {
        const mockRow = {
            id: "msg-1",
            org_id: "org-1",
            direction: "outbound",
            metadata: {},
            status: "sent",
            delivered_at: null,
        };
        const { from, updatePayloads } = mockSupabaseForOutboundRow(mockRow);
        const supabase = { from } as unknown as import("@supabase/supabase-js").SupabaseClient;

        const deliveredAt = "2026-05-08T12:00:00.000Z";
        const r = await applyOutboundProviderDeliveryPatch({
            supabase,
            providerMessageId: "resend-email-id-uuid",
            patch: {
                status: "delivered",
                delivered_at: deliveredAt,
                metadata_event: { source: "resend", type: "email.delivered" },
            },
        });

        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.message_id).toBe("msg-1");
            expect(r.updated).toContain("metadata");
            expect(r.updated).toContain("status");
            expect(r.updated).toContain("delivered_at");
        }
        expect(updatePayloads).toHaveLength(1);
        expect(updatePayloads[0]).toMatchObject({
            status: "delivered",
            delivered_at: deliveredAt,
        });
        expect(updatePayloads[0]?.metadata).toMatchObject({
            provider_webhook_events: expect.any(Array),
        });
    });

    it("sets status bounced for bounce/complaint patch", async () => {
        const mockRow = {
            id: "msg-2",
            org_id: "org-1",
            direction: "outbound",
            metadata: {},
            status: "sent",
            delivered_at: null,
        };
        const { from, updatePayloads } = mockSupabaseForOutboundRow(mockRow);
        const supabase = { from } as unknown as import("@supabase/supabase-js").SupabaseClient;

        const r = await applyOutboundProviderDeliveryPatch({
            supabase,
            providerMessageId: "bounce-id",
            patch: {
                status: "bounced",
                metadata_event: { source: "resend", type: "email.bounced" },
            },
        });

        expect(r.ok).toBe(true);
        expect(updatePayloads[0]).toMatchObject({ status: "bounced" });
        expect(updatePayloads[0]).not.toHaveProperty("delivered_at");
    });

    it("sets status failed for failure patch", async () => {
        const mockRow = {
            id: "msg-3",
            org_id: "org-1",
            direction: "outbound",
            metadata: {},
            status: "sent",
            delivered_at: null,
        };
        const { from, updatePayloads } = mockSupabaseForOutboundRow(mockRow);
        const supabase = { from } as unknown as import("@supabase/supabase-js").SupabaseClient;

        const r = await applyOutboundProviderDeliveryPatch({
            supabase,
            providerMessageId: "fail-id",
            patch: {
                status: "failed",
                metadata_event: { source: "resend", type: "email.failed" },
            },
        });

        expect(r.ok).toBe(true);
        expect(updatePayloads[0]).toMatchObject({ status: "failed" });
    });
});
