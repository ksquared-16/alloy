/**
 * Surface Composer — platform composition engine.
 *
 * One interaction model for every configurable runtime surface:
 *
 *   click surface → open library → place item → select item → inspector → publish → runtime
 *
 * Queue Row established this model (frozen). Focus Panel and future surfaces consume
 * this module. Individual surfaces contribute only a Surface Definition (sections,
 * supported components, capabilities, default layout, placement rules).
 *
 * The composer owns: selection, placement, library, inspector, publish, preview,
 * editing state, and runtime-shaped editing. Surfaces own presentation + persistence shape.
 */

export {
    SURFACE_FIELD_SECTION_LABELS,
    SURFACE_FIELD_SECTION_HELP,
    SURFACE_FIELD_PLACEMENT_HELP,
    SURFACE_FIELD_PLACEMENT_LABELS,
    SURFACE_FIELD_ROW_FOCUS_HELP,
    SURFACE_FIELD_INSPECTOR_ATTRS,
    type SurfaceFieldSectionKey,
    type SurfaceFieldPlacementMode,
} from "@/lib/adminV2/settings/surfaces/surfaceFieldComposer";

export {
    SURFACE_COMPOSER_MAX_FIELDS_PER_LINE,
    resolveSurfaceComposerDefaultAppendPlacement,
    surfaceComposerInlineFromPlacementMode,
    surfaceComposerPlacementModeFromInline,
    type SurfaceComposerPlacementOverride,
    type SurfaceComposerPlacedItemRef,
} from "@/lib/adminV2/settings/surfaces/surfaceComposerPlacementModel";

export {
    SURFACE_HEADER_SUMMARY_METADATA_KEY,
    SURFACE_HEADER_RENDERER_KEYS,
    SURFACE_HEADER_RENDERER_LABELS,
    defaultSurfaceHeaderSummaryConfig,
    readSurfaceHeaderSummaryConfig,
    withSurfaceHeaderSummaryMetadata,
    moveSurfaceHeaderRenderer,
    removeSurfaceHeaderRenderer,
    addSurfaceHeaderRenderer,
    updateSurfaceHeaderRenderer,
    type SurfaceHeaderRendererKey,
    type SurfaceHeaderRendererPlacement,
    type SurfaceHeaderSummaryConfig,
    type SurfaceHeaderSummarySegment,
    type SurfaceHeaderVisibilityMode,
} from "@/lib/adminV2/settings/surfaces/surfaceHeaderSummaryModel";

export {
    filterSurfaceComposerLibrary,
    groupSurfaceComposerLibrary,
    type SurfaceComposerLibraryCategory,
} from "@/lib/adminV2/settings/surfaces/surfaceComposerLibraryModel";

/** Shown on the canvas when nothing is selected. */
export const SURFACE_COMPOSER_EMPTY_HINT =
    "Click the surface to add or edit content.";

/** Data attribute marking a surface composer canvas region. */
export const SURFACE_COMPOSER_CANVAS_ATTR = "data-surface-composer-canvas" as const;

/** Data attribute marking the contextual inspector panel. */
export const SURFACE_COMPOSER_INSPECTOR_ATTR = "data-surface-composer-inspector" as const;

/** Data attribute marking the item library dialog. */
export const SURFACE_COMPOSER_LIBRARY_ATTR = "data-surface-composer-library" as const;
