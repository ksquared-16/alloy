import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IntakeHouseholdReviewPanel } from "@/components/admin/intake/IntakeHouseholdReviewPanel";
import type { IntakeHouseholdCandidate } from "@/lib/intake/types";

const SAMPLE_HOUSEHOLD: IntakeHouseholdCandidate = {
    household_id: "household-1",
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
    desired_start_date: null,
    relationships: [],
    unassigned_fact_ids: [],
    review_warnings: [
        "Additional household members were detected. Review is available, but only the primary parent/first child will be created by this action until multi-record commit is enabled.",
    ],
    commit_limited_to_primary: true,
};

describe("IntakeHouseholdReviewPanel", () => {
    it("renders parent cards, child cards, and commit warning", () => {
        const html = renderToStaticMarkup(<IntakeHouseholdReviewPanel household={SAMPLE_HOUSEHOLD} />);
        expect(html).toContain('data-testid="intake-household-review-panel"');
        expect(html).toContain('data-testid="intake-household-review-parents"');
        expect(html).toContain('data-testid="intake-household-review-children"');
        expect(html).toContain("Alex Lyons");
        expect(html).toContain("Jason Lyons");
        expect(html).toContain("Jaxon Lyons");
        expect(html).toContain("multi-record commit");
    });
});
