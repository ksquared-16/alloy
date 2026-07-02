/**
 * Presentation Runtime V2 — runtime labels (docs/platform/experience/presentation-runtime-v2.md).
 *
 * Every presentation component owns exactly one label and stamps it as `data-runtime-label`.
 * Single ownership: a label appearing on two components is a doctrine violation, and the
 * acceptance test for "where is X rendered" greps for these constants.
 */

export const PRESENTATION_RUNTIME_LABELS = {
    workspaceSurface: "WS.SURFACE",
    workspaceHeader: "WS.HEADER",
    workspaceHeaderCalculations: "WS.HEADER_CALCULATIONS",
    processGrid: "WS.PROCESS_GRID",
    processTile: "WS.PROCESS_TILE",
    processTileWorkViews: "WS.PROCESS_TILE_WORK_VIEWS",
    workUnitSurface: "WU.SURFACE",
    workUnitHeader: "WU.HEADER",
    workUnitAnswers: "WU.ANSWERS",
    workViewPillStrip: "WU.WORK_VIEWS",
    queueRegion: "WU.QUEUE",
    queueRow: "WU.QUEUE_ROW",
    focusPanelSurface: "FP.SURFACE",
    rightRailSurface: "RR.SURFACE",
} as const;

export type PresentationRuntimeLabel =
    (typeof PRESENTATION_RUNTIME_LABELS)[keyof typeof PRESENTATION_RUNTIME_LABELS];

/** Spread onto the component's root element: `<div {...runtimeLabelProps(label)}>`. */
export function runtimeLabelProps(label: PresentationRuntimeLabel): {
    "data-runtime-label": PresentationRuntimeLabel;
} {
    return { "data-runtime-label": label };
}
