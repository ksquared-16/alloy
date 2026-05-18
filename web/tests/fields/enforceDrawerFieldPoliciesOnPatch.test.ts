import { describe, expect, it } from "vitest";
import {
    evaluateDrawerFieldPoliciesOnPatch,
    mergeValuesForPolicyCheck,
} from "@/lib/fields/enforceDrawerFieldPoliciesOnPatch";
import { buildSimpleInteractionPolicy, buildSimpleRequirementPolicy } from "@/lib/fields/fieldPolicySettingsUi";

const oppNameDef = {
    id: "d1",
    field_key: "name",
    is_system: true,
    is_required: true,
    requirement_policy: buildSimpleRequirementPolicy("required"),
    interaction_policy: buildSimpleInteractionPolicy("editable", "opportunity", "name"),
};

const customDef = {
    id: "d2",
    field_key: "campus_pref",
    field_type: "text",
    is_system: false,
    is_required: true,
    requirement_policy: buildSimpleRequirementPolicy("required_on_save"),
    interaction_policy: buildSimpleInteractionPolicy("editable", "opportunity", "campus_pref"),
};

const statusDef = {
    id: "d3",
    field_key: "status_key",
    is_system: true,
    is_required: true,
    requirement_policy: buildSimpleRequirementPolicy("required"),
    interaction_policy: buildSimpleInteractionPolicy("editable", "opportunity", "status_key"),
};

const readOnlyNameDef = {
    ...oppNameDef,
    interaction_policy: buildSimpleInteractionPolicy("read_only", "opportunity", "name"),
};

describe("enforceDrawerFieldPoliciesOnPatch", () => {
    it("blocks opportunity custom required field when value missing", () => {
        const r = evaluateDrawerFieldPoliciesOnPatch({
            entityType: "opportunity",
            defs: [customDef],
            body: { campus_pref: "" },
            persisted: {},
            customValuesByFieldKey: {},
        });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.violations[0]?.field_key).toBe("campus_pref");
            expect(r.violations[0]?.code).toBe("required_on_save");
        }
    });

    it("blocks job custom required field when value missing", () => {
        const jobCustom = {
            ...customDef,
            field_key: "access_notes",
            interaction_policy: buildSimpleInteractionPolicy("editable", "job", "access_notes"),
        };
        const r = evaluateDrawerFieldPoliciesOnPatch({
            entityType: "job",
            defs: [jobCustom],
            body: {},
            persisted: {},
            customValuesByFieldKey: {},
        });
        expect(r.ok).toBe(false);
    });

    it("blocks opportunity native required name when empty", () => {
        const r = evaluateDrawerFieldPoliciesOnPatch({
            entityType: "opportunity",
            defs: [oppNameDef],
            body: { name: "" },
            persisted: { name: "Acme" },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.violations[0]?.field_key).toBe("name");
    });

    it("blocks job native required title when empty after merge", () => {
        const titleDef = {
            id: "j1",
            field_key: "title",
            is_system: true,
            is_required: true,
            requirement_policy: buildSimpleRequirementPolicy("required"),
            interaction_policy: buildSimpleInteractionPolicy("editable", "job", "title"),
        };
        const r = evaluateDrawerFieldPoliciesOnPatch({
            entityType: "job",
            defs: [titleDef],
            body: { title: "  " },
            persisted: { title: "Old" },
        });
        expect(r.ok).toBe(false);
    });

    it("blocks read-only enforceable field PATCH", () => {
        const r = evaluateDrawerFieldPoliciesOnPatch({
            entityType: "opportunity",
            defs: [readOnlyNameDef],
            body: { name: "New" },
            persisted: { name: "Old" },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.violations[0]?.code).toBe("read_only");
    });

    it("does not block deferred status_key policy", () => {
        const r = evaluateDrawerFieldPoliciesOnPatch({
            entityType: "opportunity",
            defs: [statusDef],
            body: { status_key: null },
            persisted: { status_key: null },
        });
        expect(r.ok).toBe(true);
    });

    it("allows valid PATCH when persisted value satisfies requirement", () => {
        const r = evaluateDrawerFieldPoliciesOnPatch({
            entityType: "opportunity",
            defs: [oppNameDef, customDef],
            body: { source: "web" },
            persisted: { name: "Acme" },
            customValuesByFieldKey: { campus_pref: "North" },
        });
        expect(r.ok).toBe(true);
    });

    it("partial PATCH does not fail when persisted satisfies requirement", () => {
        const r = evaluateDrawerFieldPoliciesOnPatch({
            entityType: "opportunity",
            defs: [oppNameDef],
            body: { assigned_to: "user-1" },
            persisted: { name: "Existing", assigned_to: null },
        });
        expect(r.ok).toBe(true);
    });

    it("returns structured violations with field_key, code, and message", () => {
        const r = evaluateDrawerFieldPoliciesOnPatch({
            entityType: "opportunity",
            defs: [readOnlyNameDef, oppNameDef],
            body: { name: "" },
            persisted: { name: "Was set" },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            for (const v of r.violations) {
                expect(v.field_key).toBeTruthy();
                expect(["required", "required_on_save", "read_only"]).toContain(v.code);
                expect(v.message.length).toBeGreaterThan(0);
            }
        }
    });

    it("mergeValuesForPolicyCheck overlays metadata notes", () => {
        const map = {
            notes: {
                entityType: "opportunity" as const,
                fieldKey: "notes",
                storage: "metadata" as const,
                bodyKey: "notes",
                policyMode: "enforceable" as const,
                requirementSupported: true,
                interactionSupported: true,
                reason: "test",
            },
        };
        const merged = mergeValuesForPolicyCheck(
            "opportunity",
            { metadata: { notes: "old" } },
            { notes: "new" },
            map,
            {}
        );
        expect(merged.notes).toBe("new");
    });
});
