import { describe, expect, it } from "vitest";
import {
    deriveSubmissionOperationalNarrative,
    sortSubmissionsByActivity,
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
    opportunity_id: "o1",
    payload: { meta: {} },
    ...overrides,
});

describe("submissionOperationalNarrative OI-4", () => {
    it("explains new family intake from created_records path", () => {
        const narrative = deriveSubmissionOperationalNarrative(
            row({
                payload: {
                    meta: {
                        intake_resolution_path: "created_records",
                        intake_opportunity_match: "created",
                        intake_needs_review: true,
                    },
                },
            })
        );

        expect(narrative.headline).toContain("New family intake created CRM records");
        expect(narrative.operatorAction).toContain("Confirm linkage");
    });

    it("explains dedup attach from matched email", () => {
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

        expect(narrative.headline).toContain("Existing opportunity matched");
        expect(narrative.lane).toBe("recentlySubmitted");
    });

    it("sorts by submitted_at descending", () => {
        const sorted = sortSubmissionsByActivity([
            row({ id: "old", submitted_at: "2026-05-01T10:00:00.000Z" }),
            row({ id: "new", submitted_at: "2026-05-27T18:22:17.000Z" }),
        ]);
        expect(sorted[0]?.id).toBe("new");
    });
});
