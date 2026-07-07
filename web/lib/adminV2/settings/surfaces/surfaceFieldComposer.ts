/**
 * Shared surface field composer interaction model.
 *
 * Queue Row builder uses this today; Focus Panel and other surface builders
 * should reuse the same section / placement vocabulary and inspector copy.
 *
 * Flow: click surface → open library → place item → select item → inspector edits.
 */

/** Anatomy section keys persisted as `builderSlot` on queue row columns. */
export type SurfaceFieldSectionKey = "identity" | "groupCount" | "attention" | "status" | "work";

export const SURFACE_FIELD_SECTION_LABELS: Record<SurfaceFieldSectionKey, string> = {
    identity: "Primary",
    groupCount: "Secondary",
    attention: "Supporting",
    status: "Right",
    work: "Bottom",
};

export const SURFACE_FIELD_SECTION_HELP =
    "Section chooses where the field appears on the surface.";

export const SURFACE_FIELD_PLACEMENT_HELP =
    "Section chooses where the field appears. Placement chooses whether it sits beside nearby fields or starts a new line.";

export const SURFACE_FIELD_ROW_FOCUS_HELP =
    "Row focus only prioritizes library suggestions. It does not control layout.";

export const SURFACE_FIELD_INSPECTOR_ATTRS = {
    section: "data-inspector-section",
    placement: "data-inspector-placement",
    fieldList: "data-inspector-field-list",
    fieldRow: "data-inspector-field-row",
    canvasAddField: "data-canvas-add-field",
    canvasField: "data-canvas-field",
    canvasFieldSelected: "data-canvas-field-selected",
} as const;

export type SurfaceFieldPlacementMode = "same-line" | "new-line-below";

export const SURFACE_FIELD_PLACEMENT_LABELS: Record<SurfaceFieldPlacementMode, string> = {
    "same-line": "Same line",
    "new-line-below": "New line below",
};
