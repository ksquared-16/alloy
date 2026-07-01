import type {
    OpportunityAttentionReasonCode,
    OpportunityAttentionResult,
} from "@/lib/opportunities/opportunityAttentionResolver";

export type AttentionResolverDiffCode =
    | "entered_attention"
    | "cleared_attention"
    | "reason_added"
    | "reason_removed"
    | "severity_changed"
    | "sla_tier_changed"
    | "priority_score_changed";

export type AttentionResolverDiffEntry = {
    code: AttentionResolverDiffCode;
    reason_code?: OpportunityAttentionReasonCode;
    detail?: Record<string, unknown>;
};

/**
 * Pure comparison for future events / auditing (GATE 3 stub path).
 * Caller supplies previous resolver output (or null on first observation).
 */
export function diffAttentionResolverResults(
    previous: OpportunityAttentionResult | null,
    next: OpportunityAttentionResult
): AttentionResolverDiffEntry[] {
    const out: AttentionResolverDiffEntry[] = [];
    const prevNeeds = previous?.needs_attention ?? false;
    const nextNeeds = next.needs_attention;

    if (!prevNeeds && nextNeeds) {
        out.push({ code: "entered_attention" });
    }
    if (prevNeeds && !nextNeeds) {
        out.push({ code: "cleared_attention" });
    }

    const prevCodes = new Set((previous?.reasons ?? []).map((r) => r.code));
    const nextCodes = new Set(next.reasons.map((r) => r.code));
    for (const c of nextCodes) {
        if (!prevCodes.has(c)) out.push({ code: "reason_added", reason_code: c });
    }
    for (const c of prevCodes) {
        if (!nextCodes.has(c)) out.push({ code: "reason_removed", reason_code: c });
    }

    const prevSev = new Map((previous?.reasons ?? []).map((r) => [r.code, r.severity] as const));
    for (const r of next.reasons) {
        const ps = prevSev.get(r.code);
        if (ps != null && ps !== r.severity) {
            out.push({
                code: "severity_changed",
                reason_code: r.code,
                detail: { from: ps, to: r.severity },
            });
        }
    }

    const prevSla = new Map((previous?.reasons ?? []).map((r) => [r.code, r.sla_tier] as const));
    for (const r of next.reasons) {
        const pt = prevSla.get(r.code);
        if (pt != null && pt !== r.sla_tier) {
            out.push({
                code: "sla_tier_changed",
                reason_code: r.code,
                detail: { from: pt, to: r.sla_tier },
            });
        }
    }

    const pp = previous?.priority_score;
    const np = next.priority_score;
    if (pp !== undefined && pp !== np) {
        out.push({ code: "priority_score_changed", detail: { from: pp, to: np } });
    }

    return out;
}
