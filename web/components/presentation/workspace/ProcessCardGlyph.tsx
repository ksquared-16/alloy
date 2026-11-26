/**
 * Presentation Runtime V2 — the ONE closed identity-glyph vocabulary.
 *
 * A single-color inline icon (currentColor; no decorative fill) keyed by the closed
 * `ProcessCardIcon` set. Shared by the process tile identity chip, the Workspace Header KPI
 * cards, and the Work View row icons so every configured glyph renders identically. The glyph
 * is domain-neutral — it never encodes a stage/view name.
 */

import type { ReactNode } from "react";
import type { ProcessCardIcon } from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";

const ICON_GLYPH: Record<ProcessCardIcon, ReactNode> = {
    grid: <path d="M5 5h4v4H5zM11 5h4v4h-4zM5 11h4v4H5zM11 11h4v4h-4z" />,
    spark: <path d="M10 3l1.2 4.2L15 8l-3.8 1.2L10 14l-1.2-4.8L5 8l3.8-0.8L10 3z" />,
    route: <path d="M4 6c0-1.1 1-2 2.2-2 1.5 0 2.5 1.2 2.8 2.6M16 14c0 1.1-1 2-2.2 2-1.5 0-2.5-1.2-2.8-2.6M6.5 8.5l7 3M6.5 11.5l7-3" />,
    users: <path d="M7 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM3 15a4 4 0 018 0M13 6v4M11 8h4" />,
    calendar: <path d="M4 6h12v10H4zM4 6l0-2M16 6l0-2M4 9h12" />,
    clipboard: <path d="M7 4h6v2H7zM5 6h10v10H5z" />,
    chart: <path d="M5 14V8M10 14V5M15 14v-4" />,
    message: <path d="M4 5h12v8H8l-4 3V5z" />,
    shield: <path d="M10 3l6 2v5c0 3.5-2.5 5.8-6 7-3.5-1.2-6-3.5-6-7V5l6-2z" />,
    book: <path d="M6 4h8v12H6zM6 4c0 0 2-1 4-1s4 1 4 1" />,
    bolt: <path d="M11 3L6 11h4l-1 6 6-9h-4l0-5z" />,
    layers: <path d="M10 4l7 3.5L10 11 3 7.5 10 4zM3 12.5L10 16l7-3.5M3 16.5L10 20l7-3.5" />,
};

export function ProcessCardGlyph({
    icon,
    className = "h-4 w-4",
    ...rest
}: {
    icon: ProcessCardIcon;
    className?: string;
} & Record<`data-${string}`, unknown>) {
    return (
        <svg
            viewBox="0 0 20 20"
            className={className}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            {...rest}
        >
            {ICON_GLYPH[icon]}
        </svg>
    );
}
