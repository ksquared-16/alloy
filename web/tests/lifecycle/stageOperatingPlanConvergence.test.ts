import { describe, expect, it } from "vitest";
import {
    normalizeOperatingPlanDraftForPersist,
    normalizeWorkTemplatePrimaryFlags,
    outcomeAutomationSummaries,
    resolveEffectivePrimaryWorkTemplate,
} from "@/lib/lifecycle/stageOperatingPlanConvergence";
import {
    stageOperatingPlanDraftToPersisted,
    type StageOperatingPlanEditorDraft,
} from "@/lib/lifecycle/stageOperatingPlanEditorModel";
import { parseStageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { resolvePrimaryWorkIntentForStage } from "@/lib/lifecycle/resolvePrimaryWorkIntentForStage";

describe("stageOperatingPlanConvergence", () => {
    it("marks first required work item primary when none flagged", () => {
        const normalized = normalizeWorkTemplatePrimaryFlags([
            {
                template_key: "review_inquiry",
                label: "Review Inquiry",
                required: true,
                due_policy: { kind: "offset_days", days: 1 },
                owner_strategy: "record_owner",
            },
            {
                template_key: "contact_family",
                label: "Contact Family",
                required: false,
                due_policy: { kind: "offset_days", days: 2 },
                owner_strategy: "record_owner",
            },
        ]);
        expect(normalized[0]?.primary).toBe(true);
        expect(normalized[1]?.primary).toBeFalsy();
        expect(resolveEffectivePrimaryWorkTemplate({ work_templates: normalized })?.template_key).toBe(
            "review_inquiry",
        );
    });

    it("resolves primary work intent from operating plan work template", () => {
        const plan = parseStageOperatingPlanV1({
            version: 1,
            lifecycle_key: "enrollment",
            stage_key: "lead",
            journey_segment: "family",
            work_templates: [
                {
                    template_key: "review_inquiry",
                    label: "Review Inquiry",
                    required: true,
                    primary: true,
                    due_policy: { kind: "offset_days", days: 1 },
                    owner_strategy: "record_owner",
                    work_definition_key: "collect_missing_information",
                },
            ],
            outcomes: [],
            outcome_rules: [],
            attention_rules: [],
        });
        expect(resolvePrimaryWorkIntentForStage("lead", plan)).toMatchObject({
            work_intent_key: "review_inquiry",
            label: "Review Inquiry",
            provenance: "operating_plan",
        });
    });

    it("shows outcome automation summaries read-only", () => {
        const lines = outcomeAutomationSummaries("qualified", [
            {
                rule_key: "qualified_move",
                when_outcome_key: "qualified",
                targets: [{ kind: "move_to_stage", stage_key: "qualification" }],
            },
        ]);
        expect(lines).toContain("Move to qualification");
    });

    it("persists Lead stage usability configuration", () => {
        const draft: StageOperatingPlanEditorDraft = {
            purpose: "Qualify inbound inquiries quickly.",
            journey_segment: "family",
            work_templates: [
                {
                    template_key: "review_inquiry",
                    label: "Review Inquiry",
                    description: "Review web form or email inquiry.",
                    required: true,
                    primary: true,
                    due_policy: { kind: "offset_days", days: 1 },
                    owner_strategy: "record_owner",
                },
            ],
            outcomes: [
                {
                    outcome_key: "qualified",
                    label: "Qualified",
                    work_template_key: "review_inquiry",
                    successful: true,
                },
                {
                    outcome_key: "need_more_info",
                    label: "Need More Information",
                    work_template_key: "review_inquiry",
                },
                {
                    outcome_key: "duplicate",
                    label: "Duplicate",
                    work_template_key: "review_inquiry",
                },
                {
                    outcome_key: "closed_lost",
                    label: "Closed Lost",
                    work_template_key: "review_inquiry",
                },
            ],
            outcome_rules: [
                {
                    rule_key: "qualified_move",
                    when_outcome_key: "qualified",
                    targets: [{ kind: "move_to_stage", stage_key: "qualification" }],
                },
            ],
            attention_rules: [
                {
                    rule_key: "work_overdue_1d",
                    kind: "work_overdue",
                    label: "Review Inquiry overdue",
                    severity: "medium",
                    threshold: 1,
                    template_key: "review_inquiry",
                    targets: [],
                },
                {
                    rule_key: "stage_age_7d",
                    kind: "stage_age_exceeded",
                    label: "Lead stage aging",
                    severity: "medium",
                    threshold: 7,
                    targets: [],
                },
            ],
        };

        const normalized = normalizeOperatingPlanDraftForPersist(draft);
        const persisted = stageOperatingPlanDraftToPersisted(normalized, "lead");
        expect(persisted?.work_templates[0]?.primary).toBe(true);
        expect(persisted?.outcomes.filter((o) => o.work_template_key === "review_inquiry")).toHaveLength(4);
        expect(persisted?.attention_rules).toHaveLength(2);
        expect(persisted?.attention_rules[0]?.targets.length).toBeGreaterThan(0);
        expect(persisted?.attention_rules[0]?.kind).toBe("work_overdue");
        expect(persisted?.attention_rules[1]?.kind).toBe("stage_age_exceeded");
    });
});

describe("business process editor convergence wiring", () => {
    it("operating plan editor exposes work items, transitions, and attention; outcomes live on Work Templates", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const editor = readFileSync(
            resolve(__dirname, "../../components/adminV2/settings/lifecycle/LifecycleStageOperatingPlanEditor.tsx"),
            "utf8",
        );
        expect(editor).toContain("Work items");
        expect(editor).toContain("Primary");
        expect(editor).not.toContain("LifecycleStageOutcomeDefinitionsEditor");
        expect(editor).toContain("LifecycleStageWorkTemplateActionsEditor");
        expect(editor).toContain("LifecycleStageOutgoingTransitionsEditor");
        expect(editor).toContain("LifecycleStageAttentionRulesEditor");

        const workTemplate = readFileSync(
            resolve(__dirname, "../../components/adminV2/settings/lifecycle/LifecycleStageWorkTemplateActionsEditor.tsx"),
            "utf8",
        );
        expect(workTemplate).toContain("LifecycleStageOutcomeDefinitionsEditor");
        expect(workTemplate).toContain("Available Outcomes");
    });

    it("attention rules editor supports configured rule types", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const catalog = readFileSync(
            resolve(__dirname, "../../lib/lifecycle/stageAttentionRuleCatalog.ts"),
            "utf8",
        );
        const editor = readFileSync(
            resolve(
                __dirname,
                "../../components/adminV2/settings/lifecycle/LifecycleStageAttentionRulesEditor.tsx",
            ),
            "utf8",
        );
        expect(catalog).toContain("work_overdue");
        expect(catalog).toContain("stage_age_exceeded");
        expect(catalog).toContain("waiting_on_family");
        expect(editor).toContain("stage-attention-add-rule");
    });

    it("step rail in action workspace is non-clickable progress", async () => {
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const rail = readFileSync(
            resolve(__dirname, "../../components/admin/actions/ActionWorkspaceStepRail.tsx"),
            "utf8",
        );
        expect(rail).toContain("cursor-default");
    });
});
