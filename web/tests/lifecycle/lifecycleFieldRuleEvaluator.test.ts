import { describe, expect, it } from "vitest";
import { buildLifecycleFieldRulesOverridePatch } from "@/lib/completion/lifecycleProgressionRequirementsConfig";
import { evaluateLifecycleActionRequirements } from "@/lib/completion/lifecycleActionRequirementCatalog";
import type { CompletionEvaluationContext } from "@/lib/completion/requirementValidationTypes";
import {
    evaluateFieldRulesForStage,
    extractPrimaryPersonSnapshot,
} from "@/lib/lifecycle/lifecycleFieldRuleEvaluator";

describe("lifecycleFieldRuleEvaluator", () => {
    it("extractPrimaryPersonSnapshot reads related primary_person", () => {
        const ctx: CompletionEvaluationContext = {
            phase: "action",
            entity_type: "opportunity",
            entity_id: "opp-1",
            action_key: "schedule_tour",
            values: {},
            related: {
                primary_person: {
                    first_name: "Jane",
                    email: null,
                    phone: "555-0100",
                },
            },
        };
        const snap = extractPrimaryPersonSnapshot(ctx);
        expect(snap.first_name).toBe("Jane");
        expect(snap.phone).toBe("555-0100");
    });

    it("blocks when person email required and missing", () => {
        const ctx: CompletionEvaluationContext = {
            phase: "action",
            entity_type: "opportunity",
            entity_id: "opp-1",
            action_key: "schedule_tour",
            status_from: "new_inquiry",
            values: { primary_person_id: "p1" },
            related: {
                primary_person: {
                    first_name: "Jane",
                    last_name: "Doe",
                    email: null,
                    phone: null,
                },
                department_metadata: buildLifecycleFieldRulesOverridePatch({
                    stage: "lead",
                    required_rule_ids: ["person:first_name", "person:email"],
                    recommended_rule_ids: [],
                    existingMetadata: {},
                }),
            },
        };
        const violations = evaluateFieldRulesForStage(ctx, "lead", {
            required_rule_ids: ["person:first_name", "person:email"],
            recommended_rule_ids: [],
        });
        expect(violations.some((v) => v.label.includes("Email"))).toBe(true);
    });

    it("reserves judgment on child rules when the children binding is absent", () => {
        // Unknown is not empty. A surface that never carried children must not report captured
        // names and DOBs as missing — that is what made What's Next claim a child already visible
        // on the same screen still needed a first name.
        const ctx: CompletionEvaluationContext = {
            phase: "action",
            entity_type: "opportunity",
            entity_id: "opp-1",
            action_key: "schedule_tour",
            values: {},
            related: {},
        };
        const violations = evaluateFieldRulesForStage(ctx, "lead", {
            required_rule_ids: ["child:first_name", "child:last_name", "child:date_of_birth"],
            recommended_rule_ids: [],
        });
        expect(violations).toEqual([]);
    });

    it("still reports missing child fields when the household genuinely has no children", () => {
        const ctx: CompletionEvaluationContext = {
            phase: "action",
            entity_type: "opportunity",
            entity_id: "opp-1",
            action_key: "schedule_tour",
            values: {},
            related: { inquiry_children: [] },
        };
        const violations = evaluateFieldRulesForStage(ctx, "lead", {
            required_rule_ids: ["child:date_of_birth"],
            recommended_rule_ids: [],
        });
        expect(violations.length).toBeGreaterThan(0);
    });

    it("does not report a captured child DOB as missing", () => {
        const ctx: CompletionEvaluationContext = {
            phase: "action",
            entity_type: "opportunity",
            entity_id: "opp-1",
            action_key: "schedule_tour",
            values: {},
            related: {
                inquiry_children: [
                    {
                        id: "cm-1",
                        customer_member_id: "cm-1",
                        first_name: "Ember",
                        last_name: "Fitz",
                        dob: "2024-06-06",
                    },
                ],
            },
        };
        const violations = evaluateFieldRulesForStage(ctx, "lead", {
            required_rule_ids: ["child:first_name", "child:last_name", "child:date_of_birth"],
            recommended_rule_ids: [],
        });
        expect(violations).toEqual([]);
    });

    it("evaluateLifecycleActionRequirements respects lead field_rules on schedule_tour", () => {
        const metadata = buildLifecycleFieldRulesOverridePatch({
            stage: "lead",
            required_rule_ids: ["person:email"],
            recommended_rule_ids: [],
            existingMetadata: {},
        });
        const ctx: CompletionEvaluationContext = {
            phase: "action",
            entity_type: "opportunity",
            entity_id: "opp-1",
            action_key: "schedule_tour",
            status_from: "new_inquiry",
            values: { primary_person_id: "p1" },
            related: {
                primary_person: { first_name: "Jane", email: null, phone: null },
                department_metadata: metadata,
                inquiry_children: [
                    {
                        id: "ocm-1",
                        program_category_id: "cat-infant",
                        schedule_type: "full_time",
                        start_date: "2026-09-01",
                    },
                ],
            },
        };
        const result = evaluateLifecycleActionRequirements(ctx);
        expect(result.ok).toBe(false);
        expect(result.blocking.some((v) => v.label.includes("Email"))).toBe(true);

        const okCtx: CompletionEvaluationContext = {
            ...ctx,
            related: {
                ...ctx.related,
                primary_person: { first_name: "Jane", email: "jane@example.com", phone: null },
            },
        };
        const ok = evaluateLifecycleActionRequirements(okCtx);
        expect(ok.blocking.some((v) => v.label.includes("Email"))).toBe(false);
    });

    it("child location_id OR opportunity location satisfies Site / Location", () => {
        const withOppLocation: CompletionEvaluationContext = {
            phase: "action",
            entity_type: "opportunity",
            entity_id: "opp-1",
            action_key: "advance",
            values: { location_id: "loc-north" },
            related: {
                inquiry_children: [
                    {
                        id: "cm-lennon",
                        customer_member_id: "cm-lennon",
                        first_name: "Lennon",
                        last_name: "Kurzman",
                        location_id: null,
                    },
                ],
                department_metadata: buildLifecycleFieldRulesOverridePatch({
                    stage: "waitlist",
                    required_rule_ids: ["child:location"],
                    recommended_rule_ids: [],
                    existingMetadata: {},
                }),
            },
        };
        const violations = evaluateFieldRulesForStage(withOppLocation, "waitlist", {
            required_rule_ids: ["child:location"],
            recommended_rule_ids: [],
        });
        expect(violations.some((v) => /Site|Location/i.test(v.label))).toBe(false);
    });

    it("reports Site / Location missing when neither child nor opportunity has location", () => {
        const ctx: CompletionEvaluationContext = {
            phase: "action",
            entity_type: "opportunity",
            entity_id: "opp-1",
            action_key: "advance",
            values: {},
            related: {
                inquiry_children: [
                    {
                        id: "cm-lennon",
                        customer_member_id: "cm-lennon",
                        first_name: "Lennon",
                        last_name: "Kurzman",
                        location_id: null,
                    },
                ],
                department_metadata: buildLifecycleFieldRulesOverridePatch({
                    stage: "waitlist",
                    required_rule_ids: ["child:location"],
                    recommended_rule_ids: [],
                    existingMetadata: {},
                }),
            },
        };
        const violations = evaluateFieldRulesForStage(ctx, "waitlist", {
            required_rule_ids: ["child:location"],
            recommended_rule_ids: [],
        });
        expect(violations.some((v) => /Site|Location/i.test(v.label))).toBe(true);
    });
});
