import { describe, expect, it } from "vitest";
import {
    buildIntakeCasePresentationRows,
    groupSubmissionsByIntakeCaseKey,
    parseIntakeCaseGroupKey,
    resolveIntakeCaseGroupKey,
    resolveSubmissionPacketSessionId,
} from "@/lib/forms/intakeCasePresentation";
import type { IntakeCaseSubmissionInput } from "@/lib/forms/intakeCasePresentation";

const OPP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OPP2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESS = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SUB1 = "11111111-1111-4111-8111-111111111111";
const SUB2 = "22222222-2222-4222-8222-222222222222";
const SUB3 = "33333333-3333-4333-8333-333333333333";

function submissionPayload(data: Record<string, unknown>): IntakeCaseSubmissionInput["payload"] {
    return data as IntakeCaseSubmissionInput["payload"];
}

function submission(
    overrides: Partial<IntakeCaseSubmissionInput> & Pick<IntakeCaseSubmissionInput, "id">
): IntakeCaseSubmissionInput {
    return {
        status: "submitted",
        created_at: "2026-05-27T10:00:00.000Z",
        submitted_at: "2026-05-27T10:00:00.000Z",
        form_definition_id: "8432c527-8799-4a55-88c7-f860bd78e747",
        ...overrides,
    } as IntakeCaseSubmissionInput;
}

describe("intakeCasePresentation IC-2", () => {
    it("groups multiple submissions with same opportunity_id into one case", () => {
        const rows = buildIntakeCasePresentationRows({
            submissions: [
                submission({
                    id: SUB1,
                    opportunity_id: OPP,
                    submitted_at: "2026-05-27T09:00:00.000Z",
                    payload: submissionPayload({
                        values: { guardian_full_name: "Donald Duck" },
                        meta: { intake_opportunity_match: "created" },
                    }),
                }),
                submission({
                    id: SUB2,
                    opportunity_id: OPP,
                    submitted_at: "2026-05-27T11:00:00.000Z",
                    payload: submissionPayload({
                        values: { guardian_full_name: "Donald Duck" },
                        meta: { intake_opportunity_match: "attached_existing", intake_needs_review: false },
                    }),
                }),
            ],
            formsById: { "8432c527-8799-4a55-88c7-f860bd78e747": "Medication Authorization" },
        });

        expect(rows).toHaveLength(1);
        expect(rows[0]!.case_key).toBe(`opportunity:${OPP}`);
        expect(rows[0]!.anchor_type).toBe("opportunity");
        expect(rows[0]!.submission_ids).toEqual([SUB2, SUB1]);
        expect(rows[0]!.submission_count).toBe(2);
        expect(rows[0]!.display_title).toContain("Donald Duck");
        expect(rows[0]!.subtitle).toContain("2 forms received");
    });

    it("groups by packet_session_id when no opportunity exists", () => {
        const rows = buildIntakeCasePresentationRows({
            submissions: [
                submission({
                    id: SUB1,
                    payload: submissionPayload({
                        meta: { packet_session_id: SESS },
                        values: { guardian_full_name: "Riley Test" },
                    }),
                }),
                submission({
                    id: SUB2,
                    packet_session_id: SESS,
                    submitted_at: "2026-05-27T12:00:00.000Z",
                    payload: submissionPayload({ values: { guardian_full_name: "Riley Test" } }),
                }),
            ],
            sessions: [
                {
                    id: SESS,
                    status: "in_progress",
                    created_at: "2026-05-27T08:00:00.000Z",
                    packet_name: "Enrollment packet",
                },
            ],
        });

        expect(rows).toHaveLength(1);
        expect(rows[0]!.case_key).toBe(`packet_session:${SESS}`);
        expect(rows[0]!.anchor_type).toBe("packet_session");
        expect(rows[0]!.packet_session_id).toBe(SESS);
        expect(rows[0]!.status_bucket).toBe("packet_in_progress");
        expect(rows[0]!.display_title).toContain("Enrollment packet");
        expect(rows[0]!.recommended_next_action).toBe("Monitor until packet completes");
    });

    it("uses stable submission fallback case key when no anchors", () => {
        const row = submission({
            id: SUB3,
            payload: submissionPayload({ values: { guardian_email: "solo@example.com" } }),
        });
        expect(resolveIntakeCaseGroupKey(row)).toBe(`submission:${SUB3}`);

        const cases = buildIntakeCasePresentationRows({ submissions: [row] });
        expect(cases).toHaveLength(1);
        expect(cases[0]!.case_key).toBe(`submission:${SUB3}`);
        expect(parseIntakeCaseGroupKey(cases[0]!.case_key)).toEqual({
            anchor_type: "submission",
            anchor_id: SUB3,
        });
    });

    it("maps review-required submission to review_required bucket", () => {
        const rows = buildIntakeCasePresentationRows({
            submissions: [
                submission({
                    id: SUB1,
                    opportunity_id: OPP,
                    payload: submissionPayload({
                        meta: { intake_needs_review: true, intake_resolution_path: "created_records" },
                        values: { guardian_full_name: "Jordan Test" },
                    }),
                }),
            ],
        });

        expect(rows[0]!.status_bucket).toBe("review_required");
        expect(rows[0]!.review_state).toBe("needs_review");
        expect(rows[0]!.recommended_next_action).toBe("Review intake and continue enrollment");
        expect(rows[0]!.attention_reasons).toContain("Review required before enrollment continues");
    });

    it("maps attached clean submission to auto_operationalized", () => {
        const rows = buildIntakeCasePresentationRows({
            submissions: [
                submission({
                    id: SUB1,
                    opportunity_id: OPP,
                    person_id: "person-1",
                    payload: submissionPayload({
                        meta: {
                            intake_needs_review: false,
                            intake_opportunity_match: "attached_existing",
                            intake_resolution_path: "matched_email",
                        },
                        values: { guardian_full_name: "Existing Family" },
                    }),
                }),
            ],
        });

        expect(rows[0]!.status_bucket).toBe("auto_operationalized");
        expect(rows[0]!.operationalized_state).toBe("attached_existing");
        expect(rows[0]!.subtitle).toContain("Attached to existing family");
        expect(rows[0]!.recommended_next_action).toBe("Continue enrollment");
    });

    it("does not crash when optional metadata is missing", () => {
        const rows = buildIntakeCasePresentationRows({
            submissions: [
                submission({
                    id: SUB1,
                    status: "draft",
                    submitted_at: null,
                    payload: undefined,
                }),
            ],
        });

        expect(rows).toHaveLength(1);
        expect(rows[0]!.status_bucket).toBe("waiting");
        expect(rows[0]!.review_state).toBe("in_progress");
        expect(rows[0]!.operationalized_state).toBe("none");
        expect(rows[0]!.has_signature).toBe(false);
    });

    it("opportunity_id takes precedence over packet_session_id for grouping", () => {
        const groups = groupSubmissionsByIntakeCaseKey([
            submission({
                id: SUB1,
                opportunity_id: OPP,
                payload: { meta: { packet_session_id: SESS } },
            }),
        ]);

        expect([...groups.keys()]).toEqual([`opportunity:${OPP}`]);
    });

    it("resolveSubmissionPacketSessionId reads explicit field and meta", () => {
        expect(
            resolveSubmissionPacketSessionId(
                submission({ id: SUB1, packet_session_id: SESS, payload: { meta: { packet_session_id: "other" } } })
            )
        ).toBe(SESS);
        expect(
            resolveSubmissionPacketSessionId(
                submission({ id: SUB1, payload: { meta: { packet_session_id: SESS } } })
            )
        ).toBe(SESS);
    });

    it("separates cases for different opportunities", () => {
        const rows = buildIntakeCasePresentationRows({
            submissions: [
                submission({ id: SUB1, opportunity_id: OPP }),
                submission({ id: SUB2, opportunity_id: OPP2 }),
            ],
        });
        expect(rows).toHaveLength(2);
        expect(rows.map((r) => r.case_key).sort()).toEqual(
            [`opportunity:${OPP}`, `opportunity:${OPP2}`].sort()
        );
    });
});
