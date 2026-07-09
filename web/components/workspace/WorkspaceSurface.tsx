"use client";

/**
 * @module WorkspaceSurface
 *
 * ## Purpose
 * Scrollable workspace body beneath the shell nav. Establishes the stone workspace field
 * (~4%) that white cards sit on.
 *
 * ## When to use
 * As the direct child content region inside `WorkspaceShell` for Overview landings,
 * Studio libraries, and full-page module views.
 *
 * ## Do NOT use for
 * - Module header or mode tabs (use `WorkspaceShell`).
 * - Multi-column queue/review layouts — use `tone="canvas"` only when the body is a
 *   full-bleed canvas with zone panels providing containment.
 *
 * ## Tones
 * - `stone` (default) — River Stone field; white cards provide containment.
 * - `canvas` — plain white when zone panels carry their own chrome.
 */

import type { HTMLAttributes, ReactNode } from "react";
import { WS_FIELD } from "@/components/workspace/workspaceTokens";

const TONE_CLASS = {
    stone: WS_FIELD,
    canvas: "bg-white",
} as const;

export default function WorkspaceSurface({
    children,
    tone = "stone",
    scroll = true,
    padded = true,
    className = "",
    ...rest
}: {
    children: ReactNode;
    tone?: keyof typeof TONE_CLASS;
    scroll?: boolean;
    padded?: boolean;
    className?: string;
} & HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            data-workspace-surface={tone}
            className={`flex min-h-0 flex-1 flex-col ${scroll ? "overflow-y-auto" : "overflow-hidden"} ${TONE_CLASS[tone]} ${padded ? "p-4 lg:p-5" : ""} ${className}`.trim()}
            {...rest}
        >
            {children}
        </div>
    );
}
