/**
 * Commercial Execution — Simulator preview surface (Phase 8).
 * The read-only preview path that makes the Simulator the first consumer.
 */

export {
    buildCommercialExecutionPreview,
    type CommercialExecutionPreview,
    type ExecutionPreviewValidation,
    type PreviewOptions,
} from "@/lib/commercial/execution/preview/buildPreview";
export {
    parseCommercialContext,
    parseHorizon,
    parseFundingPlan,
    type ParseResult,
} from "@/lib/commercial/execution/preview/parsePreviewRequest";
