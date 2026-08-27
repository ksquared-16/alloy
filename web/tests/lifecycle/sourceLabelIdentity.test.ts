/**
 * A source document's own name for a box is not a question, and must never reach a parent.
 *
 * The certification packet is imported from real PDFs, so the only string the importer has per
 * control is the AcroForm widget's internal name. `Var history`, `Prov Sp`, `DTP` and `Signature1`
 * are field labels for that reason alone — nobody chose them as words for a parent to read. The
 * separation cannot be made by looking at the string (`Polio` is ordinary English), so it is made
 * from the provenance Alloy already records in the version's mapping.
 */

import { describe, expect, it } from "vitest";

import { compileParticipantArtifact } from "@/lib/enrollment/participantRuntime/compileParticipantArtifact";
import {
    labelIsSourceFieldName,
    participantFacingLabel,
    sourceFieldNamesByFieldId,
} from "@/lib/enrollment/participantRuntime/sourceLabelIdentity";

describe("source-label provenance", () => {
    it("inverts the fidelity mapping to field id -> source widget name", () => {
        expect(
            sourceFieldNamesByFieldId({ acro_fields: { "Var history": { field_id: "field_24" }, DTP: { field_id: "f9" } } }),
        ).toEqual({ field_24: "Var history", f9: "DTP" });
    });

    it("recognises the importer's own transformations of a widget name", () => {
        expect(labelIsSourceFieldName("Var History", "Var history")).toBe(true);
        expect(labelIsSourceFieldName("Hep B", "HepB")).toBe(true);
        expect(labelIsSourceFieldName("Dtp", "DTP")).toBe(true);
        expect(labelIsSourceFieldName("Module Sp", "Module Sp")).toBe(true);
    });

    it("does not collapse two genuinely different strings", () => {
        expect(labelIsSourceFieldName("Do you consent to photographs?", "Photo")).toBe(false);
        expect(labelIsSourceFieldName("Polio booster", "Polio")).toBe(false);
        expect(labelIsSourceFieldName("", "Polio")).toBe(false);
    });

    it("returns null rather than the raw label when the label is the source's own name", () => {
        expect(participantFacingLabel("Var History", "Var history")).toBeNull();
        expect(participantFacingLabel("Do you consent?", "Photo")).toBe("Do you consent?");
        expect(participantFacingLabel("Parent Name", undefined)).toBe("Parent Name");
    });
});

describe("an acknowledgment is an affirmation, not any tickbox", () => {
    const schema = {
        fields: [
            { id: "field_24", type: "boolean", label: "Var History", required: false },
            { id: "ack", type: "boolean", label: "I have read the handbook", required: true },
        ],
    } as never;

    it("classifies an OPTIONAL unbound boolean as this artifact's own work", () => {
        const c = compileParticipantArtifact(schema, {});
        expect(c.acknowledgments.map((x) => x.field_id)).toEqual(["ack"]);
        expect(c.outstanding.map((x) => x.field_id)).toContain("field_24");
    });

    it("never hands a source widget name to the participant as a caption", () => {
        const c = compileParticipantArtifact(schema, {}, { acro_fields: { "Var history": { field_id: "field_24" } } });
        const varHistory = c.sections[0].controls.find((x) => x.field_id === "field_24");
        expect(varHistory?.label).toBe("Var History");
        expect(varHistory?.participant_label).toBeNull();
        expect(c.sections[0].controls.find((x) => x.field_id === "ack")?.participant_label).toBe(
            "I have read the handbook",
        );
    });
});

describe("a conversation cannot ask a question it has no words for", () => {
    it("projects no need for a control the source document named", async () => {
        const { projectEnrollmentInformationNeeds } = await import(
            "@/lib/enrollment/informationNeeds/projectEnrollmentInformationNeeds"
        );
        const form = {
            requirement_id: "r1",
            form_definition_id: "f1",
            form_definition_version_id: "v1",
            session_item_id: "s1",
            schema: {
                fields: [
                    { id: "field_24", type: "boolean", label: "Var History" },
                    { id: "field_40", type: "text", label: "Primary Physician Name" },
                ],
                sections: [],
            },
            pdfMapping: { acro_fields: { "Var history": { field_id: "field_24" } } },
        } as never;

        const needs = projectEnrollmentInformationNeeds({
            forms: [form],
            subjectId: null,
            sharedValues: {},
            confirmations: {} as never,
        });
        const labels = needs.flatMap((n) => n.occurrences.map((o) => o.label));
        // The school's own question survives; the PDF's name for a box is not asked out loud.
        expect(labels).toEqual(["Primary Physician Name"]);
    });
});
