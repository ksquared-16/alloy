"use client";

import type { HTMLAttributes, ReactNode } from "react";

import { WS_DIVIDER } from "@/components/workspace/workspaceTokens";

type WorkspaceSurfaceVariant = "execution" | "framed" | "landing" | "plain";

const VARIANT_CLASS: Record<WorkspaceSurfaceVariant, string> = {
    execution:
        "flex min-h-[min(22rem,65vh)] flex-1 flex-col overflow-hidden border-t border-alloy-stone/12 bg-alloy-stone/[0.02] p-3",
    framed:
        "relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-alloy-stone/20 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]",
    landing: "min-h-0 flex-1 overflow-y-auto bg-white p-4 lg:p-5",
    plain: "relative flex min-h-0 flex-1 flex-col overflow-hidden",
};

/**
 * Operational Workspace Doctrine V2 — workspace body / execution surface.
 */
export default function WorkspaceSurface({
    children,
    variant = "execution",
    className = "",
    ...rest
}: {
    children: ReactNode;
    variant?: WorkspaceSurfaceVariant;
} & HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={`${VARIANT_CLASS[variant]} ${className}`}
            data-workspace-surface={variant}
            {...rest}
        >
            {children}
        </div>
    );
}

/** Hairline separator between shell regions — re-export token class for inline use. */
export const workspaceSurfaceDividerClass = `border-b ${WS_DIVIDER}`;
