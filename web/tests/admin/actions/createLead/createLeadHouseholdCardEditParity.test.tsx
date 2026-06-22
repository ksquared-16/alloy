import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { CreateLeadHouseholdCardEditFields } from "@/components/admin/intake/CreateLeadHouseholdCardEditFields";
import { IntakeHouseholdCommitReviewPanel } from "@/components/admin/intake/IntakeHouseholdCommitReviewPanel";
import {
    buildCreateLeadCommitSelection,
    patchCreateLeadCommitRecord,
} from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import {
    commitRecordToDraftValues,
    draftValuesToCommitPatch,
} from "@/lib/admin/actions/createLead/household/commitRecordFieldMapping";
import { resolveCreateLeadHouseholdCardEditFields } from "@/lib/admin/actions/createLead/household/resolveCreateLeadHouseholdCardEditFields";
import { buildCreateLeadCommitPreview } from "@/lib/admin/actions/buildCreateLeadCommitPreview";
import { mapCreateLeadCommitSelectionToExecutePayload } from "@/lib/admin/actions/mapCreateLeadCommitSelectionToPayload";
import { formatIsoDateForDisplay } from "@/lib/intake/normalize/date";
import { formatDobForDisplay } from "@/lib/intake/review/buildIntakeReviewPresentation";
import type { IntakeHouseholdCandidate } from "@/lib/intake/types";

const MINIMAL_PARENT_HOUSEHOLD: IntakeHouseholdCandidate = {
    household_id: "household-minimal-parent",
    parents_guardians: [],
    parents: [
        {
            candidate_id: "p1",
            role: "parent",
            first_name: "Alex",
            last_name: "Kim",
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
    household_contacts: [],
    children: [],
    address: null,
    location: null,
    source: null,
    notes: null,
    program_interest: null,
    desired_start_date: null,
    relationships: [],
    unassigned_fact_ids: [],
    unmapped_facts: [],
    review_warnings: [],
    commit_limited_to_primary: false,
};

const MINIMAL_CHILD_HOUSEHOLD: IntakeHouseholdCandidate = {
    ...MINIMAL_PARENT_HOUSEHOLD,
    household_id: "household-minimal-child",
    parents: [
        {
            candidate_id: "p1",
            role: "parent",
            first_name: "Alex",
            last_name: "Kim",
            emails: ["alex@test.com"],
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
            first_name: "Sam",
            last_name: "Kim",
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
};

describe("resolveCreateLeadHouseholdCardEditFields", () => {
    it("shows configured parent fields even when contact values were not pasted", () => {
        const fields = resolveCreateLeadHouseholdCardEditFields({ entityType: "parent" });
        expect(fields.map((field) => field.payload_key)).toEqual(
            expect.arrayContaining(["first_name", "last_name", "email", "phone"]),
        );
    });

    it("shows child DOB and derived age even when DOB was not pasted", () => {
        const fields = resolveCreateLeadHouseholdCardEditFields({ entityType: "child" });
        expect(fields.map((field) => field.payload_key)).toEqual(
            expect.arrayContaining([
                "child_first_name",
                "child_last_name",
                "child_date_of_birth",
                "child_age",
                "child_program",
            ]),
        );
        expect(fields.find((field) => field.payload_key === "child_age")?.derived).toBe(true);
    });
});

describe("CreateLeadHouseholdCardEditFields DOB parity", () => {
    it("renders DOB with date input and platform display format hint", () => {
        const selection = buildCreateLeadCommitSelection(MINIMAL_CHILD_HOUSEHOLD);
        const child = selection.children[0]!;
        const fields = resolveCreateLeadHouseholdCardEditFields({ entityType: "child" });
        const draft = commitRecordToDraftValues({ ...child, dob: "2020-06-15" });

        const html = renderToStaticMarkup(
            <CreateLeadHouseholdCardEditFields
                entityType="child"
                record={child}
                fields={fields}
                draft={draft}
                onDraftChange={() => undefined}
                contextValues={{ location_id: "site-1" }}
                dataTestIdPrefix="card-edit-c1"
            />,
        );

        expect(html).toContain('type="date"');
        expect(html).toContain('data-testid="card-edit-c1-child-date-of-birth-control"');
        expect(html).toContain(formatIsoDateForDisplay("2020-06-15"));
    });

    it("normalizes saved DOB to canonical ISO and recalculates age", () => {
        const selection = buildCreateLeadCommitSelection(MINIMAL_CHILD_HOUSEHOLD);
        const child = selection.children[0]!;
        const draft = commitRecordToDraftValues(child);
        draft.dob = "2020-06-15";

        const patched = patchCreateLeadCommitRecord(
            selection,
            child.candidate_id,
            draftValuesToCommitPatch("child", draft),
        );

        expect(patched.children[0]?.dob).toBe("2020-06-15");
        expect(patched.children[0]?.age_display).toBeTruthy();
    });
});

describe("IntakeHouseholdCommitReviewPanel card edit integration", () => {
    it("renders parent email field via spec-driven card editor", () => {
        const selection = buildCreateLeadCommitSelection(MINIMAL_PARENT_HOUSEHOLD);
        const parent = selection.parents[0]!;
        const fields = resolveCreateLeadHouseholdCardEditFields({ entityType: "parent" });
        const draft = commitRecordToDraftValues(parent);

        const html = renderToStaticMarkup(
            <CreateLeadHouseholdCardEditFields
                entityType="parent"
                record={parent}
                fields={fields}
                draft={draft}
                onDraftChange={() => undefined}
                contextValues={{}}
                dataTestIdPrefix="card-edit-p1"
            />,
        );

        expect(html).toContain('data-testid="card-edit-p1-email"');
        expect(html).toContain('data-testid="card-edit-p1-phone"');
    });

    it("shows invalid DOB validation on child card after save", () => {
        let selection = buildCreateLeadCommitSelection(MINIMAL_CHILD_HOUSEHOLD);
        const child = selection.children[0]!;
        selection = patchCreateLeadCommitRecord(selection, child.candidate_id, { dob: "not-a-date" });

        const html = renderToStaticMarkup(
            <IntakeHouseholdCommitReviewPanel
                household={MINIMAL_CHILD_HOUSEHOLD}
                selection={selection}
                onSelectionChange={() => undefined}
                contextValues={{}}
            />,
        );

        expect(html).toContain("Date of birth is invalid.");
        expect(html).toContain('data-testid="commit-record-blockers-c1"');
    });

    it("updates commit preview and payload after child DOB edit", () => {
        let selection = buildCreateLeadCommitSelection(MINIMAL_CHILD_HOUSEHOLD);
        const child = selection.children[0]!;
        selection = patchCreateLeadCommitRecord(selection, child.candidate_id, { dob: "2019-03-10" });

        const preview = buildCreateLeadCommitPreview({
            values: { location_id: "site-1" },
            household: MINIMAL_CHILD_HOUSEHOLD,
            selection,
        });
        expect(preview.will_create.some((item) => item.detail === "Sam Kim")).toBe(true);

        const payload = mapCreateLeadCommitSelectionToExecutePayload({
            values: { location_id: "site-1" },
            selection,
        });
        expect(payload.child_date_of_birth).toBe("2019-03-10");
        expect(payload.household_commit_v1).toContain("2019-03-10");
    });
});

describe("platform DOB display formatting", () => {
    it("formats ISO DOB as MM/DD/YYYY for card display", () => {
        expect(formatDobForDisplay("2018-01-01")).toBe("01/01/2018");
        expect(formatIsoDateForDisplay("2018-01-01")).toBe("01/01/2018");
    });
});
