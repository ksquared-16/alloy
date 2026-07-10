import { describe, expect, it, vi, beforeEach } from "vitest";
import {
    PROCESSING_DEV_CLEANUP_CONFIRM_TOKEN,
    applyProcessingDevCleanup,
    planProcessingDevCleanup,
} from "@/lib/pos/processingDevCleanup";

function makeSupabaseMock(rows: Record<string, unknown[]>) {
    const from = vi.fn((table: string) => {
        const chain = {
            select: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            in: vi.fn(() => chain),
            delete: vi.fn(() => chain),
            update: vi.fn(() => chain),
            order: vi.fn(() => chain),
            limit: vi.fn(() => chain),
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            then(onFulfilled: (value: unknown) => unknown) {
                return Promise.resolve(onFulfilled({ data: rows[table] ?? [], error: null }));
            },
        };
        return chain;
    });
    return {
        from,
        storage: { from: vi.fn(() => ({ remove: vi.fn(async () => ({ error: null })) })) },
    };
}

describe("processingDevCleanup", () => {
    beforeEach(() => {
        vi.stubEnv("NODE_ENV", "development");
        vi.stubEnv("VERCEL_ENV", "preview");
    });

    it("exports the required confirmation token", () => {
        expect(PROCESSING_DEV_CLEANUP_CONFIRM_TOKEN).toBe("RESET-PROCESSING-TEST-DATA");
    });

    it("plans grouped artifact counts", async () => {
        const supabase = makeSupabaseMock({
            processing_cases: [{ id: "case-1", metadata: {} }],
            processing_case_sources: [{ processing_case_id: "case-1", source_id: "doc-1", source_kind: "document" }],
            documents: [{ id: "doc-1", bucket: "docs", storage_path: "a.pdf" }],
            form_definitions: [{ id: "form-1", metadata: { source: "processing", origin: "blank" } }],
            form_definition_versions: [{ id: "ver-1", form_definition_id: "form-1" }],
            form_public_links: [],
            form_submissions: [],
        });

        const plan = await planProcessingDevCleanup(supabase as never, "org-1");
        expect(plan.counts.processingCases).toBe(1);
        expect(plan.counts.documents).toBe(1);
        expect(plan.counts.forms).toBe(1);
        expect(plan.dryRun).toBe(true);
    });
});
