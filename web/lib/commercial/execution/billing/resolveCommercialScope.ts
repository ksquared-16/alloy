/**
 * Commercial Execution — Billing consumer: agreement scope → Commercial scope (pure).
 *
 * The consumption runtime knows an enrollment in Substrate-A terms: program_key
 * (via placement → location_program_categories.key) + scheduleBasis (via schedule
 * pattern). Commercial tuition is keyed by offering × variant. This resolver maps
 * one to the other DETERMINISTICALLY against the Commercial Export, and returns a
 * typed `unresolved` (never a guess) when the mapping is ambiguous or unconfigured
 * — so Billing surfaces a config gap rather than mispricing.
 *
 * No fallback, no schema change: it uses data the runtime already has.
 *
 * Doctrine: docs/platform/core/commercial-execution-platform.md §2a, §8 (Phase 9).
 */

import type { CommercialExport } from "@/lib/commercial/execution/commercialExport";
import type { PayerType } from "@/lib/commercial/execution/executionTypes";

export type CommercialScopeReason =
    | "no_offering_for_program"
    | "no_offering_match"
    | "ambiguous_offering"
    | "no_variant_for_offering"
    | "no_variant_match"
    | "ambiguous_variant";

export type CommercialScopeResolution =
    | { resolved: true; offeringId: string; variantId: string; cadenceKey: string; payerType: PayerType }
    | { resolved: false; reason: CommercialScopeReason };

/** Interpret a Substrate-A schedule basis into an attendance hint and/or a day quantity. */
function interpretBasis(scheduleBasis: string): { attendanceHint: string | null; quantityDays: number | null } {
    switch (scheduleBasis) {
        case "full_day":
            return { attendanceHint: "full_day", quantityDays: null };
        case "half_day":
            return { attendanceHint: "part_day", quantityDays: null };
        case "drop_in":
            return { attendanceHint: "drop_in", quantityDays: null };
        case "hourly":
            return { attendanceHint: "hourly", quantityDays: null };
        case "three_day":
            return { attendanceHint: null, quantityDays: 3 };
        case "four_day":
            return { attendanceHint: null, quantityDays: 4 };
        case "five_day":
            return { attendanceHint: null, quantityDays: 5 };
        default:
            return { attendanceHint: null, quantityDays: null };
    }
}

export function resolveCommercialScope(
    cfg: CommercialExport,
    args: { programKey: string; scheduleBasis: string; cadenceKey?: string; payerType?: PayerType },
): CommercialScopeResolution {
    const cadenceKey = args.cadenceKey ?? "monthly";
    const payerType = args.payerType ?? "private_pay";
    const { attendanceHint, quantityDays } = interpretBasis(args.scheduleBasis);

    const offerings = cfg.offerings.filter((o) => o.programKey === args.programKey && o.isActive);
    if (offerings.length === 0) return { resolved: false, reason: "no_offering_for_program" };
    const offeringIds = new Set(offerings.map((o) => o.id));

    if (quantityDays != null) {
        // Quantity basis (e.g. three_day): the basis doesn't name an attendance type, so
        // resolve VARIANT-FIRST across the program's offerings — the day-quantity uniquely
        // identifies the offering when exactly one such variant exists.
        const byQty = cfg.variants.filter((v) => offeringIds.has(v.offeringId) && v.isActive && v.quantityType === "days" && v.quantityValue === quantityDays);
        if (byQty.length === 0) return { resolved: false, reason: "no_variant_match" };
        if (byQty.length > 1) return { resolved: false, reason: "ambiguous_variant" };
        return { resolved: true, offeringId: byQty[0].offeringId, variantId: byQty[0].id, cadenceKey, payerType };
    }

    // Attendance basis (full_day / half_day / drop_in / hourly): match the offering by
    // attendance type, then its single active variant.
    if (!attendanceHint) return { resolved: false, reason: "no_offering_match" };
    const byAttendance = offerings.filter((o) => o.attendanceType === attendanceHint);
    if (byAttendance.length === 0) return { resolved: false, reason: "no_offering_match" };
    if (byAttendance.length > 1) return { resolved: false, reason: "ambiguous_offering" };
    const offering = byAttendance[0];

    const variants = cfg.variants.filter((v) => v.offeringId === offering.id && v.isActive);
    if (variants.length === 0) return { resolved: false, reason: "no_variant_for_offering" };
    if (variants.length > 1) return { resolved: false, reason: "ambiguous_variant" };
    return { resolved: true, offeringId: offering.id, variantId: variants[0].id, cadenceKey, payerType };
}
