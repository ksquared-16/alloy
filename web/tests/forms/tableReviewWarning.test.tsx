import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import ProcessingImportedFormStudio from "@/app/adminV2/pos/ProcessingImportedFormStudio";
import {
    looksTabular,
    tableReviewNoticesFor,
    TABLE_REVIEW_NOTICE,
} from "@/lib/pos/formDraft/tabularSourceSections";
import { draftFormToFormSchemaV1 } from "@/lib/pos/processingCase/formDraft/draftFormToFormSchemaV1";
import { safeParseFormSchema } from "@/lib/forms/schema";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

const web = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf8");

const TABLE_TEXT = "Vaccine | Dose 1 | Dose 2 | Dose 3\nDTaP | 01/02 | 03/04 | 05/06\nMMR | 01/02 | 03/04 | 05/06";

const draft = {
    title: "Admissions Packet",
    generated_form_name: "Admissions Packet",
    source_document_id: "doc-1",
    sections: [
        { id: "s1", title: "Child Information", confidence: "high", static_text: "Please complete every section in ink.", field_ids: ["dob"] },
        { id: "s2", title: "Immunization Summary", confidence: "high", static_text: TABLE_TEXT, field_ids: ["sig"] },
    ],
    fields: [
        {
            id: "dob",
            label: "Child's Date of Birth",
            type: "date",
            required: true,
            confidence: "high",
            field_source: { entity_type: "child", field_key: "child_date_of_birth" },
        },
        { id: "sig", label: "Parent signature", type: "signature", required: true, confidence: "high" },
    ],
    warnings: [],
    diagnostics: {},
    collections: [],
    generated_at: "2026-10-02T00:00:00Z",
    generator_version: "test",
} as unknown as StoredFormDraftPreview;

const render = () =>
    renderToStaticMarkup(
        <ProcessingImportedFormStudio
            draft={draft}
            sourceDocumentName="Admissions_Packet.html"
            sourcePreviewUrl="/api/admin/documents/doc-1/source-preview"
            onSaveFieldEdits={async () => {}}
            onCreateFieldAndMap={async () => {}}
        />,
    );

describe("noticing a grid nobody interpreted", () => {
    it("reads a header row plus rows of instances as a table", () => {
        expect(looksTabular(TABLE_TEXT)).toBe(true);
        expect(looksTabular("Vaccine\tDose 1\tDose 2\nDTaP\t01/02\t03/04")).toBe(true);
        expect(looksTabular("Vaccine   Dose 1   Dose 2\nDTaP   01/02   03/04")).toBe(true);
    });

    it("leaves ordinary instructions alone", () => {
        expect(looksTabular("Please complete every section in ink.")).toBe(false);
    });

    it("does not call a single delimited line a table", () => {
        // A signature rule prints exactly like one table row and is not a table.
        expect(looksTabular("Name | Date | Signature")).toBe(false);
    });

    it("does not call two-column prose a table", () => {
        expect(looksTabular("Child name   Jane\nParent name   Alex")).toBe(false);
    });

    it("warns on the tabular section and only that section", () => {
        const notices = tableReviewNoticesFor(draft);
        expect(notices.get("s2")).toBe(TABLE_REVIEW_NOTICE);
        expect(notices.has("s1")).toBe(false);
    });

    it("says what Alloy did NOT do, so nothing reads as interpreted", () => {
        expect(TABLE_REVIEW_NOTICE).toContain("Table needs review");
        expect(TABLE_REVIEW_NOTICE).toContain("rather than guessing its columns");
    });
});

describe("the warning appears on the Studio form canvas", () => {
    const html = render();

    it("renders on the section, where the operator is already looking", () => {
        expect(html).toContain('data-canvas-section-notice="s2"');
        expect(html).toContain("Table needs review");
    });

    it("needs no Advanced extraction details to be seen", () => {
        expect(html).not.toContain("Advanced extraction details");
    });

    it("exposes no detector or extraction vocabulary", () => {
        for (const leak of ["looksTabular", "tableWarning", "static_text", "confidence", "disposition"]) {
            expect(html, `leaked ${leak}`).not.toContain(leak);
        }
    });

    it("leaves the original reachable as reference material for the flagged area", () => {
        // The existing mechanism, not a new viewer.
        expect(html).toContain('data-qa-view-original="true"');
    });
});

describe("the warning is not part of the mapping overlay", () => {
    const source = web("app/adminV2/pos/ProcessingFormCanvas.tsx");

    it("renders from its own prop, so the mapping toggle cannot hide it", () => {
        // `sectionNotices` is read directly; it is never gated on `mapping.show`.
        const noticeBlock = source.slice(source.indexOf("sectionNotices?.get(section.id)"));
        expect(noticeBlock.slice(0, 500)).not.toContain("mapping");
        expect(noticeBlock.slice(0, 500)).not.toContain("showMapping");
    });

    it("is not dimmed by an attention filter, because a filter only touches fields", () => {
        const noticeBlock = source.slice(source.indexOf("data-canvas-section-notice"));
        expect(noticeBlock.slice(0, 400)).not.toContain("dimmed");
        expect(noticeBlock.slice(0, 400)).not.toContain("opacity-40");
    });

    it("is computed from the draft's kept text, independent of mapping state", () => {
        const studio = web("app/adminV2/pos/ProcessingImportedFormStudio.tsx");
        expect(studio).toContain("tableReviewNoticesFor(draft)");
    });
});

describe("the warning invents nothing", () => {
    it("creates no field and no mapping for the flagged section", () => {
        const schema = safeParseFormSchema(draftFormToFormSchemaV1(draft));
        expect(schema.success).toBe(true);
        if (!schema.success) return;
        const section = schema.data.sections.find((s) => s.id === "s2")!;
        // The section ships exactly the questions the importer found — the signature, nothing more.
        const labels = section.field_ids.map((id) => schema.data.fields.find((f) => f.id === id)?.label);
        expect(labels).toContain("Parent signature");
        for (const cell of ["Vaccine", "Dose 1", "Dose 2", "DTaP", "MMR"]) {
            expect(schema.data.fields.some((f) => f.label === cell), `invented a field for ${cell}`).toBe(false);
        }
    });

    it("fabricates no table structure anywhere in the module", () => {
        const source = web("lib/pos/formDraft/tabularSourceSections.ts");
        for (const forbidden of ["columns:", "parseTable", "buildTable", "tableRows"]) {
            expect(source, `module builds ${forbidden}`).not.toContain(forbidden);
        }
    });

    it("produces only a string per section — there is nowhere for structure to hide", () => {
        const notices = tableReviewNoticesFor(draft);
        for (const value of notices.values()) expect(typeof value).toBe("string");
        expect(notices.size).toBe(1);
    });
});

describe("the retired surfaces stay retired", () => {
    it("reintroduces no question-card presenter", () => {
        for (const p of [
            "app/adminV2/pos/ProcessingSourceFormCanvas.tsx",
            "app/adminV2/pos/ProcessingFormMappingReview.tsx",
            "lib/pos/formDraft/buildOperatorFormView.ts",
            "lib/pos/formDraft/sourceCanvasFilters.ts",
        ]) {
            expect(existsSync(join(__dirname, "..", "..", p)), p).toBe(false);
        }
    });

    it("keeps the imported form on the shared Studio canvas and inspector", () => {
        const studio = web("app/adminV2/pos/ProcessingImportedFormStudio.tsx");
        expect(studio).toContain('from "./ProcessingFormCanvas"');
        expect(studio).toContain('from "./ProcessingFormQuestionInspector"');
    });
});
