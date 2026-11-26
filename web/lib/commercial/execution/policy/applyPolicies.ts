/**
 * Commercial Execution — policy application (pure).
 *
 * Turns resolved (winning) policies into PolicyAdjustments on resolution lines:
 * gross → net. Policies MODIFY the resolution; they never create a charge. Two
 * shapes:
 *   - per-line (discount, waiver): applyLinePolicies()
 *   - relational (sibling_discount): applySiblingDiscountToSet(), across a group
 *
 * proration / eligibility need runtime inputs (day counts / subject data) not
 * present at this stage; they are RECORDED as considered-but-not-applied so the
 * explanation is honest, and are wired for a later slice. approval is a non-
 * mutating signal recorded for the consumer's review gate.
 *
 * Doctrine: docs/platform/core/commercial-execution-platform.md §7.
 */

import type { CommercialExport } from "@/lib/commercial/execution/commercialExport";
import type { ProvenanceRef } from "@/lib/commercial/execution/explanation";
import type { CommercialResolution, PolicyAdjustment, Precision, ResolvedCommercialLine } from "@/lib/commercial/execution/executionTypes";
import { money } from "@/lib/commercial/execution/evaluate/evalUtils";
import { resolvePolicy, type PolicyScopeContext } from "@/lib/commercial/execution/policy/resolvePolicy";
import { appliesToKind, readAppliesTo, readDiscount, readSiblingDiscount } from "@/lib/commercial/execution/policy/policyTypes";

export type PolicyConsidered = { ref: ProvenanceRef; applied: boolean; reason?: string };

/** Positive cents to subtract for a discount over a base amount. */
export function computeDiscountCents(basis: "percentage" | "amount", value: number, baseCents: number): number {
    const raw = basis === "percentage" ? (baseCents * value) / 100 : value;
    return Math.min(Math.max(0, Math.round(raw)), baseCents); // never below zero
}

/** Recompute a line's net from gross + adjustments (clamped ≥ 0), platform-rounded. */
export function recomputeNet(line: ResolvedCommercialLine, precision: Precision): void {
    const sum = line.adjustments.reduce((acc, a) => acc + a.amountCents, 0);
    line.net = money(Math.max(0, line.gross.amountCents + sum), precision.currency, precision.roundingRule);
}

function policyRef(id: string, label?: string): ProvenanceRef {
    return { entity: "commercial_policies", id, label };
}

/**
 * Apply per-line policies (discount, waiver) to one line and mutate it. Also
 * records proration / eligibility / approval as considered signals. Returns the
 * considered entries for the resolution's explanation graph.
 */
export function applyLinePolicies(
    line: ResolvedCommercialLine,
    exp: CommercialExport,
    ctx: PolicyScopeContext,
    asOf: string,
    precision: Precision,
): PolicyConsidered[] {
    const considered: PolicyConsidered[] = [];
    if (line.status !== "resolved") return considered; // never price an unresolved/not_offered line

    // Waiver wins over discount (waive to zero).
    const waiver = resolvePolicy(exp, "waiver", ctx, asOf);
    if (waiver && appliesToKind(readAppliesTo(waiver.params), line.kind)) {
        line.adjustments.push({
            kind: "waiver",
            amountCents: -line.gross.amountCents,
            source: { entity: "commercial_policies", id: waiver.id },
            label: "Waived",
        });
        recomputeNet(line, precision);
        considered.push({ ref: policyRef(waiver.id, "waiver"), applied: true });
        return considered; // waived — no further reductions
    }

    const discountPolicy = resolvePolicy(exp, "discount", ctx, asOf);
    if (discountPolicy) {
        const d = readDiscount(discountPolicy.params);
        if (d && appliesToKind(d.applies_to, line.kind)) {
            const cents = computeDiscountCents(d.basis, d.value, line.gross.amountCents);
            if (cents > 0) {
                line.adjustments.push({
                    kind: "discount",
                    amountCents: -cents,
                    source: { entity: "commercial_policies", id: discountPolicy.id },
                    label: d.basis === "percentage" ? `${d.value}% discount` : `discount`,
                });
                recomputeNet(line, precision);
            }
            considered.push({ ref: policyRef(discountPolicy.id, "discount"), applied: cents > 0 });
        }
    }

    // Recorded-but-not-applied (need runtime inputs / are consumer signals).
    const proration = resolvePolicy(exp, "proration", ctx, asOf);
    if (proration && line.kind === "tuition") {
        considered.push({ ref: policyRef(proration.id, "proration"), applied: false, reason: "needs_period_day_counts" });
    }
    const eligibility = resolvePolicy(exp, "eligibility", ctx, asOf);
    if (eligibility) considered.push({ ref: policyRef(eligibility.id, "eligibility"), applied: false, reason: "needs_subject_data" });
    const approval = resolvePolicy(exp, "approval", ctx, asOf);
    if (approval && approval.params.required === true) {
        considered.push({ ref: policyRef(approval.id, "approval"), applied: true, reason: "review_signal_for_consumer" });
    }

    return considered;
}

/**
 * Apply a relational sibling discount across a group's resolutions (mutates the
 * affected tuition lines). Rank order is the input order of the resolutions.
 * Returns the considered entry (or null if no sibling policy applied).
 */
export function applySiblingDiscountToSet(
    resolutions: CommercialResolution[],
    exp: CommercialExport,
    asOf: string,
    precision: Precision,
): { considered: PolicyConsidered | null } {
    if (resolutions.length === 0) return { considered: null };

    // Resolve the sibling policy against the first resolution's scope (group shares program).
    const first = resolutions[0];
    const ctx: PolicyScopeContext = {
        locationId: first.context.scope.locationId ?? null,
        programKey: first.context.scope.programKey,
        offeringId: first.context.scope.offeringId ?? null,
        variantId: first.context.scope.variantId ?? null,
    };
    const policy = resolvePolicy(exp, "sibling_discount", ctx, asOf);
    if (!policy) return { considered: null };
    const sd = readSiblingDiscount(policy.params);
    if (!sd) return { considered: { ref: policyRef(policy.id, "sibling_discount"), applied: false, reason: "invalid_value" } };

    if (resolutions.length < sd.min_siblings) {
        return { considered: { ref: policyRef(policy.id, "sibling_discount"), applied: false, reason: "below_min_siblings" } };
    }

    let applied = false;
    resolutions.forEach((res, idx) => {
        if (sd.applies_to_rank === "subsequent" && idx === 0) return; // first child pays full
        const tuition = res.lines.find((l) => l.kind === "tuition" && l.status === "resolved");
        if (!tuition || !appliesToKind(sd.applies_to, "tuition")) return;
        const cents = computeDiscountCents(sd.basis, sd.value, tuition.gross.amountCents);
        if (cents <= 0) return;
        tuition.adjustments.push({
            kind: "sibling_discount",
            amountCents: -cents,
            source: { entity: "commercial_policies", id: policy.id },
            label: sd.basis === "percentage" ? `${sd.value}% sibling discount` : "sibling discount",
        });
        recomputeNet(tuition, precision);
        applied = true;
    });

    return { considered: { ref: policyRef(policy.id, "sibling_discount"), applied } };
}
