import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLifecycleFieldPaletteDisplayLabel } from "@/lib/lifecycle/lifecycleFieldPaletteMerge";
import {
    mapActionIntakeValuesToCreateLeadPayload,
    resolveActionIntakeSpec,
    resolveCreateLeadActionIntakeSpec,
    validateActionIntakePayload,
} from "@/lib/lifecycle/resolveActionIntakeSpec";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("action intake spec resolver P0", () => {
    it("resolves create_lead from lifecycle field_rules and palette labels", () => {
        const spec = resolveCreateLeadActionIntakeSpec({
            department_id: "dept-1",
            operator_stage: "lead",
            department_metadata: {
                lifecycle_progression_requirements_v1: {
                    version: 1,
                    stages: {
                        lead: {
                            field_rules: {
                                required_rule_ids: [
                                    "person:first_name",
                                    "person:last_name",
                                    "child:first_name",
                                ],
                                recommended_rule_ids: ["person:phone"],
                            },
                        },
                    },
                },
            },
            org_field_definitions: {
                person: [
                    {
                        field_key: "phone",
                        label: "Mobile",
                        entity_type: "person",
                        is_system: true,
                        is_active: true,
                    },
                ],
            },
        });

        expect(spec.action_key).toBe("create_lead");
        expect(spec.required.map((f) => f.rule_id)).toContain("person:first_name");
        expect(spec.required.map((f) => f.rule_id)).toContain("person:last_name");
        expect(spec.recommended.map((f) => f.rule_id)).toContain("child:first_name");
        const phoneField =
            spec.required.find((f) => f.rule_id === "person:phone") ??
            spec.recommended.find((f) => f.rule_id === "person:phone");
        expect(phoneField?.field_label).toBe("Phone");
    });

    it("child rules configured required are recommended for create_lead capture", () => {
        const spec = resolveCreateLeadActionIntakeSpec({
            department_id: "dept-1",
            operator_stage: "lead",
            department_metadata: {
                lifecycle_progression_requirements_v1: {
                    version: 1,
                    stages: {
                        lead: {
                            field_rules: {
                                required_rule_ids: ["child:first_name"],
                                recommended_rule_ids: [],
                            },
                        },
                    },
                },
            },
        });
        expect(spec.required.some((f) => f.rule_id === "child:first_name")).toBe(false);
        expect(spec.recommended.some((f) => f.rule_id === "child:first_name")).toBe(true);
    });

    it("groups fields by Person and Child entity labels", () => {
        const spec = resolveCreateLeadActionIntakeSpec({
            department_id: "dept-1",
            operator_stage: "lead",
        });
        const entities = spec.groups.map((g) => g.entity_label);
        expect(entities).toContain("Person");
        if (spec.groups.some((g) => g.entity === "child")) {
            expect(entities).toContain("Child");
        }
    });

    it("missing required fields block validation and phone or email constraint applies", () => {
        const spec = resolveCreateLeadActionIntakeSpec({
            department_id: "dept-1",
            operator_stage: "lead",
        });
        const invalid = validateActionIntakePayload(spec, {
            first_name: "Ada",
            last_name: "",
            email: "",
            phone: "",
        });
        expect(invalid.ok).toBe(false);
        if (!invalid.ok) {
            expect(invalid.issues.length).toBeGreaterThan(0);
        }

        const valid = validateActionIntakePayload(spec, {
            first_name: "Ada",
            last_name: "Lovelace",
            email: "",
            phone: "5551234567",
        });
        expect(valid.ok).toBe(true);
    });

    it("maps intake values to create_lead execute payload keys", () => {
        const spec = resolveCreateLeadActionIntakeSpec({
            department_id: "dept-1",
            operator_stage: "lead",
        });
        const payload = mapActionIntakeValuesToCreateLeadPayload(spec, {
            first_name: "Ada",
            last_name: "Lovelace",
            email: "ada@example.com",
            phone: "",
            child_first_name: "Grace",
        });
        expect(payload.first_name).toBe("Ada");
        expect(payload.last_name).toBe("Lovelace");
        expect(payload.email).toBe("ada@example.com");
        expect(payload.child_first_name).toBe("Grace");
    });

    it("resolveActionIntakeSpec returns null for unsupported actions", () => {
        expect(
            resolveActionIntakeSpec({
                action_key: "schedule_tour",
                department_id: "dept-1",
            })
        ).toBeNull();
    });

    it("configured Phone label wins over legacy Mobile from org field_definitions", () => {
        expect(resolveLifecycleFieldPaletteDisplayLabel("Phone", "phone", "Mobile")).toBe("Phone");
    });
});

describe("create lead action workspace wiring", () => {
    it("create lead uses action workspace with platform minimum only", () => {
        const modal = read("components/admin/opportunity/actions/CreateLeadModal.tsx");
        expect(modal).toContain("ActionWorkspaceShell");
        expect(modal).toContain("validateCreateLeadPlatformMinimum");
        expect(modal).not.toContain("fetchActionIntakeSpec");
        expect(modal).not.toContain("validateActionIntakePayload");
    });

    it("follows gather review execute success steps", () => {
        const modal = read("components/admin/opportunity/actions/CreateLeadModal.tsx");
        expect(modal).toContain("create-lead-gather-step");
        expect(modal).toContain("create-lead-review-step");
        expect(modal).toContain("ActionWorkspaceExecuteState");
        expect(modal).toContain("ActionWorkspaceSuccessState");
        expect(modal).toContain("onCreated");
    });

    it("confirm uses existing executeCreateLeadFromModal path", () => {
        const modal = read("components/admin/opportunity/actions/CreateLeadModal.tsx");
        expect(modal).toContain("mapCreateLeadGatherToExecutePayload");
        const client = read("lib/admin/actions/entryLifecycleActionClient.ts");
        expect(client).toContain('action_key: "create_lead"');
        expect(client).toContain("CREATE_LEAD_ACTION_ENTITY_ID");
    });

    it("BOS suggestions require apply before field write", () => {
        const modal = read("components/admin/opportunity/actions/CreateLeadModal.tsx");
        expect(modal).toContain("ActionWorkspaceBosSuggestions");
        expect(modal).toContain("applySuggestions");
        expect(modal).not.toContain("applyActionIntakePasteExtraction");
    });
});
