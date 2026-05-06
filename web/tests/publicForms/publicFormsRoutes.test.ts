import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as resolveGet } from "@/app/api/public/forms/[token]/resolve/route";
import { POST as submissionsPost } from "@/app/api/public/forms/[token]/submissions/route";

const validSchema = {
    schema_version: 1 as const,
    title: "Public",
    sections: [{ id: "s1", field_ids: ["a"] }],
    fields: [{ id: "a", type: "text" as const, label: "A" }],
};

const mockResolve = vi.fn();

vi.mock("@/lib/public/forms/resolvePublicFormLink", () => ({
    resolvePublicFormLinkByToken: (...args: unknown[]) => mockResolve(...args),
}));

const insertSubmission = vi.fn(async () => ({
    data: {
        id: "33333333-3333-4333-8333-333333333333",
        status: "draft",
        payload: { values: {} },
        form_definition_version_id: "22222222-2222-4222-8222-222222222222",
    },
    error: null,
}));

vi.mock("@/lib/supabase/serverServiceClient", () => ({
    createServiceRoleClient: vi.fn(() => ({
        from: vi.fn((table: string) => {
            if (table === "form_submissions") {
                return {
                    insert: () => ({
                        select: () => ({
                            single: insertSubmission,
                        }),
                    }),
                };
            }
            return {};
        }),
    })),
}));

function resolvedValue(allowed: string[] | null) {
    return {
        ok: true as const,
        value: {
            linkId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            orgId: "11111111-1111-4111-8111-111111111111",
            formDefinitionId: "44444444-4444-4444-8444-444444444444",
            formDefinitionVersionId: "22222222-2222-4222-8222-222222222222",
            schemaJson: validSchema,
            pdfMappingJson: null,
            expiresAt: null,
            allowedEmbedOrigins: allowed,
            linkMetadata: {},
            formKey: "k",
            formName: "N",
            formKind: "center",
        },
    };
}

describe("public forms routes", () => {
    beforeEach(() => {
        vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
        mockResolve.mockResolvedValue(resolvedValue([]));
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.clearAllMocks();
    });

    it("GET resolve returns ok + schema envelope", async () => {
        const res = await resolveGet(new NextRequest("http://localhost/x"), {
            params: Promise.resolve({ token: "plain-token" }),
        });
        expect(res.status).toBe(200);
        const j = (await res.json()) as { ok: boolean; data?: { schema_json: unknown } };
        expect(j.ok).toBe(true);
        expect(j.data?.schema_json).toEqual(validSchema);
    });

    it("POST submissions rejects forbidden origin when allowlist set", async () => {
        mockResolve.mockResolvedValueOnce(resolvedValue(["https://allowed.example"]));
        const res = await submissionsPost(
            new NextRequest("http://localhost/x", {
                method: "POST",
                headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
                body: JSON.stringify({ payload: { values: {} } }),
            }),
            { params: Promise.resolve({ token: "t" }) }
        );
        expect(res.status).toBe(403);
        const j = (await res.json()) as { ok: boolean; error?: string };
        expect(j.ok).toBe(false);
        expect(j.error).toContain("Origin");
    });

    it("POST submissions creates draft when origin allowed", async () => {
        mockResolve.mockResolvedValueOnce(resolvedValue(["https://allowed.example"]));
        const res = await submissionsPost(
            new NextRequest("http://localhost/x", {
                method: "POST",
                headers: { "Content-Type": "application/json", Origin: "https://allowed.example" },
                body: JSON.stringify({ payload: { values: { a: "hi" } } }),
            }),
            { params: Promise.resolve({ token: "t" }) }
        );
        expect(res.status).toBe(201);
        const j = (await res.json()) as { ok: boolean; data?: { id: string } };
        expect(j.ok).toBe(true);
        expect(j.data?.id).toBeTruthy();
    });
});
