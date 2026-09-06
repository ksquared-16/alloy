/**
 * The assignment tuition ESTIMATE snapshot — a presentation record, not a decision.
 *
 * This module used to run its own resolver over `program_key` / `schedule_key` / `billing_period`,
 * and this test used to hand it rows in that shape — columns dropped from `commercial_tuition_rates`
 * two months before. Both are gone. The module is now HANDED the option Commercial Execution
 * resolved and only records it, so what is left to test is the recording: what it stamps, what it
 * preserves, and that a later snapshot never edits an earlier one.
 *
 * Nothing here is a quote entity, and there is no quote lifecycle. What an operator ACCEPTS is an
 * `enrollment_pricing_terms` row, written by a registered action.
 */
import { describe, expect, it } from "vitest";

import {
    generateAssignmentQuoteSnapshot,
    type ResolvedTuitionForSnapshot,
} from "@/lib/enrollment/generateAssignmentQuote";
import { listAssignmentQuoteSnapshots } from "@/lib/enrollment/assignmentQuoteSnapshot";

const RESOLVED: ResolvedTuitionForSnapshot = {
    rateId: "rate-monthly-org",
    rateCents: 120_000,
    billingPeriod: "monthly",
    rateLabel: "$1,200.00/monthly",
    isLocationOverride: false,
};

function input(over: Partial<Parameters<typeof generateAssignmentQuoteSnapshot>[0]> = {}) {
    return {
        metadata: null,
        resolved: RESOLVED,
        programKey: "toddler",
        scheduleKey: "full_time",
        locationId: "loc-lakeside",
        effectiveDate: "2026-09-06",
        actorUserId: "user-1",
        snapshotId: "snap-1",
        ...over,
    };
}

describe("assignment tuition estimate snapshot", () => {
    it("records the resolved option, and does not choose one", () => {
        const result = generateAssignmentQuoteSnapshot(input());
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.snapshot).toMatchObject({
            id: "snap-1",
            offering_id: "rate-monthly-org",
            amount_cents: 120_000,
            currency: "USD",
            effective_date: "2026-09-06",
            created_by: "user-1",
        });
        expect(result.snapshot.pricing_inputs).toMatchObject({
            rate_id: "rate-monthly-org",
            rate_cents: 120_000,
            billing_period: "monthly",
            is_location_override: false,
        });
    });

    it("refuses to invent an estimate when nothing was resolved", () => {
        const result = generateAssignmentQuoteSnapshot(input({ resolved: null }));
        expect(result.ok).toBe(false);
        expect(result.ok === false && result.error).toContain("No eligible tuition plan");
    });

    it("carries the resolution's identity, so what the operator saw stays checkable", () => {
        const result = generateAssignmentQuoteSnapshot(
            input({ pricingInputsExtra: { resolution_key: "abc123", config_version: "cfg-9" } }),
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.snapshot.pricing_inputs).toMatchObject({
            resolution_key: "abc123",
            config_version: "cfg-9",
        });
    });

    /*
     * A SNAPSHOT IS IMMUTABLE ONCE TAKEN. A second estimate is appended; the first still says what
     * it said, which is the whole reason to keep it.
     */
    it("appends rather than rewriting a previous snapshot", () => {
        const first = generateAssignmentQuoteSnapshot(input());
        expect(first.ok).toBe(true);
        if (!first.ok) return;
        const second = generateAssignmentQuoteSnapshot(
            input({
                metadata: first.metadata,
                snapshotId: "snap-2",
                resolved: { ...RESOLVED, rateId: "rate-site", rateCents: 131_000 },
            }),
        );
        expect(second.ok).toBe(true);
        if (!second.ok) return;
        const all = listAssignmentQuoteSnapshots(second.metadata);
        expect(all.map((s) => s.id)).toEqual(["snap-1", "snap-2"]);
        expect(all[0]!.amount_cents).toBe(120_000);
        expect(all[1]!.amount_cents).toBe(131_000);
    });

    it("stamps the tuition plan the estimate was taken against", () => {
        const result = generateAssignmentQuoteSnapshot(input());
        expect(result.ok && (result.metadata as Record<string, unknown>).tuition_plan_id).toBe(
            "rate-monthly-org",
        );
    });
});
