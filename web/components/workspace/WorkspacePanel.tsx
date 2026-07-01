"use client";

/**
 * Canonical workspace panel — white surface, Bend Pine left accent, emerald header
 * band, uppercase eyebrow. Identical chrome to drawer/Communications panels.
 */

import type { ReactNode } from "react";
import { WS_EYEBROW, WS_PANEL_HEADER, WS_PANEL_SURFACE, WS_PANEL_SURFACE_FLAT } from "./workspaceTokens";

export default function WorkspacePanel({
    eyebrow,
    right,
    children,
    accent = true,
    bodyClassName = "px-3 py-2.5",
    className = "",
}: {
    eyebrow: string;
    right?: ReactNode;
    children: ReactNode;
    /** Pine left accent (default) vs. a flatter neutral panel. */
    accent?: boolean;
    bodyClassName?: string;
    className?: string;
}) {
    return (
        <section className={`${accent ? WS_PANEL_SURFACE : WS_PANEL_SURFACE_FLAT} ${className}`}>
            <div className={`flex items-center justify-between gap-2 ${WS_PANEL_HEADER}`}>
                <span className={WS_EYEBROW}>{eyebrow}</span>
                {right}
            </div>
            <div className={bodyClassName}>{children}</div>
        </section>
    );
}
