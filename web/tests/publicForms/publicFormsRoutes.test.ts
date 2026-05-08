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

const CUSTOMER_ID_FROM_MEMBER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const { lastInsertRef, insertSubmission } = vi.hoisted(() => {
    const lastInsertRef = { current: null as Record<string, unknown> | null };
    const insertSubmission = vi.fn(async () => {
        const ins = lastInsertRef.current;
        return {
            data: {
                id: "33333333-3333-4333-8333-333333333333",
                status: "draft",
                payload: ins?.payload ?? { values: {} },
                form_definition_version_id: "22222222-2222-4222-8222-222222222222",
                person_id: ins?.person_id ?? null,
                customer_id: ins?.customer_id ?? null,
                customer_member_id: ins?.customer_member_id ?? null,
                opportunity_id: ins?.opportunity_id ?? null,
            },
            error: null,
        };
    });
    return { lastInsertRef, insertSubmission };
});

vi.mock("@/lib/public/forms/resolvePublicFormLink", () => ({
    resolvePublicFormLinkByToken: (...args: unknown[]) => mockResolve(...args),
}));

vi.mock("@/lib/public/forms/hydratePublicFormSelectOptions", () => ({
    hydrateSelectOptionsForSchema: (...args: unknown[]) => mockHydrate(...args),
}));

vi.mock("@/lib/supabase/serverServiceClient", () => ({
    createServiceRoleClient: vi.fn(() => ({
        from: vi.fn((table: string) => {
            if (table === "form_submissions") {
                return {
                    insert: (row: Record<string, unknown>) => {
                        lastInsertRef.current = row;
                        return {
                            select: () => ({
                                single: insertSubmission,
                            }),
                        };
                    },
                };
            }
            if (table === "customer_members") {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({
                                    data: { customer_id: CUSTOMER_ID_FROM_MEMBER },
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            if (table === "form_definitions") {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({
                                    data: { metadata: {} },
                                    error: null,
                                }),
                            }),
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
        lastInsertRef.current = null;
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

    it("POST submissions seeds CRM FKs from existing_record customer_member link metadata", async () => {
        const mid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
        mockResolve.mockResolvedValueOnce({
            ok: true as const,
            value: {
                ...resolvedValue(["https://allowed.example"]).value,
                linkMetadata: {
                    form_context_mode: "existing_record",
                    source_entity_type: "customer_member",
                    source_entity_id: mid,
                },
            },
        });
        const res = await submissionsPost(
            new NextRequest("http://localhost/x", {
                method: "POST",
                headers: { "Content-Type": "application/json", Origin: "https://allowed.example" },
                body: JSON.stringify({ payload: { values: {} } }),
            }),
            { params: Promise.resolve({ token: "t" }) }
        );
        expect(res.status).toBe(201);
        expect(lastInsertRef.current?.customer_member_id).toBe(mid);
        expect(lastInsertRef.current?.customer_id).toBe(CUSTOMER_ID_FROM_MEMBER);
        const j = (await res.json()) as {
            ok: boolean;
            data?: { customer_member_id?: string | null; customer_id?: string | null };
        };
        expect(j.data?.customer_member_id).toBe(mid);
        expect(j.data?.customer_id).toBe(CUSTOMER_ID_FROM_MEMBER);
    });
});
