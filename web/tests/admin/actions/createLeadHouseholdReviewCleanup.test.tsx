import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CreateLeadDraftLeadColumn } from "@/components/admin/actions/CreateLeadDraftLeadColumn";
import { IntakeHouseholdCommitReviewPanel } from "@/components/admin/intake/IntakeHouseholdCommitReviewPanel";
import {
    buildCreateLeadCommitSelection,
    patchCreateLeadCommitRecord,
    syncCreateLeadValuesFromCommitSelection,
} from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { validateCreateLeadCommitSelection } from "@/lib/admin/actions/createLead/commit/validateCreateLeadCommitSelection";
import { buildCreateLeadCommitPreview } from "@/lib/admin/actions/buildCreateLeadCommitPreview";
import { mapCreateLeadCommitSelectionToExecutePayload } from "@/lib/admin/actions/mapCreateLeadCommitSelectionToPayload";
import { resolveCreateLeadRequiredChecklist } from "@/lib/admin/actions/createLead/resolveCreateLeadRequiredChecklist";
import { filterGlobalCreateLeadValidationIssues } from "@/lib/admin/actions/createLead/review/createLeadCommitCardHints";
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
            emails: ["jason@test.com"],
            phones: ["4805550100"],
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
            calculated_age: { value: { years: 8, months: 5 }, display: "8 yrs 5 mo" },
            program_interest: null,
            source_fact_ids: [],
            confidence: "high",
            validation_state: "valid",
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
            code: "location_unmatched",
            severity: "warning",
            message: "Location could not be matched — select a site before creating the lead.",
        },
    ],
    commit_limited_to_primary: false,
};

function renderHouseholdDraftColumn(input?: {
    values?: Record<string, string>;
    validationIssues?: string[];
}) {
    const selection = buildCreateLeadCommitSelection(HOUSEHOLD);
    return renderToStaticMarkup(
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
                            placement_select: "site",
                        },
                    ],
                },
            ]}
            values={input?.values ?? { location_id: "" }}
            intakeSpec={null}
            requiredPayloadKeys={["location_id"]}
            onFieldChange={() => undefined}
            onSuggestionValueChange={() => undefined}
            onToggleSuggestion={() => undefined}
            onApplySuggestions={() => undefined}
            selectedSuggestionCount={0}
            analyzeError={null}
            validationIssues={
                input?.validationIssues ??
                filterGlobalCreateLeadValidationIssues(["Location is required."])
            }
            household={HOUSEHOLD}
            commitSelection={selection}
            onCommitSelectionChange={() => undefined}
        />,
    );
}

describe("CreateLead household review cleanup", () => {
    it("does not render lead context form in household mode", () => {
        const html = renderHouseholdDraftColumn();
        expect(html).toContain('data-testid="create-lead-household-review"');
        expect(html).not.toContain('data-testid="create-lead-gather-section-context"');
        expect(html).not.toContain("Lead context");
        expect(html).not.toContain("Required to create lead");
    });

    it("shows location in required checklist with missing and ambiguous states", () => {
        const selection = buildCreateLeadCommitSelection(HOUSEHOLD);
        const missing = resolveCreateLeadRequiredChecklist({
            selection,
            values: { location_id: "" },
            requiredPayloadKeys: ["location_id"],
            reviewWarnings: HOUSEHOLD.review_warnings,
            household: HOUSEHOLD,
        });
        expect(missing.find((item) => item.key === "location")?.status).toBe("ambiguous");

        const resolved = resolveCreateLeadRequiredChecklist({
            selection,
            values: { location_id: "site-1" },
            requiredPayloadKeys: ["location_id"],
            reviewWarnings: HOUSEHOLD.review_warnings,
            household: HOUSEHOLD,
        });
        expect(resolved.find((item) => item.key === "location")?.status).toBe("ok");

        const html = renderHouseholdDraftColumn();
        expect(html).toContain('data-testid="create-lead-required-item-location"');
        expect(html).toContain('data-testid="create-lead-household-location-picker"');
    });

    it("blocks Create Lead when location is missing", () => {
        const selection = buildCreateLeadCommitSelection(HOUSEHOLD);
        const result = validateCreateLeadCommitSelection({
            selection,
            values: { location_id: "" },
            requireLocation: true,
        });
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.issues).toContain("Location is required.");
    });

    it("updates preview and payload when editing parent name", () => {
        let selection = buildCreateLeadCommitSelection(HOUSEHOLD);
        const parent = selection.parents[1]!;
        selection = patchCreateLeadCommitRecord(selection, parent.candidate_id, {
            first_name: "Jonathan",
            last_name: "Wright",
        });

        const preview = buildCreateLeadCommitPreview({ values: {}, household: HOUSEHOLD, selection });
        expect(preview.will_create.some((item) => item.detail === "Jonathan Wright")).toBe(true);

        const payload = mapCreateLeadCommitSelectionToExecutePayload({
            values: { location_id: "site-1" },
            selection,
        });
        expect(payload.first_name).toBe("Molly");
        expect(payload.household_commit_v1).toContain("Jonathan");
    });

    it("updates child age display when DOB is edited", () => {
        let selection = buildCreateLeadCommitSelection(HOUSEHOLD);
        const child = selection.children[0]!;
        selection = patchCreateLeadCommitRecord(selection, child.candidate_id, {
            dob: "2020-06-15",
        });
        expect(selection.children[0]?.age_display).toBeTruthy();
        expect(selection.children[0]?.age_display).not.toBe(child.age_display);
    });

    it("updates primary payload when secondary guardian is set primary", () => {
        let selection = buildCreateLeadCommitSelection(HOUSEHOLD);
        const secondary = selection.parents[1]!;
        selection = patchCreateLeadCommitRecord(selection, secondary.candidate_id, { primary: true });

        const values = syncCreateLeadValuesFromCommitSelection({ location_id: "site-1" }, selection);
        expect(values.first_name).toBe("Jason");
        expect(values.last_name).toBe("Wright");
        expect(values.email).toBe("jason@test.com");

        const preview = buildCreateLeadCommitPreview({ values, household: HOUSEHOLD, selection });
        expect(preview.will_create.some((item) => item.label === "Parent (primary)" && item.detail === "Jason Wright")).toBe(
            true,
        );
    });

    it("does not render Primary badge on child cards", () => {
        const selection = buildCreateLeadCommitSelection(HOUSEHOLD);
        const html = renderToStaticMarkup(
            <IntakeHouseholdCommitReviewPanel
                household={HOUSEHOLD}
                selection={selection}
                onSelectionChange={() => undefined}
            />,
        );
        expect(html).toContain('data-testid="commit-primary-badge-p1"');
        expect(html).not.toContain('data-testid="commit-primary-badge-c1"');
        expect(html).not.toContain('data-testid="commit-set-primary-c1"');
    });

    it("renders commit preview as the last review section before footer", () => {
        const html = renderHouseholdDraftColumn();
        const householdIndex = html.indexOf('data-testid="intake-household-commit-review-panel"');
        const checklistIndex = html.indexOf('data-testid="create-lead-required-checklist"');
        const previewIndex = html.indexOf('data-testid="create-lead-commit-preview-panel"');
        const gatherContextIndex = html.indexOf('data-testid="create-lead-gather-section-context"');

        expect(householdIndex).toBeGreaterThan(-1);
        expect(checklistIndex).toBeGreaterThan(householdIndex);
        expect(previewIndex).toBeGreaterThan(checklistIndex);
        expect(gatherContextIndex).toBe(-1);
    });
});
