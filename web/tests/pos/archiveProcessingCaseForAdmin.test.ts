import { describe, expect, it, vi } from "vitest";
import { archiveProcessingCaseForAdmin } from "@/lib/pos/processingCase/archiveProcessingCaseForAdmin";

const ORG = "11111111-1111-4111-8111-111111111111";
const CASE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function mockSupabase(row: { id: string; status: string; metadata?: Record<string, unknown> } | null) {
    const supabase = {
        from(table: string) {
            const chain: Record<string, unknown> = {};
            chain.select = vi.fn(() => chain);
            chain.eq = vi.fn(() => chain);
            chain.maybeSingle = async () => ({ data: row, error: null });
            chain.update = vi.fn(() => ({
                eq: () => ({
                    eq: () => Promise.resolve({ error: null }),
                }),
            }));
            return chain;
        },
    };
    return supabase as never;
}

describe("archiveProcessingCaseForAdmin", () => {
    it("returns 404 when case missing", async () => {
        const result = await archiveProcessingCaseForAdmin(mockSupabase(null), ORG, CASE);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.status).toBe(404);
    });

    it("archives active case", async () => {
        const result = await archiveProcessingCaseForAdmin(
            mockSupabase({ id: CASE, status: "needs_review", metadata: {} }),
            ORG,
            CASE
        );
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.archived.case_id).toBe(CASE);
    });

    it("is idempotent when already archived", async () => {
        const result = await archiveProcessingCaseForAdmin(
            mockSupabase({ id: CASE, status: "archived", metadata: {} }),
            ORG,
            CASE
        );
        expect(result.ok).toBe(true);
    });
});
