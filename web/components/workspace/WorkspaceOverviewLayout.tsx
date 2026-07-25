/**
 * Shared Operational Workspace overview layout primitives.
 *
 * Modules compose these for Overview landings — Processing is the reference.
 * Shell / header / mode nav stay on WorkspaceShell; this owns content width + grids only.
 *
 * @see docs/platform/core/navigation-and-workspace-doctrine.md
 */

"use client";

import type { HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";
import {
    WS_OVERVIEW_ACTION_GRID,
    WS_OVERVIEW_ACTIVITY_GRID,
    WS_OVERVIEW_CONTENT,
    WS_OVERVIEW_INFO_GRID,
    WS_OVERVIEW_INFO_PRIMARY,
    WS_OVERVIEW_STACK,
} from "@/components/workspace/workspaceTokens";

/** Overview column: responsive max-width that uses the expanded canvas at 1440–1920. */
export function WorkspaceOverviewStack({
    children,
    className,
    testId,
    ...rest
}: {
    children: ReactNode;
    className?: string;
    testId?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className">) {
    return (
        <div
            className={clsx(WS_OVERVIEW_CONTENT, WS_OVERVIEW_STACK, className)}
            data-workspace-overview-stack="true"
            data-testid={testId}
            {...rest}
        >
            {children}
        </div>
    );
}

/** Primary action card row — three cards from md up; wider gutters on xl. */
export function WorkspaceOverviewActionRow({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <section className={clsx(WS_OVERVIEW_ACTION_GRID, className)} data-workspace-overview-actions="true">
            {children}
        </section>
    );
}

/** Today's activity KPI band — 2×2 collapsing to 4 columns at lg+. */
export function WorkspaceOverviewActivityBand({
    children,
    eyebrow = "Today's activity",
    className,
    testId,
    busy,
}: {
    children: ReactNode;
    eyebrow?: string;
    className?: string;
    testId?: string;
    busy?: boolean;
}) {
    return (
        <section
            className={className}
            data-workspace-overview-activity="true"
            data-testid={testId}
            aria-busy={busy}
        >
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-alloy-midnight/35">
                {eyebrow}
            </p>
            <div className={WS_OVERVIEW_ACTIVITY_GRID}>{children}</div>
        </section>
    );
}

/**
 * Lower information zones — three columns from lg; primary zone widens at xl (2/3 + 1/3 grammar).
 * Place the primary continue/recent panel first; mark it with `WorkspaceOverviewInfoPrimary`.
 */
export function WorkspaceOverviewInfoGrid({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className={clsx(WS_OVERVIEW_INFO_GRID, className)} data-workspace-overview-info="true">
            {children}
        </div>
    );
}

/** Marks the primary information zone (Recent work / Continue conversations / Needs a decision). */
export function WorkspaceOverviewInfoPrimary({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className={clsx(WS_OVERVIEW_INFO_PRIMARY, className)} data-workspace-overview-info-primary="true">
            {children}
        </div>
    );
}
