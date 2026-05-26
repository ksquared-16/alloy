import { describe, expect, it } from "vitest";
import {
    groupSubmissionsIntoInboxLanes,
    resolveSubmissionInboxLane,
    submissionInboxPrimaryAction,
    type SubmissionInboxRow,
} from "@/lib/forms/submissionInboxPresentation";

const base = (overrides: Partial<SubmissionInboxRow> = {}): SubmissionInboxRow => ({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    status: "submitted",
    created_at: "2026-05-01T10:00:00.000Z",
    submitted_at: "2026-05-02T12:00:00.000Z",
    form_definition_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    person_id: "11111111-1111-4111-8111-111111111111",
    payload: {
        meta: {
            intake_resolution_path: "matched_email",
            intake_needs_review: false,
        },
    },
    ...overrides,
});

describe("submissionInboxPresentation OW-6", () => {
    it("groups submissions into review-first lanes", () => {
        const lanes = groupSubmissionsIntoInboxLanes([
            base({
                id: "1",
                payload: { meta: { intake_needs_review: true } },
            }),
            base({
                id: "2",
                status: "draft",
                submitted_at: null,
                payload: undefined,
            }),
            base({
                id: "3",
                person_id: null,
                customer_id: null,
                customer_member_id: null,
                opportunity_id: null,
                payload: { meta: {} },
            }),
            base({ id: "4" }),
        ]);

        expect(lanes.needsReview.map((r) => r.id)).toEqual(["1"]);
        expect(lanes.drafts.map((r) => r.id)).toEqual(["2"]);
        expect(lanes.needsLinking.map((r) => r.id)).toEqual(["3"]);
        expect(lanes.recentlySubmitted.map((r) => r.id)).toEqual(["4"]);
    });

    it("resolveSubmissionInboxLane treats draft and void as drafts", () => {
        expect(resolveSubmissionInboxLane(base({ status: "draft", submitted_at: null }))).toBe("drafts");
        expect(resolveSubmissionInboxLane(base({ status: "void" }))).toBe("drafts");
    });

    it("submissionInboxPrimaryAction returns review for attention lanes", () => {
        expect(submissionInboxPrimaryAction("needsReview").label).toBe("Review intake");
        expect(submissionInboxPrimaryAction("needsLinking").kind).toBe("review");
        expect(submissionInboxPrimaryAction("drafts").label).toBe("Continue draft");
        expect(submissionInboxPrimaryAction("recentlySubmitted").label).toBe("Open");
    });
});
