/**
 * Commercial Execution — accounting resolution (pure).
 *
 * Resolves a revenue-category id into its GL account and a recognition treatment.
 * Per Phase-4 approval: a line may resolve with revenueCategoryId / glAccountId
 * null — this is surfaced as a structured WARNING, never a blocking error, and no
 * default revenue category is invented.
 *
 * Doctrine: docs/platform/core/commercial-execution-platform.md §7 (Accounting).
 */

import type { CommercialExport } from "@/lib/commercial/execution/commercialExport";
import type { ProvenanceRef } from "@/lib/commercial/execution/explanation";
import type {
    CommercialLineKind,
    LineAccounting,
    RecognitionTreatment,
    ResolutionWarning,
} from "@/lib/commercial/execution/executionTypes";

/** Revenue recognition hint, derived from the line kind + product behavior. */
export function recognitionFor(kind: CommercialLineKind, behavior: Record<string, unknown>): RecognitionTreatment {
    switch (kind) {
        case "deposit":
            return "liability";
        case "tuition":
            return "deferred"; // earned over the covered service period
        case "addon":
            return behavior.package != null ? "deferred" : "immediate";
        default:
            return "immediate"; // fee, proration, credit, discount, one-time
    }
}

export type AccountingResolution = {
    accounting: LineAccounting;
    used: ProvenanceRef[];
    warnings: ResolutionWarning[];
};

/**
 * Resolve accounting for one line. `revenueCategoryId` null (common for tuition
 * until Accounting V2 UI wiring) → glAccountId null + a warning. A mapped-but-
 * unmapped-to-GL category → glAccountId null + a distinct warning.
 */
export function resolveAccounting(
    revenueCategoryId: string | null,
    kind: CommercialLineKind,
    behavior: Record<string, unknown>,
    exp: CommercialExport,
    lineKey: string,
): AccountingResolution {
    const recognition = recognitionFor(kind, behavior);
    const warnings: ResolutionWarning[] = [];
    const used: ProvenanceRef[] = [];

    if (!revenueCategoryId) {
        warnings.push({
            code: "accounting_unmapped_revenue_category",
            message: `Line "${lineKey}" (${kind}) has no revenue category — accounting destination unresolved.`,
            lineKey,
        });
        return { accounting: { revenueCategoryId: null, glAccountId: null, recognition }, used, warnings };
    }

    const category = exp.revenueCategories.find((rc) => rc.id === revenueCategoryId);
    used.push({ entity: "commercial_revenue_categories", id: revenueCategoryId, label: category?.label });

    const glAccountId = category?.glAccountId ?? null;
    if (!glAccountId) {
        warnings.push({
            code: "accounting_unmapped_gl_account",
            message: `Revenue category "${category?.label ?? revenueCategoryId}" is not mapped to a GL account.`,
            lineKey,
        });
    }

    return { accounting: { revenueCategoryId, glAccountId, recognition }, used, warnings };
}
