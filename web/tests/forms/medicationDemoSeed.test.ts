import { describe, expect, it } from "vitest";
import { validateFormSchema } from "@/lib/forms/schema";
import { parseFormPdfMappingJson } from "@/lib/forms/pdf/pdfMappingContract";
import { validateFormPayload } from "@/lib/forms/validateSubmission";
import { payloadWithMinimumRepeatingGroups } from "@/components/forms/engine/formEnginePayload";
import {
    ALLY_BEND_STAGING_ORG_FORMS_DEMO_ID,
    MEDICATION_AUTHORIZATION_DEMO_DEFINITION_METADATA,
    MEDICATION_AUTHORIZATION_DEMO_PDF_MAPPING,
    MEDICATION_AUTHORIZATION_DEMO_SCHEMA,
    MEDICATION_DEMO_ROUTE_ITEM_KEYS,
    MEDICATION_DEMO_SCHEDULE_ITEM_KEYS,
} from "@/lib/forms/seeds/medicationAuthorizationDemo";

describe("Medication authorization demo seed", () => {
    it("SQL migration org constant matches shared Bend staging UUID", () => {
        expect(ALLY_BEND_STAGING_ORG_FORMS_DEMO_ID).toBe("7803388d-cdee-4afb-89cf-23a137f39423");
    });

    it("schema validates under Forms Engine V1 parser", () => {
        const s = validateFormSchema(MEDICATION_AUTHORIZATION_DEMO_SCHEMA);
        expect(s.title).toContain("Medication Authorization");
        expect(s.fields.some((f) => f.type === "group" && f.id === "medications")).toBe(true);
        expect(s.fields.some((f) => f.type === "signature")).toBe(true);
    });

    it("pdf_mapping_json parses", () => {
        const m = parseFormPdfMappingJson(MEDICATION_AUTHORIZATION_DEMO_PDF_MAPPING);
        expect(m?.template_key).toBe("medication_authorization_demo_v1");
        expect(m?.slots.med_name?.path).toContain("medications");
    });

    it("definition metadata flags demo-only posture", () => {
        expect(MEDICATION_AUTHORIZATION_DEMO_DEFINITION_METADATA.demo).toBe(true);
        expect(MEDICATION_AUTHORIZATION_DEMO_DEFINITION_METADATA.compliance_status).toBe("example_only");
        expect(MEDICATION_AUTHORIZATION_DEMO_DEFINITION_METADATA.not_official_state_form).toBe(true);
    });

    it("demo option item keys align with med_demo_schedule / med_demo_route seeds", () => {
        expect(MEDICATION_DEMO_SCHEDULE_ITEM_KEYS).toEqual(["daily", "twice_daily", "as_needed", "other"]);
        expect(MEDICATION_DEMO_ROUTE_ITEM_KEYS).toEqual(["oral", "topical", "inhaled", "injection", "other"]);
        const medGroup = MEDICATION_AUTHORIZATION_DEMO_SCHEMA.fields.find((f) => f.id === "medications" && f.type === "group");
        expect(medGroup?.type).toBe("group");
        if (medGroup?.type !== "group") return;
        const scheduleField = medGroup.fields.find((c) => c.id === "schedule");
        const routeField = medGroup.fields.find((c) => c.id === "route");
        expect(scheduleField?.type).toBe("select");
        expect(routeField?.type).toBe("multiselect");
        if (scheduleField?.type === "select") expect(scheduleField.option_set_key).toBe("med_demo_schedule");
        if (routeField?.type === "multiselect") expect(routeField.option_set_key).toBe("med_demo_route");
    });

    it("submit succeeds when payload starts from seeded repeating groups (no drawn UUID)", () => {
        const schema = validateFormSchema(MEDICATION_AUTHORIZATION_DEMO_SCHEMA);
        const seeded = payloadWithMinimumRepeatingGroups(schema);
        const optionValuesByFieldId = {
            schedule: [...MEDICATION_DEMO_SCHEDULE_ITEM_KEYS],
            route: [...MEDICATION_DEMO_ROUTE_ITEM_KEYS],
        };
        const row0 = seeded.groups?.medications?.[0];
        expect(row0).toBeTruthy();
        const payload = {
            ...seeded,
            values: {
                child_first_name: "Ada",
                child_last_name: "Lovelace",
                child_dob: "2020-01-15",
                guardian_full_name: "Parent Example",
                guardian_email: "parent@example.com",
                needs_special_instructions: false,
                authorization_acknowledgement: true,
            },
            groups: {
                medications: [
                    {
                        ...row0!,
                        values: {
                            med_name: "Demo Med",
                            dose_strength: "10mg",
                            schedule: "twice_daily",
                            route: ["oral"],
                        },
                    },
                ],
            },
            signatures: {
                signature_guardian: {
                    kind: "typed" as const,
                    typed_full_name: "Parent Example",
                    acknowledged_at: "2026-05-06T15:00:00.000Z",
                },
            },
        };
        const r = validateFormPayload({
            schemaJson: schema,
            payload,
            mode: "submit",
            optionValuesByFieldId,
        });
        expect(r.ok).toBe(true);
    });

    it("submit succeeds with hydrated select/multiselect option lists", () => {
        const schema = validateFormSchema(MEDICATION_AUTHORIZATION_DEMO_SCHEMA);
        const optionValuesByFieldId = {
            schedule: [...MEDICATION_DEMO_SCHEDULE_ITEM_KEYS],
            route: [...MEDICATION_DEMO_ROUTE_ITEM_KEYS],
        };
        const r = validateFormPayload({
            schemaJson: schema,
            payload: {
                values: {
                    child_first_name: "Ada",
                    child_last_name: "Lovelace",
                    child_dob: "2020-01-15",
                    guardian_full_name: "Parent Example",
                    guardian_email: "parent@example.com",
                    needs_special_instructions: false,
                    authorization_acknowledgement: true,
                },
                groups: {
                    medications: [
                        {
                            instance_key: "row-1",
                            values: {
                                med_name: "Demo Med",
                                dose_strength: "10mg",
                                schedule: "twice_daily",
                                route: ["oral"],
                            },
                        },
                    ],
                },
                signatures: {
                    signature_guardian: {
                        kind: "typed",
                        typed_full_name: "Parent Example",
                        acknowledged_at: new Date().toISOString(),
                    },
                },
            },
            mode: "submit",
            optionValuesByFieldId,
        });
        expect(r.ok).toBe(true);
    });

    it("submit rejects select value not in option_values_by_field_id", () => {
        const schema = validateFormSchema(MEDICATION_AUTHORIZATION_DEMO_SCHEMA);
        const optionValuesByFieldId = {
            schedule: [...MEDICATION_DEMO_SCHEDULE_ITEM_KEYS],
            route: [...MEDICATION_DEMO_ROUTE_ITEM_KEYS],
        };
        const r = validateFormPayload({
            schemaJson: schema,
            payload: {
                values: {
                    child_first_name: "Ada",
                    child_last_name: "Lovelace",
                    child_dob: "2020-01-15",
                    guardian_full_name: "Parent Example",
                    guardian_email: "parent@example.com",
                    needs_special_instructions: false,
                    authorization_acknowledgement: true,
                },
                groups: {
                    medications: [
                        {
                            instance_key: "row-1",
                            values: {
                                med_name: "Demo Med",
                                dose_strength: "10mg",
                                schedule: "not_in_list",
                                route: [],
                            },
                        },
                    ],
                },
                signatures: {
                    signature_guardian: {
                        kind: "typed",
                        typed_full_name: "Parent Example",
                        acknowledged_at: new Date().toISOString(),
                    },
                },
            },
            mode: "submit",
            optionValuesByFieldId,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.errors.some((e) => e.message.includes("Invalid option"))).toBe(true);
        }
    });
});
