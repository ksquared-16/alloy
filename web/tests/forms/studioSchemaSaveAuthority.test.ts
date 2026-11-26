import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { addRelationshipGroup, changeAnswerKind, setGroupRepeat } from "@/lib/forms/formBuilderSchema";
import { safeParseFormSchema, type FormSchemaV1 } from "@/lib/forms/schema";
import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import { createFormFromCaseDraft, type CreateFormDeps } from "@/lib/pos/processingCase/formDraft/createFormFromCaseDraft";
import { parseStoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/formDraftPreviewDb";
import { studioSchemaForDraft } from "@/lib/pos/processingCase/formDraft/studioSchemaForDraft";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

/**
 * SAVE AUTHORITY FOR A DOCUMENT-ORIGINATED FORM.
 *
 * Forms Studio owns what the form IS (fields, order, sections, answer types, choices, layout, conditions,
 * groups). The importer owns where it came FROM (provenance, page, region, confidence, evidence).
 *
 * The previous save rebuilt the draft from a flat field list, so it could not keep what Studio authors:
 * every save dropped every section disposition, turned every dropdown into free text, and had nowhere to
 * put a group, a minimum, a type change, a text block or a help-text edit. These tests drive the REAL
 * save route and the REAL create step.
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

const importedDraft = (): StoredFormDraftPreview =>
    ({
        title: "Enrollment packet",
        generated_form_name: "Enrollment packet",
        source_document_id: "doc-1",
        title_from_text: true,
        extracted_text_available: true,
        sections: [
            { id: "section_1", title: "Family", field_ids: ["field_1", "field_2"], disposition: "fields" },
            { id: "section_2", title: "Consent", field_ids: [], disposition: "static_text", static_text: "I agree." },
        ],
        fields: [
            {
                id: "field_1",
                label: "Is there anyone who has a legal restraining order prohibiting or limiting contact with your child?",
                type: "text",
                required: false,
                confidence: "medium",
                evidence: "hosted_form:restraining_order",
                page: 2,
            },
            {
                id: "field_2",
                label: "Program",
                type: "select",
                required: false,
                confidence: "high",
                evidence: "hosted_form:program",
                options: ["Full day", "Half day"],
            },
        ],
        warnings: [],
        diagnostics: { extracted_text_length: 0, extracted_text_preview: "", section_count: 2, field_count: 2 },
        generated_at: "2026-10-09T12:00:00.000Z",
        generator_version: "test",
    }) as unknown as StoredFormDraftPreview;

function supabaseWith(preview: StoredFormDraftPreview | null) {
    const metadata = preview ? { form_draft_preview: preview } : null;
    const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: { id: caseId, metadata }, error: null }),
    };
    return {
        from(table: string) {
            if (table === "processing_case_sources") return { ...chain, maybeSingle: async () => ({ data: null, error: null }) };
            return chain;
        },
    };
}

async function post(body: unknown) {
    return POST(new NextRequest("http://localhost", { method: "POST", body: JSON.stringify(body) }), {
        params: Promise.resolve({ caseId }),
    });
}

/** What Studio would hold after the Director's edits: a Yes/No, a minimum-2 emergency contacts group. */
function authored(): FormSchemaV1 {
    let schema = draftFormToFormSchemaV1(importedDraft());
    schema = changeAnswerKind(schema, "field_1", "boolean");
    const r = addRelationshipGroup(schema, "emergency_contacts", schema.sections[0]!.id)!;
    schema = setGroupRepeat(r.schema, r.fieldId, { min: 2 });
    return schema;
}

/** The same form as the schema authority stores it (defaults filled in on validation). */
function validated(schema: FormSchemaV1): FormSchemaV1 {
    const parsed = safeParseFormSchema(schema);
    if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
    return parsed.data;
}

describe("the Studio save stores the form exactly as Forms Studio has it", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetAdminContextCached.mockResolvedValue({ ok: true, orgId, userId: "user-1", role: "admin", permissionKeys: ["forms.author"] });
        mockStore.mockImplementation(async (draft: unknown) => draft);
    });

    it("saves the whole schema and leaves the imported metadata untouched", async () => {
        const prior = importedDraft();
        mockCreateAdminClient.mockReturnValue(supabaseWith(prior));
        const schema = authored();
        const res = await post({ studio_schema: schema });
        expect(res.status).toBe(200);
        const stored = mockStore.mock.calls.at(-1)![0] as StoredFormDraftPreview;
        expect(stored.studio_schema).toEqual(validated(schema));
        // Provenance, confidence, evidence, sections and generation identity are exactly the importer's.
        expect(stored.fields).toEqual(prior.fields);
        expect(stored.sections).toEqual(prior.sections);
        expect(stored.generated_at).toBe(prior.generated_at);
    });

    it("refuses a schema the Studio authority would refuse — nothing is stored", async () => {
        mockCreateAdminClient.mockReturnValue(supabaseWith(importedDraft()));
        const bad = { ...authored(), fields: [{ id: "x", type: "nonsense", label: "?" }] };
        const res = await post({ studio_schema: bad });
        expect(res.status).toBe(422);
        expect(mockStore).not.toHaveBeenCalled();
    });

    it("a later field-list save rebuilds the importer's view but never overwrites the Studio's form", async () => {
        const schema = authored();
        mockCreateAdminClient.mockReturnValue(supabaseWith({ ...importedDraft(), studio_schema: schema }));
        const res = await post({ title: "Enrollment packet", fields: [{ label: "Something else entirely", type: "text" }] });
        expect(res.status).toBe(200);
        const stored = mockStore.mock.calls.at(-1)![0] as StoredFormDraftPreview;
        expect(stored.studio_schema).toEqual(schema);
    });

    it("section dispositions named by id survive a field-list save (they were all dropped)", async () => {
        mockCreateAdminClient.mockReturnValue(supabaseWith(importedDraft()));
        const res = await post({
            title: "Enrollment packet",
            fields: [{ label: "Program", type: "select", options: ["Full day", "Half day"], section: "Family" }],
            section_dispositions: [{ id: "section_2", disposition: "static_text" }],
        });
        expect(res.status).toBe(200);
        const stored = mockStore.mock.calls.at(-1)![0] as StoredFormDraftPreview;
        // …and a dropdown is still a dropdown after the rebuild (it was coerced to text).
        expect(stored.fields[0]!.type).toBe("select");
    });
});

describe("one answer to 'what is this form' — for Studio and for Generate", () => {
    it("before any Studio edit it is the importer's form; after, the Studio's own", () => {
        const draft = importedDraft();
        expect(studioSchemaForDraft(draft)).toMatchObject({ ok: true, source: "import" });
        const schema = authored();
        const resolved = studioSchemaForDraft({ ...draft, studio_schema: schema });
        expect(resolved).toMatchObject({ ok: true, source: "studio" });
        expect(resolved.ok && resolved.schema).toEqual(validated(schema));
    });

    it("the stored-draft reader keeps the Studio schema (it is an allowlist)", () => {
        const schema = authored();
        const read = parseStoredFormDraftPreview({ form_draft_preview: { ...importedDraft(), studio_schema: schema } });
        expect(read?.studio_schema).toEqual(schema);
    });

    it("Generate creates exactly the form the operator authored in Studio", async () => {
        const schema = authored();
        let inserted: unknown = null;
        const deps: CreateFormDeps = {
            loadCaseMetadata: async () => ({ form_draft_preview: { ...importedDraft(), studio_schema: schema } }),
            listFormKeys: async () => new Set(),
            insertFormDefinition: async () => ({ id: "form-1" }),
            maxVersionNumber: async () => 0,
            insertVersion: async (args) => {
                inserted = args.schemaJson;
                return { id: "ver-1" };
            },
            updateCaseMetadata: async () => {},
            now: () => new Date("2026-10-09T12:00:00Z"),
        };
        const result = await createFormFromCaseDraft(deps, { orgId, caseId });
        expect(result.ok).toBe(true);
        expect(inserted).toEqual(validated(schema));
        const restraining = (inserted as FormSchemaV1).fields.find((f) => f.id === "field_1")!;
        expect(restraining.type).toBe("boolean");
        const contacts = (inserted as FormSchemaV1).fields.find((f) => f.type === "group")!;
        expect((contacts as { repeat?: { min: number } }).repeat?.min).toBe(2);
    });
});
