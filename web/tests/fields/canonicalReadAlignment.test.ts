import { describe, expect, it } from "vitest";
import { buildLifecycleFieldRulesOverridePatch } from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import type { CompletionEvaluationContext } from "@/lib/completion/requirementValidationTypes";
import { evaluateFieldRulesForStage } from "@/lib/lifecycle/lifecycleFieldRuleEvaluator";
import { LIFECYCLE_FIELD_RULE_BINDINGS } from "@/lib/lifecycle/lifecycleFieldRuleBindings";
import { resolveChildProfileFieldValue } from "@/lib/fields/childProfileFieldResolution";
import { resolveCanonicalStatusKey, resolveOcmOutcomeStatusKey } from "@/lib/fields/canonicalStatusRead";
import { resolveLegacyStatusKeyWithTextFallback } from "@/lib/fields/canonicalLegacyStatusMaintenance";
import { assertLifecycleBindingGrain } from "@/lib/fields/canonicalStrictMode";

describe("canonical read alignment — child profile", () => {
    it("resolveChildProfileFieldValue reads profile from customer_member snapshot fields", () => {
        const row = {
            customer_member_id: "cm-1",
            first_name: "Ava",
            last_name: "Lee",
            dob: "2020-03-01",
            gender: "female",
            allergies: "peanut",
            custom_fields: { medical_notes: "asthma" },
        };
        expect(resolveChildProfileFieldValue(row, "first_name")).toBe("Ava");
        expect(resolveChildProfileFieldValue(row, "dob")).toBe("2020-03-01");
        expect(resolveChildProfileFieldValue(row, "gender")).toBe("female");
        expect(resolveChildProfileFieldValue(row, "medical_notes")).toBe("asthma");
    });

    it("lifecycle evaluator satisfies child:first_name from profile grain not OCM enrollment columns", () => {
        const ctx: CompletionEvaluationContext = {
            phase: "action",
            entity_type: "opportunity",
            entity_id: "opp-1",
            action_key: "schedule_tour",
            values: {},
            related: {
                inquiry_children: [
                    {
                        id: "ocm-1",
                        customer_member_id: "cm-1",
                        first_name: "Ava",
                        last_name: "Lee",
                        program_category_id: null,
                    },
                ],
            },
        };
        const violations = evaluateFieldRulesForStage(ctx, "lead", {
            required_rule_ids: ["child:first_name"],
            recommended_rule_ids: [],
        });
        expect(violations).toHaveLength(0);
    });

    it("lifecycle evaluator blocks missing child:first_name on profile grain", () => {
        const ctx: CompletionEvaluationContext = {
            phase: "action",
            entity_type: "opportunity",
            entity_id: "opp-1",
            values: {},
            related: {
                inquiry_children: [
                    {
                        id: "ocm-1",
                        customer_member_id: "cm-1",
                        first_name: null,
                        last_name: "Lee",
                    },
                ],
            },
        };
        const violations = evaluateFieldRulesForStage(ctx, "lead", {
            required_rule_ids: ["child:first_name"],
            recommended_rule_ids: [],
        });
        expect(violations.some((v) => v.entity_type === "customer_member" && v.field_key === "first_name")).toBe(
            true
        );
    });

    it("lifecycle evaluator still reads enrollment fields from inquiry_child grain", () => {
        const metadata = buildLifecycleFieldRulesOverridePatch({
            stage: "waitlist",
            required_rule_ids: ["child:start_date"],
            recommended_rule_ids: [],
            existingMetadata: {},
        });
        const filled: CompletionEvaluationContext = {
            phase: "action",
            entity_type: "opportunity",
            entity_id: "opp-1",
            action_key: "move_to_waitlist",
            values: {},
            related: {
                department_metadata: metadata,
                inquiry_children: [{ id: "ocm-1", start_date: "2026-09-01", first_name: "Ava" }],
            },
        };
        expect(
            evaluateFieldRulesForStage(filled, "waitlist", {
                required_rule_ids: ["child:start_date"],
                recommended_rule_ids: [],
            })
        ).toHaveLength(0);

        const empty: CompletionEvaluationContext = {
            ...filled,
            related: {
                ...filled.related,
                inquiry_children: [{ id: "ocm-1", first_name: "Ava", start_date: null }],
            },
        };
        const violations = evaluateFieldRulesForStage(empty, "waitlist", {
            required_rule_ids: ["child:start_date"],
            recommended_rule_ids: [],
        });
        expect(violations.some((v) => v.entity_type === "inquiry_child")).toBe(true);
    });
});

describe("canonical status read alignment", () => {
    it("runtime resolveCanonicalStatusKey uses status_key only", () => {
        expect(resolveCanonicalStatusKey({ status_key: "new_inquiry" })).toBe("new_inquiry");
        expect(resolveCanonicalStatusKey({ status_key: null })).toBeNull();
    });

    it("legacy fallback is isolated to maintenance helper (Phase 4 removal)", () => {
        expect(resolveLegacyStatusKeyWithTextFallback({ status_key: "new_inquiry", status: "open" })).toBe(
            "new_inquiry"
        );
        expect(resolveLegacyStatusKeyWithTextFallback({ status_key: null, status: "open" })).toBe("open");
    });

    it("reads OCM outcome from outcome_status_key only", () => {
        expect(resolveOcmOutcomeStatusKey({ outcome_status_key: "waitlisted" })).toBe("waitlisted");
    });
});

describe("canonical strict mode — lifecycle bindings", () => {
    it("all lifecycle bindings respect profile vs enrollment grain", () => {
        const errors: string[] = [];
        for (const binding of LIFECYCLE_FIELD_RULE_BINDINGS) {
            const err = assertLifecycleBindingGrain({
                rule_id: binding.rule_id,
                value_source: binding.value_source,
                field_key: binding.field_key,
                ocm_field: binding.ocm_field,
                customer_member_field: binding.customer_member_field,
            });
            if (err) errors.push(err);
        }
        expect(errors).toEqual([]);
    });
});
