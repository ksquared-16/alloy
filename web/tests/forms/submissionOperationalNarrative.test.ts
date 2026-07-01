import { describe, expect, it } from "vitest";
import {
    deriveSubmissionOperationalNarrative,
    sortSubmissionsByActivity,
    submissionCreatedOrMatchedSummary,
    submissionFamilyLabel,
} from "@/lib/forms/submissionOperationalNarrative";
import type { SubmissionInboxRow } from "@/lib/forms/submissionInboxPresentation";

const row = (overrides: Partial<SubmissionInboxRow> = {}): SubmissionInboxRow => ({
    id: "sub-1",
    status: "submitted",
    created_at: "2026-05-01T10:00:00.000Z",
    submitted_at: "2026-05-27T18:09:16.000Z",
    form_definition_id: "form-1",
    person_id: "p1",
    customer_id: "c1",
    customer_member_id: "m1",
    opportunity_id: "o1",
    payload: {
        values: {
            guardian_full_name: "Donald Duck",
            child_first_name: "Huey",
            child_last_name: "Duck",
        },
        meta: {},
    } as SubmissionInboxRow["payload"],
    ...overrides,
});

describe("submissionOperationalNarrative sprint closeout", () => {
    it("uses operator-first headline for new enrollment inquiry", () => {
        const narrative = deriveSubmissionOperationalNarrative(
            row({
                payload: {
                    values: { guardian_full_name: "Donald Duck" },
                    meta: {
                        intake_resolution_path: "created_records",
                        intake_opportunity_match: "created",
                        intake_needs_review: true,
                    },
                } as SubmissionInboxRow["payload"],
            })
        );

        expect(narrative.headline).toBe("New enrollment lead created");
        expect(narrative.operatorAction).toContain("Review intake");
        expect(narrative.statusLabel).toBe("Ready for enrollment review");
    });

    it("uses existing family matched for dedup attach", () => {
        const narrative = deriveSubmissionOperationalNarrative(
            row({
                payload: {
                    meta: {
                        intake_resolution_path: "matched_email",
                        intake_opportunity_match: "attached_existing",
                        intake_needs_review: false,
                    },
                },
            })
        );

        expect(narrative.headline).toBe("Existing family matched");
        expect(narrative.lane).toBe("recentlySubmitted");
    });

    it("builds family label and created summary for workload rows", () => {
        expect(submissionFamilyLabel(row())).toBe("Donald Duck");
        expect(submissionCreatedOrMatchedSummary(row())).toContain("Created:");
        expect(submissionCreatedOrMatchedSummary(row())).toContain("Enrollment lead");
    });

    it("sorts by submitted_at descending", () => {
        const sorted = sortSubmissionsByActivity([
            row({ id: "old", submitted_at: "2026-05-01T10:00:00.000Z" }),
            row({ id: "new", submitted_at: "2026-05-27T18:22:17.000Z" }),
        ]);
        expect(sorted[0]?.id).toBe("new");
    });

    it("explains possible existing family match when submitted name differs", () => {
        const narrative = deriveSubmissionOperationalNarrative(
            row({
                payload: {
                    values: { guardian_full_name: "Jane Smith" },
                    meta: {
                        intake_identity_name_mismatch: true,
                        intake_matched_person_display_name: "Jane Doe",
                        intake_needs_review: true,
                    },
                } as SubmissionInboxRow["payload"],
            })
        );
        expect(narrative.headline).toMatch(/Possible existing family match/i);
        expect(narrative.detail).toContain("Jane Smith");
        expect(narrative.detail).toContain("Jane Doe");
    });
});
