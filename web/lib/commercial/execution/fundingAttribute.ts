/**
 * Commercial Execution — Funding attribution engine (pure).
 *
 * attribute(resolution, plan) DECORATES a Commercial Resolution: it allocates each
 * resolved line's already-computed `net` across payers and records a residual. It
 * NEVER changes `net`, and never creates a charge. Runs after policy, before a
 * consumer materializes. A plan with only `primary` is the single-payer default
 * (residual = full net → primary); additional instructions produce multi-payer
 * splits (percentage / fixed amount / coverage rule).
 *
 * Funding is a standalone stage (not part of evaluate) — mirrors expand()/
 * materialize(). The FundingPlan is a consumer/Processing INPUT; Commercial
 * Execution never stores payer data (subsidy authorization is Processing-owned).
 *
 * Invariant per line: Σ allocations + residual === net (residual absorbs rounding).
 *
 * Doctrine: docs/platform/core/commercial-execution-platform.md §7 (Funding stage).
 */

import type { ProvenanceRef } from "@/lib/commercial/execution/explanation";
import type { CommercialResolution, ResolvedCommercialLine, RoundingRule } from "@/lib/commercial/execution/executionTypes";
import type { FundingAllocation, FundingAttribution, FundingPlan, FundingTarget, PayerRef } from "@/lib/commercial/execution/funding";
import { roundCents } from "@/lib/commercial/execution/evaluate/evalUtils";

function targetMatches(target: FundingTarget, kind: string): boolean {
    if (target === "all") return true;
    if (target === "tuition") return kind === "tuition";
    return kind === "fee" || kind === "addon" || kind === "deposit"; // "fees"
}

/** Attribute one resolved line's net across the plan's payers. Pure. */
export function attributeLine(line: ResolvedCommercialLine, plan: FundingPlan, rule: RoundingRule): FundingAttribution {
    const net = line.net.amountCents;
    const allocations: FundingAllocation[] = [];
    let remaining = net;

    for (const inst of plan.allocations ?? []) {
        if (!targetMatches(inst.target ?? "all", line.kind)) continue;
        if (remaining <= 0) break;
        let amount = 0;
        if (inst.basis === "fixed_amount") amount = Math.min(Math.max(0, inst.value ?? 0), remaining);
        else if (inst.basis === "percentage") amount = Math.min(roundCents((net * (inst.value ?? 0)) / 100, rule), remaining);
        else continue; // coverage_rule → needs external rule data (deferred); left to residual
        if (amount <= 0) continue;
        allocations.push({ payer: inst.payer, amountCents: amount, basis: inst.basis, coverage: inst.coverage });
        remaining -= amount;
    }

    // Residual absorbs the remainder (and any rounding) → invariant holds exactly.
    return { allocations, residual: { payer: plan.primary, amountCents: Math.max(0, remaining) } };
}

function payerRef(p: PayerRef): ProvenanceRef {
    return { entity: "funding_payer", id: p.partyId ?? p.source, label: p.label ?? p.source };
}

/**
 * Decorate a resolution with funding attribution. Returns a NEW resolution
 * (pure); non-resolved lines keep `funding: null`.
 */
export function attribute(resolution: CommercialResolution, plan: FundingPlan): CommercialResolution {
    const rule = resolution.precision.roundingRule;
    const lines = resolution.lines.map((line) =>
        line.status === "resolved" ? { ...line, funding: attributeLine(line, plan, rule) } : line,
    );

    const considered: { ref: ProvenanceRef; applied: boolean }[] = [
        { ref: payerRef(plan.primary), applied: true },
        ...(plan.allocations ?? []).map((i) => ({ ref: payerRef(i.payer), applied: true })),
    ];

    return {
        ...resolution,
        lines,
        explanation: { ...resolution.explanation, fundingConsidered: considered },
    };
}
