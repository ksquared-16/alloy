"use client";

/**
 * @module WorkspaceDivider
 *
 * ## Purpose
 * Subtle River Stone hairline separator between workspace regions. Never black, never heavy.
 *
 * ## When to use
 * - `horizontal` — below mode nav, above workspace body, between stacked sections.
 * - `vertical` — between queue rail and workspace canvas, between canvas and inspector.
 *
 * ## Do NOT use for
 * - Card internal borders (use `WorkspaceCard` chrome).
 * - Decorative rules with strong contrast.
 */

export default function WorkspaceDivider({
    orientation = "horizontal",
    className = "",
    "data-testid": testId,
}: {
    orientation?: "horizontal" | "vertical";
    className?: string;
    "data-testid"?: string;
}) {
    const base =
        orientation === "vertical"
            ? "w-px self-stretch bg-alloy-stone/15"
            : "h-px w-full bg-alloy-stone/15";
    return (
        <span
            aria-hidden
            role="separator"
            aria-orientation={orientation}
            data-workspace-divider={orientation}
            data-testid={testId}
            className={`${base} ${className}`.trim()}
        />
    );
}
