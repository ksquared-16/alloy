/** Child activity preview — reuses person resolver (same VM field paths). */
export {
    resolvePersonActivityPreview as resolveChildActivityPreview,
    type PersonActivityPreviewEntry as ChildActivityPreviewEntry,
} from "@/lib/layout/runtime/resolvePersonActivityPreview";

/** Child last-touch summary — reuses person resolver (same VM field paths). */
export {
    resolvePersonSummaryLastTouch as resolveChildSummaryLastTouch,
    type PersonSummaryLastTouchResolution as ChildSummaryLastTouchResolution,
} from "@/lib/layout/runtime/resolvePersonSummaryLastTouch";
