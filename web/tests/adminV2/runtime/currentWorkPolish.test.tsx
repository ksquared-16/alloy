/**
 * Current Work polish — outcome effect copy, Back navigation, CSS contracts.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import StageWorkOutcomePicker from "@/components/admin/StageWorkOutcomePicker";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import { buildStageWorkOutcomeAutomationPreview } from "@/lib/lifecycle/buildStageWorkOutcomeAutomationPreview";
import { stageOperatingPlanDraftToPersisted } from "@/lib/lifecycle/stageOperatingPlanEditorModel";
import {
    formatStageWorkOutcomeEffectForPicker,
    normalizeOperatorOutcomeEffectLabel,
} from "@/lib/workIntent/stageWorkOutcomeEffectLines";
import { projectCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/projectCurrentWork";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

function contactFamilyOnlyRuntime(): StageWorkRuntimeProjection {
    const defaults = defaultStageOperatingPlanForEnrollmentStage("lead")!;
    const contactTemplate = defaults.work_templates.find((t) => t.template_key === "contact_family")!;
    const plan = stageOperatingPlanDraftToPersisted(
        {
            purpose: defaults.purpose ?? "",
            journey_segment: defaults.journey_segment,
            work_templates: [{ ...contactTemplate, primary: true }],
            outcomes: defaults.outcomes.filter((o) => o.work_template_key === "contact_family"),
            outcome_rules: defaults.outcome_rules,
            attention_rules: defaults.attention_rules,
        },
        "lead",
    )!;
    return {
        stage_key: "lead",
        stage_label: "Lead",
        purpose: plan.purpose ?? "",
        journey_segment: plan.journey_segment,
        template_keys: ["contact_family"],
        primary: {
            template_key: "contact_family",
            label: "Contact Family",
            role: "primary",
            state: "open",
            requires_outcome_picker: true,
            work_id: "work-contact",
            due_at: null,
            due_urgency: "none",
            attempt_count: 0,
            last_outcome: null,
            completed_at: null,
            outcomes: plan.outcomes,
            completion_policy_summary: null,
            completion_policy_min_attempts: null,
            completion_policy_max_attempts: null,
            outcome_automation_preview: buildStageWorkOutcomeAutomationPreview({
                plan,
                templateKey: "contact_family",
            }),
        },
        additional: [],
        execution: {
            department_id: "dept-1",
            subject: { journey_segment: "family", opportunity_id: "opp-1" },
            requires_outcome_picker: true,
        },
    };
}

describe("outcome effect label normalization", () => {
    it("rewrites Reopen: runtime copy to Continue … work", () => {
        expect(normalizeOperatorOutcomeEffectLabel("Reopen: Contact Family")).toBe(
            "Continue Contact Family work",
        );
    });

    it("formats picker effects for no-preview retry outcomes", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("lead")!;
        const outcomes = plan.outcomes.filter((o) => o.work_template_key === "contact_family");
        const effect = formatStageWorkOutcomeEffectForPicker({
            previews: [],
            outcomeKey: "left_message",
            outcomes,
            workTitle: "Contact Family",
        });
        expect(effect).toBe("Continue Contact Family work");
        expect(effect).not.toMatch(/Reopen:/i);
    });

    it("renders effect on every outcome row", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("lead")!;
        const outcomes = plan.outcomes.filter((o) => o.work_template_key === "contact_family");
        const html = renderToStaticMarkup(
            <StageWorkOutcomePicker
                workTitle="Contact Family"
                outcomes={outcomes}
                automationPreview={[]}
                variant="focus"
                onSelect={() => {}}
                onCancel={() => {}}
            />,
        );
        expect(html).not.toContain("Reopen:");
        expect(html.match(/alloy-os-outcome-picker__tile-effect/g)?.length).toBe(outcomes.length);
        expect(html).toContain("← Back");
        expect(html).not.toContain(">Cancel<");
    });
});

describe("Current Work derivation — no Review Lead fallback", () => {
    it("uses only configured primary template when Review Lead is absent from plan", () => {
        const runtime = contactFamilyOnlyRuntime();
        const context: OperationalContext = {
            grain: "case",
            subject: { type: "opportunity", id: "opp-1", label: "Test" },
            businessProcess: { key: "enrollment", label: "Enrollment", stageKey: "lead" },
            perspective: null,
            truth: { id: "opp-1" },
            stageWorkRuntime: runtime,
            signals: {
                work: { primary: null, items: [], openCount: 1, overdueCount: 0, nextActionLabel: null },
                attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
                tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
                communications: {
                    scheduledSendCount: 0,
                    nextFollowUpAt: null,
                    hasOutreach: false,
                    nextScheduledSendId: null,
                },
                billing: {
                    billingConfigured: false,
                    billingContactName: null,
                    billingContactEmail: null,
                    tuitionRateLabel: null,
                    feeBalanceCents: null,
                },
            },
            capabilities: { canMutate: true, maskedChannels: false },
            status: "ready",
        };
        const vm = projectCurrentWork(context);
        expect(vm.title).toBe("Contact Family");
        expect(vm.title).not.toContain("Review Lead");
        expect(vm.checklist.some((i) => i.label === "Review Lead")).toBe(false);
    });
});

describe("Current Work polish contracts", () => {
    it("picker Back returns to working phase — not closeFocus", () => {
        const src = readFileSync(
            path.join(process.cwd(), "components/admin/focusPanel/cards/CurrentWorkCard.tsx"),
            "utf8",
        );
        expect(src).toContain('setCompletionPhase("working")');
        expect(src).not.toMatch(/onCancel=\{\(\) => onBack\(\)\}/);
    });

    it("status pill uses subtle variant without border", () => {
        const css = readFileSync(
            path.join(process.cwd(), "app/adminV2/components/alloyOsRuntime.css"),
            "utf8",
        );
        expect(css).toMatch(
            /\[data-work-status-pill="summary"\][\s\S]*border:\s*none/,
        );
    });
});
