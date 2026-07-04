/**
 * Commercial Execution — Evaluation utilities (pure).
 *
 * Effective-dating, rounding, and deterministic key derivation. No I/O, no clock,
 * no randomness — evaluation must be reproducible.
 *
 * Doctrine: docs/platform/core/commercial-execution-platform.md §3, §9.
 */

import type { EffectiveWindow } from "@/lib/commercial/execution/commercialExport";
import type { CommercialContext, Money, RoundingRule } from "@/lib/commercial/execution/executionTypes";

/** Is `asOf` (YYYY-MM-DD) within [start, end]? null start = from day one; null end = open. */
export function isEffective(window: EffectiveWindow, asOf: string): boolean {
    if (window.start && asOf < window.start) return false;
    if (window.end && asOf > window.end) return false;
    return true;
}

/** Round a (possibly fractional) cents amount per the platform rounding rule. Integers pass through. */
export function roundCents(amountCents: number, rule: RoundingRule): number {
    if (Number.isInteger(amountCents)) return amountCents;
    switch (rule) {
        case "floor":
            return Math.floor(amountCents);
        case "ceil":
            return Math.ceil(amountCents);
        case "half_even":
        case "bankers": {
            const floor = Math.floor(amountCents);
            const diff = amountCents - floor;
            if (diff < 0.5) return floor;
            if (diff > 0.5) return floor + 1;
            return floor % 2 === 0 ? floor : floor + 1; // exactly .5 → nearest even
        }
        case "half_up":
        default:
            return Math.round(amountCents);
    }
}

/** Build a Money value, rounded once through the platform rule. */
export function money(amountCents: number, currency: string, rule: RoundingRule): Money {
    return { amountCents: roundCents(amountCents, rule), currency };
}

/** Deterministic djb2 hash of a string → hex. */
export function djb2(s: string): string {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(16);
}

/** A stable, canonical resolution key over (context, config version). */
export function resolutionKeyFor(context: CommercialContext, configVersion: string): string {
    const c = context;
    const canonical = [
        `v:${configVersion}`,
        `mode:${c.mode}`,
        `subj:${c.subject.type}:${c.subject.id ?? ""}`,
        `members:${(c.subject.members ?? []).join(",")}`,
        `prog:${c.scope.programKey}`,
        `off:${c.scope.offeringId ?? ""}`,
        `var:${c.scope.variantId ?? ""}`,
        `loc:${c.scope.locationId ?? ""}`,
        `cad:${c.commitment?.cadenceKey ?? ""}`,
        `payer:${c.commitment?.payerIntent ?? ""}`,
        `asOf:${c.asOf}`,
        `period:${c.period?.start ?? ""}~${c.period?.end ?? ""}`,
    ].join("|");
    return djb2(canonical);
}
