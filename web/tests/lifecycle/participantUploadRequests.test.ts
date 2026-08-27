/**
 * An upload is participant work whose result is evidence — never a value box.
 *
 * Three certified upload responsibilities on the enrollment packet were REQUIRED, presented to
 * nobody, and refused the submission at the very end with "Required field missing". The parent
 * could complete and sign their paperwork and still not finish it.
 */

import { describe, expect, it } from "vitest";

import {
    outstandingUploadRequests,
    participantUploadRequests,
    uploadDestinationForField,
} from "@/lib/enrollment/participantRuntime/participantUploadRequests";

const schema = {
    fields: [
        { id: "name", type: "text", label: "Student Name" },
        {
            id: "upload_immunization",
            type: "file_ref",
            label: "Immunization record",
            required: true,
            description: "Oregon law requires proof of immunization or exemption.",
            document_type: "immunization_record",
        },
        // The Exemption's "I have attached the required document from (check one)" — no doc_type.
        { id: "upload_module", type: "file_ref", label: "The vaccine module certificate", required: true },
        { id: "upload_optional", type: "file_ref", label: "Anything else", required: false },
    ],
} as never;

describe("what this artifact asks the parent to bring", () => {
    it("finds every attachment in document order, with the school's own words", () => {
        const r = participantUploadRequests(schema);
        expect(r.map((x) => x.field_id)).toEqual(["upload_immunization", "upload_module", "upload_optional"]);
        expect(r[0]).toMatchObject({
            title: "Immunization record",
            required: true,
            docType: "immunization_record",
            description: "Oregon law requires proof of immunization or exemption.",
        });
    });

    it("files an unclassified attachment as an enrollment document rather than guessing", () => {
        // Filing a vaccine-module certificate as an immunization record would assert a different fact.
        expect(participantUploadRequests(schema)[1]).toMatchObject({
            docType: "enrollment_document",
            description: null,
        });
    });

    it("refuses a field that is not an upload on THIS artifact — the request selects nothing", () => {
        expect(uploadDestinationForField(schema, "upload_module")?.docType).toBe("enrollment_document");
        expect(uploadDestinationForField(schema, "name")).toBeNull();
        expect(uploadDestinationForField(schema, "not_a_field")).toBeNull();
    });

    it("counts an attachment satisfied only once a document id is on file", () => {
        expect(outstandingUploadRequests(schema, {}).length).toBe(3);
        const withOne = outstandingUploadRequests(schema, { upload_immunization: "3f2b9f0e-0000-4000-8000-000000000001" });
        expect(withOne.map((x) => x.field_id)).toEqual(["upload_module", "upload_optional"]);
        // A blank string is not a document.
        expect(outstandingUploadRequests(schema, { upload_immunization: "   " }).length).toBe(3);
    });

    it("does not manufacture a vaccine dose out of an attached record", () => {
        // The record is evidence the school must hold. Structured dose truth stays Health's.
        const r = participantUploadRequests(schema)[0];
        expect(Object.keys(r)).toEqual(["field_id", "title", "description", "required", "docType"]);
    });
});

describe("a document is brought, not typed", () => {
    it("is never raised as a conversational need", async () => {
        const { projectEnrollmentInformationNeeds } = await import(
            "@/lib/enrollment/informationNeeds/projectEnrollmentInformationNeeds"
        );
        const needs = projectEnrollmentInformationNeeds({
            forms: [
                {
                    requirement_id: "r1",
                    form_definition_id: "f1",
                    form_definition_version_id: "v1",
                    session_item_id: "s1",
                    schema: {
                        fields: [
                            { id: "upload_immunization", type: "file_ref", label: "Immunization record", required: true },
                            { id: "physician", type: "text", label: "Primary Physician Name" },
                        ],
                        sections: [],
                    },
                } as never,
            ],
            subjectId: null,
            sharedValues: {},
            confirmations: {} as never,
        });
        // An upload destination holds a document id, so words collected in conversation could only
        // be refused by the submission. It is presented at the artifact instead.
        expect(needs.flatMap((n) => n.occurrences.map((o) => o.form_field_id))).toEqual(["physician"]);
    });
});
