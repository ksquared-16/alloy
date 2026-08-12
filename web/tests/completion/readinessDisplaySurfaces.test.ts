import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import OperationalReadinessGapsPanel from "@/components/admin/completion/OperationalReadinessGapsPanel";
import { OpportunityDrawerRequiredInformationPanel } from "@/components/admin/opportunity/OpportunityDrawerRequiredInformationPanel";
import { ActionPreflightBlockedPanel } from "@/components/admin/opportunity/ActionPreflightBlockedPanel";
import {
    groupReadinessGapsByLevel,
    readinessDisplayReadyMessage,
} from "@/lib/completion/readinessDisplayPresentation";
import type { ReadinessResult } from "@/lib/completion/readinessTypes";

function readinessFixture(overrides: Partial<ReadinessResult> = {}): ReadinessResult {
    return {
        contract_version: "1.0",
        primary_state: "needs_information",
        trigger: "record_view",
        subject: { entity_type: "opportunity", entity_id: "opp-1" },
        context: { org_id: "org-1" },
        gaps: [],
        counts: {
            gaps_total: 0,
            by_level: { recommended: 0, required: 0, enforced: 0 },
            blocking: 0,
            satisfied: 0,
            configured: 0,
        },
        ok: true,
        ...overrides,
    };
}

describe("readiness display surfaces", () => {
    it("drawer displays ready state when readiness.ok is true", () => {
        const html = renderToStaticMarkup(
            createElement(OpportunityDrawerRequiredInformationPanel, {
                readiness: readinessFixture({ ok: true, primary_state: "ready" }),
            })
        );
        expect(html).toContain('data-operational-readiness-ready="true"');
        expect(html).toContain(readinessDisplayReadyMessage());
    });

    it("drawer groups Recommended, Required, and Enforced gaps", () => {
        const readiness = readinessFixture({
            ok: false,
            primary_state: "needs_information",
            gaps: [
                {
                    requirement_id: "child:age_group",
                    scope_type: "record",
                    level: "recommended",
                    label: "Child · Age Group",
                    missing_reason: "Missing age group.",
                    failure_kind: "missing",
                    blocking: false,
                },
                {
                    requirement_id: "child:date_of_birth",
                    scope_type: "record",
                    level: "required",
                    label: "Child · Date of Birth",
                    missing_reason: "Missing date of birth.",
                    failure_kind: "missing",
                    blocking: false,
                },
                {
                    requirement_id: "child:program_interest",
                    scope_type: "record",
                    level: "enforced",
                    label: "Child · Program Interest",
                    missing_reason: "Missing program interest.",
                    failure_kind: "missing",
                    blocking: true,
                },
            ],
        });
        const groups = groupReadinessGapsByLevel(readiness);
        expect(groups.map((g) => g.level)).toEqual(["enforced", "required", "recommended"]);

        const html = renderToStaticMarkup(
            createElement(OperationalReadinessGapsPanel, { readiness })
        );
        expect(html).toContain('data-operational-readiness-level="enforced"');
        expect(html).toContain('data-operational-readiness-level="required"');
        expect(html).toContain('data-operational-readiness-level="recommended"');
        expect(html).toContain("Must be completed before gated actions can run.");
    });

    it("drawer gracefully handles missing readiness", () => {
        const html = renderToStaticMarkup(
            createElement(OpportunityDrawerRequiredInformationPanel, { readiness: null })
        );
        expect(html).toBe("");
    });

    it("action preflight blocked panel displays Enforced gaps from readiness", () => {
        const html = renderToStaticMarkup(
            createElement(ActionPreflightBlockedPanel, {
                opportunityId: "opp-1",
                preflight: {
                    action_key: "schedule_tour",
                    title: "Schedule tour — requirements",
                    summary: "Complete required information before continuing.",
                    blocking: [],
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
                            actionRules: 0,
                            transitionRules: 0,
                            completionRules: 0,
                        },
                    },
                    readiness: readinessFixture({
                        ok: false,
                        primary_state: "blocked",
                        trigger: "action_execute",
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
                            {
                                requirement_id: "child:age_group",
                                scope_type: "record",
                                level: "recommended",
                                label: "Child · Age Group",
                                missing_reason: "Missing age group.",
                                failure_kind: "missing",
                                blocking: false,
                            },
                        ],
                    }),
                },
            })
        );

        expect(html).toContain("required information is missing");
        expect(html).toContain('data-action-preflight-enforced-blockers="true"');
        expect(html).toContain("Child · Program Interest");
        expect(html).toContain('data-action-preflight-guidance="true"');
        expect(html).toContain("Child · Age Group");
    });

    it("Recommended and Required gaps render as guidance, not blockers", () => {
        const html = renderToStaticMarkup(
            createElement(ActionPreflightBlockedPanel, {
                opportunityId: "opp-1",
                preflight: {
                    action_key: "schedule_tour",
                    title: "Schedule tour — requirements",
                    summary: "Complete required information before continuing.",
                    blocking: [
                        {
                            field_key: "legacy",
                            label: "Legacy blocker",
                            reason: "Legacy",
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
                            actionRules: 0,
                            transitionRules: 0,
                            completionRules: 0,
                        },
                    },
                    readiness: readinessFixture({
                        ok: false,
                        gaps: [
                            {
                                requirement_id: "child:age_group",
                                scope_type: "record",
                                level: "recommended",
                                label: "Child · Age Group",
                                missing_reason: "Missing.",
                                failure_kind: "missing",
                                blocking: false,
                            },
                            {
                                requirement_id: "child:date_of_birth",
                                scope_type: "record",
                                level: "required",
                                label: "Child · Date of Birth",
                                missing_reason: "Missing.",
                                failure_kind: "missing",
                                blocking: false,
                            },
                        ],
                    }),
                },
            })
        );

        expect(html).not.toContain('data-action-preflight-enforced-blockers="true"');
        expect(html).toContain('data-action-preflight-guidance-item="true"');
        expect(html).toContain('data-action-preflight-gap-level="recommended"');
        expect(html).toContain('data-action-preflight-gap-level="required"');
        expect(html).not.toContain('data-action-preflight-gap-level="enforced"');
    });

});
