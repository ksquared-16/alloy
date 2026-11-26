import { describe, expect, it, vi } from "vitest";
import { deleteFormDefinitionForAdmin } from "@/lib/admin/forms/deleteFormDefinitionForAdmin";

const ORG = "11111111-1111-4111-8111-111111111111";
const FORM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function thenableChain<T>(value: T) {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.delete = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => value);
    chain.then = (onFulfilled: (v: T) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve(value).then(onFulfilled, onRejected);
    return chain;
}

function mockSupabase(handlers: {
    form?: { id: string } | null;
    published?: number;
    submissions?: number;
    packetRefs?: number;
}) {
    let formDefCalls = 0;
    let versionCalls = 0;

    const supabase = {
        from(table: string) {
            if (table === "form_definitions") {
                formDefCalls += 1;
                if (formDefCalls === 1) {
                    return thenableChain({ data: handlers.form ?? null, error: null });
                }
                return thenableChain({ error: null });
            }
            if (table === "form_definition_versions") {
                versionCalls += 1;
                if (versionCalls === 1) {
                    return thenableChain({ count: handlers.published ?? 0, error: null });
                }
                return thenableChain({ error: null });
            }
            if (table === "form_submissions") {
                return thenableChain({ count: handlers.submissions ?? 0, error: null });
            }
            if (table === "form_packet_items") {
                return thenableChain({ count: handlers.packetRefs ?? 0, error: null });
            }
            return thenableChain({ error: null });
        },
    };
    return supabase as never;
}

describe("deleteFormDefinitionForAdmin", () => {
    it("returns 404 when form missing", async () => {
        const result = await deleteFormDefinitionForAdmin(mockSupabase({ form: null }), ORG, FORM);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.status).toBe(404);
    });

    it("blocks delete when published version exists", async () => {
        const result = await deleteFormDefinitionForAdmin(mockSupabase({ form: { id: FORM }, published: 1 }), ORG, FORM);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.status).toBe(409);
            expect(result.message).toMatch(/archive/i);
        }
    });

    it("blocks delete when submissions exist", async () => {
        const result = await deleteFormDefinitionForAdmin(mockSupabase({ form: { id: FORM }, submissions: 2 }), ORG, FORM);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.message).toMatch(/submissions/i);
    });

    it("deletes draft-only form when safe", async () => {
        const result = await deleteFormDefinitionForAdmin(mockSupabase({ form: { id: FORM } }), ORG, FORM);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.deleted.form_id).toBe(FORM);
    });
});
