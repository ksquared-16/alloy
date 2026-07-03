import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionPreflightBlockedPanel } from "@/components/admin/opportunity/ActionPreflightBlockedPanel";
import { APPROVE_ENROLLMENT_ACTION_KEY } from "@/lib/admin/actions/enrollmentApprovalConstants";

describe("ActionPreflightBlockedPanel", () => {
    it("renders action title, summary, blocking labels, reasons, and sources", () => {
        const html = renderToStaticMarkup(
            createElement(ActionPreflightBlockedPanel, {
                opportunityId: "opp-1",
                preflight: {
                    action_key: APPROVE_ENROLLMENT_ACTION_KEY,
                    title: "Approve enrollment — requirements",
                    summary: "Complete required information before continuing.",
                    blocking: [
                        {
                            field_key: "program_room_cohort_key",
                            label: "Classroom",
                            reason: "Classroom or placement target is required before enrollment approval.",
                            source: "action",
                        },
                        {
                            field_key: "schedule_type",
                            label: "Schedule",
                            reason: "Schedule is required before enrollment approval.",
                            source: "completion",
                        },
                    ],
                    recommended: [],
                    completion_requirements: {
                        ok: false,
                        blocking: [
                            {
                                entity_type: "opportunity",
                                entity_id: "opp-1",
                                field_key: "program_room_cohort_key",
                                label: "Classroom",
                                requirement_type: "required_before_action",
                                blocking_level: "hard_block",
                                missing_reason:
                                    "Classroom or placement target is required before enrollment approval.",
                                context: { action_key: APPROVE_ENROLLMENT_ACTION_KEY },
                            },
                            {
                                entity_type: "opportunity",
                                entity_id: "opp-1",
                                field_key: "schedule_type",
                                label: "Schedule",
                                requirement_type: "required_before_action",
                                blocking_level: "hard_block",
                                missing_reason: "Schedule is required before enrollment approval.",
                                context: { action_key: APPROVE_ENROLLMENT_ACTION_KEY },
                            },
                        ],
                        warnings: [],
                        recommendations: [],
                    },
                    effective_requirements: {
                        ok: false,
                        blocking: [],
                        recommended: [],
                        autoPopulate: [],
                        sourceSummary: {
                            layoutRules: 0,
                            actionRules: 2,
                            transitionRules: 0,
                            completionRules: 0,
                        },
                    },
                },
            })
        );

        expect(html).toContain("Approve enrollment — requirements");
        expect(html).toContain("Complete required information");
        expect(html).toContain("Classroom");
        expect(html).toContain("Classroom or placement target");
        expect(html).toContain("(action)");
        expect(html).toContain("Schedule");
        expect(html).toContain("(completion)");
        expect(html).toContain('data-action-preflight-blocked="true"');
        expect(html).toContain('data-completion-requirements-blocking="true"');
    });

    it("uses readiness enforced gaps when readiness is attached", () => {
        const html = renderToStaticMarkup(
            createElement(ActionPreflightBlockedPanel, {
                opportunityId: "opp-1",
                preflight: {
                    action_key: APPROVE_ENROLLMENT_ACTION_KEY,
                    title: "Approve enrollment — requirements",
                    summary: "Complete required information before continuing.",
                    blocking: [
                        {
                            field_key: "program_room_cohort_key",
                            label: "Classroom",
                            reason: "Classroom or placement target is required before enrollment approval.",
                            source: "action",
                        },
                    ],
                    recommended: [],
                    completion_requirements: {
                        ok: false,
                        blocking: [],
                        warnings: [],
                        recommendations: [],
                    },
                    effective_requirements: {
                        ok: false,
                        blocking: [],
                        recommended: [],
                        autoPopulate: [],
                        sourceSummary: {
                            layoutRules: 0,
                            actionRules: 1,
                            transitionRules: 0,
                            completionRules: 0,
                        },
                    },
                    readiness: {
                        contract_version: "1.0",
                        primary_state: "blocked",
                        trigger: "action_execute",
                        subject: { entity_type: "opportunity", entity_id: "opp-1" },
                        context: { org_id: "org-1" },
                        gaps: [
                            {
                                requirement_id: "child:program_interest",
                                scope_type: "record",
                                level: "enforced",
                                label: "Child · Program Interest",
                                missing_reason: "Missing program interest.",
                                failure_kind: "missing",
                                blocking: true,
                                field_key: "child:program_interest",
                            },
                        ],
                        counts: {
                            gaps_total: 1,
                            by_level: { recommended: 0, required: 0, enforced: 1 },
                            blocking: 1,
                            satisfied: 0,
                            configured: 1,
                        },
                        ok: false,
                    },
                },
            })
        );

        expect(html).toContain("required information is missing");
        expect(html).toContain('data-action-preflight-enforced-blockers="true"');
        expect(html).toContain("Child · Program Interest");
    });
});
