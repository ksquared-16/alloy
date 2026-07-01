import { describe, expect, it } from "vitest";
import { filterQueueRowsByWorkViewFilters } from "@/lib/lifecycle/evaluateWorkViewFiltersV1";
import { computeOperationalProjection } from "@/lib/lifecycle/operationalProjection";
import {
    WORK_VIEW_CONDITION_FIELD_DEFS,
    getWorkViewConditionField,
} from "@/lib/lifecycle/workViewConditionFieldRegistry";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";

/**
 * Status Truth Doctrine — there is no generic status. Every status belongs to a subject/grain:
 *  - Lead Status      → opportunities.status_key            (family / opportunity grain)
 *  - Child Enrollment → opportunity_customer_members.outcome_status_key (child / member grain)
 *  - Person Status    → persons.status_key                 (person grain)        — not yet a Work View field
 *  - Account Status   → customers.status_key               (account grain)       — not yet a Work View field
 * Counts must follow the selected grain.
 */

describe("Status Truth Doctrine — Work View condition fields are domain-typed", () => {
    it("exposes Lead Status and Child Enrollment Status as distinct subject-typed fields", () => {
        const lead = getWorkViewConditionField("opportunity_status");
        const child = getWorkViewConditionField("child_enrollment_status");
        expect(lead?.label).toBe("Lead Status");
        expect(lead?.optionSource).toEqual({ kind: "status_definitions", entityType: "opportunities" });
        expect(child?.label).toBe("Enrollment Status");
        expect(child?.optionSource).toEqual({
            kind: "status_definitions",
            entityType: "opportunity_customer_members",
        });
        // Lead and Child status resolve from DIFFERENT entities — never a shared status set.
        expect(lead?.optionSource).not.toEqual(child?.optionSource);
        expect(lead?.runtimeField).toBe("opportunity_status");
        expect(child?.runtimeField).toBe("child_enrollment_status");
    });

    it("exposes NO generic status, and NO unbacked Person/Account status field yet", () => {
        const keys = WORK_VIEW_CONDITION_FIELD_DEFS.map((d) => d.key);
        expect(keys).not.toContain("status");
        // Person/Account status are NOT exposed until safely backed (Account has no seeded
        // status_definitions; Person status is not carried on opportunity/child Work View rows).
        expect(keys).not.toContain("person_status");
        expect(keys).not.toContain("account_status");
        expect(keys).not.toContain("customer_status");
        expect(getWorkViewConditionField("person_status")).toBeNull();
        expect(getWorkViewConditionField("account_status")).toBeNull();
    });
});

describe("Status Truth Doctrine — the right status drives the right stage", () => {
    const leadStageView: WorkViewConfigV1Stored = {
        id: "new_leads",
        label: "New Leads",
        display_order: 1,
        match: "all",
        filters_v1: [{ field_key: "opportunity_stage", operator: "equals", value: "lead" }],
    };
    const waitlistChildView: WorkViewConfigV1Stored = {
        id: "waitlist",
        label: "Waitlist",
        display_order: 4,
        match: "all",
        filters_v1: [{ field_key: "child_enrollment_status", operator: "equals", value: "waitlisted" }],
    };

    it("Lead Status (New Lead) drives the Lead family stage — family count 1", () => {
        const family = { id: "lyons", status_key: "new_inquiry" };
        const p = computeOperationalProjection({
            baseRows: [family],
            workViews: [leadStageView],
            statusStageMap: { new_inquiry: "lead" }, // status_definitions.process_stage_key
        });
        expect(p.byViewId.new_leads!.count).toBe(1);
        expect(p.byViewId.new_leads!.rows).toHaveLength(1);
    });

    it("Child Enrollment Status (Waitlisted) drives the child Waitlist stage at CHILD grain", () => {
        // Two waitlisted children in one family = TWO child rows → count 2 (child grain, not 1 family).
        const childRows = [
            { id: "child-a", opportunity_id: "fam-1", child_enrollment_status_key: "waitlisted" },
            { id: "child-b", opportunity_id: "fam-1", child_enrollment_status_key: "waitlisted" },
        ];
        const p = computeOperationalProjection({ baseRows: childRows, workViews: [waitlistChildView] });
        expect(p.byViewId.waitlist!.count).toBe(2);
        expect(p.byViewId.waitlist!.rows).toHaveLength(2);
    });

    it("Lead Status 'waitlisted' does NOT drive the child Waitlist stage (different domain/field)", () => {
        // A family whose LEAD status is 'waitlisted' but whose child has no enrollment disposition.
        const family = { id: "fam-2", status_key: "waitlisted", child_enrollment_status_key: null };
        const matched = filterQueueRowsByWorkViewFilters([family], waitlistChildView.filters_v1, "all");
        expect(matched).toHaveLength(0); // child_enrollment_status is null → not a child waitlist
    });

    it("Lead Status and Child Enrollment Status resolve from different row fields (no cross-talk)", () => {
        // Same record carries a lead status AND a child disposition — each condition sees only its own.
        const row = { id: "r", status_key: "new_inquiry", child_enrollment_status_key: "enrolled" };
        expect(
            filterQueueRowsByWorkViewFilters(
                [row],
                [{ field_key: "opportunity_status", operator: "equals", value: "new_inquiry" }],
                "all",
            ),
        ).toHaveLength(1);
        expect(
            filterQueueRowsByWorkViewFilters(
                [row],
                [{ field_key: "opportunity_status", operator: "equals", value: "enrolled" }],
                "all",
            ),
        ).toHaveLength(0); // lead status is new_inquiry, not enrolled (enrolled is the CHILD's)
        expect(
            filterQueueRowsByWorkViewFilters(
                [row],
                [{ field_key: "child_enrollment_status", operator: "equals", value: "enrolled" }],
                "all",
            ),
        ).toHaveLength(1);
    });
});
