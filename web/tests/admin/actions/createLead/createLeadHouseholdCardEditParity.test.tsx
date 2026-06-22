import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { CreateLeadHouseholdCardEditFields } from "@/components/admin/intake/CreateLeadHouseholdCardEditFields";
import {
    buildCreateLeadCommitSelection,
    patchCreateLeadCommitRecord,
} from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import {
    commitRecordToPayloadDraft,
    payloadDraftToCommitPatch,
} from "@/lib/admin/actions/createLead/household/commitRecordFieldMapping";
import {
    flattenCreateLeadHouseholdCardEditFields,
    resolveCreateLeadHouseholdCardEditFields,
} from "@/lib/admin/actions/createLead/household/resolveCreateLeadHouseholdCardEditFields";
import { buildCreateLeadCommitPreview } from "@/lib/admin/actions/buildCreateLeadCommitPreview";
import { mapCreateLeadCommitSelectionToExecutePayload } from "@/lib/admin/actions/mapCreateLeadCommitSelectionToPayload";
import { createLeadPayloadKeyForRule } from "@/lib/lifecycle/createLeadIntakeFieldMap";
import { customFieldRuleId } from "@/lib/lifecycle/lifecycleFieldRuleBindings";
import { resolveCreateLeadActionIntakeSpec } from "@/lib/lifecycle/resolveActionIntakeSpec";
import { formatIsoDateForDisplay } from "@/lib/intake/normalize/date";
import { formatDobForDisplay } from "@/lib/intake/review/buildIntakeReviewPresentation";
import type { IntakeHouseholdCandidate } from "@/lib/intake/types";

const ENROLLMENT_LEAD_METADATA = {
    lifecycle_builder_stage_field_rules_v1: {
        version: 1,
        by_stage_key: {
            lead: {
                required_rule_ids: [
                    "person:first_name",
                    "person:last_name",
                    "person:email",
                    "person:phone",
                ],
                recommended_rule_ids: ["child:first_name", "child:last_name", "child:date_of_birth"],
            },
        },
    },
};

const ORG_CHILD_FIELD_DEFINITIONS = {
    child: [
        {
            field_key: "preferred_start_month",
            label: "Preferred Start Month",
            entity_type: "inquiry_child",
            field_type: "text",
            is_system: false,
            is_active: true,
            config: {},
        },
    ],
};

function resolveSpecWithOrgFields() {
    return resolveCreateLeadActionIntakeSpec({
        department_id: "dept-1",
        operator_stage: "lead",
        builder_stage_key: "lead",
        department_metadata: ENROLLMENT_LEAD_METADATA,
        org_field_definitions: ORG_CHILD_FIELD_DEFINITIONS,
    });
}

const MINIMAL_CHILD_HOUSEHOLD: IntakeHouseholdCandidate = {
    household_id: "household-minimal-child",
    parents_guardians: [],
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
    household_contacts: [],
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

describe("createLeadPayloadKeyForRule custom org fields", () => {
    it("maps custom child org field rule ids to child_* payload keys", () => {
        const ruleId = customFieldRuleId("child", "preferred_start_month");
        expect(createLeadPayloadKeyForRule(ruleId)).toBe("child_preferred_start_month");
    });
});

describe("resolveCreateLeadHouseholdCardEditFields from ActionIntakeSpec", () => {
    it("derives parent required fields from BP required information", () => {
        const spec = resolveSpecWithOrgFields();
        const groups = resolveCreateLeadHouseholdCardEditFields({ entityType: "parent", intakeSpec: spec });

        expect(groups.required.map((field) => field.payload_key)).toEqual(
            expect.arrayContaining(["first_name", "last_name", "email", "phone"]),
        );
        expect(groups.required.every((field) => field.tier === "required")).toBe(true);
    });

    it("shows configured child fields from entity config without Create Lead gather list", () => {
        const spec = resolveSpecWithOrgFields();
        expect(spec.optional.some((field) => field.payload_key === "child_preferred_start_month")).toBe(true);

        const groups = resolveCreateLeadHouseholdCardEditFields({ entityType: "child", intakeSpec: spec });
        const flat = flattenCreateLeadHouseholdCardEditFields(groups);

        expect(flat.map((field) => field.payload_key)).toEqual(
            expect.arrayContaining([
                "child_first_name",
                "child_last_name",
                "child_date_of_birth",
                "child_age",
                "child_preferred_start_month",
            ]),
        );
        expect(groups.additional.some((field) => field.payload_key === "child_preferred_start_month")).toBe(true);
        expect(groups.additional.some((field) => field.field_label === "Preferred Start Month")).toBe(true);
    });

    it("does not require CREATE_LEAD_GATHER_FIELDS fallback when intakeSpec is provided", () => {
        const spec = resolveCreateLeadActionIntakeSpec({
            department_id: "dept-1",
            operator_stage: "lead",
            builder_stage_key: "lead",
            department_metadata: {
                lifecycle_builder_stage_field_rules_v1: {
                    version: 1,
                    by_stage_key: {
                        lead: {
                            required_rule_ids: ["person:first_name", "person:last_name"],
                            recommended_rule_ids: [],
                        },
                    },
                },
            },
        });
        const groups = resolveCreateLeadHouseholdCardEditFields({ entityType: "parent", intakeSpec: spec });
        expect(groups.required.map((field) => field.payload_key)).toEqual(["first_name", "last_name"]);
        expect(groups.required.some((field) => field.payload_key === "email")).toBe(false);
        expect(groups.additional.every((field) => field.tier === "optional")).toBe(true);
    });
});

describe("CreateLeadHouseholdCardEditFields DOB parity", () => {
    it("renders DOB with date input and platform display format hint", () => {
        const spec = resolveSpecWithOrgFields();
        const groups = resolveCreateLeadHouseholdCardEditFields({ entityType: "child", intakeSpec: spec });
        const selection = buildCreateLeadCommitSelection(MINIMAL_CHILD_HOUSEHOLD);
        const child = selection.children[0]!;
        const draft = { ...commitRecordToPayloadDraft(child, "child"), child_date_of_birth: "2020-06-15" };

        const html = renderToStaticMarkup(
            <CreateLeadHouseholdCardEditFields
                entityType="child"
                record={child}
                requiredFields={groups.required}
                additionalFields={groups.additional}
                draft={draft}
                onDraftChange={() => undefined}
                contextValues={{ location_id: "site-1" }}
                dataTestIdPrefix="card-edit-c1"
            />,
        );

        expect(html).toContain('type="date"');
        expect(html).toContain('data-testid="card-edit-c1-additional-child-date-of-birth-control"');
        expect(html).toContain(formatIsoDateForDisplay("2020-06-15"));
        expect(html).toContain('data-testid="card-edit-c1-additional-fields"');
        expect(html).toContain('data-testid="card-edit-c1-additional-child-preferred-start-month"');
    });

    it("normalizes saved DOB to canonical ISO and recalculates age", () => {
        const selection = buildCreateLeadCommitSelection(MINIMAL_CHILD_HOUSEHOLD);
        const child = selection.children[0]!;
        const draft = commitRecordToPayloadDraft(child, "child");
        draft.child_date_of_birth = "2020-06-15";

        const patched = patchCreateLeadCommitRecord(
            selection,
            child.candidate_id,
            payloadDraftToCommitPatch("child", draft),
        );

        expect(patched.children[0]?.dob).toBe("2020-06-15");
        expect(patched.children[0]?.age_display).toBeTruthy();
    });

    it("persists custom configured child field values through commit selection and payload", () => {
        let selection = buildCreateLeadCommitSelection(MINIMAL_CHILD_HOUSEHOLD);
        const child = selection.children[0]!;
        const draft = commitRecordToPayloadDraft(child, "child");
        draft.child_preferred_start_month = "September";

        selection = patchCreateLeadCommitRecord(
            selection,
            child.candidate_id,
            payloadDraftToCommitPatch("child", draft),
        );

        expect(selection.children[0]?.extra_payload_values.child_preferred_start_month).toBe("September");

        const payload = mapCreateLeadCommitSelectionToExecutePayload({
            values: { location_id: "site-1" },
            selection,
        });
        expect(payload.child_preferred_start_month).toBe("September");
        expect(payload.household_commit_v1).toContain("September");
    });
});

describe("platform DOB display formatting", () => {
    it("formats ISO DOB as MM/DD/YYYY for card display", () => {
        expect(formatDobForDisplay("2018-01-01")).toBe("01/01/2018");
        expect(formatIsoDateForDisplay("2018-01-01")).toBe("01/01/2018");
    });
});

describe("commit preview integration", () => {
    it("updates commit preview after child DOB edit", () => {
        let selection = buildCreateLeadCommitSelection(MINIMAL_CHILD_HOUSEHOLD);
        const child = selection.children[0]!;
        selection = patchCreateLeadCommitRecord(selection, child.candidate_id, { dob: "2019-03-10" });

        const preview = buildCreateLeadCommitPreview({
            values: { location_id: "site-1" },
            household: MINIMAL_CHILD_HOUSEHOLD,
            selection,
        });
        expect(preview.will_create.some((item) => item.detail === "Sam Kim")).toBe(true);
    });
});
