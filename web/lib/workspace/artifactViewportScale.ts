/**
 * Artifact viewport scale helpers — fit-page / fit-width / manual zoom math.
 * Presentation-only; shared by ProcessingSourceDocumentViewport and tests.
 */

export type ArtifactScaleMode = "fit-page" | "fit-width" | "manual";

export const ARTIFACT_ZOOM_MIN = 0.5;
export const ARTIFACT_ZOOM_MAX = 2;
export const ARTIFACT_ZOOM_STEP = 0.25;
export const ARTIFACT_VIEWPORT_PAD = 16;

/** Page card chrome above/below SVG (header + padding). */
export const ARTIFACT_PAGE_CARD_CHROME = 52;
export const ARTIFACT_PAGE_STACK_GAP = 12;

export type ArtifactPageLayout = { width: number; height: number };

export function clampArtifactScale(value: number): number {
    return Math.min(ARTIFACT_ZOOM_MAX, Math.max(ARTIFACT_ZOOM_MIN, value));
}

export function estimateArtifactPageHeight(containerW: number, page: ArtifactPageLayout): number {
    if (page.width <= 0 || page.height <= 0 || containerW <= 0) return 0;
    return ARTIFACT_PAGE_CARD_CHROME + containerW * (page.height / page.width);
}

export function estimateArtifactStackHeight(containerW: number, pages: ArtifactPageLayout[]): number {
    if (pages.length === 0 || containerW <= 0) return 0;
    return pages.reduce(
        (sum, page, index) => sum + (index > 0 ? ARTIFACT_PAGE_STACK_GAP : 0) + estimateArtifactPageHeight(containerW, page),
        0
    );
}

/** Fit page — both width and height must fit; never scale above 1. */
export function computeFitPageScale(input: {
    viewportW: number;
    viewportH: number;
    contentW: number;
    firstPageH: number;
    pad?: number;
}): number {
    const pad = input.pad ?? ARTIFACT_VIEWPORT_PAD;
    const availW = Math.max(1, input.viewportW - pad);
    const availH = Math.max(1, input.viewportH - pad);
    const contentW = Math.max(1, input.contentW);
    const firstPageH = Math.max(1, input.firstPageH);
    const scaleW = availW / contentW;
    const scaleH = availH / firstPageH;
    return clampArtifactScale(Math.min(scaleW, scaleH, 1));
}

/** Fit width — page width matches viewport; vertical scroll expected. */
export function computeFitWidthScale(input: {
    viewportW: number;
    contentW: number;
    pad?: number;
}): number {
    const pad = input.pad ?? ARTIFACT_VIEWPORT_PAD;
    const availW = Math.max(1, input.viewportW - pad);
    const contentW = Math.max(1, input.contentW);
    return clampArtifactScale(availW / contentW);
}

export function resolveArtifactScale(input: {
    mode: ArtifactScaleMode;
    viewportW: number;
    viewportH: number;
    contentW: number;
    firstPageH: number;
    manualScale: number;
    pad?: number;
}): number {
    if (input.viewportW <= 0 || input.viewportH <= 0 || input.contentW <= 0) return 1;
    if (input.mode === "manual") return clampArtifactScale(input.manualScale);
    if (input.mode === "fit-width") {
        return computeFitWidthScale({
            viewportW: input.viewportW,
            contentW: input.contentW,
            pad: input.pad,
        });
    }
    return computeFitPageScale({
        viewportW: input.viewportW,
        viewportH: input.viewportH,
        contentW: input.contentW,
        firstPageH: input.firstPageH,
        pad: input.pad,
    });
}
