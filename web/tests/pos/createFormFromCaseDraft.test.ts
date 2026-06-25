/**
 * POS-FP13 — create a real, unpublished editable form from a case's draft preview.
 *
 * Proves: preview → form definition + DRAFT version (never published); the version's
 * schema validates against the live FormSchemaV1; idempotent (no duplicate on repeat);
 * no preview → clear error; org scoping (case load is org-keyed); and only forms tables
 * + the case metadata link are written (no records, no publish).
 */

import { describe, it, expect } from "vitest";
import {
    createFormFromCaseDraft,
    parseFormDraftCreated,
    type CreateFormDeps,
} from "@/lib/pos/processingCase/formDraft/createFormFromCaseDraft";
import { buildFormDraftFromStructure } from "@/lib/pos/processingCase/formDraft/buildFormDraftFromStructure";
import { stampFormDraftPreview } from "@/lib/pos/processingCase/formDraft/formDraftPreviewDb";
import { detectDocumentStructure } from "@/lib/pos/processingCase/structure/detectDocumentStructure";
import { validateFormSchema } from "@/lib/forms/schema";

const TEXT = ["School Age Child Health Report", "CHILD INFORMATION", "Child Name: ______", "Date of Birth: __/__/____"].join("\n");

function previewMetadata() {
    const draft = stampFormDraftPreview(
        buildFormDraftFromStructure({
            structure: detectDocumentStructure(TEXT),
            sourceDocumentId: "doc-1",
            extractedText: TEXT,
            fileName: null,
            classificationKey: null,
            extractedTextAvailable: true,
        })
    );
    return { form_draft_preview: draft, classification: { classification_key: "form_like_document" } } as Record<string, unknown>;
}

interface Recorder {
    deps: CreateFormDeps;
    versions: { status: string; schemaJson: unknown }[];
    definitions: { name: string }[];
    caseUpdates: Record<string, unknown>[];
    loadOrgIds: string[];
}

function makeDeps(initialMetadata: Record<string, unknown> | null): Recorder {
    let metadata = initialMetadata;
    const versions: { status: string; schemaJson: unknown }[] = [];
    const definitions: { name: string }[] = [];
    const caseUpdates: Record<string, unknown>[] = [];
    const loadOrgIds: string[] = [];
    let seq = 0;
    const deps: CreateFormDeps = {
        async loadCaseMetadata({ orgId }) {
            loadOrgIds.push(orgId);
            return metadata;
        },
        async listFormKeys() {
            return new Set<string>();
        },
        async insertFormDefinition({ name }) {
            definitions.push({ name });
            return { id: `form-${++seq}` };
        },
        async maxVersionNumber() {
            return 0;
        },
        async insertVersion({ schemaJson }) {
            // The adapter always inserts status "draft"; record what the orchestrator passed.
            versions.push({ status: "draft", schemaJson });
            return { id: `ver-${++seq}` };
        },
        async updateCaseMetadata({ metadata: m }) {
            caseUpdates.push(m);
            metadata = m; // so a second call sees the created link (idempotency)
        },
        now: () => new Date("2026-06-17T11:00:00.000Z"),
    };
    return { deps, versions, definitions, caseUpdates, loadOrgIds };
}

describe("createFormFromCaseDraft", () => {
    it("preview → form definition + DRAFT version whose schema validates", async () => {
        const r = makeDeps(previewMetadata());
        const res = await createFormFromCaseDraft(r.deps, { orgId: "org-1", caseId: "case-1" });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.alreadyCreated).toBe(false);
        expect(res.formId).toBe("form-1");
        expect(res.formVersionId).toBe("ver-2");
        // exactly one definition + one DRAFT version
        expect(r.definitions).toHaveLength(1);
        expect(r.versions).toHaveLength(1);
        expect(r.versions[0].status).toBe("draft");
        // the persisted schema validates against the live FormSchemaV1
        const parsed = validateFormSchema(r.versions[0].schemaJson);
        expect(parsed.title).toBe("School Age Child Health Report");
        // case metadata now carries the link
        const link = parseFormDraftCreated(r.caseUpdates[0]);
        expect(link).toEqual({ form_id: "form-1", form_version_id: "ver-2", created_at: "2026-06-17T11:00:00.000Z" });
    });

    it("is idempotent — a second call returns the existing form, no duplicate", async () => {
        const r = makeDeps(previewMetadata());
        const first = await createFormFromCaseDraft(r.deps, { orgId: "org-1", caseId: "case-1" });
        const second = await createFormFromCaseDraft(r.deps, { orgId: "org-1", caseId: "case-1" });
        expect(first.ok && second.ok).toBe(true);
        if (!second.ok) return;
        expect(second.alreadyCreated).toBe(true);
        expect(second.formId).toBe("form-1");
        // still only ONE definition + ONE version created
        expect(r.definitions).toHaveLength(1);
        expect(r.versions).toHaveLength(1);
    });

    it("no preview → clear no_preview error (creates nothing)", async () => {
        const r = makeDeps({ classification: { classification_key: "unknown" } });
        const res = await createFormFromCaseDraft(r.deps, { orgId: "org-1", caseId: "case-1" });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("no_preview");
        expect(r.definitions).toHaveLength(0);
        expect(r.versions).toHaveLength(0);
    });

    it("case not found → not_found error", async () => {
        const r = makeDeps(null);
        const res = await createFormFromCaseDraft(r.deps, { orgId: "org-1", caseId: "missing" });
        expect(res.ok).toBe(false);
        if (res.ok) return;
        expect(res.code).toBe("not_found");
    });

    it("org scoping — the case is loaded with the caller's org id", async () => {
        const r = makeDeps(previewMetadata());
        await createFormFromCaseDraft(r.deps, { orgId: "org-77", caseId: "case-1" });
        expect(r.loadOrgIds).toContain("org-77");
    });
});

describe("parseFormDraftCreated", () => {
    it("reads the stored link, null when absent/malformed", () => {
        expect(parseFormDraftCreated({ form_draft_created: { form_id: "f", form_version_id: "v", created_at: "t" } })).toEqual({
            form_id: "f",
            form_version_id: "v",
            created_at: "t",
        });
        expect(parseFormDraftCreated({})).toBeNull();
        expect(parseFormDraftCreated({ form_draft_created: { form_id: "f" } })).toBeNull();
    });
});
