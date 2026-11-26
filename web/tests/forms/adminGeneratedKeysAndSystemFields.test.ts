import { describe, expect, it } from "vitest";
import { allocateUniqueKey, slugKeyFromDisplayName } from "@/lib/forms/adminGeneratedKeys";
import { emptyFormSchema } from "@/lib/forms/adminFormSchemaBuilder";
import { OPERATIONAL_FORM_SYSTEM_FIELDS, SYSTEM_FIELD_BY_ID } from "@/lib/forms/systemFieldRegistry";
import { formFieldFromRegistryEntry } from "@/lib/forms/systemFieldToFormField";
import { validateFormSchema } from "@/lib/forms/schema";
import { validateFormPayload } from "@/lib/forms/validateSubmission";

describe("adminGeneratedKeys", () => {
    it("slugifies display titles to snake_case", () => {
        expect(slugKeyFromDisplayName("Waitlist Intake")).toBe("waitlist_intake");
        expect(slugKeyFromDisplayName("Child Enrollment Form")).toBe("child_enrollment_form");
    });

    it("prefixes when slug would not start with a letter", () => {
        expect(slugKeyFromDisplayName("123 ABC")).toMatch(/^f_/);
    });

    it("allocates numeric suffixes on collision", () => {
        const taken = new Set(["waitlist_intake", "waitlist_intake_2"]);
        expect(allocateUniqueKey("waitlist_intake", taken)).toBe("waitlist_intake_3");
    });

    it("returns base when not taken", () => {
        expect(allocateUniqueKey("new_form", new Set(["other"]))).toBe("new_form");
    });
});

describe("operational system field registry", () => {
    it("exposes stable ids and maps by id", () => {
        expect(OPERATIONAL_FORM_SYSTEM_FIELDS.length).toBeGreaterThan(5);
        for (const e of OPERATIONAL_FORM_SYSTEM_FIELDS) {
            expect(SYSTEM_FIELD_BY_ID.get(e.id)).toEqual(e);
            expect(e.field_key).toBeTruthy();
            expect(e.default_label.length).toBeGreaterThan(0);
        }
    });

    it("includes common intake fields", () => {
        const ids = new Set(OPERATIONAL_FORM_SYSTEM_FIELDS.map((e) => e.id));
        expect(ids.has("child_first_name")).toBe(true);
        expect(ids.has("guardian_email")).toBe(true);
        expect(ids.has("start_date")).toBe(true);
    });
});

describe("formFieldFromRegistryEntry + FormSchemaV1", () => {
    it("builds a valid field with field_source from registry", () => {
        const entry = SYSTEM_FIELD_BY_ID.get("child_first_name")!;
        const field = formFieldFromRegistryEntry(entry);
        expect(field.id).toBe("child_first_name");
        expect(field.field_source).toEqual({
            entity_type: "child",
            field_key: "child_first_name",
            shared_value_key: "child_first_name",
            crm_mapping_key: "child.first_name",
        });
        const schema = validateFormSchema({
            schema_version: 1,
            title: "T",
            sections: [{ id: "s1", field_ids: [field.id] }],
            fields: [field],
        });
        expect(schema.fields[0]!.label).toBe("Child first name");
    });

    it("keeps field_source when label and help are customized", () => {
        const entry = SYSTEM_FIELD_BY_ID.get("child_first_name")!;
        const field = formFieldFromRegistryEntry(entry, {
            label: "Student given name",
            description: "As on birth certificate",
            required: false,
        });
        expect(field.label).toBe("Student given name");
        expect(field.description).toBe("As on birth certificate");
        expect(field.required).toBe(false);
        expect(field.field_source?.entity_type).toBe("child");
        expect(field.field_source?.field_key).toBe("child_first_name");
        expect(field.field_source?.crm_mapping_key).toBe("child.first_name");
    });

    it("accepts payload for schema built from registry field", () => {
        const entry = SYSTEM_FIELD_BY_ID.get("guardian_email")!;
        const field = formFieldFromRegistryEntry(entry);
        const schema = validateFormSchema({
            schema_version: 1,
            title: "T",
            sections: [{ id: "s1", field_ids: [field.id] }],
            fields: [field],
        });
        const res = validateFormPayload({
            schemaJson: schema,
            payload: { values: { [field.id]: "a@b.co" } },
            mode: "submit",
        });
        expect(res.ok).toBe(true);
    });
});

describe("emptyFormSchema", () => {
    it("starts with an empty question section (no auto-seeded registry fields)", () => {
        const schema = emptyFormSchema("Website Inquiry");
        const parsed = validateFormSchema(schema);
        expect(parsed.fields).toHaveLength(0);
        expect(parsed.sections[0]?.field_ids).toEqual([]);
        expect(parsed.title).toBe("Website Inquiry");
    });
});
