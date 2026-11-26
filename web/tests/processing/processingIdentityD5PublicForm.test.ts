import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyFormIntakeSafe } from "@/lib/forms/intake/applyFormIntakeSafe";
import { ingestPublicFormThroughProcessing } from "@/lib/pos/processingIdentity/sources/formIntakeAdapter";
import type { FormIntakeMeta } from "@/lib/forms/intake/formLeadCaptureTypes";

vi.mock("@/lib/pos/processingCase/openProcessingCaseFromSource", () => ({
    openProcessingCaseFromSource: vi.fn().mockResolvedValue({ processingCaseId: "case-form-1", created: true }),
}));

vi.mock("@/lib/pos/processingIdentity/canonicalResolutionEngine", () => ({
    runCanonicalIdentityResolution: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/pos/processingCase/processingCaseDb", () => ({
    makeProcessingCaseDbDeps: vi.fn().mockReturnValue({}),
    dbFindPrimaryCaseSourceRowId: vi.fn().mockResolvedValue("source-row-1"),
}));

const ORG = "11111111-1111-4111-8111-111111111111";
const SUB = "33333333-3333-4333-8333-333333333333";

const intakeMeta: FormIntakeMeta = {
    vertical_id: "vert-1",
    guardian: {
        email: "sarah@example.com",
        phone: "5551234567",
        first_name: "Sarah",
        last_name: "Emerson",
    },
    child: {
        first_name: "Mia",
        last_name: "Emerson",
        dob: "2020-03-15",
    },
};

/**
 * The adapter reads `form_definitions` (admin category + case-title template)
 * before it writes `processing_cases`. The stub originally provided only
 * `update`, so that read threw `.select is not a function`, the adapter's own
 * catch turned it into `{ ok: false }`, and both assertions below failed for a
 * reason that had nothing to do with what they assert.
 *
 * Providing the read keeps the test's actual subject intact: it still proves the
 * adapter opens a Processing case and writes NO CRM identity table.
 */
function supabaseStub() {
    const update = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
        }),
    });
    const select = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
    });
    return { from: vi.fn().mockReturnValue({ update, select }) } as unknown as SupabaseClient;
}

describe("D5 public form authoritative Processing intake", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("applyFormIntakeSafe rejects active authority (E1 guard)", async () => {
        await expect(
            applyFormIntakeSafe({} as SupabaseClient, {
                orgId: ORG,
                linkMetadata: {},
                payload: { values: {}, meta: {} },
            }),
        ).rejects.toThrow(/retired \(E1\)/);
    });

    it("ingestPublicFormThroughProcessing opens case without CRM identity writes", async () => {
        const sb = supabaseStub();
        const result = await ingestPublicFormThroughProcessing(sb, {
            orgId: ORG,
            submissionId: SUB,
            formDefinitionId: "form-1",
            intakeMeta,
            payload: { values: {}, meta: { intake: intakeMeta } },
            linkMetadata: { lead_capture: true },
        });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.processingCaseId).toBe("case-form-1");
        }
        expect(sb.from).toHaveBeenCalledWith("processing_cases");
        expect(sb.from).not.toHaveBeenCalledWith("persons");
        expect(sb.from).not.toHaveBeenCalledWith("opportunities");
    });

    it("idempotent replay returns same case reference shape", async () => {
        const sb = supabaseStub();
        const first = await ingestPublicFormThroughProcessing(sb, {
            orgId: ORG,
            submissionId: SUB,
            formDefinitionId: "form-1",
            intakeMeta,
            payload: { values: {}, meta: {} },
        });
        const second = await ingestPublicFormThroughProcessing(sb, {
            orgId: ORG,
            submissionId: SUB,
            formDefinitionId: "form-1",
            intakeMeta,
            payload: { values: {}, meta: {} },
        });
        expect(first.ok && second.ok).toBe(true);
        if (first.ok && second.ok) {
            expect(first.processingCaseId).toBe(second.processingCaseId);
        }
    });
});

describe("D5 submit route wiring", () => {
    it("public submit route imports canonical form adapter (not legacy direct writer)", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const route = readFileSync(
            resolve(
                import.meta.dirname,
                "../../app/api/public/forms/[token]/submissions/[submissionId]/submit/route.ts",
            ),
            "utf8",
        );
        expect(route).toContain("ingestPublicFormThroughProcessing");
        expect(route).not.toMatch(/applyFormIntakeSafe\s*\(/);
    });
});
