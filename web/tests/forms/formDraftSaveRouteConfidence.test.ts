import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
 * The save ROUTE is the one hop of draft -> payload -> route -> rebuild that the pure suites in
 * importMappingIntegrity.test.ts cannot reach: they call the payload builder and the rebuild directly.
 * The route's own parse was where confidence broke at the type level (a narrowed literal widened to
 * `string` inside the returned object), and vitest strips types, so only a test that drives the real
 * handler proves the value actually crosses it.
 */

const orgId = "org-1";
const caseId = "11111111-1111-4111-8111-111111111111";

const { mockGetAdminContextCached, mockCreateAdminClient, mockStore } = vi.hoisted(() => ({
    mockGetAdminContextCached: vi.fn(),
    mockCreateAdminClient: vi.fn(),
    mockStore: vi.fn(),
}));

vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return { ...actual, getAdminContextCached: mockGetAdminContextCached };
});

vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: mockCreateAdminClient }));

vi.mock("@/lib/pos/processingCase/formDraft/formDraftPreviewDb", async () => {
    const actual = await vi.importActual<typeof import("@/lib/pos/processingCase/formDraft/formDraftPreviewDb")>(
        "@/lib/pos/processingCase/formDraft/formDraftPreviewDb",
    );
    return { ...actual, dbStoreFormDraftPreview: (_s: unknown, args: { draft: unknown }) => mockStore(args.draft) };
});

import { POST } from "@/app/api/admin/processing/cases/[caseId]/form-draft/save/route";

/** A case that exists, with no primary document and no prior preview. */
function supabaseCase() {
    const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: { id: caseId, metadata: null }, error: null }),
    };
    return {
        from(table: string) {
            if (table === "processing_case_sources") {
                return { ...chain, maybeSingle: async () => ({ data: null, error: null }) };
            }
            return chain;
        },
    };
}

async function save(fields: unknown[]) {
    const res = await POST(
        new NextRequest("http://localhost", { method: "POST", body: JSON.stringify({ title: "Disposable", fields }) }),
        { params: Promise.resolve({ caseId }) },
    );
    expect(res.status).toBe(200);
    const draft = mockStore.mock.calls.at(-1)![0] as { fields: Array<{ label: string; confidence: string }> };
    return Object.fromEntries(draft.fields.map((f) => [f.label, f.confidence]));
}

describe("the save route carries the importer's confidence into the rebuilt draft", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetAdminContextCached.mockResolvedValue({ ok: true, orgId, userId: "user-1", role: "admin", permissionKeys: ["forms.author"] });
        mockCreateAdminClient.mockReturnValue(supabaseCase());
        mockStore.mockImplementation(async (draft: unknown) => draft);
    });

    it("keeps high, medium and low exactly as posted", async () => {
        const out = await save([
            { label: "Parent email", confidence: "high" },
            { label: "Child's gender", confidence: "medium" },
            { label: "subject_line", confidence: "low", evidence: "hosted_form:form:subject_line" },
        ]);
        expect(out).toEqual({ "Parent email": "high", "Child's gender": "medium", subject_line: "low" });
    });

    it("admits no new state — anything else falls back to the operator-authored default", async () => {
        const out = await save([
            { label: "Invented", confidence: "certain" },
            { label: "Numeric", confidence: 0.4 },
            { label: "Authored by the operator" },
        ]);
        expect(out).toEqual({ Invented: "high", Numeric: "high", "Authored by the operator": "high" });
    });
});
