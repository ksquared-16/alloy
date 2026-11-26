"use client";

/**
 * @module WorkspaceCard
 *
 * ## Purpose
 * White surface card on the stone workspace field. Thin stone border, soft elevation.
 *
 * ## When to use
 * Action cards, summary panels, contained list groups inside `WorkspaceSurface`.
 *
 * ## Do NOT use for
 * - Full-width multi-column zones (use `WorkspaceZonePanel`).
 * - Module shell chrome (use `WorkspaceShell`).
 * - Record drawer sections.
 */

import type { HTMLAttributes, ReactNode } from "react";
import { WS_PANEL_SURFACE_FLAT, WS_PROCESS_TILE_CHROME, WS_PROCESS_TILE_CHROME_HOVER } from "@/components/workspace/workspaceTokens";

export default function WorkspaceCard({
    children,
    flat = false,
    interactive = false,
    padded = true,
    className = "",
    ...rest
}: {
    children: ReactNode;
    flat?: boolean;
    interactive?: boolean;
    padded?: boolean;
    className?: string;
} & HTMLAttributes<HTMLDivElement>) {
    const chrome = flat ? WS_PANEL_SURFACE_FLAT : WS_PROCESS_TILE_CHROME;
    return (
        <div
            data-workspace-card="true"
            className={`${chrome} ${interactive ? WS_PROCESS_TILE_CHROME_HOVER : ""} ${padded ? "p-4" : ""} ${className}`.trim()}
            {...rest}
        >
            {children}
        </div>
    );
}
