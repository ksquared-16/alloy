import { describe, expect, it } from "vitest";
import {
    gatherFieldsFromActionIntakeSpec,
    missingRequiredLabelsForCreateLead,
    resolveCreateLeadRequiredFields,
    validateCreateLeadFromIntakeSpec,
} from "@/lib/admin/actions/resolveCreateLeadRequiredFields";
import { resolveCreateLeadActionIntakeSpec } from "@/lib/lifecycle/resolveActionIntakeSpec";

const enrollmentLeadMetadata = {
    lifecycle_builder_stage_field_rules_v1: {
        version: 1,
        by_stage_key: {
            lead: {
                required_rule_ids: [
                    "opportunity:location",
                    "person:first_name",
                    "person:last_name",
                    "person:email",
                    "person:phone",
                ],
                recommended_rule_ids: [],
            },
        },
    },
};

describe("resolveCreateLeadRequiredFields", () => {
    it("derives required gather fields from Lead stage builder configuration", () => {
        const bundle = resolveCreateLeadRequiredFields({
            departmentId: "dept-1",
            stageKey: "lead",
            departmentMetadata: enrollmentLeadMetadata,
        });

        expect(bundle.requiredPayloadKeys).toEqual(
            expect.arrayContaining(["location_id", "first_name", "last_name", "email", "phone"]),
        );
        expect(bundle.gatherFields.some((f) => f.payload_key === "location_id" && f.tier === "required")).toBe(
            true,
        );
    });

    it("includes Location when configured required on Lead stage", () => {
        const spec = resolveCreateLeadActionIntakeSpec({
            department_id: "dept-1",
            operator_stage: "lead",
            builder_stage_key: "lead",
            department_metadata: enrollmentLeadMetadata,
        });
        const location = spec.required.find((f) => f.rule_id === "opportunity:location");
        expect(location?.payload_key).toBe("location_id");
        expect(location?.placement_select).toBe("site");
    });

    it("requires Email and Phone individually when both configured required", () => {
        const spec = resolveCreateLeadActionIntakeSpec({
            department_id: "dept-1",
            operator_stage: "lead",
            builder_stage_key: "lead",
            department_metadata: enrollmentLeadMetadata,
        });
        expect(spec.constraints).toEqual([]);
        expect(spec.required.some((f) => f.rule_id === "person:email")).toBe(true);
        expect(spec.required.some((f) => f.rule_id === "person:phone")).toBe(true);

        const missing = missingRequiredLabelsForCreateLead(spec, {
            first_name: "Jordan",
            last_name: "Lee",
            email: "jordan@example.com",
            phone: "",
            location_id: "site-1",
        });
        expect(missing).toContain("Phone");
        expect(missing).not.toContain("Email or phone");
    });

    it("uses email-or-phone constraint only on platform fallback", () => {
        const spec = resolveCreateLeadActionIntakeSpec({
            department_id: "dept-1",
            operator_stage: "lead",
        });
        expect(spec.requirements_source).toBe("platform");
        expect(spec.constraints.some((c) => c.kind === "at_least_one")).toBe(true);

        const missing = missingRequiredLabelsForCreateLead(spec, {
            first_name: "Jordan",
            last_name: "Lee",
            email: "",
            phone: "",
        });
        expect(missing.join(" · ")).toMatch(/contact|email|phone/i);
    });

    it("uses field definition labels over hardcoded Parent copy", () => {
        const spec = resolveCreateLeadActionIntakeSpec({
            department_id: "dept-1",
            operator_stage: "lead",
            builder_stage_key: "lead",
            department_metadata: enrollmentLeadMetadata,
            org_field_definitions: {
                person: [
                    {
                        field_key: "first_name",
                        label: "Guardian first name",
                        entity_type: "person",
                        is_system: true,
                        is_active: true,
                    },
                ],
            },
        });
        const firstName = spec.required.find((f) => f.rule_id === "person:first_name");
        expect(firstName?.field_label).toBe("Guardian first name");

        const gatherFields = gatherFieldsFromActionIntakeSpec(spec);
        expect(gatherFields.find((f) => f.payload_key === "first_name")?.field_label).toBe("Guardian first name");
    });

    it("updates required banner from applied draft values (not unapplied suggestions)", () => {
        const spec = resolveCreateLeadActionIntakeSpec({
            department_id: "dept-1",
            operator_stage: "lead",
            builder_stage_key: "lead",
            department_metadata: enrollmentLeadMetadata,
        });

        const applied = {
            first_name: "Jordan",
            last_name: "Lee",
            email: "",
            phone: "",
            location_id: "",
        };
        const afterApply = missingRequiredLabelsForCreateLead(spec, applied);
        expect(afterApply).toEqual(expect.arrayContaining(["Location", "Email", "Phone"]));
        expect(afterApply).not.toContain("First name");
        expect(afterApply).not.toContain("Last name");
    });

    it("validates create lead payload from intake spec", () => {
        const bundle = resolveCreateLeadRequiredFields({
            departmentId: "dept-1",
            stageKey: "lead",
            departmentMetadata: enrollmentLeadMetadata,
        });
        const invalid = validateCreateLeadFromIntakeSpec(bundle.spec, {
            first_name: "Jordan",
            last_name: "Lee",
        });
        expect(invalid.ok).toBe(false);

        const valid = validateCreateLeadFromIntakeSpec(bundle.spec, {
            first_name: "Jordan",
            last_name: "Lee",
            email: "jordan@example.com",
            phone: "5551234567",
            location_id: "site-1",
        });
        expect(valid.ok).toBe(true);
    });

    it("falls back to platform minimum when no department requirements exist", () => {
        const bundle = resolveCreateLeadRequiredFields({
            departmentId: "dept-1",
            stageKey: "lead",
            departmentMetadata: null,
        });
        expect(bundle.spec.requirements_source).toBe("platform");
        expect(bundle.requiredPayloadKeys).toEqual(expect.arrayContaining(["first_name", "last_name"]));
    });
});

describe("create lead step rail affordance", () => {
    it("Create Lead progress pills are non-interactive progress indicators", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const rail = readFileSync(
            resolve(__dirname, "../../../components/admin/actions/CreateLeadProgressRail.tsx"),
            "utf8",
        );
        expect(rail).toContain("cursor-default");
        expect(rail).toContain('aria-disabled="true"');
        expect(rail).not.toContain("onClick");
    });
});

describe("create lead modal intake wiring", () => {
    it("loads Lead stage requirements via fetchActionIntakeSpec", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const modal = readFileSync(
            resolve(__dirname, "../../../components/admin/opportunity/actions/CreateLeadModal.tsx"),
            "utf8",
        );
        expect(modal).toContain("fetchActionIntakeSpec");
        expect(modal).toContain("CreateLeadProgressRail");
        expect(modal).toContain("applyHighConfidenceCreateLeadExtraction");
        const draft = readFileSync(
            resolve(__dirname, "../../../components/admin/actions/CreateLeadDraftLeadColumn.tsx"),
            "utf8",
        );
        expect(draft).toContain("missingRequiredLabelsForCreateLead");
    });
});
