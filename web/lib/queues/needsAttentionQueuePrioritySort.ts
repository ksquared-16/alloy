/**
 * Deterministic list ordering for opportunity `needs_attention` work-unit queues (no AI).
 * Applied after resolver membership filter; tie-breakers preserve queue-definition sort order.
 */

import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import type { OpportunityAttentionSeverity } from "@/lib/opportunities/opportunityAttentionConfig";
import type { AttentionSlaTier } from "@/lib/opportunities/attentionSla";
import { worstTierAmongReasons } from "@/lib/opportunities/operationalAttentionExplain";

export type OpportunitySortPlan = { column: string; ascending: boolean };

/** Minimal row shape for queue list ordering (matches `QueueService` opportunity preview rows). */
export type NeedsAttentionSortableOpportunityRow = { id: string; updated_at?: string | null };

const SLA_VAL: Record<AttentionSlaTier, number> = { ok: 0, approaching: 1, breached: 2 };

function severityRank(s: OpportunityAttentionSeverity | undefined): number {
    if (!s) return 0;
    const m: Record<OpportunityAttentionSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    return m[s] ?? 0;
}

/** Lexicographic string compare for queue plan columns (parity with QueueService.sortOpportunityRowsByPlan). */
export function compareOpportunityRowSortPlan(
    a: NeedsAttentionSortableOpportunityRow,
    b: NeedsAttentionSortableOpportunityRow,
    sort: OpportunitySortPlan[],
): number {
    const plans = sort.length ? sort : [{ column: "updated_at", ascending: true }];
    for (const p of plans) {
        const av = (a as Record<string, unknown>)[p.column];
        const bv = (b as Record<string, unknown>)[p.column];
        const as = av == null ? "" : String(av);
        const bs = bv == null ? "" : String(bv);
        if (as < bs) return p.ascending ? -1 : 1;
        if (as > bs) return p.ascending ? 1 : -1;
    }
    return 0;
}

/**
 * Higher operational urgency sorts first (descending priority_score, then SLA / severity / recency).
 */
export function compareNeedsAttentionOpportunitiesForQueueList(
    a: OpportunityAttentionResult,
    b: OpportunityAttentionResult,
    aUpdatedAt: string | null,
    bUpdatedAt: string | null,
): number {
    const scoreDelta = b.priority_score - a.priority_score;
    if (scoreDelta !== 0) return scoreDelta;
    const wa = worstTierAmongReasons(a.reasons);
    const wb = worstTierAmongReasons(b.reasons);
    const slaCmp = SLA_VAL[wb] - SLA_VAL[wa];
    if (slaCmp !== 0) return slaCmp;

    const sevCmp = severityRank(b.primary_reason?.severity) - severityRank(a.primary_reason?.severity);
    if (sevCmp !== 0) return sevCmp;

    const pslaA = a.primary_reason?.sla_tier ?? "ok";
    const pslaB = b.primary_reason?.sla_tier ?? "ok";
    const pSlaCmp = SLA_VAL[pslaB] - SLA_VAL[pslaA];
    if (pSlaCmp !== 0) return pSlaCmp;

    const waitA = a.waiting.active ? 1 : 0;
    const waitB = b.waiting.active ? 1 : 0;
    if (waitB !== waitA) return waitB - waitA;

    const ta = aUpdatedAt ? Date.parse(aUpdatedAt) : 0;
    const tb = bUpdatedAt ? Date.parse(bUpdatedAt) : 0;
    return tb - ta;
}

export function sortNeedsAttentionFilteredRows<T extends NeedsAttentionSortableOpportunityRow>(
    rows: T[],
    attentionByRowId: Map<string, OpportunityAttentionResult>,
    sort: OpportunitySortPlan[],
): T[] {
    if (!rows.length) return rows;
    const decorated = rows.map((row) => ({
        row,
        attention: attentionByRowId.get(String(row.id)),
    }));
    decorated.sort((x, y) => {
        if (x.attention && y.attention) {
            const c = compareNeedsAttentionOpportunitiesForQueueList(
                x.attention,
                y.attention,
                (x.row as { updated_at?: string | null }).updated_at ?? null,
                (y.row as { updated_at?: string | null }).updated_at ?? null,
            );
            if (c !== 0) return c;
        }
        return compareOpportunityRowSortPlan(x.row, y.row, sort);
    });
    return decorated.map((d) => d.row);
}
