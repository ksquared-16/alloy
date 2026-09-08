/**
 * HOW ONE CHARGE'S NET DIVIDES BETWEEN NAMED PEOPLE — decided, not written.
 *
 * The Director's decision governs every line of this file: responsibility resolves to an EXPLICIT
 * party. Nothing here infers a responsible person from account ownership, from being the primary
 * contact, from being a parent or guardian, from the `payer` contact role, or from who paid. If the
 * shares do not account for the whole net, the leftover is recorded as UNASSIGNED — a real row
 * holding real cents that nobody has yet been made responsible for — rather than handed to whoever
 * the platform could most plausibly blame.
 *
 * ── WHY THIS IS NOT THE COMMERCIAL FUNDING ENGINE ──
 *
 * `fundingAttribute.ts` allocates a line's net across payers with a residual to a PRIMARY, and that
 * residual is the whole reason it cannot own this: it presumes someone is always there to absorb
 * what is left, which is exactly the assumption the Director removed. Its *algorithm* is reused in
 * spirit and its vocabulary is quoted — fixed before percentage, clamped, nothing invented — but
 * responsibility's system of record is Thread 6's, and Commercial Execution stays the owner of
 * FUNDING, which this module hands it later.
 *
 * ── THE CENT RULE ──
 *
 * Percentages are floored, and what floors leave behind is dealt with explicitly:
 *   · a `remainder` share exists → it takes everything left, which is what a remainder means;
 *   · the percentages total exactly 100% with no fixed share → the leftover is pure rounding dust
 *     and is handed out one cent at a time in priority order, so a 70/30 of an odd number still
 *     sums exactly and nobody sees a stray unassigned penny;
 *   · otherwise → the leftover is a genuine gap in the arrangement and becomes UNASSIGNED.
 * A cent is never invented and never dropped.
 *
 * Pure. No I/O, no clock, no Supabase.
 */

export type ShareMethod = "percentage" | "fixed" | "remainder";

/** One authored share, already narrowed to the arrangement in force. */
export type ResponsibilityShare = {
    shareId: string;
    responsiblePartyId: string;
    method: ShareMethod;
    /** Basis points for `percentage` — 7000 is 70%. */
    percentBasisPoints: number | null;
    /** Absolute cents for `fixed`. */
    amountCents: number | null;
    priority: number;
};

export type ResolvedAllocation = {
    shareId: string | null;
    responsiblePartyId: string | null;
    isUnassigned: boolean;
    assignedAmountCents: number;
    basis: "percentage" | "fixed" | "remainder" | "unassigned";
    /** The authored figure this came from: basis points, or cents for a fixed share. */
    basisValue: number | null;
    explanation: string;
};

export type SplitRefusal =
    | "no_shares"
    | "percentage_over_100"
    | "fixed_exceeds_net"
    | "over_allocated"
    | "negative_net";

export type SplitDecision =
    | { kind: "allocated"; allocations: ResolvedAllocation[]; unassignedCents: number }
    | { kind: "refused"; reason: SplitRefusal; detail: string };

/** Deterministic order: priority, then share id. Two runs must divide money identically. */
function ordered(shares: readonly ResponsibilityShare[]): ResponsibilityShare[] {
    return [...shares].sort((a, b) => (a.priority !== b.priority ? a.priority - b.priority : a.shareId < b.shareId ? -1 : 1));
}

export function resolveResponsibilitySplit(args: {
    netCents: number;
    shares: readonly ResponsibilityShare[];
}): SplitDecision {
    const net = args.netCents;
    if (net < 0) return { kind: "refused", reason: "negative_net", detail: `net ${net}` };
    const shares = ordered(args.shares);
    if (shares.length === 0) return { kind: "refused", reason: "no_shares", detail: "the arrangement names nobody" };

    const fixed = shares.filter((s) => s.method === "fixed");
    const pct = shares.filter((s) => s.method === "percentage");
    const remainder = shares.find((s) => s.method === "remainder") ?? null;

    const pctTotalBp = pct.reduce((acc, s) => acc + (s.percentBasisPoints ?? 0), 0);
    if (pctTotalBp > 10_000) {
        return { kind: "refused", reason: "percentage_over_100", detail: `${pctTotalBp} basis points` };
    }
    const fixedTotal = fixed.reduce((acc, s) => acc + (s.amountCents ?? 0), 0);
    if (fixedTotal > net) {
        // REFUSED, not clamped. Silently shrinking a fixed share would tell an operator the family
        // is covered when the arrangement they authored cannot be honoured.
        return { kind: "refused", reason: "fixed_exceeds_net", detail: `fixed ${fixedTotal} over net ${net}` };
    }

    // ── ZERO NET IS A LEGITIMATE ANSWER ──────────────────────────────────────────────────────
    // A fully discounted month still has an arrangement; everyone's share of nothing is nothing,
    // and the invariant holds trivially rather than by special-casing it away.
    if (net === 0) {
        return {
            kind: "allocated",
            allocations: shares.map((s) => ({
                shareId: s.shareId,
                responsiblePartyId: s.responsiblePartyId,
                isUnassigned: false,
                assignedAmountCents: 0,
                basis: s.method,
                basisValue: s.method === "percentage" ? s.percentBasisPoints : s.method === "fixed" ? s.amountCents : null,
                explanation: "Nothing is owed for this period.",
            })),
            unassignedCents: 0,
        };
    }

    const allocations: ResolvedAllocation[] = [];
    for (const s of fixed) {
        allocations.push({
            shareId: s.shareId,
            responsiblePartyId: s.responsiblePartyId,
            isUnassigned: false,
            assignedAmountCents: s.amountCents ?? 0,
            basis: "fixed",
            basisValue: s.amountCents,
            explanation: `Fixed share of $${((s.amountCents ?? 0) / 100).toFixed(2)}.`,
        });
    }

    // Percentages are taken on the NET, floored — the same convention Thread 10 uses for a
    // discount, so a percentage means the same thing wherever it is authored.
    const pctFloors = pct.map((s) => Math.floor((net * (s.percentBasisPoints ?? 0)) / 10_000));
    pct.forEach((s, index) => {
        allocations.push({
            shareId: s.shareId,
            responsiblePartyId: s.responsiblePartyId,
            isUnassigned: false,
            assignedAmountCents: pctFloors[index]!,
            basis: "percentage",
            basisValue: s.percentBasisPoints,
            explanation: `${((s.percentBasisPoints ?? 0) / 100).toFixed(2)}% of $${(net / 100).toFixed(2)}.`,
        });
    });

    const claimed = allocations.reduce((acc, a) => acc + a.assignedAmountCents, 0);
    if (claimed > net) {
        return { kind: "refused", reason: "over_allocated", detail: `${claimed} allocated over net ${net}` };
    }
    let leftover = net - claimed;

    // ── WHO GETS WHAT IS LEFT ────────────────────────────────────────────────────────────────
    if (remainder) {
        allocations.push({
            shareId: remainder.shareId,
            responsiblePartyId: remainder.responsiblePartyId,
            isUnassigned: false,
            assignedAmountCents: leftover,
            basis: "remainder",
            basisValue: null,
            explanation: `Everything not covered by the other shares — $${(leftover / 100).toFixed(2)}.`,
        });
        return { kind: "allocated", allocations, unassignedCents: 0 };
    }

    const complete = fixedTotal === 0 && pctTotalBp === 10_000;
    if (complete && leftover > 0) {
        /*
         * PURE ROUNDING DUST. The arrangement covers the whole net, so what flooring left behind is
         * at most one cent per percentage share. Handing it out in priority order keeps the sum
         * exact and keeps an operator from seeing a one-cent "unassigned" line that misrepresents a
         * complete arrangement as an incomplete one.
         */
        const pctAllocations = allocations.filter((a) => a.basis === "percentage");
        for (let i = 0; leftover > 0 && i < pctAllocations.length; i += 1) {
            pctAllocations[i]!.assignedAmountCents += 1;
            pctAllocations[i]!.explanation += " Carries one cent of rounding.";
            leftover -= 1;
        }
        return { kind: "allocated", allocations, unassignedCents: 0 };
    }

    if (leftover > 0) {
        /*
         * A REAL GAP, RECORDED AS ONE. Nobody has been made responsible for these cents, and the
         * platform says exactly that rather than naming a person it has no arrangement for. This is
         * the Director's decision in its most literal form.
         */
        allocations.push({
            shareId: null,
            responsiblePartyId: null,
            isUnassigned: true,
            assignedAmountCents: leftover,
            basis: "unassigned",
            basisValue: null,
            explanation:
                `$${(leftover / 100).toFixed(2)} is not covered by any responsibility share. `
                + "No one has been made responsible for it.",
        });
        return { kind: "allocated", allocations, unassignedCents: leftover };
    }

    return { kind: "allocated", allocations, unassignedCents: 0 };
}

/** The identity of "this arrangement's decision about this charge". */
export function responsibilityAllocationKey(chargeId: string, arrangementId: string, shareId: string | null): string {
    // The unassigned row is keyed by the arrangement, not a share, because it belongs to the gap in
    // the arrangement rather than to any one authored line.
    return `fra:${chargeId}:${arrangementId}:${shareId ?? "unassigned"}`;
}
