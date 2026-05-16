import { describe, expect, it } from "vitest";
import {
    evaluateFieldRequirementViolations,
    isFieldRequiredInContext,
    legacyIsRequiredFromPolicy,
    normalizeFieldDefinitionRequirementWrite,
    parseFieldRequirementPolicy,
    requirementPolicyFromLegacyIsRequired,
    resolveFieldRequirementPolicy,
} from "@/lib/fields/fieldRequirementPolicy";

describe("fieldRequirementPolicy", () => {
    it("legacy is_required maps to required/optional policy", () => {
        expect(resolveFieldRequirementPolicy({ field_key: "a", is_required: true }).mode).toBe("required");
        expect(resolveFieldRequirementPolicy({ field_key: "a", is_required: false }).mode).toBe("optional");
    });

    it("parses required_before_status_change with status_keys", () => {
        const r = parseFieldRequirementPolicy({
            version: 1,
            mode: "required_before_status_change",
            status_keys: ["enrolled"],
            validation_message: "Required before enroll",
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.status_keys).toEqual(["enrolled"]);
        }
    });

    it("rejects conditionally_required without condition", () => {
        const r = parseFieldRequirementPolicy({ version: 1, mode: "conditionally_required" });
        expect(r.ok).toBe(false);
    });

    it("normalize syncs is_required from policy", () => {
        const n = normalizeFieldDefinitionRequirementWrite({
            requirement_policy: { version: 1, mode: "required_on_save" },
        });
        expect("error" in n).toBe(false);
        if (!("error" in n)) {
            expect(n.is_required).toBe(true);
            expect(legacyIsRequiredFromPolicy(n.requirement_policy)).toBe(true);
        }
    });

    it("required_on_save only applies on save phase", () => {
        const row = {
            field_key: "notes",
            requirement_policy: requirementPolicyFromLegacyIsRequired(false),
        };
        row.requirement_policy = {
            version: 1,
            mode: "required_on_save",
            validation_scope: "save",
        };
        expect(isFieldRequiredInContext(row, { phase: "save" }, "")).toBe(true);
        expect(isFieldRequiredInContext(row, { phase: "display" }, "")).toBe(false);
    });

    it("required_before_status_change fires for matching status", () => {
        const row = {
            field_key: "tier",
            requirement_policy: {
                version: 1,
                mode: "required_before_status_change",
                status_keys: ["active"],
            },
        };
        expect(
            isFieldRequiredInContext(row, { phase: "status_change", status_key: "active" }, null)
        ).toBe(true);
        expect(
            isFieldRequiredInContext(row, { phase: "status_change", status_key: "draft" }, "x")
        ).toBe(false);
    });

    it("conditionally_required when predicate matches and value empty", () => {
        const row = {
            field_key: "subsidy",
            requirement_policy: {
                version: 1,
                mode: "conditionally_required",
                condition: { field_key: "has_subsidy", op: "eq", value: true },
            },
        };
        expect(
            isFieldRequiredInContext(
                row,
                { phase: "save", values: { has_subsidy: true } },
                null
            )
        ).toBe(true);
        expect(
            evaluateFieldRequirementViolations(
                row,
                { phase: "save", values: { has_subsidy: true } },
                null
            ).length
        ).toBe(1);
    });
});
