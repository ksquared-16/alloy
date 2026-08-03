import { describe, expect, it } from "vitest";
import {
    evaluateAssignmentProposalReadiness,
    assignmentFactorFromLifecycleRuleId,
} from "@/lib/enrollment/assignmentProposalReadiness";
import {
    appendAssignmentQuoteSnapshot,
    acceptAssignmentQuoteSnapshot,
    activeAssignmentQuoteSnapshot,
    assertQuoteSnapshotImmutable,
    listAssignmentQuoteSnapshots,
} from "@/lib/enrollment/assignmentQuoteSnapshot";

describe("assignmentProposalReadiness", () => {
    it("Scenario 1 — partial family request surfaces preferred-days gap when configured", () => {
        const result = evaluateAssignmentProposalReadiness({
            requiredFactors: ["requested_days_per_week", "preferred_weekdays"],
            facts: {
                processInstanceMetadata: { requested_days_per_week: 3 },
            },
        });
        expect(result.ready).toBe(false);
        expect(result.gaps.map((g) => g.factor)).toEqual(["preferred_weekdays"]);
    });

    it("Scenario 3 — blocks on missing site/program/schedule/tuition without changing stage", () => {
        const result = evaluateAssignmentProposalReadiness({
            requiredFactors: [
                "site",
                "program",
                "assignment_start",
                "proposed_schedule",
                "tuition_plan",
            ],
            facts: {
                processInstanceMetadata: { requested_days_per_week: 3, weekdays: [1, 2, 3] },
                locationId: "site-1",
                // program missing
                hasProposedSchedule: true,
                proposedAssignmentStart: "2026-09-15",
                // tuition missing
            },
        });
        expect(result.ready).toBe(false);
        expect(result.gaps.map((g) => g.factor).sort()).toEqual(["program", "tuition_plan"]);
    });

    it("Scenario 10 — Tenant A requires room + quote acceptance; Tenant B does not", () => {
        const facts = {
            processInstanceMetadata: {
                requested_days_per_week: 5,
                weekdays: [1, 2, 3, 4, 5],
                start_date: "2026-09-01",
            },
            locationId: "site-1",
            programCategoryId: "prog-1",
            hasProposedSchedule: true,
            proposedAssignmentStart: "2026-09-15",
            tuitionPlanId: "plan-1",
            hasQuoteSnapshot: true,
            quoteAccepted: false,
            roomLocationId: null as string | null,
        };

        const tenantA = evaluateAssignmentProposalReadiness({
            requiredFactors: ["room", "quote_accepted", "tuition_plan"],
            facts,
        });
        expect(tenantA.ready).toBe(false);
        expect(tenantA.gaps.map((g) => g.factor).sort()).toEqual(["quote_accepted", "room"]);

        const tenantB = evaluateAssignmentProposalReadiness({
            requiredFactors: ["tuition_plan", "proposed_schedule"],
            facts,
        });
        expect(tenantB.ready).toBe(true);
        expect(tenantB.gaps).toEqual([]);
    });

    it("maps lifecycle rule ids to assignment factors", () => {
        expect(assignmentFactorFromLifecycleRuleId("child:requested_days_per_week")).toBe(
            "requested_days_per_week",
        );
        expect(assignmentFactorFromLifecycleRuleId("child:quote_accepted")).toBe("quote_accepted");
        expect(assignmentFactorFromLifecycleRuleId("person:first_name")).toBeNull();
    });
});

describe("assignmentQuoteSnapshot", () => {
    it("Scenario 6 — durable snapshot is immutable and not rewritten by later generation", () => {
        const first = appendAssignmentQuoteSnapshot(
            { start_date: "2026-09-01" },
            {
                id: "q1",
                offering_id: "plan-v1",
                offering_version_key: "v1",
                offering_label: "Full time",
                amount_cents: 120000,
                currency: "USD",
                effective_date: "2026-09-15",
                pricing_inputs: { days: 5, plan_amount_cents: 120000 },
                created_by: "user-1",
                generated_at: "2026-08-01T12:00:00Z",
            },
        );
        assertQuoteSnapshotImmutable(first.snapshot);
        expect(first.snapshot.amount_cents).toBe(120000);

        const second = appendAssignmentQuoteSnapshot(first.metadata, {
            id: "q2",
            offering_id: "plan-v2",
            offering_version_key: "v2",
            amount_cents: 130000,
            currency: "USD",
            effective_date: "2026-09-15",
            pricing_inputs: { days: 5, plan_amount_cents: 130000 },
            created_by: "user-1",
            generated_at: "2026-08-02T12:00:00Z",
            supersedes_snapshot_id: "q1",
        });

        const rows = listAssignmentQuoteSnapshots(second.metadata);
        expect(rows.find((r) => r.id === "q1")?.status).toBe("superseded");
        expect(rows.find((r) => r.id === "q1")?.amount_cents).toBe(120000);
        expect(activeAssignmentQuoteSnapshot(second.metadata)?.id).toBe("q2");

        const accepted = acceptAssignmentQuoteSnapshot(
            second.metadata,
            "q2",
            "2026-08-03T10:00:00Z",
        );
        expect(accepted.ok).toBe(true);
        expect(activeAssignmentQuoteSnapshot(accepted.metadata)?.status).toBe("accepted");
    });
});
