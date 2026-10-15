import { describe, expect, it } from "vitest";

import { buildFormIntakeMetaFromPayload } from "@/lib/forms/intake/buildFormIntakeMetaFromPayload";
import type { FormSchemaV1 } from "@/lib/forms/schema";

/**
 * Found by deployed Phase G (#1445) on a Studio-authored lead-capture form submitted through a
 * North Campus "Share by location" link: the child committed with no date of birth although the
 * family entered one, and the lead committed with no location.
 */
const VID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NORTH = "1a5644a7-45c4-413b-9021-5f556118b6e2";
const field = (id: string, crm_mapping_key: string) =>
    ({ id, type: "text", label: id, required: true, field_source: { field_key: id, entity_type: "child", crm_mapping_key } }) as never;

// The shape the Processing Studio publishes: canonical bindings, ids that are NOT the default paths.
const studioSchema = {
    schema_version: 1,
    title: "ZZ QA lead capture",
    fields: [
        field("child_first_name", "child.first_name"),
        field("child_last_name", "child.last_name"),
        field("child_date_of_birth", "child.date_of_birth"),
        field("parent_mail", "guardian.email"),
        field("guardian_first_name", "guardian.first_name"),
        field("guardian_last_name", "guardian.last_name"),
    ],
    sections: [],
} as unknown as FormSchemaV1;

const values = {
    child_first_name: "Kai",
    child_last_name: "Ravi",
    child_date_of_birth: "2024-06-20",
    parent_mail: "ravi@example.com",
    guardian_first_name: "Ravi",
    guardian_last_name: "Smith",
};

describe("form intake reads canonical bindings, not only default field ids", () => {
    it("a Studio date of birth (child.date_of_birth) reaches the child", () => {
        const r = buildFormIntakeMetaFromPayload({ values, linkMetadata: { default_vertical_id: VID }, schema: studioSchema });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.intake.child?.dob).toBe("2024-06-20");
        // A bound guardian email whose id is not the default id is read too.
        expect(r.intake.guardian?.email).toBe("ravi@example.com");
    });

    it("explicit link intake_field_paths still win over bindings", () => {
        const r = buildFormIntakeMetaFromPayload({
            values: { ...values, other_dob: "2023-01-02" },
            linkMetadata: { default_vertical_id: VID, intake_field_paths: { child_dob: "other_dob" } },
            schema: studioSchema,
        });
        expect(r.ok && r.intake.child?.dob).toBe("2023-01-02");
    });

    it("without a schema the default ids still apply (legacy forms unchanged)", () => {
        const r = buildFormIntakeMetaFromPayload({
            values: { guardian_email: "a@example.com", child_first_name: "A", child_dob: "2020-01-01" },
            linkMetadata: { default_vertical_id: VID },
        });
        expect(r.ok && r.intake.child?.dob).toBe("2020-01-01");
    });
});

describe("a location-specific link places the child at its campus", () => {
    it("the link's default_location_id becomes the child's location when the form names none", () => {
        const r = buildFormIntakeMetaFromPayload({
            values,
            linkMetadata: { default_vertical_id: VID, default_location_id: NORTH },
            schema: studioSchema,
        });
        expect(r.ok && r.intake.child?.location_id).toBe(NORTH);
    });

    it("a location the family chose on the form wins over the link's campus", () => {
        const chosen = "e9ed1883-d6a5-463d-bda0-b765e15c6214";
        const r = buildFormIntakeMetaFromPayload({
            values: { ...values, campus: chosen },
            linkMetadata: { default_vertical_id: VID, default_location_id: NORTH },
            schema: { ...studioSchema, fields: [...studioSchema.fields, field("campus", "child.location_id")] } as FormSchemaV1,
        });
        expect(r.ok && r.intake.child?.location_id).toBe(chosen);
    });

    it("no link campus, no form location → no invented location", () => {
        const r = buildFormIntakeMetaFromPayload({ values, linkMetadata: { default_vertical_id: VID }, schema: studioSchema });
        expect(r.ok && r.intake.child?.location_id).toBeNull();
    });
});
