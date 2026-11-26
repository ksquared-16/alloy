"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore, type CSSProperties, type FocusEvent, type MouseEvent, type ReactNode } from "react";
import { commitAdminV2NavLinkNavigation } from "@/lib/adminV2/navigation/adminV2SoftNavLinkCommit";
import {
    getAdminV2NavigationTransitionSnapshot,
    subscribeAdminV2NavigationTransition,
} from "@/lib/adminV2/navigation/adminV2NavigationTransition";
import { adminV2SoftNavClickedKey } from "@/lib/adminV2/shellNavigation";
import { useAdminDrawerOptional } from "@/contexts/AdminDrawerContext";

function normalizeNavPath(path: string): string {
    if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
    return path;
}

export type AdminV2NavLinkProps = {
    href: string;
    children: ReactNode;
    className?: string;
    style?: CSSProperties;
    title?: string;
    /** Marks the current route (or section) for persistent highlight. */
    active?: boolean;
    /** When true, only `active` controls highlight (not pathname-only match). Use for ?queue= sidebar rows. */
    highlightFromActiveOnly?: boolean;
    "aria-label"?: string;
    onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
    onMouseEnter?: (e: MouseEvent<HTMLAnchorElement>) => void;
    onFocus?: (e: FocusEvent<HTMLAnchorElement>) => void;
    "data-testid"?: string;
};

/**
 * Shell navigation — soft orchestrated transition for eligible Workspace and Organization /
 * Settings routes (Configuration Continuity Checkpoint A); otherwise `adminV2CommitNavigation`
 * (full document load). Kill switch: `NEXT_PUBLIC_ADMIN_V2_SOFT_SIDEBAR_NAV=0`.
 */
export function AdminV2NavLink({
    className,
    active,
    highlightFromActiveOnly = false,
    children,
    href,
    style,
    title,
    onClick,
    onMouseEnter,
    onFocus,
    "aria-label": ariaLabel,
    "data-testid": dataTestId,
}: AdminV2NavLinkProps) {
    const pathname = usePathname();
    const router = useRouter();
    const adminDrawer = useAdminDrawerOptional();
    const hrefPath = href.split(/[?#]/)[0] ?? href;
    const isCurrentRoute = normalizeNavPath(pathname) === normalizeNavPath(hrefPath);
    const realHighlight = Boolean(active || (!highlightFromActiveOnly && isCurrentRoute));

    // IMMEDIATE ACKNOWLEDGEMENT: the nav transition snapshot is set SYNCHRONOUSLY on click (before any
    // prepare/await), so subscribing here lights up the exact item the operator clicked the instant
    // they click it — no waiting for the route (which, on a slow load, is seconds away) to change the
    // pathname-derived highlight. This is the same pending signal the workspace tiles already consume
    // (`data-adminv2-nav-pending`); the sidebar link simply wasn't wired to it. The prior current item
    // keeps its highlight (brief overlap reads as "moving from here to there") — never a blank moment
    // where the click seems to have done nothing.
    const navSnapshot = useSyncExternalStore(
        subscribeAdminV2NavigationTransition,
        getAdminV2NavigationTransitionSnapshot,
        getAdminV2NavigationTransitionSnapshot,
    );
    const isPending =
        navSnapshot.isTransitioning && navSnapshot.clickedKey === adminV2SoftNavClickedKey(href);
    const isHighlighted = realHighlight || isPending;
    const merged = [
        "adminv2-nav-link",
        isHighlighted ? "adminv2-nav-link--active" : "",
        isPending ? "adminv2-nav-link--pending" : "",
        className,
    ]
        .filter(Boolean)
        .join(" ");

    const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        commitAdminV2NavLinkNavigation(href, { closeDrawer: adminDrawer?.closeDrawer, router });
    };

    return (
        <a
            href={href}
            className={merged}
            style={style}
            title={title}
            aria-label={ariaLabel}
            aria-current={realHighlight ? "page" : undefined}
            aria-busy={isPending || undefined}
            data-adminv2-nav-pending={isPending ? "true" : undefined}
            onClick={handleClick}
            onMouseEnter={onMouseEnter}
            onFocus={onFocus}
            data-testid={dataTestId}
        >
            <span className="adminv2-nav-link__inner">{children}</span>
        </a>
    );
}
