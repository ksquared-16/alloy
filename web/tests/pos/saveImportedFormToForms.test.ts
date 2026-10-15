import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { addRelationshipGroup, setFieldCalculation, setFieldVisibility, setGroupRepeat, structureAddressAt } from "@/lib/forms/formBuilderSchema";
import { setFieldLayoutWidth } from "@/lib/forms/formRowComposition";
import { validateFormSchema, type FormSchemaV1 } from "@/lib/forms/schema";
import { createFormFromCaseDraft, type CreateFormDeps } from "@/lib/pos/processingCase/formDraft/createFormFromCaseDraft";
import { formMatchesStudioFolder, formOrigin, formPublishStatus } from "@/lib/pos/processingFolderConfig";
import { parseProcessingFolderList } from "@/lib/pos/processingFolderPersistence";

/**
 * SAVE TO FORMS — an imported form becomes a normal Forms Studio form, filed in a folder.
 */

const { mockCtx, mockClient } = vi.hoisted(() => ({ mockCtx: vi.fn(), mockClient: vi.fn() }));
vi.mock("@/lib/admin/getAdminContext", async () => {
    const actual = await vi.importActual<typeof import("@/lib/admin/getAdminContext")>("@/lib/admin/getAdminContext");
    return { ...actual, getAdminContextCached: mockCtx };
});
vi.mock("@/lib/supabaseAdmin", () => ({ createAdminClient: mockClient }));

import { GET, PATCH } from "@/app/api/admin/processing/folders/route";

/* ------------------------------------------------------------------ the authored form */

function authoredStudioSchema(): FormSchemaV1 {
    let s = validateFormSchema({
        schema_version: 1,
        title: "Admissions",
        sections: [{ id: "s1", title: "Child", field_ids: ["dob", "start", "age", "siblings", "siblings_list", "l1", "city", "state", "zip"] }],
        fields: [
            { id: "dob", type: "date", label: "Student Date of Birth", required: true },
            { id: "start", type: "date", label: "Student's first day", required: true },
            { id: "age", type: "text", label: "Student Age Upon Enrolling", required: false },
            { id: "siblings", type: "boolean", label: "Does your child have siblings?", required: false },
            { id: "siblings_list", type: "text", label: "Please list siblings", required: false },
            { id: "l1", type: "text", label: "Home address line 1", required: true, field_source: { entity_type: "person", field_key: "address_line1" } },
            { id: "city", type: "text", label: "City", required: true, field_source: { entity_type: "person", field_key: "city" } },
            { id: "state", type: "text", label: "State", required: true, field_source: { entity_type: "person", field_key: "state" } },
            { id: "zip", type: "text", label: "ZIP", required: true, field_source: { entity_type: "person", field_key: "postal_code" } },
        ],
    });
    s = setFieldCalculation(s, "age", { kind: "age_from_date_of_birth", source_key: "dob", as_of_key: "start" });
    s = setFieldVisibility(s, "siblings_list", { triggerFieldId: "siblings", value: true });
    s = setFieldLayoutWidth(s, "dob", "half");
    s = structureAddressAt(s, "city");
    const people = addRelationshipGroup(s, "emergency_contacts", "s1")!;
    s = setGroupRepeat(people.schema, people.fieldId, { min: 2 });
    return validateFormSchema(JSON.parse(JSON.stringify(s)));
}

function caseMetadata(studio: FormSchemaV1) {
    return {
        form_draft_preview: {
            title: "Admissions packet",
            generated_form_name: "2026–27 Admissions",
            source_document_id: "doc-1",
            sections: [],
            fields: [{ id: "dob", label: "Student Date of Birth", type: "date", required: true, confidence: "high", evidence: "hosted_form:dob" }],
            warnings: [],
            generated_at: "2026-10-15T00:00:00.000Z",
            generator_version: "test",
            studio_schema: studio,
            studio_schema_saved_at: "2026-10-15T00:05:00.000Z",
        },
    } as Record<string, unknown>;
}

function fakeDeps(initial: Record<string, unknown>) {
    let metadata = initial;
    const definitions: Array<{ id: string; name: string; metadata: Record<string, unknown> }> = [];
    const versions: Array<{ id: string; formDefinitionId: string; schemaJson: unknown; metadata: Record<string, unknown> }> = [];
    const refiled: Array<{ formId: string; folderId: string }> = [];
    let seq = 0;
    const deps: CreateFormDeps = {
        async loadCaseMetadata() { return metadata; },
        async listFormKeys() { return new Set(definitions.map((d) => d.name)); },
        async insertFormDefinition({ name, metadata: m }) { const id = `form-${++seq}`; definitions.push({ id, name, metadata: m }); return { id }; },
        async maxVersionNumber() { return 0; },
        async insertVersion({ formDefinitionId, schemaJson, metadata: m }) { const id = `ver-${++seq}`; versions.push({ id, formDefinitionId, schemaJson, metadata: m }); return { id }; },
        async updateCaseMetadata({ metadata: m }) { metadata = m; },
        async setFormFolder({ formId, folderId }) {
            refiled.push({ formId, folderId });
            const def = definitions.find((d) => d.id === formId);
            if (def) def.metadata = { ...def.metadata, admin_category: folderId };
        },
        now() { return new Date("2026-10-15T01:00:00.000Z"); },
    };
    return { deps, definitions, versions, refiled };
}

/* ------------------------------------------------------------------ tests */

describe("Save to Forms creates a normal Forms Studio form", () => {
    it("files it in the chosen folder, From document, as a draft — never published", async () => {
        const studio = authoredStudioSchema();
        const f = fakeDeps(caseMetadata(studio));
        const result = await createFormFromCaseDraft(f.deps, { orgId: "org-1", caseId: "case-1", folderId: "enrollment_2026_2027" });
        expect(result).toMatchObject({ ok: true, alreadyCreated: false, formName: "2026–27 Admissions" });
        const def = f.definitions[0]!;
        expect(def.metadata).toMatchObject({ origin: "document", admin_category: "enrollment_2026_2027", source_case_id: "case-1", source_document_id: "doc-1" });

        const libraryRow = { name: def.name, metadata: def.metadata, has_published_version: false };
        expect(formOrigin(libraryRow)).toBe("generated");
        expect(formPublishStatus(libraryRow)).toBe("draft");
        expect(formMatchesStudioFolder(libraryRow, "enrollment_2026_2027")).toBe(true);
        expect(formMatchesStudioFolder(libraryRow, "generated")).toBe(true);
        expect(formMatchesStudioFolder(libraryRow, "manual")).toBe(false);
    });

    it("saves the Studio form exactly — fields, mappings, conditions, groups, address, layout, requiredness, calculations", async () => {
        const studio = authoredStudioSchema();
        const f = fakeDeps(caseMetadata(studio));
        await createFormFromCaseDraft(f.deps, { orgId: "org-1", caseId: "case-1", folderId: "x" });
        expect(JSON.stringify(f.versions[0]!.schemaJson)).toBe(JSON.stringify(studio));
        const saved = f.versions[0]!.schemaJson as FormSchemaV1;
        expect(saved.fields.find((x) => x.id === "age")!.derived).toEqual({ kind: "age_from_date_of_birth", source_key: "dob", as_of_key: "start" });
        expect(saved.fields.find((x) => x.id === "siblings_list")!.visibility).toBeTruthy();
        expect(saved.fields.some((x) => (x as { collection_binding?: unknown }).collection_binding)).toBe(true);
        expect(saved.fields.some((x) => (x as { address_binding?: unknown }).address_binding)).toBe(true);
    });

    it("saving again is the same form — no duplicate; a changed folder re-files it", async () => {
        const f = fakeDeps(caseMetadata(authoredStudioSchema()));
        const first = await createFormFromCaseDraft(f.deps, { orgId: "org-1", caseId: "case-1", folderId: "a_folder" });
        const again = await createFormFromCaseDraft(f.deps, { orgId: "org-1", caseId: "case-1", folderId: "a_folder" });
        const moved = await createFormFromCaseDraft(f.deps, { orgId: "org-1", caseId: "case-1", folderId: "b_folder" });
        expect(f.definitions).toHaveLength(1);
        expect(f.versions).toHaveLength(1);
        if (!first.ok || !again.ok || !moved.ok) throw new Error("expected ok");
        expect(again.formId).toBe(first.formId);
        expect(again.alreadyCreated).toBe(true);
        expect(moved.formId).toBe(first.formId);
        expect(f.definitions[0]!.metadata.admin_category).toBe("b_folder");
    });

    it("without a folder it is still a From-document draft, findable under Generated from documents", async () => {
        const f = fakeDeps(caseMetadata(authoredStudioSchema()));
        await createFormFromCaseDraft(f.deps, { orgId: "org-1", caseId: "case-1" });
        expect(f.definitions[0]!.metadata.admin_category).toBeUndefined();
        expect(formMatchesStudioFolder({ metadata: f.definitions[0]!.metadata }, "generated")).toBe(true);
    });
});

describe("provenance of forms already created from documents", () => {
    it("a form created before this change (source_case_id, no origin) reads From document, not Manual", () => {
        const legacy = { metadata: { source: "document_form_draft", source_case_id: "case-0", source_document_id: "doc-0" } };
        expect(formOrigin(legacy)).toBe("generated");
        expect(formOrigin({ metadata: { origin: "blank" } })).toBe("manual");
    });
});

describe("folder persistence contract", () => {
    it("accepts a well-formed list and refuses ids, names and scopes it cannot trust", () => {
        const ok = parseProcessingFolderList([{ id: "enrollment_2026_2027", label: "2026–2027 Enrollment", scopes: ["form", "work", "category"], order: 50, isSystem: false }]);
        expect(ok.ok).toBe(true);
        expect(parseProcessingFolderList([{ id: "Bad Id", label: "x", scopes: ["form"], order: 1, isSystem: false }]).ok).toBe(false);
        expect(parseProcessingFolderList([{ id: "a", label: "", scopes: ["form"], order: 1, isSystem: false }]).ok).toBe(false);
        expect(parseProcessingFolderList([{ id: "a", label: "A", scopes: ["nope"], order: 1, isSystem: false }]).ok).toBe(false);
        expect(parseProcessingFolderList([{ id: "a", label: "A", scopes: ["form"], order: 1, isSystem: false }, { id: "a", label: "B", scopes: ["form"], order: 2, isSystem: false }]).ok).toBe(false);
        expect(parseProcessingFolderList("nope").ok).toBe(false);
    });
});

describe("/api/admin/processing/folders — the organisation's folders", () => {
    type Row = { org_id: string; metadata: Record<string, unknown> };
    let rows: Row[];
    const client = () => ({
        from: () => {
            let orgId = "";
            const b: Record<string, unknown> = {
                select: () => b,
                eq: (_c: string, v: string) => { orgId = v; return b; },
                maybeSingle: async () => ({ data: rows.find((r) => r.org_id === orgId) ?? null, error: null }),
                upsert: async (row: Row) => {
                    const i = rows.findIndex((r) => r.org_id === row.org_id);
                    if (i >= 0) rows[i] = row; else rows.push(row);
                    return { error: null };
                },
            };
            return b;
        },
    });
    const author = { ok: true, orgId: "org-A", capabilities: new Set(["forms.author"]), permissionKeys: ["forms.author"] };
    const patch = (folders: unknown) => PATCH(new NextRequest("http://x/api/admin/processing/folders", { method: "PATCH", body: JSON.stringify({ folders }) }));
    const folder = { id: "enrollment_2026_2027", label: "2026–2027 Enrollment", scopes: ["form", "work", "category"], order: 50, isSystem: false };

    beforeEach(() => {
        rows = [{ org_id: "org-A", metadata: { timezone: "America/Los_Angeles" } }, { org_id: "org-B", metadata: {} }];
        mockClient.mockImplementation(client);
    });
    afterEach(() => vi.clearAllMocks());

    it("a Forms author saves folders on their own organisation, without touching other settings", async () => {
        mockCtx.mockResolvedValue(author);
        const res = await patch([folder]);
        expect(res.status, await res.clone().text()).toBe(200);
        const a = rows.find((r) => r.org_id === "org-A")!;
        expect(a.metadata.timezone).toBe("America/Los_Angeles");
        expect((a.metadata.processing_folders as { folders: unknown[] }).folders).toHaveLength(1);
        expect(rows.find((r) => r.org_id === "org-B")!.metadata.processing_folders).toBeUndefined();
        const got = await (await GET()).json();
        expect(got.data.folders.map((f: { label: string }) => f.label)).toEqual(["2026–2027 Enrollment"]);
    });

    it("another organisation never sees them", async () => {
        mockCtx.mockResolvedValue(author);
        await patch([folder]);
        mockCtx.mockResolvedValue({ ...author, orgId: "org-B" });
        expect((await (await GET()).json()).data.folders).toBeNull();
    });

    it("someone without Forms authoring cannot create folders", async () => {
        mockCtx.mockResolvedValue({ ok: true, orgId: "org-A", capabilities: new Set(), permissionKeys: [] });
        const res = await patch([folder]);
        expect(res.status).toBe(403);
        expect(rows.find((r) => r.org_id === "org-A")!.metadata.processing_folders).toBeUndefined();
    });

    it("refuses a malformed list", async () => {
        mockCtx.mockResolvedValue(author);
        expect((await patch([{ id: "BAD", label: "" }])).status).toBe(400);
    });
});
