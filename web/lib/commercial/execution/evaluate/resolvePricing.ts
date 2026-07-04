/**
 * Commercial Execution — tuition pricing resolution (pure).
 *
 * Resolves the matrix cell (variant × cadence × payer × location) from the export.
 * Location override wins over org default; explicit `not_offered` is distinct from
 * "no rate set". Effective-dating is honored at `asOf`. No policy, no rounding here.
 *
 * V1 note: the tuition matrix is keyed by VARIANT (which already encodes quantity),
 * so scheduleBasis is not part of the lookup — the variant is the quantity axis.
 *
 * Doctrine: docs/platform/core/commercial-execution-platform.md §5.
 */

import type { CommercialExport, TuitionRateDef } from "@/lib/commercial/execution/commercialExport";
import type { PayerType, ResolutionReasonCode } from "@/lib/commercial/execution/executionTypes";
import { isEffective } from "@/lib/commercial/execution/evaluate/evalUtils";

export type PricingResolution =
    | { kind: "priced"; rate: TuitionRateDef; scope: "location" | "org_default" }
    | { kind: "not_offered"; rate: TuitionRateDef; scope: "location" | "org_default" }
    | { kind: "unresolved"; reason: ResolutionReasonCode };

/** Latest effective_start wins (null start sorts earliest). */
function mostSpecific(rows: TuitionRateDef[]): TuitionRateDef {
    return [...rows].sort((a, b) => (b.effective.start ?? "").localeCompare(a.effective.start ?? ""))[0];
}

export function resolvePricing(
    exp: CommercialExport,
    args: { variantId: string; cadenceKey: string; payerType: PayerType; locationId: string | null; asOf: string },
): PricingResolution {
    const candidates = exp.tuitionRates.filter(
        (r) =>
            r.variantId === args.variantId &&
            r.cadenceKey === args.cadenceKey &&
            r.payerType === args.payerType &&
            // is_active is folded into readers; not_offered stays visible so we can explain it.
            true,
    );
    if (candidates.length === 0) return { kind: "unresolved", reason: "no_rate_for_scope" };

    const effective = candidates.filter((r) => isEffective(r.effective, args.asOf));
    if (effective.length === 0) return { kind: "unresolved", reason: "no_effective_config" };

    // Location override wins over org default.
    let scope: "location" | "org_default" | null = null;
    let rows: TuitionRateDef[] = [];
    if (args.locationId) {
        const loc = effective.filter((r) => r.locationId === args.locationId);
        if (loc.length > 0) {
            scope = "location";
            rows = loc;
        }
    }
    if (!scope) {
        const org = effective.filter((r) => r.locationId === null);
        if (org.length > 0) {
            scope = "org_default";
            rows = org;
        }
    }
    if (!scope) return { kind: "unresolved", reason: "no_rate_for_scope" };

    const priced = rows.filter((r) => !r.notOffered);
    if (priced.length > 0) return { kind: "priced", rate: mostSpecific(priced), scope };
    return { kind: "not_offered", rate: mostSpecific(rows), scope };
}
