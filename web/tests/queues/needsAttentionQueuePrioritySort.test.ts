import { describe, expect, it } from "vitest";

import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import {
    compareNeedsAttentionOpportunitiesForQueueList,
    sortNeedsAttentionFilteredRows,
} from "@/lib/queues/needsAttentionQueuePrioritySort";

function reason(
    code: "follow_up_date_passed" | "high_value_stale" | "waiting_on_documents",
    sla_tier: "ok" | "approaching" | "breached",
    severity: "critical" | "high" | "medium" | "low" = "medium",
) {
    return {
        code,
        label: code,
        severity,
        sla_tier,
        sla_clock_confidence: "high" as const,
    };
}

function attention(partial: Partial<OpportunityAttentionResult> & Pick<OpportunityAttentionResult, "priority_score">): OpportunityAttentionResult {
    const primary = partial.primary_reason ?? reason("follow_up_date_passed", "ok");
    return {
        needs_attention: true,
        reasons: partial.reasons ?? [primary],
        primary_reason: primary,
        waiting: partial.waiting ?? { bucket: "none", since_iso: null, active: false },
        priority_score: partial.priority_score,
        priority_breakdown: partial.priority_breakdown ?? [],
        auxiliary: partial.auxiliary ?? { activity_stale: null },
        resolver_version: 2,
        computed_at_iso: "2026-05-13T12:00:00.000Z",
    };
}

describe("needsAttentionQueuePrioritySort", () => {
    it("orders higher priority_score first", () => {
        const hi = attention({ priority_score: 50, primary_reason: reason("follow_up_date_passed", "ok") });
        const lo = attention({ priority_score: 10, primary_reason: reason("high_value_stale", "ok") });
        expect(compareNeedsAttentionOpportunitiesForQueueList(hi, lo, null, null)).toBeLessThan(0);
        expect(compareNeedsAttentionOpportunitiesForQueueList(lo, hi, null, null)).toBeGreaterThan(0);
    });

    it("uses worst SLA among reasons when scores tie", () => {
        const breached = attention({
            priority_score: 5,
            reasons: [reason("follow_up_date_passed", "breached"), reason("high_value_stale", "ok")],
            primary_reason: reason("high_value_stale", "ok"),
        });
        const ok = attention({
            priority_score: 5,
            reasons: [reason("follow_up_date_passed", "ok")],
            primary_reason: reason("follow_up_date_passed", "ok"),
        });
        expect(compareNeedsAttentionOpportunitiesForQueueList(breached, ok, null, null)).toBeLessThan(0);
    });

    it("sortNeedsAttentionFilteredRows tie-breaks with queue sort plan when attention signals match", () => {
        const rows = [
            { id: "a", updated_at: "2026-05-10T00:00:00.000Z", name: "Alice" },
            { id: "b", updated_at: "2026-05-10T00:00:00.000Z", name: "Bob" },
        ];
        const att = attention({ priority_score: 1, primary_reason: reason("follow_up_date_passed", "ok") });
        const map = new Map<string, OpportunityAttentionResult>([
            ["a", att],
            ["b", att],
        ]);
        const asc = sortNeedsAttentionFilteredRows(rows, map, [{ column: "name", ascending: true }]);
        expect(asc.map((r) => r.id)).toEqual(["a", "b"]);
        const desc = sortNeedsAttentionFilteredRows(rows, map, [{ column: "name", ascending: false }]);
        expect(desc.map((r) => r.id)).toEqual(["b", "a"]);
    });
});
