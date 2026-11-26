import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IntakeHouseholdReviewPanel } from "@/components/admin/intake/IntakeHouseholdReviewPanel";
import { IntakeReviewWarningsBanner } from "@/components/admin/intake/IntakeReviewWarningsBanner";
import type { IntakeHouseholdCandidate } from "@/lib/intake/types";

const SAMPLE_HOUSEHOLD: IntakeHouseholdCandidate = {
    household_id: "household-1",
    parents_guardians: [
        {
            candidate_id: "p1",
            role: "parent",
            first_name: "Alex",
            last_name: "Lyons",
            emails: ["alex.lyons@test.com"],
            phones: ["4804804800"],
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
            last_name: "Lyons",
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
    parents: [
        {
            candidate_id: "p1",
            role: "parent",
            first_name: "Alex",
            last_name: "Lyons",
            emails: ["alex.lyons@test.com"],
            phones: ["4804804800"],
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
            last_name: "Lyons",
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
            value: "alex.lyons@test.com",
            raw_value: "alex.lyons@test.com",
            validation_state: "valid",
            source_fact_ids: [],
        },
        {
            kind: "phone",
            value: "4804804800",
            raw_value: "4804804800",
            validation_state: "valid",
            source_fact_ids: [],
        },
    ],
    children: [
        {
            candidate_id: "c1",
            role: "child",
            first_name: "Jaxon",
            last_name: "Lyons",
            emails: [],
            phones: [],
            dob: "2013-11-23",
            age_years: null,
            calculated_age: { value: { years: 12, months: 1 }, display: "12 yrs 1 mo" },
            program_interest: null,
            source_fact_ids: [],
            confidence: "high",
            validation_state: "valid",
        },
    ],
    address: null,
    location: { label: "South Campus", resolved_value: null, resolved_label: null, source_fact_ids: [], confidence: "medium", validation_state: "unknown" },
    source: null,
    notes: null,
    program_interest: null,
    start_date: null,
    relationships: [],
    unassigned_fact_ids: [],
    unmapped_facts: [],
    review_warnings: [
        {
            code: "extra_parents_commit_limited",
            severity: "warning",
            message: "2 parents/guardians detected. Only the primary parent will be created by this action.",
        },
    ],
    commit_limited_to_primary: true,
};

describe("IntakeHouseholdReviewPanel", () => {
    it("renders parent cards and child cards", () => {
        const html = renderToStaticMarkup(<IntakeHouseholdReviewPanel household={SAMPLE_HOUSEHOLD} />);
        expect(html).toContain('data-testid="intake-household-review-panel"');
        expect(html).toContain('data-testid="intake-household-review-parents"');
        expect(html).toContain('data-testid="intake-household-review-children"');
        expect(html).toContain("Household detected");
        expect(html).toContain("Alex Lyons");
        expect(html).toContain("Jason Lyons");
        expect(html).toContain("Jaxon Lyons");
    });
});

describe("IntakeReviewWarningsBanner", () => {
    it("renders structured warnings prominently", () => {
        const html = renderToStaticMarkup(
            <IntakeReviewWarningsBanner warnings={SAMPLE_HOUSEHOLD.review_warnings} />,
        );
        expect(html).toContain('data-testid="intake-review-warnings-banner"');
        expect(html).toContain("2 parents/guardians detected");
    });

    it("renders global blocker messages", () => {
        const html = renderToStaticMarkup(
            <IntakeReviewWarningsBanner messages={["Location is required."]} />,
        );
        expect(html).toContain("Location is required.");
    });
});
