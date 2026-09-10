import { describe, expect, it } from "vitest";

import { updateField } from "@/lib/forms/formBuilderSchema";
import { participantUploadRequests } from "@/lib/enrollment/participantRuntime/participantUploadRequests";
import type { FormSchemaV1 } from "@/lib/forms/schema";

/**
 * AN UPLOAD QUESTION CAN NOW SAY WHAT IT IS ASKING FOR.
 *
 * `file_ref.document_type` has been in the schema all along, and `participantUploadRequests` reads
 * it to decide how an attachment is filed. Nothing could SET it: the builder inspector authored a
 * label, help text and required-ness, and left the classification permanently absent. So every
 * upload an administrator authored was filed as `enrollment_document` — honest, and unable to tell
 * a family who attached a physical that they still owe an immunization record.
 */

const schema = (): FormSchemaV1 => ({
    title: "Immunization / Vaccination Record",
    fields: [
        {
            id: "f_upload",
            type: "file_ref",
            label: "Immunization record",
            required: true,
            description: "Please attach your child's current immunization or vaccination record.",
        },
    ],
    sections: [{ id: "s1", title: "Evidence", field_ids: ["f_upload"] }],
}) as unknown as FormSchemaV1;

describe("authoring the document classification on an upload question", () => {
    it("stores the operator's choice on the field", () => {
        const next = updateField(schema(), "f_upload", { document_type: "immunization_record" });
        expect((next.fields[0] as { document_type?: string }).document_type).toBe("immunization_record");
    });

    it("clearing it is a real choice, not an absent one", () => {
        const set = updateField(schema(), "f_upload", { document_type: "immunization_record" });
        const cleared = updateField(set, "f_upload", { document_type: "" });
        expect((cleared.fields[0] as { document_type?: string }).document_type).toBeUndefined();
    });

    it("only an upload question carries one", () => {
        const text = updateField(
            { ...schema(), fields: [{ id: "f_upload", type: "text", label: "Name" }] } as unknown as FormSchemaV1,
            "f_upload",
            { document_type: "immunization_record" },
        );
        expect((text.fields[0] as { document_type?: string }).document_type).toBeUndefined();
    });

    it("reaches the participant as the ask the family actually sees", () => {
        // The whole point of authoring it: the runtime derivation changes.
        const before = participantUploadRequests(schema());
        expect(before[0].docType).toBe("enrollment_document");
        expect(before[0].title).toBe("Immunization record");
        expect(before[0].required).toBe(true);
        expect(before[0].description).toContain("attach your child's current immunization");

        const after = participantUploadRequests(updateField(schema(), "f_upload", { document_type: "immunization_record" }));
        expect(after[0].docType).toBe("immunization_record");
        // Title, instructions and required-ness are unchanged — only the filing improves.
        expect(after[0].title).toBe(before[0].title);
        expect(after[0].description).toBe(before[0].description);
    });
});
