import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CreateLeadDraftLeadColumn } from "@/components/admin/actions/CreateLeadDraftLeadColumn";
import { CreateLeadRequiredChecklistRow } from "@/components/admin/actions/CreateLeadRequiredChecklistRow";
import { IntakeHouseholdCommitReviewPanel } from "@/components/admin/intake/IntakeHouseholdCommitReviewPanel";
import { IntakeReviewWarningsBanner } from "@/components/admin/intake/IntakeReviewWarningsBanner";
import { ActionWorkspaceSuccessState } from "@/components/admin/actions/ActionWorkspaceSuccessState";
import { buildCreateLeadCommitSelection } from "@/lib/intake/commit/createLeadCommitSelection";
import { resolveCreateLeadRequiredChecklist } from "@/lib/admin/actions/resolveCreateLeadRequiredChecklist";
import { resolveCreateLeadPostCreateRecommendations } from "@/lib/admin/actions/resolveCreateLeadPostCreateRecommendations";
import { mapBosRecommendationsToSuccessActions } from "@/lib/admin/actions/mapBosRecommendationsToSuccessActions";
import {
    buildCreateLeadRecordCardHints,
    filterGlobalCreateLeadValidationIssues,
    partitionIntakeReviewWarnings,
} from "@/lib/intake/review/classifyIntakeReviewWarnings";
import type { IntakeHouseholdCandidate } from "@/lib/intake/types";

const HOUSEHOLD: IntakeHouseholdCandidate = {
    household_id: "household-1",
    parents_guardians: [],
    parents: [
        {
            candidate_id: "p1",
            role: "parent",
            first_name: "Molly",
            last_name: "Wright",
            emails: ["molly@test.com"],
            phones: [],
            dob: null,
            age_years: null,
            calculated_age: null,
            program_interest: null,
            source_fact_ids: [],
            confidence: "high",
            validation_state: "valid",
        },
        {
            candidate_id: "p2",
            role: "parent",
            first_name: "Jason",
            last_name: "Wright",
            emails: [],
            phones: [],
            dob: null,
            age_years: null,
            calculated_age: null,
            program_interest: null,
            source_fact_ids: [],
            confidence: "high",
            validation_state: "valid",
        },
    ],
    household_contacts: [
        {
            kind: "email",
            value: "molly@test.com",
            raw_value: "molly@test.com",
            validation_state: "valid",
            source_fact_ids: [],
        },
    ],
    children: [
        {
            candidate_id: "c1",
            role: "child",
            first_name: "Mckenzie",
            last_name: "Wright",
            emails: [],
            phones: [],
            dob: "2018-01-01",
            age_years: null,
            calculated_age: null,
            program_interest: null,
            source_fact_ids: [],
            confidence: "high",
            validation_state: "valid",
            last_name_inferred: true,
        },
    ],
    address: null,
    location: {
        label: "North Campus",
        resolved_value: null,
        resolved_label: null,
        source_fact_ids: [],
        confidence: "medium",
        validation_state: "unknown",
    },
    source: null,
    notes: null,
    program_interest: null,
    desired_start_date: null,
    relationships: [],
    unassigned_fact_ids: [],
    unmapped_facts: [],
    review_warnings: [
        {
            code: "extra_parents_commit_limited",
            severity: "info",
            message: "Additional guardians detected (Jason Wright) — included in commit when selected and valid.",
        },
        {
            code: "child_last_name_inferred",
            severity: "info",
            message: 'Child last name "Wright" inferred for Mckenzie from household parents — confirm before commit.',
        },
        {
            code: "location_unmatched",
            severity: "warning",
            message: "Location could not be matched — select a site before creating the lead.",
        },
    ],
    commit_limited_to_primary: false,
};

describe("partitionIntakeReviewWarnings", () => {
    it("keeps only global blockers in the banner partition", () => {
        const { globalWarnings, addressWarnings } = partitionIntakeReviewWarnings(HOUSEHOLD.review_warnings);
        expect(globalWarnings.map((w) => w.code)).toEqual(["location_unmatched"]);
        expect(addressWarnings).toEqual([]);
    });
});

describe("buildCreateLeadRecordCardHints", () => {
    it("renders record-level hints on parent and child cards", () => {
        const selection = buildCreateLeadCommitSelection(HOUSEHOLD);
        const secondaryParent = selection.parents.find((p) => p.candidate_id === "p2")!;
        const child = selection.children[0]!;

        expect(buildCreateLeadRecordCardHints({ record: selection.parents[0]!, household: HOUSEHOLD })).toContain(
            "Included in commit",
        );
        expect(buildCreateLeadRecordCardHints({ record: secondaryParent, household: HOUSEHOLD })).toContain(
            "Secondary guardian",
        );
        expect(buildCreateLeadRecordCardHints({ record: child, household: HOUSEHOLD })).toContain(
            "Last name inferred — confirm",
        );

        const html = renderToStaticMarkup(
            <IntakeHouseholdCommitReviewPanel
                household={HOUSEHOLD}
                selection={selection}
                onSelectionChange={() => undefined}
            />,
        );
        expect(html).toContain('data-testid="commit-record-hints-p2"');
        expect(html).toContain("Secondary guardian");
        expect(html).toContain('data-testid="commit-record-hints-c1"');
        expect(html).toContain("Last name inferred — confirm");
        expect(html).not.toContain("Additional guardians detected");
    });
});

describe("CreateLeadRequiredChecklistRow", () => {
    it("shows required checklist status above commit preview", () => {
        const selection = buildCreateLeadCommitSelection(HOUSEHOLD);
        const items = resolveCreateLeadRequiredChecklist({
            selection,
            values: { location_id: "site-1" },
            requireLocation: true,
            reviewWarnings: HOUSEHOLD.review_warnings,
            household: HOUSEHOLD,
        });
        const html = renderToStaticMarkup(<CreateLeadRequiredChecklistRow items={items} />);
        expect(html).toContain('data-testid="create-lead-required-checklist"');
        expect(html).toContain('data-testid="create-lead-required-item-primary-guardian"');
        expect(html).toContain('data-testid="create-lead-required-item-valid-contact"');
        expect(html).toContain('data-testid="create-lead-required-item-location"');
        expect(html).toContain('data-status="ok"');
    });
});

describe("CreateLeadDraftLeadColumn household review polish", () => {
    it("hides flat required section and shows global banner only for blockers", () => {
        const selection = buildCreateLeadCommitSelection(HOUSEHOLD);
        const html = renderToStaticMarkup(
            <CreateLeadDraftLeadColumn
                findings={[]}
                suggestions={[]}
                analyzing={false}
                manualMode={false}
                draftEditMode
                sections={[
                    {
                        key: "context",
                        label: "Lead",
                        fields: [
                            {
                                payload_key: "location_id",
                                field_label: "Location",
                                section: "context",
                                section_label: "Lead",
                                tier: "required",
                                value_kind: "select",
                            },
                        ],
                    },
                ]}
                values={{ location_id: "" }}
                intakeSpec={null}
                requiredPayloadKeys={["location_id"]}
                onFieldChange={() => undefined}
                onSuggestionValueChange={() => undefined}
                onToggleSuggestion={() => undefined}
                onApplySuggestions={() => undefined}
                selectedSuggestionCount={0}
                analyzeError={null}
                validationIssues={filterGlobalCreateLeadValidationIssues(["Location is required."])}
                household={HOUSEHOLD}
                commitSelection={selection}
                onCommitSelectionChange={() => undefined}
            />,
        );

        expect(html).toContain('data-testid="create-lead-required-checklist"');
        expect(html).not.toContain('data-testid="create-lead-gather-section-context"');
        expect(html).not.toContain("Required to create lead");
        expect(html).not.toContain('data-testid="action-workspace-bos-missing-hints"');
        expect(html).toContain('data-testid="intake-review-warnings-banner"');
        expect(html).toContain("Location could not be matched");
        expect(html).not.toContain("Additional guardians detected");
    });
});

describe("IntakeReviewWarningsBanner", () => {
    it("renders message-only global blockers", () => {
        const html = renderToStaticMarkup(
            <IntakeReviewWarningsBanner messages={["Location is required.", "A valid email or phone is required."]} />,
        );
        expect(html).toContain('data-testid="intake-review-warnings-banner"');
        expect(html).toContain("Location is required.");
    });
});

describe("resolveCreateLeadPostCreateRecommendations", () => {
    const values = {
        first_name: "Molly",
        last_name: "Wright",
        child_first_name: "Mckenzie",
        child_last_name: "Wright",
        child_program: "prog-1",
        child_desired_start_date: "2026-09-01",
        location_id: "site-1",
    };

    it("excludes unconfigured actions", () => {
        const recommendations = resolveCreateLeadPostCreateRecommendations(values, { availableActionKeys: [] });
        expect(recommendations.some((r) => r.key === "schedule-tour")).toBe(false);
        expect(recommendations.some((r) => r.key === "send-welcome")).toBe(false);
    });

    it("includes configured actions only", () => {
        const recommendations = resolveCreateLeadPostCreateRecommendations(values, {
            availableActionKeys: ["schedule_tour", "send_welcome_email"],
        });
        expect(recommendations.find((r) => r.key === "schedule-tour")?.readiness).toBe("ready");
        expect(recommendations.find((r) => r.key === "send-welcome")?.readiness).toBe("ready");
    });

    it("does not emit coming soon recommendations", () => {
        const recommendations = resolveCreateLeadPostCreateRecommendations(values, {
            availableActionKeys: ["schedule_tour"],
        });
        expect(recommendations.every((r) => r.readiness !== "coming_soon")).toBe(true);
        const actions = mapBosRecommendationsToSuccessActions(recommendations, { onOpenLead: () => undefined });
        expect(actions.some((a) => a.status === "Template ready soon")).toBe(false);
        expect(actions.some((a) => a.id === "send-welcome")).toBe(false);
    });
});

describe("ActionWorkspaceSuccessState configured recommendations", () => {
    it("shows only configured next actions without coming soon", () => {
        const values = {
            first_name: "Molly",
            last_name: "Wright",
            child_first_name: "Mckenzie",
            location_id: "site-1",
            child_program: "prog-1",
            child_desired_start_date: "2026-09-01",
        };
        const recommendations = resolveCreateLeadPostCreateRecommendations(values, {
            availableActionKeys: ["schedule_tour"],
        });
        const html = renderToStaticMarkup(
            <ActionWorkspaceSuccessState
                title="Lead Created"
                householdLabel="Wright Household"
                bosRecommendations={recommendations}
                suggestedActions={mapBosRecommendationsToSuccessActions(recommendations, {
                    onOpenLead: () => undefined,
                })}
                maxVisibleRecommendations={3}
            />,
        );
        expect(html).toContain("Schedule Tour");
        expect(html).not.toContain("Send Welcome Email");
        expect(html).not.toContain("Coming soon");
        expect(html).toContain("Open Lead");
    });
});
