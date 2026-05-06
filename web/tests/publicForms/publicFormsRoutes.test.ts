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
const mockHydrate = vi.fn();

vi.mock("@/lib/public/forms/resolvePublicFormLink", () => ({
    resolvePublicFormLinkByToken: (...args: unknown[]) => mockResolve(...args),
}));

vi.mock("@/lib/public/forms/hydratePublicFormSelectOptions", () => ({
    hydrateSelectOptionsForSchema: (...args: unknown[]) => mockHydrate(...args),
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
        mockHydrate.mockResolvedValue({
            option_values_by_field_id: {},
            option_choices_by_field_id: {},
        });
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
        const j = (await res.json()) as {
            ok: boolean;
            data?: {
                schema_json: unknown;
                option_values_by_field_id?: Record<string, string[]>;
                option_choices_by_field_id?: Record<string, { value: string; label: string }[]>;
            };
        };
        expect(j.ok).toBe(true);
        expect(j.data?.schema_json).toEqual(validSchema);
        expect(j.data?.option_values_by_field_id).toEqual({});
        expect(j.data?.option_choices_by_field_id).toEqual({});
        expect(mockHydrate).toHaveBeenCalledOnce();
    });

    it("GET resolve includes option_values_by_field_id for select fields", async () => {
        const schemaWithSelect = {
            schema_version: 1 as const,
            title: "Public",
            sections: [{ id: "s1", field_ids: ["color"] }],
            fields: [{ id: "color", type: "select" as const, label: "Color", option_set_key: "colors" }],
        };
        mockResolve.mockResolvedValueOnce({
            ok: true as const,
            value: {
                ...resolvedValue([]).value,
                schemaJson: schemaWithSelect,
            },
        });
        mockHydrate.mockResolvedValueOnce({
            option_values_by_field_id: { color: ["red", "blue"] },
            option_choices_by_field_id: {
                color: [
                    { value: "red", label: "Red" },
                    { value: "blue", label: "Blue" },
                ],
            },
        });
        const res = await resolveGet(new NextRequest("http://localhost/x"), {
            params: Promise.resolve({ token: "plain-token" }),
        });
        expect(res.status).toBe(200);
        const j = (await res.json()) as {
            ok: boolean;
            data?: { option_values_by_field_id?: Record<string, string[]> };
        };
        expect(j.data?.option_values_by_field_id?.color).toEqual(["red", "blue"]);
    });

    it("GET resolve rejects disallowed Origin when embed allowlist is set", async () => {
        mockResolve.mockResolvedValueOnce(resolvedValue(["https://parent.site"]));
        const res = await resolveGet(
            new NextRequest("http://localhost/x", {
                headers: { Origin: "https://evil.site" },
            }),
            { params: Promise.resolve({ token: "plain-token" }) }
        );
        expect(res.status).toBe(403);
        const j = (await res.json()) as { ok: boolean; code?: string };
        expect(j.ok).toBe(false);
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
