import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import ProcessingFormCanvas from "@/app/adminV2/pos/ProcessingFormCanvas";
import { isDocumentPlumbingField, plumbingWarning } from "@/lib/pos/formDraft/documentPlumbingFields";
import { buildFormDraftFromStructure } from "@/lib/pos/processingCase/formDraft/buildFormDraftFromStructure";
import type { FormSchemaV1 } from "@/lib/forms/schema";

const web = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf8");

const schema: FormSchemaV1 = {
    schema_version: 1,
    title: "Packet",
    sections: [{ id: "s1", title: "Child", field_ids: ["a", "b", "c", "d", "e"] }],
    fields: [
        { id: "a", type: "text", label: "Mapped field", required: true },
        { id: "b", type: "text", label: "Unplaced field", required: false },
        { id: "c", type: "text", label: "Proposed field", required: false },
        { id: "d", type: "text", label: "Form-only field", required: false },
        { id: "e", type: "text", label: "Derived field", required: false },
    ],
} as unknown as FormSchemaV1;

const canvas = (show: boolean) =>
    renderToStaticMarkup(
        <ProcessingFormCanvas
            schema={schema}
            selectedFieldId={null}
            selectedSectionId={null}
            editable
            onSelectField={() => {}}
            onSelectSection={() => {}}
            onAddQuestion={() => {}}
            onAddSection={() => {}}
            mapping={{
                show,
                byFieldId: new Map([
                    ["a", "mapped"],
                    ["b", "needs_mapping"],
                    ["c", "suggested"],
                    ["d", "form_only"],
                    ["e", "derived"],
                ]),
            }}
        />,
    );

describe("the mapping overlay uses the established Alloy tokens", () => {
    const html = canvas(true);

    it("signals a settled mapping with Bend Pine, the product's own success accent", () => {
        expect(html).toContain("border-l-alloy-bend-pine/70");
        expect(html).toContain("text-alloy-bend-pine");
    });

    it("signals needs-mapping with the ember/error token", () => {
        expect(html).toContain("border-l-alloy-ember/70");
        expect(html).toContain("text-alloy-ember");
    });

    it("never uses midnight as a mapping signal — it read as black and said nothing", () => {
        const stateColours = (web("app/adminV2/pos/ProcessingFormCanvas.tsx").match(/const MAPPING_(EDGE|WORD|STATE_CHIP)[\s\S]*?\n};/g) ?? []).join("\n");
        expect(stateColours).not.toContain("alloy-midnight");
        expect(stateColours).not.toContain("alloy-forge");
        expect(stateColours).not.toContain("black");
    });

    it("gives a suggestion the palette's advisory colour rather than inventing one", () => {
        expect(html).toContain("alloy-gold");
    });

    it("keeps form-only neutral and shows a derived value as positive but secondary", () => {
        expect(html).toContain("text-alloy-muted");
        expect(html).toContain("text-alloy-bend-pine/70");
    });

    it("introduces no new green", () => {
        const source = web("app/adminV2/pos/ProcessingFormCanvas.tsx");
        for (const invented of ["emerald", "green-5", "lime", "teal", "#0f0", "#00ff"]) {
            expect(source.toLowerCase(), invented).not.toContain(invented);
        }
    });
});

describe("Show mapping off gives a clean form", () => {
    const off = canvas(false);

    it("shows no mapping colour and no mapping word", () => {
        expect(off).not.toContain("border-l-alloy-bend-pine/70");
        expect(off).not.toContain("Needs mapping");
        expect(off).not.toContain("Kept with the form");
        expect(off).not.toContain('data-testid="form-canvas-mapping-a"');
    });

    it("still shows the form itself, requiredness included", () => {
        expect(off).toContain("Mapped field");
        expect(off).toContain("Required");
        expect(off).toContain("Optional");
    });
});

describe("View original is centred and uncropped", () => {
    const source = web("app/adminV2/pos/ProcessingImportedFormStudio.tsx");

    it("centres the viewer instead of pinning it to the right edge", () => {
        const drawer = source.slice(source.indexOf('data-qa-original-drawer'));
        const shell = source.slice(source.indexOf("fixed inset-0 z-50"), source.indexOf('data-qa-original-close'));
        expect(shell).toContain("items-center");
        expect(shell).toContain("justify-center");
        // The old right-hand rail is gone.
        expect(shell).not.toContain("max-w-xl");
        expect(drawer.length).toBeGreaterThan(0);
    });

    it("gives the document room, and lets it scroll at its own proportions", () => {
        const start = source.indexOf("fixed inset-0 z-50");
        const shell = source.slice(start, start + 1200);
        expect(shell).toContain("max-w-5xl");
        expect(shell).toContain("h-full");
        expect(source).toContain('className="min-h-0 w-full flex-1 border-0 bg-white"');
    });

    it("never lets the dismiss layer cover the document", () => {
        // The click-outside target sits behind the panel.
        expect(source).toContain("-z-10");
    });

    it("keeps the existing sandboxed preview untouched", () => {
        expect(source).toContain('sandbox=""');
        expect(source).toContain('referrerPolicy="no-referrer"');
        expect(source).toContain("src={sourcePreviewUrl}");
        expect(source).not.toContain("srcDoc");
    });

    it("is an overlay, so the form keeps its selection and scroll position", () => {
        // Opening and closing only toggles state; the form is never unmounted or re-seeded.
        expect(source).toContain("setOriginalOpen(true)");
        expect(source).toContain("setOriginalOpen(false)");
        expect(source).not.toContain("router.push");
        expect(source).not.toContain("window.location");
    });
});

describe("a control the document never asked anyone about", () => {
    const plumbing = { label: "subject_line", confidence: "low", evidence: "hosted_form:contact:subject_line" };

    it("recognises an unlabelled control whose whole prompt is its own machine name", () => {
        expect(isDocumentPlumbingField(plumbing)).toBe(true);
    });

    it("keeps a control the reader found a real label for", () => {
        expect(isDocumentPlumbingField({ ...plumbing, confidence: "high" })).toBe(false);
    });

    it("keeps any prompt a person actually wrote", () => {
        expect(isDocumentPlumbingField({ ...plumbing, label: "Subject line" })).toBe(false);
        expect(isDocumentPlumbingField({ ...plumbing, label: "What is the subject?" })).toBe(false);
    });

    it("keeps a snake_case label that is NOT the control's own name", () => {
        expect(isDocumentPlumbingField({ ...plumbing, evidence: "hosted_form:contact:message_body" })).toBe(false);
    });

    it("leaves non-hosted sources alone entirely", () => {
        expect(isDocumentPlumbingField({ ...plumbing, evidence: "pdf_field" })).toBe(false);
    });

    it("says what it left out rather than dropping it in silence", () => {
        expect(plumbingWarning(["subject_line"])).toContain("Left out of the form: subject_line");
        expect(plumbingWarning([])).toBeNull();
    });
});

describe("an imported document carries no subject_line", () => {
    const draft = buildFormDraftFromStructure({
        sourceDocumentId: "doc-1",
        extractedTextAvailable: true,
        extractedText: "Contact",
        structure: {
            sections: [
                {
                    title: "Contact",
                    confidence: "high",
                    fields: [
                        { label: "Child's Date of Birth", suggested_type: "date", required: true, confidence: "high", evidence: "hosted_form:form:dob" },
                        { label: "subject_line", suggested_type: "text", required: false, confidence: "low", evidence: "hosted_form:form:subject_line" },
                        { label: "Parent email", suggested_type: "text", required: true, confidence: "high", evidence: "hosted_form:form:parent_email" },
                    ],
                },
            ],
            warnings: [],
        } as never,
    } as never);

    it("does not put the page's plumbing on the form", () => {
        expect(draft.fields.some((f) => f.label === "subject_line")).toBe(false);
    });

    it("keeps every question the document actually asks", () => {
        expect(draft.fields.map((f) => f.label)).toEqual(["Child's Date of Birth", "Parent email"]);
    });

    it("renumbers cleanly, so the remaining fields are still a coherent form", () => {
        expect(draft.fields.map((f) => f.id)).toEqual(["field_1", "field_2"]);
        expect(draft.sections[0]!.field_ids).toEqual(["field_1", "field_2"]);
    });

    it("tells the operator what it left out", () => {
        expect(draft.warnings.join(" ")).toContain("subject_line");
    });

    it("solves it at the source, not by hiding it in the UI", () => {
        const studio = web("app/adminV2/pos/ProcessingImportedFormStudio.tsx");
        const canvasSource = web("app/adminV2/pos/ProcessingFormCanvas.tsx");
        expect(studio).not.toContain("subject_line");
        expect(canvasSource).not.toContain("subject_line");
    });
});

describe("manually authored forms are untouched", () => {
    it("filters nothing out of a hand-built form, because the rule lives in the document importer", () => {
        // The predicate is only consulted by buildFormDraftFromStructure — the document-derived path.
        const manual = web("lib/pos/processingCase/formDraft/buildManualFormDraft.ts");
        expect(manual).not.toContain("isDocumentPlumbingField");
        const builder = web("lib/pos/processingCase/formDraft/buildFormDraftFromStructure.ts");
        expect(builder).toContain("isDocumentPlumbingField");
    });

    it("leaves every system field the Studio library offers in place", () => {
        const library = web("lib/forms/processingFormFieldLibrary.ts");
        expect(library).not.toContain("isDocumentPlumbingField");
    });
});
