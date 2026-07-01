/**
 * POS-FP11.2 — marker-LESS structure detection for real PDF text.
 *
 * unpdf (text-only, no OCR) STRIPS the visual markers government/childcare forms rely on:
 * the colon, the underscore blank, and the checkbox glyph are drawn widgets, not text.
 * So an AcroForm like the Missouri MO500 "School Age Child Health Report" extracts as
 * BARE label lines and multi-column label rows separated by wide whitespace gaps — which
 * the marker-only detector returned 0 fields for. These fixtures use that realistic
 * marker-less shape (no colons / underscores / checkbox glyphs) and prove we now produce
 * a useful draft, with honest diagnostics, and WITHOUT inventing numbered child_1/2/3
 * fields.
 */

import { describe, it, expect } from "vitest";
import { detectDocumentStructure } from "@/lib/pos/processingCase/structure/detectDocumentStructure";

/** Realistic unpdf-style extraction of an MO500-style form: bare labels + column gaps. */
const MO500_MARKERLESS = [
    "Missouri Department of Health and Senior Services",
    "School Age Child Health Report",
    "Child Information",
    "Name of Child                 Date of Birth                 Sex",
    "Address                       City            State          Zip",
    "Parent/Guardian               Home Phone                     Work Phone",
    "School                        Grade           Teacher",
    "Health History",
    "Allergies",
    "Current Medications",
    "Physical Examination",
    "Height        Weight          Blood Pressure",
    "Vision        Hearing",
    "Immunizations",
    "Vaccine                       Date Administered",
    "Physician Name",
    "Physician Signature           Date",
    "This report must be completed by a licensed health care provider.",
].join("\n");

function allFields(text: string) {
    return detectDocumentStructure(text).sections.flatMap((s) => s.fields);
}
function labelSet(text: string) {
    return new Set(allFields(text).map((f) => f.label.toLowerCase()));
}

describe("marker-less MO500 → useful draft (was 0 fields)", () => {
    const r = detectDocumentStructure(MO500_MARKERLESS);
    const fields = r.sections.flatMap((s) => s.fields);
    const labels = labelSet(MO500_MARKERLESS);

    it("produces multiple sections and many fields from bare labels + column gaps", () => {
        expect(r.sections.length).toBeGreaterThanOrEqual(3);
        expect(fields.length).toBeGreaterThanOrEqual(15);
    });

    it("recognizes the real section headers (mixed case, no markers)", () => {
        const titles = r.sections.map((s) => s.title);
        expect(titles).toContain("Child Information");
        expect(titles).toContain("Health History");
        expect(titles).toContain("Physical Examination");
    });

    it("captures core fields with sensible types", () => {
        expect(labels.has("name of child")).toBe(true);
        expect(labels.has("date of birth")).toBe(true);
        expect(labels.has("address")).toBe(true);
        expect(labels.has("home phone")).toBe(true);
        const byLabel = Object.fromEntries(fields.map((f) => [f.label.toLowerCase(), f]));
        expect(byLabel["date of birth"].suggested_type).toBe("date");
        expect(byLabel["date administered"].suggested_type).toBe("date");
        expect(fields.some((f) => f.suggested_type === "signature")).toBe(true);
    });

    it("splits multi-column label rows into separate fields", () => {
        // "Address  City  State  Zip" → four distinct fields.
        expect(labels.has("city")).toBe(true);
        expect(labels.has("state")).toBe(true);
        expect(labels.has("zip")).toBe(true);
    });

    it("does NOT turn the document title / instructions into fields", () => {
        expect(labels.has("school age child health report")).toBe(false);
        expect([...labels].some((l) => /licensed health care provider/.test(l))).toBe(false);
    });

    it("never invents numbered child_1 / child_2 style fields", () => {
        for (const f of fields) {
            expect(f.label).not.toMatch(/_\d+$/);
            expect(f.label.toLowerCase()).not.toMatch(/child[\s_]*\d/);
        }
    });
});

describe("detection diagnostics explain the outcome", () => {
    it("populates counts, section headers, confidence summary, and rejected examples", () => {
        const d = detectDocumentStructure(MO500_MARKERLESS).diagnostics!;
        expect(d.text_length).toBeGreaterThan(0);
        expect(d.line_count).toBeGreaterThan(0);
        expect(d.candidate_labels).toBeGreaterThanOrEqual(15);
        expect(d.section_headers).toContain("Child Information");
        expect(d.confidence_summary.high + d.confidence_summary.medium + d.confidence_summary.low).toBe(
            d.candidate_labels
        );
        // The title line should appear as a rejected example with a reason.
        expect(d.rejected_examples.some((r) => /school age child health report/i.test(r.text))).toBe(true);
    });

    it("zero-field documents still get diagnostics + an explanatory warning (no dead-end)", () => {
        const r = detectDocumentStructure("This is a plain paragraph of narrative prose with no labelled prompts at all.");
        expect(r.sections).toEqual([]);
        expect(r.diagnostics!.candidate_labels).toBe(0);
        expect(r.warnings.some((w) => /no labelled fields/i.test(w))).toBe(true);
    });
});

describe("single bare labels via lexicon (no colon/underscore)", () => {
    it("emits a field for a known label phrase on its own line", () => {
        const labels = labelSet("Patient Information\nDate of Birth\nPhysician Name");
        expect(labels.has("date of birth")).toBe(true);
        expect(labels.has("physician name")).toBe(true);
    });

    it("a lone choice prompt is not double-emitted as a text field", () => {
        // "Up to date" is the prompt for the following Yes/No — it should be one checkbox field.
        const fields = allFields("Up to date\n☐ Yes ☐ No");
        const upToDate = fields.filter((f) => /up to date/i.test(f.label));
        expect(upToDate).toHaveLength(1);
        expect(upToDate[0].suggested_type).toBe("checkbox");
    });
});
