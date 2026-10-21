/**
 * FI-01 — Director medical visibility policy, application layer: a child's medical profile fields,
 * medical form answers and medical proposals need health.view; generic access never grants them.
 */
import { describe, expect, it } from "vitest";

import { validateFormSchema } from "@/lib/forms/schema";
import { loadCustomerMemberProfileFieldsByMemberId } from "@/lib/completion/loadCustomerMemberProfileFields";
import { CHILD_HEALTH_PROFILE_FIELD_KEYS, isChildHealthProfileFieldKey } from "@/lib/health/childHealthProfileFields";
import { isMedicalCollectionProvider, medicalFormFieldIds } from "@/lib/health/medicalFormAnswers";
import { withholdMedicalAnswersFromPayload } from "@/lib/health/withholdMedicalSubmissionAnswers";
import { parseHealthCaptureDeclaration } from "@/lib/health/healthCaptureDeclaration";

const SCHEMA = {
    schema_version: 1,
    title: "TA-806",
    sections: [{ id: "s", field_ids: ["first", "allergy_list", "has_allergies", "imm_dtap_dose_1", "employer", "meds"] }],
    fields: [
        { id: "first", type: "text", label: "Child first name", required: false, field_source: { entity_type: "child", field_key: "child_first_name" } },
        { id: "allergy_list", type: "text", label: "Allergies", required: false, field_source: { entity_type: "child", field_key: "allergies", shared_value_key: "child_allergies" } },
        { id: "has_allergies", type: "boolean", label: "Any allergies?", required: false },
        { id: "imm_dtap_dose_1", type: "date", label: "DTaP 1", required: false },
        { id: "employer", type: "text", label: "Employer", required: false, field_source: { entity_type: "person", field_key: "employer" } },
        {
            id: "meds", type: "group", label: "Medications", required: false, repeat: { min: 0, max: 3 },
            collection_binding: { collection_provider_ref: "health.medications", iteration_entity_type: "person_health_fact", iteration_alias: "m" },
            fields: [{ id: "meds__medication", type: "text", label: "Medication", required: true }],
        },
    ],
};
const DECL = parseHealthCaptureDeclaration({ health_capture: { immunization_grid: { vaccines: [{ vaccine_key: "dtap", dose_field_ids: ["imm_dtap_dose_1"] }] } } });

describe("which child profile fields are medical (one list, from the registry)", () => {
    it("allergies, medical notes, special diet and special instructions — and nothing else", () => {
        expect([...CHILD_HEALTH_PROFILE_FIELD_KEYS].sort()).toEqual(["allergies", "medical_notes", "special_diet", "special_instructions"]);
        expect(isChildHealthProfileFieldKey("preferred_name")).toBe(false);
    });
});

describe("which answers on a form are medical", () => {
    const ids = medicalFormFieldIds(validateFormSchema(SCHEMA as never), DECL);
    it("declared immunization fields, child-health-bound fields and health.* collection rows", () => {
        expect([...ids].sort()).toEqual(["allergy_list", "imm_dtap_dose_1", "meds", "meds__medication"]);
    });
    it("never by guessing at labels: an unbound 'Any allergies?' and the parent's employer are not medical", () => {
        expect(ids.has("has_allergies")).toBe(false);
        expect(ids.has("employer")).toBe(false);
    });
    it("medical collection providers", () => {
        expect(isMedicalCollectionProvider("health.allergies")).toBe(true);
        expect(isMedicalCollectionProvider("medical.consents")).toBe(true);
        expect(isMedicalCollectionProvider("person.contact_role.parents")).toBe(false);
    });
});

describe("a submission read without Medical access", () => {
    const payload = {
        values: { first: "Mia", allergy_list: "Peanuts", imm_dtap_dose_1: "2024-01-01", employer: "Acme" },
        groups: { meds: [{ instance_key: "m1", values: { meds__medication: "Albuterol" } }] },
        meta: { client_ip_hash: "x" },
    };
    it("loses the medical answers, keeps the rest, and says so", () => {
        const out = withholdMedicalAnswersFromPayload(SCHEMA, DECL, payload) as typeof payload & { meta: Record<string, unknown> };
        expect(out.values).toEqual({ first: "Mia", employer: "Acme" });
        expect(out.groups).toEqual({});
        expect(out.meta.medical_answers_withheld).toBe(true);
        expect(JSON.stringify(out)).not.toMatch(/Peanuts|Albuterol|2024-01-01/);
        // The stored object is untouched.
        expect(payload.values.allergy_list).toBe("Peanuts");
    });
    it("an unreadable form is withheld whole — we cannot tell what is medical in it", () => {
        const out = withholdMedicalAnswersFromPayload({ not: "a schema" }, null, payload) as Record<string, unknown>;
        expect(JSON.stringify(out)).not.toMatch(/Peanuts|Mia/);
    });
    it("a form with no medical answers passes through unchanged", () => {
        const plain = { values: { first: "Mia" } };
        expect(withholdMedicalAnswersFromPayload(SCHEMA, DECL, plain)).toBe(plain);
    });
});

describe("the shared child profile loader states whose access the read is for", () => {
    /** Records the field keys the loader asks the database for, and returns one value per key. */
    function fakeDb(rowsFor: (keys: string[]) => unknown[]) {
        const asked: string[][] = [];
        const builder = (table: string) => {
            const state: { keys?: string[] } = {};
            const q: Record<string, unknown> = {};
            for (const m of ["select", "eq"]) q[m] = () => q;
            q.in = (col: string, vals: string[]) => {
                if (col === "field_definitions.field_key") { state.keys = vals; asked.push(vals); }
                return q;
            };
            q.then = (res: (v: unknown) => unknown) =>
                res(table === "customer_members" ? { data: [{ id: "m1", first_name: "Mia" }], error: null } : { data: rowsFor(state.keys ?? []), error: null });
            return q;
        };
        return { client: { from: builder } as never, asked };
    }
    const values = (keys: string[]) => keys.map((k) => ({ entity_id: "m1", value_text: `${k}-value`, field_definitions: { field_key: k, field_type: "text" } }));

    it("without health.view the medical keys are not even queried, and never returned", async () => {
        const { client, asked } = fakeDb(values);
        const out = (await loadCustomerMemberProfileFieldsByMemberId(client, "org", ["m1"], { permissionKeys: ["crm.customers.read"] })).get("m1")!;
        expect(asked[0]!.some((k) => isChildHealthProfileFieldKey(k))).toBe(false);
        expect(out.allergies).toBeUndefined();
        expect(out.medical_notes).toBeUndefined();
    });

    it("even if the database returned one, it is dropped (belt and braces)", async () => {
        const { client } = fakeDb(() => values(["allergies", "preferred_name"]));
        const out = (await loadCustomerMemberProfileFieldsByMemberId(client, "org", ["m1"], { permissionKeys: [] })).get("m1")!;
        expect(out.allergies).toBeUndefined();
        expect(out.preferred_name).toBe("preferred_name-value");
    });

    it("a failed grant read (null) denies", async () => {
        const { client } = fakeDb(values);
        expect((await loadCustomerMemberProfileFieldsByMemberId(client, "org", ["m1"], { permissionKeys: null })).get("m1")!.allergies).toBeUndefined();
    });

    it("with health.view the medical fields are read", async () => {
        const { client, asked } = fakeDb(values);
        const out = (await loadCustomerMemberProfileFieldsByMemberId(client, "org", ["m1"], { permissionKeys: ["health.view"] })).get("m1")!;
        expect(asked[0]).toEqual(expect.arrayContaining(["allergies", "medical_notes"]));
        expect(out.allergies).toBe("allergies-value");
    });
});
