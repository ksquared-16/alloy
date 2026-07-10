"use client";

/**
 * Processing source document viewport — scrollable artifact canvas with zoom controls.
 * Fit page scales the first page to the bounded viewport (width + height); scroll reaches all pages.
 * Presentation only; preserves Regions/PDF content supplied by parent.
 */

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import WorkspaceArtifactZoomControls from "@/components/workspace/WorkspaceArtifactZoomControls";
import { WS_ARTIFACT_CANVAS, WS_ARTIFACT_VIEWPORT_SCROLL } from "@/components/workspace/workspaceTokens";
import {
    ARTIFACT_VIEWPORT_PAD,
    ARTIFACT_ZOOM_STEP,
    clampArtifactScale,
    estimateArtifactPageHeight,
    estimateArtifactStackHeight,
    resolveArtifactScale,
    type ArtifactPageLayout,
    type ArtifactScaleMode,
} from "@/lib/workspace/artifactViewportScale";

export type { ArtifactPageLayout };

export default function ProcessingSourceDocumentViewport({
    mappingBanner,
    pdfMode = false,
    pageLayouts,
    children,
}: {
    mappingBanner?: ReactNode;
    pdfMode?: boolean;
    /** PDF point dimensions per page — aspect ratio for fit-page before SVG layout settles. */
    pageLayouts?: ArtifactPageLayout[];
    children: ReactNode;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
    const [contentSize, setContentSize] = useState({ w: 0, h: 0 });
    const [firstPageHeight, setFirstPageHeight] = useState(0);
    const [scaleMode, setScaleMode] = useState<ArtifactScaleMode>("fit-page");
    const [manualScale, setManualScale] = useState(1);

    const measure = useCallback(() => {
        const scrollEl = scrollRef.current;
        const contentEl = contentRef.current;
        if (!scrollEl || !contentEl) return;

        const viewportW = scrollEl.clientWidth;
        const viewportH = scrollEl.clientHeight;
        setViewportSize({ w: viewportW, h: viewportH });

        const contentW = Math.max(0, viewportW - ARTIFACT_VIEWPORT_PAD);
        contentEl.style.width = contentW > 0 ? `${contentW}px` : "100%";
        contentEl.style.zoom = "1";

        const measuredH = contentEl.scrollHeight;
        const layoutH = pageLayouts?.length ? estimateArtifactStackHeight(contentW, pageLayouts) : 0;
        const height = Math.max(measuredH, layoutH);

        const firstPageEl = contentEl.querySelector("[data-workspace-artifact-page]");
        const measuredFirstH = firstPageEl instanceof HTMLElement ? firstPageEl.getBoundingClientRect().height : 0;
        const layoutFirstH =
            pageLayouts?.[0] && contentW > 0 ? estimateArtifactPageHeight(contentW, pageLayouts[0]) : 0;

        setContentSize({ w: contentW || viewportW, h: height });
        setFirstPageHeight(Math.max(measuredFirstH, layoutFirstH));
    }, [pageLayouts]);

    useLayoutEffect(() => {
        let cancelled = false;
        let attempts = 0;

        const runMeasure = () => {
            if (cancelled) return;
            measure();
            const scrollEl = scrollRef.current;
            if (scrollEl && scrollEl.clientHeight === 0 && attempts < 12) {
                attempts += 1;
                requestAnimationFrame(runMeasure);
            }
        };

        runMeasure();

        const scrollEl = scrollRef.current;
        const contentEl = contentRef.current;
        if (!scrollEl || !contentEl) return () => { cancelled = true; };

        const observer = new ResizeObserver(() => measure());
        observer.observe(scrollEl);
        observer.observe(contentEl);
        for (const pageEl of contentEl.querySelectorAll("[data-workspace-artifact-page]")) {
            observer.observe(pageEl);
        }

        return () => {
            cancelled = true;
            observer.disconnect();
        };
    }, [measure, children, pageLayouts, pdfMode]);

    const firstPageH = useMemo(() => {
        const layoutFirstH =
            pageLayouts?.[0] && contentSize.w > 0 ? estimateArtifactPageHeight(contentSize.w, pageLayouts[0]) : 0;
        return Math.max(firstPageHeight, layoutFirstH, 1);
    }, [firstPageHeight, pageLayouts, contentSize.w]);

    const effectiveScale = useMemo(
        () =>
            resolveArtifactScale({
                mode: scaleMode,
                viewportW: viewportSize.w,
                viewportH: viewportSize.h,
                contentW: contentSize.w,
                firstPageH,
                manualScale,
            }),
        [scaleMode, viewportSize, contentSize.w, firstPageH, manualScale]
    );

    useLayoutEffect(() => {
        const contentEl = contentRef.current;
        if (!contentEl) return;
        contentEl.style.zoom = String(effectiveScale);
    }, [effectiveScale]);

    const displayPercent = Math.round(effectiveScale * 100);

    const bumpZoom = (delta: number) => {
        const base = scaleMode === "manual" ? manualScale : effectiveScale;
        setScaleMode("manual");
        setManualScale(clampArtifactScale(base + delta));
    };

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            <WorkspaceArtifactZoomControls
                zoom={displayPercent}
                fitActive={scaleMode !== "manual"}
                onZoomIn={() => bumpZoom(ARTIFACT_ZOOM_STEP)}
                onZoomOut={() => bumpZoom(-ARTIFACT_ZOOM_STEP)}
                onFitPage={() => setScaleMode("fit-page")}
                onFitWidth={() => setScaleMode("fit-width")}
            />
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-1.5 pb-1.5">
                <div className={`${WS_ARTIFACT_CANVAS} min-h-0 flex-1`} data-workspace-artifact-canvas="true">
                    {mappingBanner ? <div className="shrink-0">{mappingBanner}</div> : null}
                    <div
                        ref={scrollRef}
                        className={`${WS_ARTIFACT_VIEWPORT_SCROLL} min-h-0 flex-1 basis-0 ${pdfMode ? "" : ""}`}
                        data-workspace-artifact-viewport="true"
                        data-workspace-artifact-scale-mode={scaleMode}
                        data-workspace-artifact-scale={displayPercent}
                    >
                        <div ref={contentRef} className={pdfMode ? "min-w-0" : "min-w-0 w-full"}>
                            {children}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
