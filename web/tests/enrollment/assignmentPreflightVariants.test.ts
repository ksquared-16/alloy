import { describe, expect, it } from "vitest";
import { evaluateAssignmentProposalReadiness } from "@/lib/enrollment/assignmentProposalReadiness";

/**
 * Tenant-configured preflight variants for assignment proposal readiness.
 * Pure evaluation — Tenant A requires room + quote_accepted; Tenant B requires neither.
 */
describe("assignmentPreflightVariants", () => {
    const baseFacts = {
        processInstanceMetadata: {
            requested_days_per_week: 5,
            weekdays: [1, 2, 3, 4, 5],
            start_date: "2026-09-01",
            schedule_type: "full_day",
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

    it("Tenant A — requires room + quote_accepted → not ready until both present", () => {
        const tenantARequired = ["room", "quote_accepted", "tuition_plan"] as const;

        const blocked = evaluateAssignmentProposalReadiness({
            requiredFactors: tenantARequired,
            facts: baseFacts,
        });
        expect(blocked.ready).toBe(false);
        expect(blocked.gaps.map((g) => g.factor).sort()).toEqual(["quote_accepted", "room"]);

        const ready = evaluateAssignmentProposalReadiness({
            requiredFactors: tenantARequired,
            facts: {
                ...baseFacts,
                roomLocationId: "room-1",
                quoteAccepted: true,
            },
        });
        expect(ready.ready).toBe(true);
        expect(ready.gaps).toEqual([]);
    });

    it("Tenant B — neither room nor quote_accepted required → ready without them", () => {
        const tenantBRequired = ["tuition_plan", "proposed_schedule", "site", "program"] as const;

        const result = evaluateAssignmentProposalReadiness({
            requiredFactors: tenantBRequired,
            facts: baseFacts,
        });
        expect(result.ready).toBe(true);
        expect(result.gaps).toEqual([]);
        // Same facts fail Tenant A — config selects factors; code evaluates consistently.
        const tenantA = evaluateAssignmentProposalReadiness({
            requiredFactors: ["room", "quote_accepted"],
            facts: baseFacts,
        });
        expect(tenantA.ready).toBe(false);
    });
});
