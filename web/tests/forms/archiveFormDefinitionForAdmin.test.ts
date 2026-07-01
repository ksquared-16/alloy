import { describe, expect, it, vi } from "vitest";
import { archiveFormDefinitionForAdmin } from "@/lib/admin/forms/archiveFormDefinitionForAdmin";

const ORG = "11111111-1111-4111-8111-111111111111";
const FORM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function mockSupabase(handlers: {
    form?: { id: string; name: string; is_active: boolean; metadata?: Record<string, unknown> } | null;
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
                if (table === "form_public_links") {
                    return chain;
                }
                return chain;
            });
            chain.eq = vi.fn((col: string) => {
                if (table === "form_packet_items" && col === "form_definition_id") {
                    return Promise.resolve({ count: handlers.packetRefs ?? 0, error: null });
                }
                return chain;
            });
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

    it("blocks archive when form is in a packet", async () => {
        const { supabase } = mockSupabase({
            form: { id: FORM, name: "Inquiry", is_active: true },
            packetRefs: 1,
        });
        const result = await archiveFormDefinitionForAdmin(supabase, ORG, FORM);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(409);
            expect(result.message).toMatch(/packet/i);
        }
    });

    it("archives form and deactivates public links", async () => {
        const { supabase, updates } = mockSupabase({
            form: { id: FORM, name: "Inquiry", is_active: true, metadata: {} },
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
