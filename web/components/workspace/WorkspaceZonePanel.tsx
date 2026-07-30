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
            {/*
              * The body MUST be a flex column. Every consumer writes its body child as
              * `min-h-0 flex-1 overflow-y-auto` (Review questions, the Processing queue rail, the
              * work-item detail pane), and `flex-1` is inert unless this parent is a flex container.
              * Without it the child sized to its full content height inside an `overflow-hidden`
              * block, so the list was CLIPPED and its own `overflow-y-auto` never activated — the
              * "Review questions panel cannot be scrolled" defect.
              */}
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        </section>
    );
}
