/**
 * A date has ONE stored value and MORE THAN ONE rendering.
 *
 * The defect: a canonical date is stored `2021-03-14`, and the fidelity mapping passed values
 * straight through, so a parent's enrollment paperwork printed the database's serialization — on the
 * Firefly form, at all three destinations the same fact reaches.
 *
 * The fix is a presentation seam at the DESTINATION, not a Participant Runtime date doctrine. These
 * controls hold the four properties that makes it safe:
 *
 *   1. canonical storage is unchanged
 *   2. the conversation keeps using Alloy's human display helper
 *   3. document rendering is destination/mapping behaviour, declarable per destination
 *   4. the same semantic date may print differently in the two places WITHOUT forking into two values
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import {
    DEFAULT_DOCUMENT_DATE_FORMAT,
    formatValueForDocumentDestination,
} from "@/lib/forms/pdf/documentDestinationDate";
import { fidelityFieldValues, parseFidelityPdfMapping } from "@/lib/forms/pdf/fidelityMappingContract";
import { displayValue } from "@/lib/enrollment/participantRuntime/participantTurnPresentation";

const source = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/** The stored canonical value. Nothing in this file may change it. */
const STORED = "2021-03-14";

/** The Firefly shape: one schema field printed at three document destinations. */
function mappingWith(dateFormats: Partial<Record<string, string>> = {}) {
    // Non-null by construction: a fixture that stopped parsing is a defect in the fixture, and
    // failing here names it immediately rather than through a downstream type error.
    const parsed = parseFidelityPdfMapping({
        engine: "fidelity_v1",
        template_key: "firefly_enrollment_fixture_v1",
        source_sha256: "a".repeat(64),
        acro_fields: {
            child_full_name: { field_id: "f_name" },
            child_dob: { field_id: "f_dob", ...(dateFormats.child_dob ? { date_format: dateFormats.child_dob } : {}) },
            child_dob_pickup: { field_id: "f_dob", ...(dateFormats.child_dob_pickup ? { date_format: dateFormats.child_dob_pickup } : {}) },
            child_dob_medical: { field_id: "f_dob", ...(dateFormats.child_dob_medical ? { date_format: dateFormats.child_dob_medical } : {}) },
        },
        signature_placements: [],
    });
    if (!parsed) throw new Error("fixture mapping failed to parse");
    return parsed;
}

describe("the destination decides how a date prints", () => {
    it("does not print the storage serialization by default", () => {
        // The whole defect in one assertion.
        expect(DEFAULT_DOCUMENT_DATE_FORMAT).not.toBe("iso");
        expect(formatValueForDocumentDestination(STORED)).toBe("03/14/2021");
    });

    it("prints ISO only where the destination explicitly asks for it", () => {
        // ISO on paperwork becomes a declared choice rather than an accident of storage.
        expect(formatValueForDocumentDestination(STORED, "iso")).toBe(STORED);
    });

    it("honours the other declared shapes", () => {
        expect(formatValueForDocumentDestination(STORED, "mm-dd-yyyy")).toBe("03-14-2021");
        expect(formatValueForDocumentDestination(STORED, "long")).toBe("Mar 14, 2021");
    });

    it("touches only stored dates — never other values", () => {
        for (const untouched of ["Marisol Vega", "Peanuts, melon", "555-0134", "", "March 14, 2021", "2021"]) {
            expect(formatValueForDocumentDestination(untouched)).toBe(untouched);
        }
        expect(formatValueForDocumentDestination(true)).toBe(true);
        expect(formatValueForDocumentDestination(42)).toBe(42);
    });

    it("does not shift a date-only value across a timezone", () => {
        // A birthday has no timezone. Formatting it locally is how the 1st prints as the 31st.
        expect(formatValueForDocumentDestination("2021-01-01")).toBe("01/01/2021");
        expect(formatValueForDocumentDestination("2021-12-31")).toBe("12/31/2021");
    });
});

describe("one value, every destination", () => {
    it("formats every destination of the same fact identically", () => {
        const out = fidelityFieldValues(mappingWith(), { f_name: "Marisol Vega", f_dob: STORED });
        expect(out.child_dob).toBe("03/14/2021");
        expect(out.child_dob_pickup).toBe("03/14/2021");
        expect(out.child_dob_medical).toBe("03/14/2021");
        // The fan-out is the product value; it must not become a fan-out of DIFFERENT renderings.
        expect(new Set([out.child_dob, out.child_dob_pickup, out.child_dob_medical]).size).toBe(1);
    });

    it("lets two destinations of the SAME fact print differently when each declares it", () => {
        // Still one value. A school form's line and a machine-read field can legitimately disagree
        // about shape — that is presentation, and it is why the format lives on the destination.
        const out = fidelityFieldValues(mappingWith({ child_dob_medical: "iso", child_dob_pickup: "long" }), {
            f_dob: STORED,
        });
        expect(out.child_dob).toBe("03/14/2021");
        expect(out.child_dob_pickup).toBe("Mar 14, 2021");
        expect(out.child_dob_medical).toBe(STORED);
    });

    it("leaves a non-date destination alone", () => {
        const out = fidelityFieldValues(mappingWith(), { f_name: "Marisol Vega", f_dob: STORED });
        expect(out.child_full_name).toBe("Marisol Vega");
    });
});

describe("presentation differs; truth does not fork", () => {
    it("renders ONE stored value as a parent's sentence and as paperwork, differently", () => {
        const conversation = displayValue(STORED);
        const document = fidelityFieldValues(mappingWith(), { f_dob: STORED }).child_dob;

        // Alloy's human display doctrine in the conversation…
        expect(conversation).toBe("Mar 14, 2021");
        // …the destination's shape on the paperwork…
        expect(document).toBe("03/14/2021");
        // …and they are deliberately not the same string.
        expect(conversation).not.toBe(document);

        // THE POINT: neither is stored, and the stored value is what it always was.
        expect(STORED).toBe("2021-03-14");
        expect(conversation).not.toBe(STORED);
        expect(document).not.toBe(STORED);
    });

    it("is a pure read — formatting cannot mutate the value it was given", () => {
        const values = { f_dob: STORED };
        fidelityFieldValues(mappingWith(), values);
        expect(values.f_dob).toBe(STORED);
    });
});

describe("the seam is in one place, and the doctrines stay apart", () => {
    it("the live render and the SIGNED copy format through the same seam", () => {
        /**
         * A parent who reviewed `03/14/2021` must not sign a copy that says `2021-03-14`. Both
         * paths go through `fidelityFieldValues`, which is where the formatting now happens — so
         * they cannot drift by construction.
         */
        for (const rel of [
            "lib/enrollment/participantRuntime/renderParticipantEnrollmentDocument.ts",
            "lib/forms/pdf/persistSignedEnrollmentArtifact.ts",
        ]) {
            /*
             * Whitespace-insensitive on purpose.
             *
             * The literal `fidelityFieldValues(mapping,` broke the moment either call site gained a
             * third argument and wrapped across lines — a formatting change, not a drift. What the
             * guard is for is that BOTH paths still go through this one seam.
             */
            expect(source(rel).replace(/\s+/g, " "), rel).toContain("fidelityFieldValues( mapping,");
        }
        // And neither formats dates itself.
        for (const rel of [
            "lib/enrollment/participantRuntime/renderParticipantEnrollmentDocument.ts",
            "lib/forms/pdf/persistSignedEnrollmentArtifact.ts",
        ]) {
            expect(source(rel), rel).not.toContain("formatValueForDocumentDestination");
        }
    });

    it("Participant Runtime does not import the document formatter", () => {
        // The conversation uses `formatDisplayDate`; the document uses the destination format. A
        // Participant Runtime file reaching for the document formatter would be the second doctrine
        // this fix exists to avoid.
        const presentation = source("lib/enrollment/participantRuntime/participantTurnPresentation.ts");
        expect(presentation).not.toContain("documentDestinationDate");
        expect(presentation).toContain("presentationDateFormat");
    });

    it("borrows the platform date parser rather than adding a second one", () => {
        const mod = source("lib/forms/pdf/documentDestinationDate.ts");
        expect(mod).toContain("parsePresentationDateInput");
        expect(mod).not.toContain("new Date(");
    });

    it("declares the format on the destination, where the mapping already carries presentation", () => {
        const withFormat = parseFidelityPdfMapping({
            engine: "fidelity_v1",
            template_key: "firefly_enrollment_fixture_v1",
            source_sha256: "a".repeat(64),
            acro_fields: { child_dob: { field_id: "f_dob", date_format: "mm-dd-yyyy" } },
            signature_placements: [],
        });
        expect(withFormat?.acro_fields.child_dob.date_format).toBe("mm-dd-yyyy");

        // An unknown shape is refused rather than silently ignored.
        expect(
            parseFidelityPdfMapping({
                engine: "fidelity_v1",
                template_key: "firefly_enrollment_fixture_v1",
                source_sha256: "a".repeat(64),
                acro_fields: { child_dob: { field_id: "f_dob", date_format: "dd.mm.yy" } },
                signature_placements: [],
            }),
        ).toBeNull();
    });

    it("accepts a mapping authored before the contract existed", () => {
        // Backward compatibility is the reason the key is optional: every published version in
        // flight today has no `date_format`, and each must keep rendering.
        const legacy = mappingWith();
        expect(legacy.acro_fields.child_dob.date_format).toBeUndefined();
        expect(fidelityFieldValues(legacy, { f_dob: STORED }).child_dob).toBe("03/14/2021");
    });
});
