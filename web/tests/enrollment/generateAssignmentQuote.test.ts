import { describe, expect, it } from "vitest";
import {
    generateAssignmentQuoteSnapshot,
    listEligibleTuitionPlans,
} from "@/lib/enrollment/generateAssignmentQuote";
import {
    assertQuoteSnapshotImmutable,
    listAssignmentQuoteSnapshots,
    activeAssignmentQuoteSnapshot,
} from "@/lib/enrollment/assignmentQuoteSnapshot";
import type { TuitionRateCandidate } from "@/lib/adminV2/runtime/focusPanel/financialConfig/resolveEnrollmentTuitionRate";

const rates: TuitionRateCandidate[] = [
    {
        id: "rate-ft-org",
        program_key: "preschool",
        schedule_key: "full_day",
        rate_cents: 120000,
        billing_period: "monthly",
        location_id: null,
    },
    {
        id: "rate-ft-site",
        program_key: "preschool",
        schedule_key: "full_day",
        rate_cents: 125000,
        billing_period: "monthly",
        location_id: "site-1",
    },
    {
        id: "rate-pt",
        program_key: "preschool",
        schedule_key: "part_day",
        rate_cents: 80000,
        billing_period: "monthly",
        location_id: null,
    },
];

describe("generateAssignmentQuoteSnapshot", () => {
    it("resolves an eligible plan and stamps an immutable snapshot (no ledger fields)", () => {
        const result = generateAssignmentQuoteSnapshot({
            metadata: { start_date: "2026-09-01", location_id: "site-1" },
            rates,
            programKey: "preschool",
            scheduleKey: "full_day",
            locationId: "site-1",
            effectiveDate: "2026-09-15",
            actorUserId: "user-1",
            snapshotId: "snap-1",
            generatedAt: "2026-08-03T12:00:00Z",
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.snapshot.offering_id).toBe("rate-ft-site");
        expect(result.snapshot.amount_cents).toBe(125000);
        expect(result.snapshot.status).toBe("generated");
        expect(result.metadata.tuition_plan_id).toBe("rate-ft-site");
        assertQuoteSnapshotImmutable(result.snapshot);

        // Quote is commercial proposal only — never invents ledger/invoice/payment truth.
        expect(result.snapshot).not.toHaveProperty("ledger_entry_id");
        expect(result.snapshot).not.toHaveProperty("invoice_id");
        expect(result.snapshot).not.toHaveProperty("payment_id");
        expect(result.metadata).not.toHaveProperty("ledger_posted");
        expect(JSON.stringify(result.metadata)).not.toMatch(/invoice_id|payment_id|ledger_entry/);
    });

    it("honors an explicit offering_id when present in the eligible pool", () => {
        const result = generateAssignmentQuoteSnapshot({
            metadata: {},
            rates,
            programKey: "preschool",
            scheduleKey: "full_day",
            locationId: "site-1",
            offeringId: "rate-ft-org",
            effectiveDate: "2026-09-15",
            actorUserId: null,
            snapshotId: "snap-pick",
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.snapshot.offering_id).toBe("rate-ft-org");
        expect(result.snapshot.amount_cents).toBe(120000);
    });

    it("refuses when no eligible plan matches", () => {
        const result = generateAssignmentQuoteSnapshot({
            metadata: {},
            rates,
            programKey: "infant",
            scheduleKey: "full_day",
            locationId: null,
            effectiveDate: "2026-09-15",
            actorUserId: null,
            snapshotId: "snap-x",
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error).toMatch(/No eligible tuition plan/i);
    });

    it("supersedes prior generated snapshots without rewriting their amounts", () => {
        const first = generateAssignmentQuoteSnapshot({
            metadata: {},
            rates,
            programKey: "preschool",
            scheduleKey: "full_day",
            locationId: null,
            effectiveDate: "2026-09-15",
            actorUserId: "u1",
            snapshotId: "q1",
            generatedAt: "2026-08-01T00:00:00Z",
        });
        expect(first.ok).toBe(true);
        if (!first.ok) return;
        const frozenAmount = first.snapshot.amount_cents;
        assertQuoteSnapshotImmutable(first.snapshot);

        const second = generateAssignmentQuoteSnapshot({
            metadata: first.metadata,
            rates: [
                {
                    id: "rate-ft-org-v2",
                    program_key: "preschool",
                    schedule_key: "full_day",
                    rate_cents: 140000,
                    billing_period: "monthly",
                    location_id: null,
                },
            ],
            programKey: "preschool",
            scheduleKey: "full_day",
            locationId: null,
            effectiveDate: "2026-09-15",
            actorUserId: "u1",
            snapshotId: "q2",
            generatedAt: "2026-08-02T00:00:00Z",
        });
        expect(second.ok).toBe(true);
        if (!second.ok) return;

        const rows = listAssignmentQuoteSnapshots(second.metadata);
        expect(rows.find((r) => r.id === "q1")?.status).toBe("superseded");
        expect(rows.find((r) => r.id === "q1")?.amount_cents).toBe(frozenAmount);
        expect(activeAssignmentQuoteSnapshot(second.metadata)?.id).toBe("q2");
        expect(activeAssignmentQuoteSnapshot(second.metadata)?.amount_cents).toBe(140000);
    });

    it("lists eligible tuition plans for the picker without fabricating rates", () => {
        const eligible = listEligibleTuitionPlans({
            rates,
            programKey: "preschool",
            scheduleKey: "full_day",
            locationId: "site-1",
        });
        expect(eligible.map((r) => r.id)).toEqual(["rate-ft-site", "rate-ft-org"]);
        expect(
            listEligibleTuitionPlans({
                rates,
                programKey: null,
                scheduleKey: "full_day",
                locationId: null,
            }),
        ).toEqual([]);
    });
});
