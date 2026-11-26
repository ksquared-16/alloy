/**
 * FI-06 / FI-07 — a parent's work and contact facts: which answers they are, whose they are, and
 * that distinct numbers stay distinct.
 */
import { describe, expect, it } from "vitest";

import { validateFormSchema, type FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import { canonicalPrefillPathForBinding } from "@/lib/forms/prefill/canonicalPrefillMap";
import { adaptPersonContactFactsToProposals, readRespondentContactFacts } from "@/lib/fields/personContactFacts/personContactFactProposals";
import { normalizeCommunicationPreference, statedNameContradictsPerson } from "@/lib/fields/personContactFacts/personContactFacts";

const G = (field_key: string) => ({ entity_type: "guardian", field_key, shared_value_key: field_key });
const P = (field_key: string) => ({ entity_type: "person", field_key });

/** The TA-806 guardian block, bound the way the canonical facts are now. */
const SCHEMA: FormSchemaV1 = validateFormSchema({
    schema_version: 1,
    title: "TA-806 guardians",
    sections: [{ id: "s", field_ids: ["first", "last", "cell", "home", "work", "employer", "hours", "work_addr", "method", "others"] }],
    fields: [
        { id: "first", type: "text", label: "Parent or guardian first name", required: true, field_source: G("guardian_first_name") },
        { id: "last", type: "text", label: "Parent or guardian last name", required: true, field_source: G("guardian_last_name") },
        { id: "cell", type: "text", label: "Cell phone", required: true, field_source: G("guardian_phone") },
        { id: "home", type: "text", label: "Home phone", required: false, field_source: G("guardian_home_phone") },
        { id: "work", type: "text", label: "Work phone", required: false, field_source: P("work_phone") },
        { id: "employer", type: "text", label: "Employer", required: false, field_source: P("employer") },
        { id: "hours", type: "text", label: "Work hours", required: false, field_source: G("guardian_work_hours") },
        { id: "work_addr", type: "text", label: "Work address", required: false, field_source: G("guardian_work_address") },
        { id: "method", type: "text", label: "Best way to reach you", required: false, field_source: G("guardian_preferred_contact_method") },
        {
            id: "others", type: "group", label: "Other parents or guardians", required: false, repeat: { min: 0, max: 3 },
            collection_binding: { collection_provider_ref: "person.contact_role.parents", iteration_entity_type: "person", iteration_alias: "guardian" },
            fields: [
                { id: "others__phone", type: "text", label: "Phone", required: true, field_source: P("phone") },
                { id: "others__employer", type: "text", label: "Employer", required: false, field_source: P("employer") },
            ],
        },
    ],
} as never);

const payload = (over: Record<string, unknown> = {}): FormPayload =>
    ({
        values: { first: "Pat", last: "Rivers", cell: "503-555-0101", home: "503-555-0202", work: "503-555-0303", employer: "Acme Clinic", hours: "Mon–Fri 8–5", work_addr: "1 Main St, Hillsboro", method: "Text", ...over },
        groups: { others: [{ instance_key: "o1", values: { others__phone: "503-555-0909", others__employer: "Second Co" } }] },
    }) as FormPayload;

describe("which answers are the parent's work and contact facts", () => {
    it("home, work and cell are three numbers — home and work never fold into the mobile phone", () => {
        const r = readRespondentContactFacts(SCHEMA, payload());
        expect(r.facts).toEqual({
            home_phone: "503-555-0202",
            work_phone: "503-555-0303",
            employer: "Acme Clinic",
            work_hours: "Mon–Fri 8–5",
            work_address: "1 Main St, Hillsboro",
            communication_preference: "sms",
        });
        // The cell number is the adult's identity-bearing `persons.phone` — identity owns it, not this proposal.
        expect(Object.values(r.facts)).not.toContain("503-555-0101");
        expect(r.stated_first_name).toBe("Pat");
        expect(r.stated_last_name).toBe("Rivers");
    });

    it("another guardian's row is a different person — never read as the respondent's facts", () => {
        const r = readRespondentContactFacts(SCHEMA, payload({ employer: "" }));
        expect(r.facts.employer).toBeUndefined();
        expect(JSON.stringify(r.facts)).not.toContain("Second Co");
        expect(JSON.stringify(r.facts)).not.toContain("503-555-0909");
    });

    it("blank answers propose nothing (a blank never clears a value on record)", () => {
        const r = readRespondentContactFacts(SCHEMA, payload({ home: " ", work: "", employer: "", hours: "", work_addr: "", method: "" }));
        expect(r.facts).toEqual({});
        expect(adaptPersonContactFactsToProposals(SCHEMA, payload({ home: " ", work: "", employer: "", hours: "", work_addr: "", method: "" }), { formSubmissionId: "sub-1", formDefinitionVersionId: null })).toEqual([]);
    });

    it("a contact method Alloy does not record is named, never guessed", () => {
        expect(normalizeCommunicationPreference("Text message")).toBe("sms");
        expect(normalizeCommunicationPreference("call")).toBe("phone");
        expect(normalizeCommunicationPreference("carrier pigeon")).toBeNull();
        const [c] = adaptPersonContactFactsToProposals(SCHEMA, payload({ method: "carrier pigeon" }), { formSubmissionId: "sub-1", formDefinitionVersionId: "v1" });
        const inst = c!.instances[0]!;
        expect(inst.person_contact_facts_intent?.facts.communication_preference).toBeUndefined();
        expect(inst.diagnostics[0]?.message).toMatch(/carrier pigeon/);
    });

    it("one stable proposal per submission, executed as person_contact_facts", () => {
        const a = adaptPersonContactFactsToProposals(SCHEMA, payload(), { formSubmissionId: "sub-1", formDefinitionVersionId: "v1" });
        const b = adaptPersonContactFactsToProposals(SCHEMA, payload(), { formSubmissionId: "sub-1", formDefinitionVersionId: "v1" });
        expect(a[0]!.instances).toHaveLength(1);
        expect(a[0]!.instances[0]!.proposal_id).toBe(b[0]!.instances[0]!.proposal_id);
        expect(a[0]!.instances[0]!.execution_kind).toBe("person_contact_facts");
        expect(a[0]!.instances[0]!.field_proposals.map((f) => f.label)).toEqual(expect.arrayContaining(["Home phone", "Work phone", "Employer"]));
    });
});

describe("prefill reads the facts from the adult", () => {
    it("guardian keys resolve to the adult's own facts; registered guardian email/phone no longer fall through", () => {
        expect(canonicalPrefillPathForBinding("guardian", "guardian_phone", { aliasOnly: true })).toBe("person.phone");
        expect(canonicalPrefillPathForBinding("guardian", "guardian_email", { aliasOnly: true })).toBe("person.email");
        expect(canonicalPrefillPathForBinding("guardian", "guardian_home_phone", { aliasOnly: true })).toBe("person.home_phone");
        expect(canonicalPrefillPathForBinding("guardian", "guardian_work_phone", { aliasOnly: true })).toBe("person.work_phone");
        expect(canonicalPrefillPathForBinding("guardian", "employer", { aliasOnly: true })).toBe("person.employer");
        expect(canonicalPrefillPathForBinding("guardian", "employer_address", { aliasOnly: true })).toBe("person.work_address");
        expect(canonicalPrefillPathForBinding("guardian", "mobile_phone", { aliasOnly: true })).toBe("person.phone");
    });
});

describe("whose facts they are", () => {
    it("a name not given contradicts nothing; a different adult's name does", () => {
        const pat = { first_name: "Pat", last_name: "Rivers" };
        expect(statedNameContradictsPerson({ first: null, last: null }, pat)).toBe(false);
        expect(statedNameContradictsPerson({ first: " pat ", last: "RIVERS" }, pat)).toBe(false);
        expect(statedNameContradictsPerson({ first: "Jordan", last: "Rivers" }, pat)).toBe(true);
    });
});
