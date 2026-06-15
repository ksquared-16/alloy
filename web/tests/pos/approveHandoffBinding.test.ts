import { describe, it, expect } from "vitest";
import { extractBoundPerson } from "@/lib/pos/processingCase/approveHandoff";

/** Minimal POS-bound schema: email/first/last mapped to person; one unmapped field. */
const schema = {
    schema_version: 1,
    fields: [
        { id: "f_email", label: "Email", type: "text", field_source: { entity_type: "person", field_key: "email" } },
        { id: "f_first", label: "First name", type: "text", field_source: { entity_type: "person", field_key: "first_name" } },
        { id: "f_last", label: "Last name", type: "text", field_source: { entity_type: "person", field_key: "last_name" } },
        { id: "f_note", label: "Notes", type: "text" },
    ],
};

describe("extractBoundPerson — meaning layer, not guessing", () => {
    it("promotes the BOUND person fields and lowercases the email", () => {
        const r = extractBoundPerson(schema, {
            f_email: "Ada@Example.com",
            f_first: "Ada",
            f_last: "Lovelace",
            f_note: "ignore-me@nope.com",
        });
        expect(r).toEqual({ email: "ada@example.com", firstName: "Ada", lastName: "Lovelace", hasEmailBinding: true });
    });

    it("does NOT guess an email from an unmapped field when there is no person.email binding", () => {
        const noEmail = { schema_version: 1, fields: [{ id: "f_note", label: "Notes", type: "text" }] };
        const r = extractBoundPerson(noEmail, { f_note: "reach me at someone@example.com" });
        expect(r.hasEmailBinding).toBe(false);
        expect(r.email).toBeNull();
    });

    it("reports the binding but no value when the mapped email field is empty", () => {
        const r = extractBoundPerson(schema, { f_email: "   ", f_first: "Ada" });
        expect(r.hasEmailBinding).toBe(true);
        expect(r.email).toBeNull();
        expect(r.firstName).toBe("Ada");
    });
});
