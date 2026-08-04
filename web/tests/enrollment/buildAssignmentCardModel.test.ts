import { describe, expect, it } from "vitest";
import {
    ASSIGNMENT_CARD_SECTION_TITLES,
    assignmentCardFieldValue,
    assignmentCardSection,
    buildAssignmentCardModel,
} from "@/lib/enrollment/buildAssignmentCardModel";
import { EFFECTIVE_DATE_LABELS } from "@/lib/enrollment/effectiveDateAuthority";
import { evaluateAssignmentProposalReadiness } from "@/lib/enrollment/assignmentProposalReadiness";
import type { AssignmentQuoteSnapshot } from "@/lib/enrollment/assignmentQuoteSnapshot";

const quote: AssignmentQuoteSnapshot = {
    id: "q1",
    status: "generated",
    offering_id: "plan-full",
    offering_label: "Full-time tuition",
    amount_cents: 145000,
    currency: "USD",
    effective_date: "2026-09-01",
    pricing_inputs: { days: 5 },
    created_by: "user-1",
    generated_at: "2026-08-01T12:00:00.000Z",
};

describe("buildAssignmentCardModel", () => {
    it("keeps Requested Start and Start Date as distinct fields with operator labels", () => {
        const model = buildAssignmentCardModel({
            processInstanceMetadata: {
                start_date: "2026-09-01",
                requested_days_per_week: 3,
                weekdays: [1, 3, 5],
            },
            committedAssignments: [
                {
                    id: "c1",
                    start_date: "2026-09-15",
                    status: "active",
                    commitment_kind: "committed",
                    weekdays: [1, 2, 3, 4, 5],
                    scheduleTypeLabel: "Full day",
                    roomName: "Oak",
                },
            ],
        });

        expect(model.requestedStart).toBe("2026-09-01");
        expect(model.startDate).toBe("2026-09-15");
        expect(model.startDateSource).toBe("committed_assignment");

        const family = assignmentCardSection(model, "family_request");
        expect(family?.title).toBe(ASSIGNMENT_CARD_SECTION_TITLES.family_request);
        expect(assignmentCardFieldValue(model, "family_request", "requested_start")).toBe(
            "Sep 1, 2026",
        );
        expect(
            family?.fields.find((f) => f.key === "requested_start")?.label,
        ).toBe(EFFECTIVE_DATE_LABELS.requestedStart);

        expect(assignmentCardFieldValue(model, "committed_assignment", "start_date")).toBe(
            "Sep 15, 2026",
        );
        expect(
            assignmentCardSection(model, "committed_assignment")?.fields.find(
                (f) => f.key === "start_date",
            )?.label,
        ).toBe(EFFECTIVE_DATE_LABELS.startDate);

        // Must not collapse: family request never shows the committed start as Requested Start.
        expect(assignmentCardFieldValue(model, "family_request", "requested_start")).not.toBe(
            assignmentCardFieldValue(model, "committed_assignment", "start_date"),
        );
    });

    it("places requested days and preferred weekdays under Family request", () => {
        const model = buildAssignmentCardModel({
            processInstanceMetadata: {
                start_date: "2026-09-01",
                requested_days_per_week: 3,
                weekdays: [1, 3, 5],
            },
        });

        const family = assignmentCardSection(model, "family_request");
        expect(family?.empty).toBe(false);
        expect(assignmentCardFieldValue(model, "family_request", "requested_days_per_week")).toBe(
            "3",
        );
        expect(
            family?.fields.find((f) => f.key === "requested_days_per_week")?.label,
        ).toBe(EFFECTIVE_DATE_LABELS.requestedDaysPerWeek);
        expect(assignmentCardFieldValue(model, "family_request", "preferred_weekdays")).toBe(
            "Mon, Wed, Fri",
        );
        expect(
            family?.fields.find((f) => f.key === "preferred_weekdays")?.label,
        ).toBe(EFFECTIVE_DATE_LABELS.preferredDays);
    });

    it("sections proposed, commercial estimate, committed, and readiness gaps calmly", () => {
        const readiness = evaluateAssignmentProposalReadiness({
            requiredFactors: ["room", "quote_accepted"],
            facts: {
                processInstanceMetadata: {
                    start_date: "2026-09-01",
                    requested_days_per_week: 5,
                    weekdays: [1, 2, 3, 4, 5],
                },
                hasProposedSchedule: true,
                hasQuoteSnapshot: true,
                quoteAccepted: false,
                roomLocationId: null,
            },
        });

        const model = buildAssignmentCardModel({
            processInstanceMetadata: {
                start_date: "2026-09-01",
                requested_days_per_week: 5,
                weekdays: [1, 2, 3, 4, 5],
            },
            scheduleTypeLabel: "School day",
            proposedAssignments: [
                {
                    id: "p1",
                    start_date: "2026-09-10",
                    status: "planned",
                    commitment_kind: "proposed",
                    weekdays: [1, 2, 3, 4, 5],
                    scheduleTypeLabel: "School day",
                    roomName: "Maple",
                    programLabel: "Preschool",
                    arriveTime: "08:00",
                    departTime: "15:30",
                },
            ],
            committedAssignments: [],
            quoteSnapshot: quote,
            readiness,
        });

        expect(model.sections.map((s) => s.key)).toEqual([
            "family_request",
            "proposed_assignment",
            "commercial_estimate",
            "committed_assignment",
            "readiness_gaps",
        ]);

        expect(assignmentCardFieldValue(model, "proposed_assignment", "proposed_schedule")).toBe(
            "School day",
        );
        expect(
            assignmentCardFieldValue(model, "proposed_assignment", "proposed_assignment_start"),
        ).toBe("Sep 10, 2026");
        expect(assignmentCardFieldValue(model, "proposed_assignment", "proposed_room")).toBe(
            "Maple",
        );

        expect(assignmentCardFieldValue(model, "commercial_estimate", "quote_offering")).toBe(
            "Full-time tuition",
        );
        expect(assignmentCardFieldValue(model, "commercial_estimate", "quote_amount")).toBe(
            "$1,450.00",
        );
        expect(assignmentCardFieldValue(model, "commercial_estimate", "quote_status")).toBe(
            "Generated",
        );

        // No committed OA and no agreement fallback → Start Date empty; section empty-ish on schedule fields.
        expect(model.startDate).toBeNull();
        expect(assignmentCardFieldValue(model, "committed_assignment", "start_date")).toBeNull();

        const gaps = assignmentCardSection(model, "readiness_gaps");
        expect(gaps?.empty).toBe(false);
        expect(gaps?.gaps.map((g) => g.factor).sort()).toEqual(["quote_accepted", "room"]);
        expect(model.readinessReady).toBe(false);
        expect(model.readinessGapCount).toBe(2);
        expect(model.summaryLine).toBe("2 readiness gaps");
    });

    it("uses agreement fallback for Start Date when no committed OA exists", () => {
        const model = buildAssignmentCardModel({
            processInstanceMetadata: { start_date: "2026-09-01" },
            agreementStartDate: "2026-09-20",
            committedAssignments: [],
        });
        expect(model.startDate).toBe("2026-09-20");
        expect(model.startDateSource).toBe("agreement_fallback");
        expect(assignmentCardFieldValue(model, "committed_assignment", "start_date")).toBe(
            "Sep 20, 2026",
        );
        expect(model.summaryLine).toContain(EFFECTIVE_DATE_LABELS.startDate);
    });

    it("marks empty sections when facts are absent", () => {
        const model = buildAssignmentCardModel({});
        expect(assignmentCardSection(model, "family_request")?.empty).toBe(true);
        expect(assignmentCardSection(model, "proposed_assignment")?.empty).toBe(true);
        expect(assignmentCardSection(model, "commercial_estimate")?.empty).toBe(true);
        expect(assignmentCardSection(model, "committed_assignment")?.empty).toBe(true);
        expect(assignmentCardSection(model, "readiness_gaps")?.empty).toBe(true);
        expect(model.summaryLine).toBe("No assignment yet");
    });

    it("reads active quote snapshot from participation metadata when not passed explicitly", () => {
        const model = buildAssignmentCardModel({
            processInstanceMetadata: {
                start_date: "2026-09-01",
                assignment_quote_snapshots: [quote],
            },
        });
        expect(assignmentCardFieldValue(model, "commercial_estimate", "quote_offering")).toBe(
            "Full-time tuition",
        );
        expect(model.summaryLine).toBe("Commercial estimate ready");
    });
});
