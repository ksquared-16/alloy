/**
 * Processing source-document canvas interaction model.
 *
 * Product distinction:
 * - Detection proposes what it sees.
 * - Mapping decides where it belongs.
 * - Normalization converts the value.
 * - Manual region creation recovers what detection missed.
 * - Deselection is interaction state only — never destructive.
 */

import type { QuestionSubject } from "./questionResolutionModel";

/** Minimum drag extent (SVG viewBox units) before a draw is accepted. */
export const MIN_REGION_DRAG_PX = 3;

export type ProcessingCanvasMode = "select" | "draw_region";

export type DrawRegionTarget =
    | { kind: "new_field" }
    | { kind: "map_question"; questionId: string };

export type RegionVisualKind = "auto_detected" | "operator_saved" | "operator_unsaved" | "operator_corrected";

export type PendingManualRegion = {
    page: number;
    bbox: [number, number, number, number];
    evidenceLabel: string;
    displayLabel: string;
    type: string;
    section: string;
    questionSubject: QuestionSubject;
    destinationFieldId?: string;
    sampleValue?: string;
};

export type ProcessingCanvasState = {
    mode: ProcessingCanvasMode;
    drawTarget: DrawRegionTarget | null;
};

export const PINE_REGION = "#00A283";
export const REGION_STROKE_MUTED = "#9bbcb3";
export const REGION_STROKE_OPERATOR = "#7a8f88";

export function initialCanvasState(): ProcessingCanvasState {
    return { mode: "select", drawTarget: null };
}

export function enterDrawRegionMode(target: DrawRegionTarget): ProcessingCanvasState {
    return { mode: "draw_region", drawTarget: target };
}

export function exitDrawRegionMode(state: ProcessingCanvasState): ProcessingCanvasState {
    if (state.mode !== "draw_region") return state;
    return { mode: "select", drawTarget: null };
}

export function shouldAcceptDrawRect(w: number, h: number, min = MIN_REGION_DRAG_PX): boolean {
    return w >= min && h >= min;
}

export function resolveRegionVisualKind(
    mappingOrigin?: "auto_detected" | "operator_created" | "operator_corrected",
    unsaved = false
): RegionVisualKind {
    if (unsaved) return "operator_unsaved";
    if (mappingOrigin === "operator_created") return "operator_saved";
    if (mappingOrigin === "operator_corrected") return "operator_corrected";
    return "auto_detected";
}

export type RegionVisualStyle = {
    fill: string;
    fillOpacity: number;
    stroke: string;
    strokeWidth: number;
    strokeDasharray?: string;
};

/** Visual treatment using existing Processing region language — no new accent colors. */
export function regionVisualStyle(kind: RegionVisualKind, selected: boolean): RegionVisualStyle {
    if (selected) {
        return {
            fill: PINE_REGION,
            fillOpacity: 0.34,
            stroke: PINE_REGION,
            strokeWidth: 2.2,
        };
    }

    switch (kind) {
        case "operator_unsaved":
            return {
                fill: PINE_REGION,
                fillOpacity: 0.08,
                stroke: PINE_REGION,
                strokeWidth: 1.5,
                strokeDasharray: "5 3",
            };
        case "operator_saved":
            return {
                fill: PINE_REGION,
                fillOpacity: 0.1,
                stroke: REGION_STROKE_OPERATOR,
                strokeWidth: 1,
                strokeDasharray: "3 2",
            };
        case "operator_corrected":
            return {
                fill: PINE_REGION,
                fillOpacity: 0.12,
                stroke: REGION_STROKE_MUTED,
                strokeWidth: 1,
            };
        case "auto_detected":
        default:
            return {
                fill: PINE_REGION,
                fillOpacity: 0.12,
                stroke: REGION_STROKE_MUTED,
                strokeWidth: 1,
            };
    }
}

export type EscapeCanvasResult = {
    state: ProcessingCanvasState;
    clearPendingManual: boolean;
    clearSelection: boolean;
};

/** Escape key priority: exit draw mode → cancel unsaved manual region → clear selection. */
export function applyEscapeToCanvas(input: {
    state: ProcessingCanvasState;
    hasPendingManual: boolean;
}): EscapeCanvasResult {
    if (input.state.mode === "draw_region") {
        return {
            state: exitDrawRegionMode(input.state),
            clearPendingManual: false,
            clearSelection: false,
        };
    }
    if (input.hasPendingManual) {
        return {
            state: input.state,
            clearPendingManual: true,
            clearSelection: true,
        };
    }
    return {
        state: input.state,
        clearPendingManual: false,
        clearSelection: true,
    };
}

export function buildSavedManualQuestion(
    pending: PendingManualRegion,
    id: string
): import("./questionResolutionModel").ReviewQuestionInput {
    return {
        id,
        evidenceLabel: pending.evidenceLabel.trim(),
        displayLabel: pending.displayLabel.trim() || pending.evidenceLabel.trim(),
        type: pending.type,
        section: pending.section,
        page: pending.page,
        bbox: pending.bbox,
        evidence: "manual_pdf_mapping",
        mappingOrigin: "operator_created",
        questionSubject: pending.questionSubject,
        destinationFieldId: pending.destinationFieldId,
        sampleValue: pending.sampleValue,
    };
}

export function isCanvasInteractionLocked(canvasMode: ProcessingCanvasMode): boolean {
    return canvasMode === "draw_region";
}

/** Resize and pan are not canvas modes — viewport zoom/scroll handles navigation separately. */
export const CANVAS_MODE_LIMITATIONS = {
    resize_region: false,
    pan: false,
    pdf_text_extraction_in_region: false,
} as const;
