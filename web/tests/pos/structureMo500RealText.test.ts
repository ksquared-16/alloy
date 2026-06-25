/**
 * POS-FP11.3 — detection against the REAL MO500 extracted text (not a clean fixture).
 *
 * The actual MO500 "School Age Child Health Report" extracts via unpdf (text-only, no
 * OCR) as a sparse, near-newline-less ALL-CAPS blob (~1.5k chars). The previous detector
 * returned a single bogus field — the department masthead, mislabelled as a "signature"
 * because the word "signature" appeared somewhere on the same long line. These tests pin
 * the corrected behavior: the masthead is rejected, known childcare/health labels are
 * recovered from the blob, types are sane, and the result is honestly graded "weak"
 * (text-assisted, not exact PDF mapping).
 */

import { describe, it, expect } from "vitest";
import { detectDocumentStructure } from "@/lib/pos/processingCase/structure/detectDocumentStructure";

/** Faithful shape of the real MO500 extraction: one long ALL-CAPS run, headers + labels. */
const MO500_REAL_BLOB =
    "MISSOURI DEPARTMENT OF ELEMENTARY AND SECONDARY EDUCATION OFFICE OF CHILDHOOD - CHILD CARE COMPLIANCE " +
    "SCHOOL-AGE CHILD HEALTH REPORT " +
    "IDENTIFYING INFORMATION CHILD'S NAME BIRTHDATE " +
    "HEALTH STATEMENT (CHECK ONE) THE CHILD IS IN GOOD HEALTH AND MAY PARTICIPATE IN ALL ACTIVITIES " +
    "SPECIAL HEALTH OR MEDICAL REQUIREMENTS ALLERGIES MEDICATIONS " +
    "PARENT/GUARDIAN SIGNATURE DATE " +
    "THIS REPORT MUST BE COMPLETED BY A PARENT OR GUARDIAN. SEE INSTRUCTIONS ON REVERSE. PAGE 1 OF 1";

function fields(text: string) {
    return detectDocumentStructure(text).sections.flatMap((s) => s.fields);
}

describe("real MO500 blob — header rejected, labels recovered, honest grade", () => {
    const r = detectDocumentStructure(MO500_REAL_BLOB);
    const fs = r.sections.flatMap((s) => s.fields);
    const labels = fs.map((f) => f.label.toLowerCase());
    const byLabel = Object.fromEntries(fs.map((f) => [f.label.toLowerCase(), f]));

    it("does NOT turn the department masthead into a field", () => {
        expect(labels.some((l) => /department|missouri/.test(l))).toBe(false);
    });

    it("never infers a signature from a long agency header", () => {
        expect(fs.some((f) => f.suggested_type === "signature" && /department|missouri|education/i.test(f.label))).toBe(
            false
        );
    });

    it("records the rejected header in diagnostics", () => {
        expect(r.diagnostics!.rejected_headers.some((h) => /MISSOURI DEPARTMENT/i.test(h))).toBe(true);
    });

    it("recovers the real labels from the blob", () => {
        expect(labels).toContain("child's name");
        expect(byLabel["birthdate"]?.suggested_type).toBe("date");
        expect(labels).toContain("health statement");
        expect(labels).toContain("special health or medical requirements");
        const sig = byLabel["parent/guardian signature"];
        expect(sig?.suggested_type).toBe("signature");
        expect(fs.length).toBeGreaterThanOrEqual(4);
    });

    it("lists the detected known labels in diagnostics", () => {
        expect(r.diagnostics!.detected_known_labels).toContain("Child's Name");
        expect(r.diagnostics!.detected_known_labels).toContain("Parent/Guardian Signature");
    });

    it("grades the result 'weak' (sparse blob → text-assisted, not exact PDF mapping)", () => {
        expect(r.diagnostics!.quality).toBe("weak");
        expect(r.warnings.some((w) => /text-assisted draft|not exact pdf mapping/i.test(w))).toBe(true);
    });

    it("does not fabricate numbered child_1 / child_2 fields", () => {
        for (const f of fs) {
            expect(f.label).not.toMatch(/_\d+$/);
            expect(f.label.toLowerCase()).not.toMatch(/child[\s_]*\d/);
        }
    });
});

describe("signature guard is isolated to short signature lines", () => {
    it("a short 'X Signature' label is still a signature field", () => {
        const fs = fields("Parent/Guardian Signature: __________________");
        expect(fs.some((f) => f.suggested_type === "signature")).toBe(true);
    });

    it("a long header line containing the word 'signature' is not a signature field", () => {
        const fs = fields(
            "STATE DEPARTMENT OF EDUCATION REQUIRES A PARENT SIGNATURE BELOW BEFORE THIS FORM CAN BE PROCESSED"
        );
        expect(fs.some((f) => f.suggested_type === "signature")).toBe(false);
    });
});
