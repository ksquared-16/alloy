import { describe, expect, it } from "vitest";
import {
    buildIntakeWorkloadDiagnostics,
    intakeWorkloadLaneCounts,
} from "@/lib/forms/intakeWorkloadDiagnostics";
import { buildIntakeWorkspaceFilterPanel } from "@/lib/forms/intakeWorkspaceFilters";
import type { SubmissionInboxRow } from "@/lib/forms/submissionInboxPresentation";

const TEST_1C = "c5e2e078-97ee-4e17-9d66-1527a9f0c46b";
const TEST_1D = "50ac6911-5887-4934-9ae8-a221d61f81f6";
const FORM_ID = "e68e0160-3157-44fd-b207-2c0f14d1764f";

const row = (overrides: Partial<SubmissionInboxRow>): SubmissionInboxRow => ({
    id: TEST_1C,
    status: "submitted",
    created_at: "2026-05-27T18:08:18.000Z",
    submitted_at: "2026-05-27T18:09:16.000Z",
    form_definition_id: FORM_ID,
    person_id: "p1",
    customer_id: "c1",
    opportunity_id: "o1",
    payload: {
        meta: {
            intake_needs_review: true,
            intake_resolution_path: "created_records",
            intake_opportunity_match: "created",
        },
    },
    ...overrides,
});

describe("intakeWorkloadDiagnostics Test 2B", () => {
    it("assigns Runtime Test 1C to needsReview and 1D to recentlySubmitted", () => {
        const submissions = [
            row({ id: TEST_1C }),
            row({
                id: TEST_1D,
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

        const diagnostics = buildIntakeWorkloadDiagnostics(submissions);
        const oneC = diagnostics.find((d) => d.id === TEST_1C);
        const oneD = diagnostics.find((d) => d.id === TEST_1D);

        expect(oneC?.lane).toBe("needsReview");
        expect(oneC?.headline).toContain("New enrollment inquiry created");
        expect(oneD?.lane).toBe("recentlySubmitted");
        expect(oneD?.headline).toContain("Existing family matched");

        const counts = intakeWorkloadLaneCounts(submissions);
        expect(counts.needsReview).toBe(1);
        expect(counts.recentlySubmitted).toBe(1);
    });

    it("places Test 1C first in review panel with operational copy", () => {
        const panel = buildIntakeWorkspaceFilterPanel("needs_review", {
            submissions: [row({ id: TEST_1C })],
            sessions: [],
            forms: [{ id: FORM_ID, name: "Medication Authorization — Demo" }],
            packets: [],
            formsById: { [FORM_ID]: "Medication Authorization — Demo" },
        });

        expect(panel.items[0]?.title).toContain("New enrollment inquiry created");
        expect(panel.items[0]?.submission?.id).toBe(TEST_1C);
    });
});
