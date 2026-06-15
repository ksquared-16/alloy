import { describe, expect, it } from "vitest";
import {
    buildLifecycleIntentIdempotencyKey,
    resolvePrimaryWorkIntentForStage,
    selectPrimaryWorkTemplateFromPlan,
} from "@/lib/lifecycle/resolvePrimaryWorkIntentForStage";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

function leadPlan(overrides: Partial<StageOperatingPlanV1> = {}): StageOperatingPlanV1 {
    return {
        version: 1,
        lifecycle_key: "enrollment",
        stage_key: "lead",
        journey_segment: "family",
        work_templates: [],
        outcomes: [],
        outcome_rules: [],
        attention_rules: [],
        ...overrides,
    };
}

describe("selectPrimaryWorkTemplateFromPlan", () => {
    it("prefers primary=true over first required", () => {
        const plan = leadPlan({
            work_templates: [
                {
                    template_key: "review",
                    label: "Review Inquiry",
                    required: true,
                    due_policy: { kind: "same_day" },
                    owner_strategy: "record_owner",
                },
                {
                    template_key: "contact",
                    label: "Contact Family",
                    required: true,
                    primary: true,
                    due_policy: { kind: "offset_days", days: 1 },
                    owner_strategy: "record_owner",
                    work_definition_key: "contact_family",
                },
            ],
        });
        expect(selectPrimaryWorkTemplateFromPlan(plan)?.template_key).toBe("contact");
    });

    it("uses first required when no primary flag", () => {
        const plan = leadPlan({
            work_templates: [
                {
                    template_key: "optional",
                    label: "Optional",
                    required: false,
                    due_policy: { kind: "offset_days", days: 3 },
                    owner_strategy: "record_owner",
                },
                {
                    template_key: "required_first",
                    label: "Contact Family",
                    required: true,
                    due_policy: { kind: "same_day" },
                    owner_strategy: "record_owner",
                    work_definition_key: "contact_family",
                },
            ],
        });
        expect(selectPrimaryWorkTemplateFromPlan(plan)?.template_key).toBe("required_first");
    });

    it("returns null when templates exist but none primary or required", () => {
        const plan = leadPlan({
            work_templates: [
                {
                    template_key: "optional",
                    label: "Optional",
                    required: false,
                    due_policy: { kind: "offset_days", days: 1 },
                    owner_strategy: "record_owner",
                },
            ],
        });
        expect(selectPrimaryWorkTemplateFromPlan(plan)).toBeNull();
    });
});

describe("resolvePrimaryWorkIntentForStage", () => {
    it("maps lead to Make Contact / contact_family when no plan templates qualify", () => {
        expect(resolvePrimaryWorkIntentForStage("lead")).toMatchObject({
            work_intent_key: "make_contact",
            label: "Make Contact",
            work_definition_key: "contact_family",
            source: "legacy_map",
        });
    });

    it("uses configured primary template label and template_key as work_intent_key", () => {
        const plan = leadPlan({
            work_templates: [
                {
                    template_key: "contact_family_lead",
                    label: "Contact Family",
                    description: "Call or text the family",
                    required: true,
                    primary: true,
                    due_policy: { kind: "offset_days", days: 2 },
                    owner_strategy: "record_owner",
                    work_definition_key: "contact_family",
                },
            ],
        });
        expect(resolvePrimaryWorkIntentForStage("lead", plan)).toMatchObject({
            work_intent_key: "contact_family_lead",
            template_key: "contact_family_lead",
            label: "Contact Family",
            description: "Call or text the family",
            work_definition_key: "contact_family",
            due_policy: { kind: "offset_days", days: 2 },
            source: "operating_plan_template",
        });
    });

    it("falls back to legacy map when plan has no qualifying templates", () => {
        const plan = leadPlan({
            work_templates: [
                {
                    template_key: "optional",
                    label: "Optional follow-up",
                    required: false,
                    due_policy: { kind: "offset_days", days: 1 },
                    owner_strategy: "record_owner",
                },
            ],
        });
        expect(resolvePrimaryWorkIntentForStage("lead", plan)).toMatchObject({
            work_intent_key: "make_contact",
            source: "legacy_map",
        });
    });

    it("maps qualification to Gather Enrollment Information", () => {
        expect(resolvePrimaryWorkIntentForStage("qualification")).toMatchObject({
            work_intent_key: "gather_enrollment_information",
            label: "Gather Enrollment Information",
            work_definition_key: "collect_missing_information",
        });
    });

    it("returns null for enrolled", () => {
        expect(resolvePrimaryWorkIntentForStage("enrolled")).toBeNull();
    });

    it("builds stable lifecycle intent idempotency keys", () => {
        expect(
            buildLifecycleIntentIdempotencyKey({
                orgId: "org-1",
                opportunityId: "opp-1",
                stageKey: "lead",
                workIntentKey: "make_contact",
            }),
        ).toBe("lifecycle_intent:org-1:opp-1:lead:make_contact");
    });
});
