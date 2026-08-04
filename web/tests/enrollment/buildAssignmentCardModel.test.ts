import { describe, expect, it } from "vitest";
import {
    assignmentCardFieldValue,
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
    it("exposes a coherent offer model (not a five-section presentation stack)", () => {
        const model = buildAssignmentCardModel({
            processInstanceMetadata: {
                start_date: "2026-09-01",
                requested_days_per_week: 3,
                weekdays: [1, 3, 5],
            },
            scheduleTypeLabel: "School day",
            siteLabel: "South Campus",
            proposedAssignments: [
                {
                    id: "p1",
                    start_date: "2026-09-10",
                    status: "planned",
                    commitment_kind: "proposed",
                    weekdays: [1, 3, 5],
                    scheduleTypeLabel: "School day",
                    roomName: "Maple",
                    programLabel: "Preschool",
                    siteLabel: "South Campus",
                },
            ],
            quoteSnapshot: quote,
        });

        expect(model.state).toBe("proposed");
        expect(model.stateLabel).toBe("Proposed assignment");
        expect(model.fields.map((f) => f.key)).toEqual([
            "site",
            "program",
            "room",
            "schedule",
            "start_date",
            "tuition_plan",
            "estimated_tuition",
            "quote",
        ]);
        // Family-request facts stay available for Children/comparison — not offer fields.
        expect(model.fields.some((f) => f.key === "requested_days_per_week")).toBe(false);
        expect(model.fields.some((f) => f.key === "preferred_weekdays")).toBe(false);
        expect(model.requestedStart).toBe("2026-09-01");
        expect(model.fields.find((f) => f.key === "site")?.value).toBe("South Campus");
        expect(model.fields.find((f) => f.key === "tuition_plan")?.value).toBe("Full-time tuition");
        expect(model.fields.find((f) => f.key === "estimated_tuition")?.value).toBe("$1,450.00");
        expect(model.fields.find((f) => f.key === "quote")?.value).toMatch(/Generated/);
    });

    it("keeps Requested Start distinct from operational Start Date", () => {
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
        expect(model.state).toBe("committed");
        expect(model.stateLabel).toMatch(/Committed/);
        expect(model.fields.find((f) => f.key === "start_date")?.value).toBe("Sep 15, 2026");
        expect(assignmentCardFieldValue(model, "family_request", "requested_start")).toBe(
            "Sep 1, 2026",
        );
        expect(assignmentCardFieldValue(model, "committed_assignment", "start_date")).toBe(
            "Sep 15, 2026",
        );
        expect(assignmentCardFieldValue(model, "family_request", "requested_start")).not.toBe(
            assignmentCardFieldValue(model, "committed_assignment", "start_date"),
        );
    });

    it("shows compact readiness summary and field-level required/missing state", () => {
        const readiness = evaluateAssignmentProposalReadiness({
            requiredFactors: ["room", "quote_generated"],
            facts: {
                processInstanceMetadata: {
                    start_date: "2026-09-01",
                    requested_days_per_week: 5,
                    weekdays: [1, 2, 3, 4, 5],
                },
                hasProposedSchedule: true,
                hasQuoteSnapshot: false,
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
                    roomName: null,
                    programLabel: "Preschool",
                },
            ],
            committedAssignments: [],
            quoteSnapshot: null,
            readiness,
        });

        expect(model.readinessReady).toBe(false);
        expect(model.readinessGapCount).toBe(2);
        expect(model.readinessSummary).toBe("2 items required");
        expect(model.summaryLine).toBe("2 items required");
        expect(model.fields.find((f) => f.key === "room")?.missing).toBe(true);
        expect(model.fields.find((f) => f.key === "quote")?.missing).toBe(true);
        expect(model.fields.find((f) => f.key === "program")?.present).toBe(true);
    });

    it("uses agreement fallback for Start Date when no committed OA exists", () => {
        const model = buildAssignmentCardModel({
            processInstanceMetadata: { start_date: "2026-09-01" },
            agreementStartDate: "2026-09-20",
            committedAssignments: [],
        });
        expect(model.startDate).toBe("2026-09-20");
        expect(model.startDateSource).toBe("agreement_fallback");
        expect(model.state).toBe("committed");
        expect(assignmentCardFieldValue(model, "committed_assignment", "start_date")).toBe(
            "Sep 20, 2026",
        );
        expect(model.summaryLine).toContain(EFFECTIVE_DATE_LABELS.startDate);
    });

    it("marks calm empty offer when no assignment facts exist", () => {
        const model = buildAssignmentCardModel({});
        expect(model.state).toBe("none");
        expect(model.stateLabel).toBe("No assignment yet");
        expect(model.summaryLine).toBe("No assignment yet");
        expect(model.readinessReady).toBe(true);
        expect(model.fields.every((f) => !f.present)).toBe(true);
    });

    it("reads active quote snapshot from participation metadata when not passed explicitly", () => {
        const model = buildAssignmentCardModel({
            processInstanceMetadata: {
                start_date: "2026-09-01",
                assignment_quote_snapshots: [quote],
            },
        });
        expect(model.fields.find((f) => f.key === "tuition_plan")?.value).toBe("Full-time tuition");
        expect(model.fields.find((f) => f.key === "estimated_tuition")?.value).toBe("$1,450.00");
        expect(model.state).toBe("proposed");
        expect(model.quoteGeneratedAt).toBe(quote.generated_at);
    });
});
