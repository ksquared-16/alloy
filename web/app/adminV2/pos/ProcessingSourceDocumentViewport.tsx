"use client";

/**
 * Processing source document viewport — scrollable artifact canvas with zoom controls.
 * Presentation only; preserves Regions/PDF content supplied by parent.
 */

import { useState, type ReactNode } from "react";

import WorkspaceArtifactZoomControls from "@/components/workspace/WorkspaceArtifactZoomControls";
import { WS_ARTIFACT_CANVAS, WS_ARTIFACT_VIEWPORT_SCROLL } from "@/components/workspace/workspaceTokens";

export default function ProcessingSourceDocumentViewport({
    mappingBanner,
    pdfMode = false,
    children,
}: {
    mappingBanner?: ReactNode;
    pdfMode?: boolean;
    children: ReactNode;
}) {
    const [zoom, setZoom] = useState(100);

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <WorkspaceArtifactZoomControls zoom={zoom} onZoomChange={setZoom} onFitWidth={() => setZoom(100)} />
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-1.5 pb-1.5">
                <div className={`${WS_ARTIFACT_CANVAS} min-h-0`} data-workspace-artifact-canvas="true">
                    {mappingBanner}
                    <div
                        className={`${WS_ARTIFACT_VIEWPORT_SCROLL} ${pdfMode ? "flex flex-col" : ""}`}
                        data-workspace-artifact-viewport="true"
                    >
                        <div
                            className={pdfMode ? "flex min-h-[100%] min-w-0 flex-1 flex-col" : "min-w-0 w-full"}
                            style={{ zoom: zoom / 100 }}
                        >
                            {children}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
