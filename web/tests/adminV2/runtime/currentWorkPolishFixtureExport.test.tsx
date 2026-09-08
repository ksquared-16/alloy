/**
 * Generate static Current Work collapsed-card HTML for Playwright viewport evidence.
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import CurrentWorkCard from "@/components/admin/focusPanel/cards/CurrentWorkCard";
import { resolvePublishedStageInputsForCurrentWork } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolvePublishedStageInputsForCurrentWork";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import { defaultStageOperatingPlanForEnrollmentStage } from "@/lib/lifecycle/defaultEnrollmentStageOperatingPlans";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import { enrollmentLeadWithFieldRulesPublishedDepartmentMetadata } from "@/tests/adminV2/runtime/fixtures/currentWorkPublishedPlanFixtures";

vi.mock("@/components/workIntent/useWorkIntentOutcomeCompletion", () => ({
    useWorkIntentOutcomeCompletion: () => ({
        completeOutcome: vi.fn(async () => {}),
        busy: false,
        error: null,
        clearError: vi.fn(),
    }),
}));

describe("Current Work polish fixture export", () => {
    it("writes collapsed-card-fixture.html for viewport screenshots", () => {
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
        const published = resolvePublishedStageInputsForCurrentWork({
            departmentMetadata: enrollmentLeadWithFieldRulesPublishedDepartmentMetadata(),
            builderStageKey: "lead",
        });
        const context: OperationalContext = {
            grain: "case",
            subject: { type: "opportunity", id: "opp-1", label: "Test Family" },
            businessProcess: { key: "enrollment", label: "Enrollment", stageKey: "lead" },
            perspective: null,
            truth: { id: "opp-1" },
            stageWorkRuntime: runtime,
            publishedStageInputs: published
                ? { ...published, operatorGuidance: "Confirm contact details before outreach." }
                : null,
            signals: {
                work: { primary: null, items: [], openCount: 1, overdueCount: 0, nextActionLabel: null },
                attention: { needsAttention: true, primaryReason: "First contact overdue", reasonCount: 1 },
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

        const markup = renderToStaticMarkup(
            React.createElement(CurrentWorkCard, {
                model: {
                    key: "current_work",
                    title: "Current Work",
                    insight: "Contact Family",
                    tier: "work",
                    span: "row",
                    density: "compact",
                    visible: true,
                    archetype: "status",
                },
                context,
            }),
        );
        const outDir = resolve(__dirname, "../../../../docs/sprints/07_2026/current-work-final-product-polish/evidence");
        mkdirSync(outDir, { recursive: true });
        const css = readFileSync(resolve(__dirname, "../../../app/adminV2/components/alloyOsRuntime.css"), "utf8");
        expect(markup).toContain('data-work-action="open-work"');
        expect(markup).toContain("Quick actions");
        expect(markup).not.toContain("Alternate paths");

        const html = `<!doctype html><html><head><meta charset="utf-8"/><style>
body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f4f6f8}
.qa-shell{max-width:420px;margin:24px auto;padding:12px;background:#fff;border:1px solid #dbe2e8;border-radius:12px}
${css}
</style></head><body><div class="qa-shell">${markup}</div></body></html>`;
        writeFileSync(resolve(outDir, "collapsed-card-fixture.html"), html);
    });
});
