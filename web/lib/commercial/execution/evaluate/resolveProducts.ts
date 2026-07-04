/**
 * Commercial Execution — commercial product resolution (pure).
 *
 * Selects the Commercial Products (fee / addon / deposit) applicable to a context:
 * org-wide or program-matched, location-null or location-matched, active, and
 * effective at `asOf`. No pricing math beyond reading the configured amount; no
 * policy; no funding.
 *
 * Doctrine: docs/platform/core/commercial-execution-platform.md §5.
 */

import type { CommercialExport, CommercialProductDef } from "@/lib/commercial/execution/commercialExport";
import { isEffective } from "@/lib/commercial/execution/evaluate/evalUtils";

export function resolveProducts(
    exp: CommercialExport,
    args: { programKey: string; locationId: string | null; asOf: string },
): CommercialProductDef[] {
    return exp.products.filter((p) => {
        if (!p.isActive) return false;
        if (!isEffective(p.effective, args.asOf)) return false;
        // Program scope: org-wide (empty) or matches the context program.
        if (p.scope.programKey && p.scope.programKey !== args.programKey) return false;
        // Location scope: org-wide (null) or matches the context location.
        if (p.scope.locationId && p.scope.locationId !== args.locationId) return false;
        return true;
    });
}
