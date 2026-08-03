"use client";

import type { ReactNode } from "react";

import { WS_EYEBROW, WS_PANEL_SURFACE_FLAT } from "@/components/workspace/workspaceTokens";

/**
 * @module WorkspaceZonePanel
 *
 * ## Purpose
 * A flex-column zone inside a multi-column module workspace (queue rail, source document,
 * review inspector). White surface, compact header band, scrollable body.
 *
 * ## When to use
 * Inside `WorkspaceSurface` when splitting a workspace into side-by-side zones (Processing
 * Queue + canvas, Source document + Questions review).
 *
 * ## Do NOT use for
 * - Standalone landing cards (use `WorkspaceCard`).
 * - Single-section content groups (use `WorkspaceSection`).
 * - Org-level workspace panels (use Presentation Runtime surfaces).
 */

export default function WorkspaceZonePanel({
    title,
    children,
    className = "",
    headerAction,
    "data-testid": testId,
}: {
    title: string;
    children: ReactNode;
    className?: string;
    headerAction?: ReactNode;
    "data-testid"?: string;
}) {
    const zoneKey = title.toLowerCase().replace(/\s+/g, "-");
    return (
        <section
            className={`flex min-h-0 flex-col overflow-hidden ${WS_PANEL_SURFACE_FLAT} ${className}`}
            data-workspace-zone-panel={zoneKey}
            data-testid={testId}
        >
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-alloy-stone/12 bg-white px-3 py-1.5">
                <h2 className={WS_EYEBROW}>{title}</h2>
                {headerAction}
            </header>
            <div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>
        </section>
    );
}
