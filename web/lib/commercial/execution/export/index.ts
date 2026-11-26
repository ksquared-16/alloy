/**
 * Commercial Execution — Export layer public surface.
 *
 * The read-only projection of frozen Commercial V1 into the canonical
 * CommercialExport contract. Evaluation (Phase 4) consumes `composeCommercialExport`.
 *
 * Doctrine: docs/platform/core/commercial-execution-platform.md §2.
 */

export {
    readPrograms,
    readOfferings,
    readVariants,
    readPricing,
    readProducts,
    readCadences,
    readRevenueCategories,
    readGlAccountIds,
} from "@/lib/commercial/execution/export/readCommercialConfig";
export { validateCommercialExport } from "@/lib/commercial/execution/export/validateCommercialExport";
export {
    composeCommercialExport,
    type ComposedCommercialExport,
} from "@/lib/commercial/execution/export/composeCommercialExport";
export type {
    ExportReadContext,
    ExportValidation,
    ExportValidationIssue,
    ExportIssueSeverity,
} from "@/lib/commercial/execution/export/readerTypes";
