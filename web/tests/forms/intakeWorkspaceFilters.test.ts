import { describe, expect, it } from "vitest";
import {
    buildIntakeWorkspaceFilterPanel,
    countIntakeWorkspaceFilters,
    countIntakeWorkspaceSubmissionLanes,
    defaultIntakeWorkspaceFilter,
    intakeCaseMatchesWorkspaceFilter,
} from "@/lib/forms/intakeWorkspaceFilters";
import { buildIntakeCasePresentationRows } from "@/lib/forms/intakeCasePresentation";
import type { SubmissionInboxRow } from "@/lib/forms/submissionInboxPresentation";

const OPP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FORM = "form-1";

const submission = (overrides: Partial<SubmissionInboxRow> = {}): SubmissionInboxRow => ({
    id: "sub-1",
    status: "submitted",
    created_at: "2026-05-01T10:00:00.000Z",
    submitted_at: "2026-05-02T12:00:00.000Z",
    form_definition_id: FORM,
    payload: { meta: { intake_needs_review: true } },
    ...overrides,
});

describe("intakeWorkspaceFilters IC-3", () => {
    it("counts review, linking, and waiting workloads", () => {
        const counts = countIntakeWorkspaceFilters({
            submissions: [
                submission(),
                submission({ id: "sub-2", payload: { meta: {} }, person_id: null }),
            ],
            sessions: [
                { id: "sess-1", status: "completed", created_at: "2026-05-03T10:00:00.000Z", packet_name: "Enrollment" },
                { id: "sess-2", status: "in_progress", created_at: "2026-05-03T11:00:00.000Z", packet_name: "Waitlist" },
            ],
            forms: [{ id: "form-1" }, { id: "form-2" }],
            packets: [{ id: "pkt-1" }],
            formsById: { [FORM]: "Waitlist" },
        });

        expect(counts.needs_review).toBeGreaterThanOrEqual(2);
        expect(counts.needs_linking).toBeGreaterThanOrEqual(1);
        expect(counts.needs_action).toBe(counts.needs_review + counts.needs_linking);
        expect(counts.waiting).toBe(1);
    });

    it("preserves submission lane counts for diagnostics", () => {
        const lanes = countIntakeWorkspaceSubmissionLanes([
            submission(),
            submission({ id: "sub-2", payload: { meta: {} }, person_id: null }),
        ]);
        expect(lanes.needsReview).toBe(1);
        expect(lanes.needsLinking).toBe(1);
    });

    it("defaults to needs_action when review or linking count is positive", () => {
        expect(
            defaultIntakeWorkspaceFilter({
                needs_action: 2,
                needs_review: 2,
                needs_linking: 0,
                recent: 3,
                waiting: 0,
                forms: 1,
                packets: 0,
            })
        ).toBe("needs_action");
    });

    it("defaults to recent when workload is clear", () => {
        expect(
            defaultIntakeWorkspaceFilter({
                needs_action: 0,
                needs_review: 0,
                needs_linking: 0,
                recent: 2,
                waiting: 0,
                forms: 1,
                packets: 0,
            })
        ).toBe("recent");
    });

    it("collapses multiple submissions with same opportunity into one workload row", () => {
        const panel = buildIntakeWorkspaceFilterPanel("recent", {
            submissions: [
                submission({
                    id: "sub-a",
                    opportunity_id: OPP,
                    submitted_at: "2026-05-02T10:00:00.000Z",
                    person_id: "p1",
                    payload: {
                        meta: {
                            intake_resolution_path: "matched_email",
                            intake_opportunity_match: "attached_existing",
                            intake_needs_review: false,
                        },
                    },
                }),
                submission({
                    id: "sub-b",
                    opportunity_id: OPP,
                    submitted_at: "2026-05-02T12:00:00.000Z",
                    person_id: "p1",
                    payload: {
                        meta: {
                            intake_resolution_path: "matched_email",
                            intake_opportunity_match: "attached_existing",
                            intake_needs_review: false,
                        },
                    },
                }),
            ],
            sessions: [],
            forms: [{ id: FORM, name: "Medication demo" }],
            packets: [],
            formsById: { [FORM]: "Medication demo" },
        });

        expect(panel.items).toHaveLength(1);
        expect(panel.items[0]?.isCaseRow).toBe(true);
        expect(panel.items[0]?.submissionCount).toBe(2);
        expect(panel.items[0]?.caseKey).toBe(`opportunity:${OPP}`);
        expect(panel.items[0]?.operatorAction).toBe("Continue enrollment");
        expect(panel.items[0]?.opportunityId).toBe(OPP);
    });

    it("builds recent panel with case-centric copy and recommended next action", () => {
        const panel = buildIntakeWorkspaceFilterPanel("recent", {
            submissions: [
                submission({
                    id: "sub-recent",
                    person_id: "p1",
                    payload: {
                        meta: {
                            intake_resolution_path: "matched_email",
                            intake_opportunity_match: "attached_existing",
                            intake_needs_review: false,
                        },
                    },
                }),
            ],
            sessions: [],
            forms: [{ id: FORM, name: "Medication demo" }],
            packets: [],
            formsById: { [FORM]: "Medication demo" },
        });

        expect(panel.title).toBe("Ready / healthy");
        expect(panel.items[0]?.isCaseRow).toBe(true);
        expect(panel.items[0]?.meta).toContain("Existing family");
        expect(panel.items[0]?.operatorAction).toBe("Continue enrollment");
        expect(panel.items[0]?.quickReview).toBe(true);
    });

    it("builds needs linking panel with case rows", () => {
        const panel = buildIntakeWorkspaceFilterPanel("needs_linking", {
            submissions: [submission({ payload: { meta: {} } })],
            sessions: [],
            forms: [{ id: FORM, name: "Waitlist" }],
            packets: [],
            formsById: { [FORM]: "Waitlist" },
        });

        expect(panel.title).toBe("Needs linking");
        expect(panel.items).toHaveLength(1);
        expect(panel.items[0]?.operatorAction).toBe("Match to family profile");
        expect(panel.empty).toBe("No intake cases need family matching.");
    });

    it("uses case-centric empty states", () => {
        expect(
            buildIntakeWorkspaceFilterPanel("needs_review", {
                submissions: [],
                sessions: [],
                forms: [],
                packets: [],
                formsById: {},
            }).empty
        ).toBe("No intake cases need review.");

        expect(
            buildIntakeWorkspaceFilterPanel("waiting", {
                submissions: [],
                sessions: [],
                forms: [],
                packets: [],
                formsById: {},
            }).empty
        ).toBe("No intake cases are waiting on completion.");
    });

    it("selects primary submission for quick review from grouped case", () => {
        const panel = buildIntakeWorkspaceFilterPanel("needs_review", {
            submissions: [
                submission({
                    id: "sub-old",
                    opportunity_id: OPP,
                    submitted_at: "2026-05-01T10:00:00.000Z",
                    payload: {
                        meta: { intake_needs_review: true, intake_resolution_path: "created_records" },
                    },
                }),
                submission({
                    id: "sub-new",
                    opportunity_id: OPP,
                    submitted_at: "2026-05-02T12:00:00.000Z",
                    payload: {
                        meta: { intake_needs_review: true, intake_resolution_path: "created_records" },
                    },
                }),
            ],
            sessions: [],
            forms: [{ id: FORM, name: "Medication demo" }],
            packets: [],
            formsById: { [FORM]: "Medication demo" },
        });

        expect(panel.items).toHaveLength(1);
        expect(panel.items[0]?.submission?.id).toBe("sub-new");
        expect(panel.items[0]?.quickReview).toBe(true);
    });

    it("does not crash when packet session enrichment is missing", () => {
        const submissions = [
            submission({
                id: "sub-packet",
                payload: { meta: { packet_session_id: "sess-missing" } },
            }),
        ];

        expect(() =>
            buildIntakeCasePresentationRows({
                submissions,
            })
        ).not.toThrow();

        const panel = buildIntakeWorkspaceFilterPanel("needs_linking", {
            submissions,
            sessions: [],
            forms: [],
            packets: [],
            formsById: {},
        });

        expect(panel.items).toHaveLength(1);
        expect(panel.items[0]?.isCaseRow).toBe(true);
    });

    it("maps intake case status buckets to workspace filters", () => {
        const [reviewCase] = buildIntakeCasePresentationRows({
            submissions: [submission({ payload: { meta: { intake_needs_review: true } } })],
        });
        expect(reviewCase).toBeDefined();
        expect(intakeCaseMatchesWorkspaceFilter(reviewCase!, "needs_review")).toBe(true);
        expect(intakeCaseMatchesWorkspaceFilter(reviewCase!, "needs_linking")).toBe(false);
    });
});
