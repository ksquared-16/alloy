import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import ProcessingSourceFormCanvas from "@/app/adminV2/pos/ProcessingSourceFormCanvas";
import type { StoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/types";

/**
 * The acceptance test for the canvas is recognition: an operator looking at this should see the form
 * they uploaded, not a report about it. So these assertions are about the PAGE — its headings in the
 * source's order, its instructions, its controls, its signature line — with the mapping sitting on each
 * field rather than in a column beside them.
 */

const draft = {
    title: "Admissions Packet",
    generated_form_name: "Admissions Packet",
    source_document_id: "doc-1",
    sections: [
        {
            id: "s1",
            title: "Child Information",
            confidence: "high",
            static_text: "Please complete every section in ink.",
            field_ids: ["name", "dob", "allergies", "describe", "addr1", "city", "state", "zip"],
        },
        {
            id: "s2",
            title: "Immunization Summary",
            confidence: "high",
            static_text: "Vaccine | Dose 1 | Dose 2 | Dose 3\nDTaP | 01/02 | 03/04 | 05/06\nMMR | 01/02 | 03/04 | 05/06",
            field_ids: ["signature"],
        },
    ],
    fields: [
        {
            id: "name",
            label: "Student Name",
            type: "text",
            required: true,
            confidence: "high",
            field_source: { entity_type: "customer_member", field_key: "full_name" },
            evidence: "Student Name: ______",
            page: 1,
        },
        {
            id: "dob",
            label: "Student Date of Birth",
            type: "date",
            required: true,
            confidence: "high",
            field_source: { entity_type: "customer_member", field_key: "date_of_birth" },
        },
        { id: "allergies", label: "Does the child have allergies?", type: "boolean", required: true, confidence: "high" },
        { id: "describe", label: "If yes, please describe", type: "text", required: false, confidence: "low" },
        { id: "addr1", label: "Home address line 1", type: "text", required: true, confidence: "high", field_source: { entity_type: "person", field_key: "address_line1" } },
        { id: "city", label: "City", type: "text", required: true, confidence: "high", field_source: { entity_type: "person", field_key: "city" } },
        { id: "state", label: "State", type: "text", required: true, confidence: "high", field_source: { entity_type: "person", field_key: "state" } },
        { id: "zip", label: "ZIP", type: "text", required: true, confidence: "high", field_source: { entity_type: "person", field_key: "postal_code" } },
        { id: "signature", label: "Parent signature", type: "signature", required: true, confidence: "high" },
    ],
    warnings: [],
    diagnostics: {},
    collections: [],
    generated_at: "2026-10-01T00:00:00Z",
    generator_version: "test",
} as unknown as StoredFormDraftPreview;

function render(over: Partial<React.ComponentProps<typeof ProcessingSourceFormCanvas>> = {}): string {
    return renderToStaticMarkup(
        <ProcessingSourceFormCanvas
            draft={draft}
            sourceDocumentName="Admissions_Packet.html"
            sourcePreviewUrl="/api/admin/documents/doc-1/source-preview"
            onOpenAdvanced={() => {}}
            onChangeMapping={async () => {}}
            onCreateFieldAndMap={async () => {}}
            {...over}
        />,
    );
}

describe("the uploaded form is the form the operator sees", () => {
    it("lays the page out as the document: its title, its sections, its instructions", () => {
        const html = render();
        expect(html).toContain("Admissions Packet");
        expect(html).toContain("Admissions_Packet.html");
        expect(html).toContain("Child Information");
        expect(html).toContain("Immunization Summary");
        expect(html).toContain("Please complete every section in ink.");
    });

    it("keeps the source's own order and wording for every label", () => {
        const html = render();
        const order = ["Student Name", "Student Date of Birth", "Does the child have allergies?", "Home address", "Parent signature"];
        let at = -1;
        for (const label of order) {
            const next = html.indexOf(label);
            expect(next, `${label} missing from the canvas`).toBeGreaterThan(-1);
            expect(next, `${label} out of source order`).toBeGreaterThan(at);
            at = next;
        }
    });

    it("draws a control shaped like the one the source declared", () => {
        const html = render();
        // A yes/no keeps its two choices; a signature keeps its line; neither becomes a generic row.
        expect(html).toContain("Yes");
        expect(html).toContain("No");
        expect(html).toContain("signature");
        expect(html).toContain("Required");
        expect(html).toContain("Optional");
    });

    it("renders the canvas by default, not the raw file and not a preview", () => {
        const html = render();
        expect(html).toContain('data-qa-canvas-mode="source"');
        expect(html).toContain('data-qa-source-canvas="true"');
        // The default view is the mapping canvas, so the iframe is not what loads first.
        expect(html).not.toContain("<iframe");
    });
});

describe("mapping is drawn on the field, not in a list beside it", () => {
    it("marks a settled field Mapped and an unplaceable one Needs mapping, in place", () => {
        const html = render();
        expect(html).toContain('data-qa-canvas-field="name"');
        expect(html).toContain('data-qa-mapping="known"');
        expect(html).toContain('data-qa-mapping="needs_review"');
        expect(html).toContain("✓ Mapped");
        expect(html).toContain("⚠ Needs mapping");
    });

    it("offers the fix on the unmapped field itself", () => {
        const html = render();
        expect(html).toContain('data-qa-map-it="describe"');
        expect(html).toContain("Map it");
    });

    it("lets the operator change a mapping Alloy was confident about", () => {
        const html = render();
        expect(html).toContain('data-qa-map-it="name"');
        expect(html).toContain("Change");
    });

    it("offers no inline fix when the surface is read-only", () => {
        const html = render({ onChangeMapping: undefined, onCreateFieldAndMap: undefined });
        expect(html).not.toContain("data-qa-map-it");
    });

    it("never shows the operator the engine's own vocabulary", () => {
        const html = render();
        for (const leak of [
            "entity_type",
            "field_key",
            "owner_hint",
            "collection_provider_ref",
            "customer_member",
            "requirement kind",
            "Analyze as one packet",
        ]) {
            expect(html, `leaked ${leak}`).not.toContain(leak);
        }
    });
});

describe("structures the source had are kept as themselves", () => {
    it("shows five postal lines as one address with one mapping state", () => {
        const html = render();
        expect(html).toContain('data-qa-canvas-address="addr1"');
        expect(html).toContain("Home address");
        // The lines are still visible inside the one concept, in postal order.
        expect(html).toContain("City");
        expect(html).toContain("ZIP");
        // ...and not as four more independently-mapped questions.
        expect(html).not.toContain('data-qa-canvas-field="city"');
    });

    it("nests a conditional follow-up under the question that triggers it", () => {
        const html = render();
        expect(html).toContain("only asked when the answer is Yes");
        // Nesting is visual: the follow-up is inside the trigger's own element.
        const trigger = html.indexOf('data-qa-canvas-field="allergies"');
        const follow = html.indexOf('data-qa-canvas-field="describe"');
        expect(trigger).toBeGreaterThan(-1);
        expect(follow).toBeGreaterThan(trigger);
    });

    it("warns about a grid it did not interpret instead of inventing a table", () => {
        const html = render();
        expect(html).toContain('data-qa-canvas-table-warning="s2"');
        expect(html).toContain("Table needs review");
    });

    it("keeps the document's own words available as source context", () => {
        expect(render()).toContain("Why is this here?");
    });
});

describe("the filters change emphasis, not the page", () => {
    it("offers all five, with counts", () => {
        const html = render();
        for (const id of ["all", "mapped", "needs", "suggested", "form_only"]) {
            expect(html).toContain(`data-qa-canvas-filter="${id}"`);
        }
    });

    it("leaves every field on the canvas, undimmed, before a filter is picked", () => {
        const html = render();
        expect(html).toContain('data-qa-dimmed="false"');
        expect(html).not.toContain('data-qa-dimmed="true"');
    });
});

describe("the source and the form are both reachable", () => {
    it("offers Source, Original and Form", () => {
        const html = render();
        expect(html).toContain('data-qa-canvas-mode="source"');
        expect(html).toContain('data-qa-canvas-mode="original"');
        expect(html).toContain('data-qa-canvas-mode="form"');
    });

    it("cannot open the original when the source has no safe preview", () => {
        const html = render({ sourcePreviewUrl: null });
        expect(html).toMatch(/data-qa-canvas-mode="original"[^>]*disabled/);
    });
});

describe("the source stays evidence, never executable application content", () => {
    const read = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf8");
    const canvas = read("app/adminV2/pos/ProcessingSourceFormCanvas.tsx");

    it("never injects the uploaded markup into the operator's own document", () => {
        // The canvas is drawn from the PARSED structure. A sanitiser here would be an XSS waiting to
        // happen in an admin session, so there is no path for source bytes into this DOM at all.
        expect(canvas).not.toContain("dangerouslySetInnerHTML");
        expect(canvas).not.toContain("innerHTML");
    });

    it("frames the original file with an empty sandbox and no referrer", () => {
        expect(canvas).toContain('sandbox=""');
        expect(canvas).toContain('referrerPolicy="no-referrer"');
    });

    it("renders the original only through the server's own sandboxed route", () => {
        // The only src is the prop the pane fills from /api/admin/documents/<id>/source-preview.
        expect(canvas).toMatch(/src=\{sourcePreviewUrl\}/);
        expect(canvas).not.toContain("srcDoc");
    });

    it("has replaced the question-card landing rather than restyling it", () => {
        expect(existsSync(join(__dirname, "..", "..", "app/adminV2/pos/ProcessingFormMappingReview.tsx"))).toBe(false);
    });
});

describe("the Form view is a real preview", () => {
    const canvas = readFileSync(join(__dirname, "..", "..", "app/adminV2/pos/ProcessingSourceFormCanvas.tsx"), "utf8");

    it("renders through the engine families actually submit through, not a second description", () => {
        expect(canvas).toContain("FormEngineRenderer");
        expect(canvas).toContain('mode="readonly"');
        expect(canvas).toContain("draftFormToFormSchemaV1");
    });
});
