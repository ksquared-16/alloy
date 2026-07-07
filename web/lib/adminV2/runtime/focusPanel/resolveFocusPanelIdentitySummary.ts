/**
 * Focus Panel header summary — thin adapter over the shared Header Surface resolver.
 */

export {
    resolveSurfaceHeaderSummarySegments as resolveFocusPanelIdentitySummarySegments,
    resolveSurfaceHeaderSummaryFromConfig as resolveFocusPanelIdentitySummaryFromConfig,
    formatSurfaceHeaderSummaryLine as formatFocusPanelIdentitySummaryLine,
} from "@/lib/adminV2/runtime/surfaceHeader/resolveSurfaceHeaderSummary";

export type { SurfaceHeaderSummarySegment as FocusPanelIdentitySummarySegment } from "@/lib/adminV2/settings/surfaces/surfaceHeaderSummaryModel";
