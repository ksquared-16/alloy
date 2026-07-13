/**
 * Current Work + Process Builder QA regression tests.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import CurrentWorkCard from "@/components/admin/focusPanel/cards/CurrentWorkCard";
import { buildCurrentWorkSurfaceVM } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkSurfaceVM";
import { resolveCurrentWorkFieldRuleDisplayLabel } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkFieldRuleDisplayLabel";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";

vi.mock("@/components/workIntent/useWorkIntentOutcomeCompletion", () => ({
    useWorkIntentOutcomeCompletion: () => ({
        completeOutcome: vi.fn(async () => {}),
        busy: false,
        error: null,
        clearError: vi.fn(),
    }),
}));

function baseContext(runtime: StageWorkRuntimeProjection | null, overrides?: Partial<OperationalContext>): OperationalContext {
    return {
        grain: "case",
        subject: { type: "opportunity", id: "opp-1", label: "Test Family" },
        businessProcess: { key: "enrollment", label: "Enrollment", stageKey: "tour" },
        perspective: null,
        truth: { id: "opp-1" },
        stageWorkRuntime: runtime,
        signals: {
            work: { primary: null, items: [], openCount: 1, overdueCount: 0, nextActionLabel: null },
            attention: { needsAttention: true, primaryReason: "Missing tour date", reasonCount: 1 },
            tour: { scheduled: false, startAt: null, statusLabel: null, bookingId: null },
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
        ...overrides,
    };
}

describe("Current Work semantic readiness VM", () => {
    it("status and progress render separately — no combined percent badge source", () => {
        const cardSource = readFileSync(
            resolve(__dirname, "../../../components/admin/focusPanel/cards/CurrentWorkCard.tsx"),
            "utf8",
        );
        expect(cardSource).not.toContain("surface.progress.percent}%");
        expect(cardSource).toContain("surface.readiness");
    });

    it("blocked reason is visible in readiness VM", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("tour");
        const runtime: StageWorkRuntimeProjection = {
            stage_key: "tour",
            stage_label: "Tour",
            purpose: plan?.purpose ?? "",
            journey_segment: "family",
            template_keys: ["schedule_tour"],
            primary: {
                template_key: "schedule_tour",
                label: "Schedule Tour",
                role: "primary",
                state: "open",
                requires_outcome_picker: true,
                work_id: "work-1",
                due_at: null,
                due_urgency: "none",
                attempt_count: 0,
                last_outcome: null,
                completed_at: null,
                outcomes: plan?.outcomes ?? [],
                completion_policy_summary: null,
                completion_policy_min_attempts: null,
                completion_policy_max_attempts: null,
                outcome_automation_preview: [],
            },
            additional: [],
            execution: {
                department_id: "dept-1",
                subject: { journey_segment: "family", opportunity_id: "opp-1" },
                requires_outcome_picker: true,
            },
        };
        const vm = buildCurrentWorkSurfaceVM({ context: baseContext(runtime) });
        expect(vm.statusLabel).toBe("Blocked");
        expect(vm.readiness.reasonLabel).toBe("Missing tour date");
        expect(vm.readiness.state).toBe("blocked");
    });

    it("requirements disclosure defaults collapsed in summary markup", () => {
        const plan = defaultStageOperatingPlanForEnrollmentStage("lead")!;
        const runtime: StageWorkRuntimeProjection = {
            stage_key: "lead",
            stage_label: "Lead",
            purpose: plan.purpose ?? "",
            journey_segment: "family",
            template_keys: ["contact_family"],
            primary: {
                template_key: "contact_family",
                label: "Contact Family",
                role: "primary",
                state: "open",
                requires_outcome_picker: true,
                work_id: "work-1",
                due_at: null,
                due_urgency: "none",
                attempt_count: 0,
                last_outcome: null,
                completed_at: null,
                outcomes: plan.outcomes.filter((o) => o.work_template_key === "contact_family"),
                completion_policy_summary: null,
                completion_policy_min_attempts: null,
                completion_policy_max_attempts: null,
                outcome_automation_preview: [],
            },
            additional: [],
            execution: {
                department_id: "dept-1",
                subject: { journey_segment: "family", opportunity_id: "opp-1" },
                requires_outcome_picker: true,
            },
        };
        const context = baseContext(runtime, {
            signals: {
                ...baseContext(runtime).signals,
                attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
            },
        });
        const html = renderToStaticMarkup(
            <CurrentWorkCard
                model={{
                    key: "current_work",
                    title: "Current Work",
                    insight: "Contact Family",
                    tier: "work",
                    span: "row",
                    density: "compact",
                    visible: true,
                    archetype: "status",
                }}
                context={context}
            />,
        );
        expect(html).toContain('data-work-requirements-trigger="true"');
        expect(html).toContain('aria-expanded="false"');
        expect(html).not.toContain("Location Id");
    });
});

describe("canonical field label resolution", () => {
    it("Location Id never appears when schools catalog label exists", () => {
        const label = resolveCurrentWorkFieldRuleDisplayLabel("custom:opportunity:schools");
        expect(label).not.toBe("Location Id");
        expect(label).not.toMatch(/Id$/);
    });

    it("missing metadata uses safe humanized fallback", () => {
        const label = resolveCurrentWorkFieldRuleDisplayLabel("custom:opportunity:site_location");
        expect(label).toBe("Site Location");
    });
});

describe("stage validation duplicate error", () => {
    it("unified save sets only stageSaveError for missing status on manual-selection stages", () => {
        const source = readFileSync(
            resolve(__dirname, "../../../components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx"),
            "utf8",
        );
        const block = source.slice(
            source.indexOf("if (effectiveKeys.length < 1)"),
            source.indexOf("setStageSaveState(\"saving\")"),
        );
        expect(block).toContain("setStageSaveError(message)");
        expect(block).toContain("setStatusesError(null)");
        expect(block).not.toMatch(/setStatusesError\(message\)/);
    });
});
