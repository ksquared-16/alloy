/**
 * @deprecated Import from `@/lib/adminV2/settings/surfaces/surfaceComposer` or
 * `surfaceHeaderSummaryModel` — Focus Panel-specific naming is retired in favor of
 * the generic Header Surface model.
 */

export {
    SURFACE_HEADER_SUMMARY_METADATA_KEY as FOCUS_PANEL_IDENTITY_SUMMARY_METADATA_KEY,
    SURFACE_HEADER_RENDERER_KEYS as FOCUS_PANEL_IDENTITY_RENDERER_KEYS,
    SURFACE_HEADER_RENDERER_LABELS as FOCUS_PANEL_IDENTITY_RENDERER_LABELS,
    defaultSurfaceHeaderSummaryConfig as defaultFocusPanelIdentitySummaryConfig,
    readSurfaceHeaderSummaryConfig as readFocusPanelIdentitySummaryConfig,
    withSurfaceHeaderSummaryMetadata as withFocusPanelIdentitySummaryMetadata,
    moveSurfaceHeaderRenderer as moveIdentityRenderer,
    removeSurfaceHeaderRenderer as removeIdentityRenderer,
    addSurfaceHeaderRenderer as addIdentityRenderer,
    updateSurfaceHeaderRenderer as updateIdentityRenderer,
    type SurfaceHeaderRendererKey as FocusPanelIdentityRendererKey,
    type SurfaceHeaderRendererPlacement as FocusPanelIdentityRendererPlacement,
    type SurfaceHeaderSummaryConfig as FocusPanelIdentitySummaryConfig,
    type SurfaceHeaderSummarySegment as FocusPanelIdentitySummarySegment,
    type SurfaceHeaderVisibilityMode as FocusPanelIdentityVisibilityMode,
} from "@/lib/adminV2/settings/surfaces/surfaceHeaderSummaryModel";
