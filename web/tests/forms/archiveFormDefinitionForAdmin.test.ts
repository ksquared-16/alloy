import { describe, expect, it, vi } from "vitest";
import { archiveFormDefinitionForAdmin } from "@/lib/admin/forms/archiveFormDefinitionForAdmin";

const ORG = "11111111-1111-4111-8111-111111111111";
const FORM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/**
 * `activePackets` is the list of packet ids that are currently ACTIVE, and `packetRefs` is how many
 * items of THOSE packets reference the form — which is the question the guard now asks. A form
 * referenced only by retired packets therefore reaches the mock with no active ids at all.
 */
function mockSupabase(handlers: {
    form?: { id: string; name: string; is_active: boolean; metadata?: Record<string, unknown> } | null;
    activePackets?: string[];
    packetRefs?: number;
    linkCount?: number;
}) {
    const updates: string[] = [];
    const supabase = {
        from(table: string) {
            const chain: Record<string, unknown> = {};
            chain.select = vi.fn((_cols?: string, opts?: { count?: string; head?: boolean }) => {
                if (table === "form_definitions" && !opts?.head) {
                    return { ...chain, maybeSingle: async () => ({ data: handlers.form ?? null, error: null }) };
                }
                if (table === "form_packet_items" && opts?.head) {
                    return chain;
                }
                if (table === "form_definitions" && opts?.head) {
                    return chain;
                }
                if (table === "form_public_links") {
                    return chain;
                }
                return chain;
            });
            chain.eq = vi.fn((col: string) => {
                // The active-packet lookup resolves on its final `.eq("is_active", true)`.
                if (table === "form_packet_definitions" && col === "is_active") {
                    return Promise.resolve({
                        data: (handlers.activePackets ?? []).map((id) => ({ id })),
                        error: null,
                    });
                }
                return chain;
            });
            // Items are counted only WITHIN the active packets, so the count resolves on `.in`.
            chain.in = vi.fn(() => Promise.resolve({ count: handlers.packetRefs ?? 0, error: null }));
            chain.update = vi.fn(() => {
                updates.push(table);
                if (table === "form_definitions") {
                    return {
                        eq: () => ({
                            eq: () => Promise.resolve({ error: null }),
                        }),
                    };
                }
                return {
                    eq: () => ({
                        eq: () => ({
                            select: async () => ({
                                data: Array.from({ length: handlers.linkCount ?? 1 }).map((_, i) => ({ id: `link-${i}` })),
                                error: null,
                            }),
                        }),
                    }),
                };
            });
            chain.maybeSingle = async () => ({ data: handlers.form ?? null, error: null });
            return chain;
        },
    };
    return { supabase: supabase as never, updates };
}

describe("archiveFormDefinitionForAdmin", () => {
    it("returns 404 when form missing", async () => {
        const { supabase } = mockSupabase({ form: null });
        const result = await archiveFormDefinitionForAdmin(supabase, ORG, FORM);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.status).toBe(404);
    });

    it("blocks archive when form is in an ACTIVE packet", async () => {
        const { supabase } = mockSupabase({
            form: { id: FORM, name: "Inquiry", is_active: true },
            activePackets: ["packet-live"],
            packetRefs: 1,
        });
        const result = await archiveFormDefinitionForAdmin(supabase, ORG, FORM);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(409);
            expect(result.message).toMatch(/packet/i);
        }
    });

    it("ALLOWS archive when the only packets referencing it are retired", async () => {
        /*
         * The guard used to count every packet item ever created. A certification fixture Form could
         * then never be tidied away without first dismantling the retired fixture packet that
         * referenced it — the cascade-delete this codebase avoids everywhere else.
         *
         * No active packet uses this form, so archiving it cannot break a packet families are being
         * sent, which is the only thing the guard was ever protecting. The retired packet keeps its
         * items, its sessions and its history.
         */
        const { supabase } = mockSupabase({
            form: { id: FORM, name: "Cert fixture", is_active: true, metadata: {} },
            activePackets: [],
            packetRefs: 0,
            linkCount: 0,
        });
        const result = await archiveFormDefinitionForAdmin(supabase, ORG, FORM);
        expect(result.ok).toBe(true);
    });

    it("archives form and deactivates public links", async () => {
        const { supabase, updates } = mockSupabase({
            form: { id: FORM, name: "Inquiry", is_active: true, metadata: {} },
            activePackets: ["packet-live"],
            packetRefs: 0,
            linkCount: 2,
        });
        const result = await archiveFormDefinitionForAdmin(supabase, ORG, FORM);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.archived.form_id).toBe(FORM);
            expect(result.archived.public_links_deactivated).toBe(2);
        }
        expect(updates).toContain("form_definitions");
        expect(updates).toContain("form_public_links");
    });
});
