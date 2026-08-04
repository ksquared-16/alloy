import { describe, expect, it } from "vitest";
import {
    assignmentCardFieldValue,
    buildAssignmentCardModel,
} from "@/lib/enrollment/buildAssignmentCardModel";
import { EFFECTIVE_DATE_LABELS } from "@/lib/enrollment/effectiveDateAuthority";
import { evaluateAssignmentProposalReadiness } from "@/lib/enrollment/assignmentProposalReadiness";
import type { AssignmentQuoteSnapshot } from "@/lib/enrollment/assignmentQuoteSnapshot";
import {
    appendAssignmentQuoteSnapshot,
    activeAssignmentQuoteSnapshot,
} from "@/lib/enrollment/assignmentQuoteSnapshot";
import { resolveOperationalStartDate } from "@/lib/enrollment/effectiveDateAuthority";
import {
    assignmentTypeEstablishesEnrollment,
    readAssignmentTypeBehavior,
} from "@/lib/operationalAssignments/assignmentTypeBehavior";

const preschoolQuote: AssignmentQuoteSnapshot = {
    id: "q-preschool",
    status: "generated",
    offering_id: "plan-full",
    offering_label: "Full-time tuition",
    amount_cents: 145000,
    currency: "USD",
    effective_date: "2026-09-01",
    pricing_inputs: { days: 5 },
    created_by: "user-1",
    generated_at: "2026-08-01T12:00:00.000Z",
    schedule_assignment_id: "oa-preschool",
};

const beforeCareQuote: AssignmentQuoteSnapshot = {
    id: "q-before",
    status: "generated",
    offering_id: "plan-before",
    offering_label: "Before care",
    amount_cents: 18000,
    currency: "USD",
    effective_date: "2026-09-01",
    pricing_inputs: {},
    created_by: "user-1",
    generated_at: "2026-08-02T12:00:00.000Z",
    schedule_assignment_id: "oa-before",
};

describe("buildAssignmentCardModel — multi-entry cardinality", () => {
    it("renders zero, one, and many assignment entries", () => {
        expect(buildAssignmentCardModel({}).entries).toEqual([]);

        const one = buildAssignmentCardModel({
            proposedAssignments: [
                {
                    id: "oa-1",
                    start_date: "2026-09-08",
                    status: "planned",
                    commitment_kind: "proposed",
                    assignmentTypeLabel: "Preschool",
                    isPrimary: true,
                    establishesEnrollment: true,
                    roomName: "A",
                    programLabel: "Preschool",
                    siteLabel: "South",
                    weekdays: [1, 2, 3, 4, 5],
                    scheduleTypeLabel: "Full day",
                },
            ],
        });
        expect(one.entries).toHaveLength(1);
        expect(one.entries[0]!.title).toBe("Preschool");
        expect(one.entries[0]!.state).toBe("proposed");

        const many = buildAssignmentCardModel({
            committedAssignments: [
                {
                    id: "oa-core",
                    start_date: "2026-09-08",
                    status: "active",
                    commitment_kind: "committed",
                    assignmentTypeLabel: "Preschool",
                    isPrimary: true,
                    establishesEnrollment: true,
                    siteLabel: "South",
                    roomName: "Preschool A",
                    weekdays: [1, 2, 3, 4, 5],
                    arriveTime: "08:00",
                    departTime: "15:00",
                },
            ],
            proposedAssignments: [
                {
                    id: "oa-before",
                    start_date: "2026-09-08",
                    status: "planned",
                    commitment_kind: "proposed",
                    assignmentTypeLabel: "Before Care",
                    isPrimary: false,
                    establishesEnrollment: false,
                    siteLabel: "South",
                    weekdays: [1, 2, 3, 4, 5],
                    arriveTime: "07:00",
                    departTime: "08:00",
                },
            ],
            interests: [
                {
                    id: "interest-soccer",
                    label: "Soccer Shots",
                    assignmentTypeKey: "enrichment",
                },
            ],
            processInstanceMetadata: {
                assignment_quote_snapshots: [preschoolQuote, beforeCareQuote],
            },
            readinessByAssignmentId: {
                "oa-before": evaluateAssignmentProposalReadiness({
                    requiredFactors: ["tuition_plan", "quote_generated"],
                    facts: {
                        hasQuoteSnapshot: true,
                        tuitionPlanId: "plan-before",
                    },
                }),
            },
        });

        expect(many.entries.map((e) => e.title)).toEqual([
            "Preschool",
            "Before Care",
            "Soccer Shots",
        ]);
        expect(many.entries.map((e) => e.state)).toEqual([
            "committed",
            "proposed",
            "interested",
        ]);
        expect(many.summaryLine).toMatch(/3 assignments/);
        expect(many.entries.find((e) => e.id === "oa-before")?.estimatedTuition).toBe("$180.00");
        expect(many.entries.find((e) => e.id === "interest-soccer")?.interestOnly).toBe(true);
    });

    it("keeps Requested Start distinct from Enrollment Start Date", () => {
        const model = buildAssignmentCardModel({
            processInstanceMetadata: { start_date: "2026-09-01" },
            committedAssignments: [
                {
                    id: "c1",
                    start_date: "2026-09-15",
                    status: "active",
                    commitment_kind: "committed",
                    isPrimary: true,
                    establishesEnrollment: true,
                    assignmentTypeLabel: "Preschool",
                },
            ],
        });
        expect(model.requestedStart).toBe("2026-09-01");
        expect(model.enrollmentStartDate).toBe("2026-09-15");
        expect(assignmentCardFieldValue(model, "family_request", "requested_start")).not.toBe(
            assignmentCardFieldValue(model, "committed_assignment", "start_date"),
        );
    });

    it("isolates per-entry readiness", () => {
        const model = buildAssignmentCardModel({
            proposedAssignments: [
                {
                    id: "oa-core",
                    start_date: "2026-09-08",
                    status: "planned",
                    commitment_kind: "proposed",
                    assignmentTypeLabel: "Preschool",
                    isPrimary: true,
                    establishesEnrollment: true,
                    roomName: "A",
                    programLabel: "Preschool",
                    scheduleTypeLabel: "Full day",
                },
                {
                    id: "oa-before",
                    start_date: "2026-09-08",
                    status: "planned",
                    commitment_kind: "proposed",
                    assignmentTypeLabel: "Before Care",
                    isPrimary: false,
                    establishesEnrollment: false,
                },
            ],
            readinessByAssignmentId: {
                "oa-core": { ready: true, gaps: [] },
                "oa-before": evaluateAssignmentProposalReadiness({
                    requiredFactors: ["room", "quote_generated"],
                    facts: { roomLocationId: null, hasQuoteSnapshot: false },
                }),
            },
        });
        expect(model.entries.find((e) => e.id === "oa-core")?.readinessReady).toBe(true);
        expect(model.entries.find((e) => e.id === "oa-before")?.readinessSummary).toBe(
            "2 items required",
        );
        expect(model.readinessSummary).toMatch(/need attention|items required/i);
    });
});

describe("Enrollment Start Date — enrollment-establishing filter", () => {
    it("ignores earlier non-establishing enrichment when deriving Enrollment Start", () => {
        const resolved = resolveOperationalStartDate({
            committedAssignments: [
                {
                    id: "soccer",
                    start_date: "2026-08-20",
                    status: "active",
                    commitment_kind: "committed",
                    establishes_enrollment: false,
                    is_primary: false,
                },
                {
                    id: "core",
                    start_date: "2026-09-08",
                    status: "active",
                    commitment_kind: "committed",
                    establishes_enrollment: true,
                    is_primary: true,
                },
            ],
        });
        expect(resolved.startDate).toBe("2026-09-08");
        expect(resolved.assignmentId).toBe("core");
    });

    it("chooses earliest among qualifying commitments", () => {
        const resolved = resolveOperationalStartDate({
            committedAssignments: [
                {
                    id: "later",
                    start_date: "2026-10-01",
                    status: "active",
                    commitment_kind: "committed",
                    establishes_enrollment: true,
                    is_primary: true,
                },
                {
                    id: "earlier",
                    start_date: "2026-09-08",
                    status: "active",
                    commitment_kind: "committed",
                    establishes_enrollment: true,
                    is_primary: true,
                },
            ],
        });
        expect(resolved.startDate).toBe("2026-09-08");
    });

    it("does not rewrite Enrollment Start when a non-establishing add-on changes", () => {
        const before = resolveOperationalStartDate({
            committedAssignments: [
                {
                    id: "core",
                    start_date: "2026-09-08",
                    status: "active",
                    commitment_kind: "committed",
                    is_primary: true,
                    establishes_enrollment: true,
                },
            ],
        });
        const after = resolveOperationalStartDate({
            committedAssignments: [
                {
                    id: "core",
                    start_date: "2026-09-08",
                    status: "active",
                    commitment_kind: "committed",
                    is_primary: true,
                    establishes_enrollment: true,
                },
                {
                    id: "before-care",
                    start_date: "2026-08-01",
                    status: "active",
                    commitment_kind: "committed",
                    is_primary: false,
                    establishes_enrollment: false,
                },
            ],
        });
        expect(before.startDate).toBe("2026-09-08");
        expect(after.startDate).toBe("2026-09-08");
    });

    it("defaults establishesEnrollment from primaryEligible on assignment types", () => {
        expect(
            assignmentTypeEstablishesEnrollment(
                readAssignmentTypeBehavior({ primaryEligible: true }),
            ),
        ).toBe(true);
        expect(
            assignmentTypeEstablishesEnrollment(
                readAssignmentTypeBehavior({ primaryEligible: false }),
            ),
        ).toBe(false);
        expect(
            assignmentTypeEstablishesEnrollment(
                readAssignmentTypeBehavior({
                    primaryEligible: false,
                    establishesEnrollment: true,
                }),
            ),
        ).toBe(true);
    });
});

describe("per-assignment quote isolation", () => {
    it("regenerating one entry quote does not supersede another entry", () => {
        let meta: Record<string, unknown> = {
            assignment_quote_snapshots: [preschoolQuote, beforeCareQuote],
        };
        const regenerated = appendAssignmentQuoteSnapshot(meta, {
            id: "q-before-2",
            offering_id: "plan-before",
            offering_label: "Before care refreshed",
            amount_cents: 20000,
            currency: "USD",
            effective_date: "2026-09-01",
            pricing_inputs: {},
            created_by: "user-1",
            generated_at: "2026-08-03T12:00:00.000Z",
            schedule_assignment_id: "oa-before",
        });
        meta = regenerated.metadata;
        expect(activeAssignmentQuoteSnapshot(meta, "oa-preschool")?.id).toBe("q-preschool");
        expect(activeAssignmentQuoteSnapshot(meta, "oa-before")?.id).toBe("q-before-2");
        expect(activeAssignmentQuoteSnapshot(meta, "oa-preschool")?.amount_cents).toBe(145000);
    });
});

describe("buildAssignmentCardModel — legacy single-entry compat", () => {
    it("uses agreement fallback for Start Date when no committed OA exists", () => {
        const model = buildAssignmentCardModel({
            processInstanceMetadata: { start_date: "2026-09-01" },
            agreementStartDate: "2026-09-20",
            committedAssignments: [],
        });
        expect(model.enrollmentStartDate).toBe("2026-09-20");
        expect(model.startDateSource).toBe("agreement_fallback");
        expect(assignmentCardFieldValue(model, "committed_assignment", "start_date")).toBe(
            "Sep 20, 2026",
        );
        expect(model.summaryLine).toContain(EFFECTIVE_DATE_LABELS.startDate);
    });
});
