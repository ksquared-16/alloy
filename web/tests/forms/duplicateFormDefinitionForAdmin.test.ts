import { describe, expect, it, vi, beforeEach } from "vitest";
import { duplicateFormDefinitionForAdmin } from "@/lib/admin/forms/duplicateFormDefinitionForAdmin";

const ORG = "11111111-1111-4111-8111-111111111111";
const SOURCE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NEW_FORM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DRAFT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PUBLISHED = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

vi.mock("@/lib/admin/forms/formsAdminDb", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/admin/forms/formsAdminDb")>();
    return {
        ...actual,
        dbListFormDefinitionKeys: vi.fn(async () => new Set(["website_inquiry"])),
        dbMaxVersionNumber: vi.fn(async () => 0),
        dbInsertFormDefinition: vi.fn(async (_supabase, row) => ({
            data: { ...row, id: NEW_FORM },
            error: null,
        })),
        dbInsertVersion: vi.fn(async (_supabase, row) => ({
            data: { ...row, id: DRAFT },
            error: null,
        })),
    };
});

function createMockSupabase(
    sourceForm: Record<string, unknown> | null,
    versions: Record<string, unknown>[]
) {
    return {
        from(table: string) {
            if (table === "form_definitions") {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({ data: sourceForm, error: null }),
                            }),
                        }),
                    }),
                };
            }
            if (table === "form_definition_versions") {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                order: async () => ({ data: versions, error: null }),
                            }),
                        }),
                    }),
                };
            }
            throw new Error(`unexpected table ${table}`);
        },
    };
}

describe("duplicateFormDefinitionForAdmin", () => {
    beforeEach(async () => {
        const { dbInsertFormDefinition, dbInsertVersion } = await import("@/lib/admin/forms/formsAdminDb");
        vi.mocked(dbInsertFormDefinition).mockClear();
        vi.mocked(dbInsertVersion).mockClear();
    });

    it("returns 404 when source missing", async () => {
        const supabase = createMockSupabase(null, []);
        const result = await duplicateFormDefinitionForAdmin(supabase as never, ORG, SOURCE);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.status).toBe(404);
    });

    it("returns 409 when no versions exist", async () => {
        const supabase = createMockSupabase(
            { id: SOURCE, key: "inquiry", name: "Inquiry", kind: "center", metadata: {} },
            []
        );
        const result = await duplicateFormDefinitionForAdmin(supabase as never, ORG, SOURCE);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.status).toBe(409);
    });

    it("copies latest draft schema into new unpublished form", async () => {
        const schema = { fields: [{ id: "email", type: "email" }] };
        const supabase = createMockSupabase(
            {
                id: SOURCE,
                key: "website_inquiry",
                name: "Website Inquiry",
                description: "Families",
                kind: "center",
                metadata: { intake_intent: "enrollment_lead" },
            },
            [
                {
                    id: DRAFT,
                    version_number: 2,
                    status: "draft",
                    schema_json: schema,
                    pdf_mapping_json: null,
                    metadata: {},
                },
                {
                    id: PUBLISHED,
                    version_number: 1,
                    status: "published",
                    schema_json: { fields: [] },
                    pdf_mapping_json: null,
                    metadata: {},
                },
            ]
        );

        const result = await duplicateFormDefinitionForAdmin(supabase as never, ORG, SOURCE);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.form.name).toBe("Copy of Website Inquiry");
            expect(result.form.key).toMatch(/^copy_of_website_inquiry/);
            expect(result.form.id).toBe(NEW_FORM);
        }

        const { dbInsertFormDefinition, dbInsertVersion } = await import("@/lib/admin/forms/formsAdminDb");
        expect(dbInsertFormDefinition).toHaveBeenCalledWith(
            supabase,
            expect.objectContaining({
                name: "Copy of Website Inquiry",
                metadata: { intake_intent: "enrollment_lead" },
            })
        );
        expect(dbInsertVersion).toHaveBeenCalledWith(
            supabase,
            expect.objectContaining({
                form_definition_id: NEW_FORM,
                status: "draft",
                schema_json: schema,
            })
        );
    });

    it("falls back to published schema when no draft exists", async () => {
        const schema = { fields: [{ id: "name" }] };
        const supabase = createMockSupabase(
            {
                id: SOURCE,
                key: "waitlist",
                name: "Waitlist",
                kind: "center",
                metadata: {},
            },
            [
                {
                    id: PUBLISHED,
                    version_number: 1,
                    status: "published",
                    schema_json: schema,
                    pdf_mapping_json: null,
                    metadata: {},
                },
            ]
        );

        const result = await duplicateFormDefinitionForAdmin(supabase as never, ORG, SOURCE);
        expect(result.ok).toBe(true);

        const { dbInsertVersion } = await import("@/lib/admin/forms/formsAdminDb");
        expect(dbInsertVersion).toHaveBeenCalledWith(
            supabase,
            expect.objectContaining({ schema_json: schema, status: "draft" })
        );
    });
});
