import { describe, expect, it } from "vitest";
import {
    buildIntakeWorkloadBrowserDebug,
    formatLinkedRecordSummary,
} from "@/lib/forms/intakeWorkloadBrowserDebug";
import {
    INTAKE_RUNTIME_TEST_1C_ID,
    INTAKE_RUNTIME_TEST_1D_ID,
    INTAKE_RUNTIME_TEST_ORG_ID,
    DEMO_CHILDCARE_ORG_ID,
} from "@/lib/forms/intakeRuntimeTestFixtures";
import type { SubmissionInboxRow } from "@/lib/forms/submissionInboxPresentation";

const row = (overrides: Partial<SubmissionInboxRow>): SubmissionInboxRow => ({
    id: INTAKE_RUNTIME_TEST_1C_ID,
    status: "submitted",
    created_at: "2026-05-27T18:08:18.000Z",
    submitted_at: "2026-05-27T18:09:16.000Z",
    form_definition_id: "e68e0160-3157-44fd-b207-2c0f14d1764f",
    person_id: "p1",
    customer_id: "c1",
    opportunity_id: "o1",
    payload: { meta: { intake_needs_review: true, intake_resolution_path: "created_records" } },
    ...overrides,
});

describe("intakeWorkloadBrowserDebug Test 2C", () => {
    it("flags org mismatch when Demo Childcare session lacks Test 1C/1D", () => {
        const debug = buildIntakeWorkloadBrowserDebug({
            sessionOrgId: DEMO_CHILDCARE_ORG_ID,
            apiOrgId: DEMO_CHILDCARE_ORG_ID,
            apiUrl: "/api/admin/forms/submissions?limit=200",
            submissions: [
                {
                    id: "old-submission-id",
                    status: "submitted",
                    created_at: "2026-05-13T10:00:00.000Z",
                    submitted_at: "2026-05-13T10:00:00.000Z",
                    form_definition_id: "form-old",
                },
            ],
            activeFilter: "needs_review",
            formsById: {},
        });

        expect(debug.hasTest1C).toBe(false);
        expect(debug.hasTest1D).toBe(false);
        expect(debug.orgMismatchHint).toContain("Test 2D");
    });

    it("finds Test 1C and 1D fixture ids in loaded submissions", () => {
        const submissions = [
            row({ id: INTAKE_RUNTIME_TEST_1C_ID }),
            row({
                id: INTAKE_RUNTIME_TEST_1D_ID,
                submitted_at: "2026-05-27T18:22:17.000Z",
                payload: {
                    meta: {
                        intake_needs_review: false,
                        intake_resolution_path: "matched_email",
                        intake_opportunity_match: "attached_existing",
                    },
                },
            }),
        ];

        const debug = buildIntakeWorkloadBrowserDebug({
            sessionOrgId: INTAKE_RUNTIME_TEST_ORG_ID,
            apiOrgId: INTAKE_RUNTIME_TEST_ORG_ID,
            apiUrl: "/api/admin/forms/submissions?limit=200",
            submissions,
            activeFilter: "needs_review",
            formsById: { "e68e0160-3157-44fd-b207-2c0f14d1764f": "Medication Authorization — Demo" },
        });

        expect(debug.hasTest1C).toBe(true);
        expect(debug.hasTest1D).toBe(true);
        expect(debug.orgMismatchHint).toBeNull();
    });

    it("formats linked CRM summary", () => {
        expect(formatLinkedRecordSummary(row({}))).toContain("Created:");
        expect(formatLinkedRecordSummary(row({ person_id: null, customer_id: null, opportunity_id: null }))).toBeNull();
    });
});
