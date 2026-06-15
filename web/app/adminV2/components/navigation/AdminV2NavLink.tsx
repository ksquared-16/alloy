"use client";

import { usePathname } from "next/navigation";
import { type CSSProperties, type FocusEvent, type MouseEvent, type ReactNode } from "react";
import { adminV2CommitNavigation } from "@/lib/adminV2/shellNavigation";
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
};

/**
 * Shell navigation — `adminV2CommitNavigation` (full document load).
 * Avoids dead UI from cancelled `router.push` / soft `<Link>` transitions during heavy RSC work.
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
}: AdminV2NavLinkProps) {
    const pathname = usePathname();
    const adminDrawer = useAdminDrawerOptional();
    const hrefPath = href.split(/[?#]/)[0] ?? href;
    const isCurrentRoute = normalizeNavPath(pathname) === normalizeNavPath(hrefPath);
    const isHighlighted = Boolean(active || (!highlightFromActiveOnly && isCurrentRoute));
    const merged = [
        "adminv2-nav-link",
        isHighlighted ? "adminv2-nav-link--active" : "",
        className,
    ]
        .filter(Boolean)
        .join(" ");

    const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        adminV2CommitNavigation(href, { closeDrawer: adminDrawer?.closeDrawer });
    };

    return (
        <a
            href={href}
            className={merged}
            style={style}
            title={title}
            aria-label={ariaLabel}
            aria-current={isHighlighted ? "page" : undefined}
            onClick={handleClick}
            onMouseEnter={onMouseEnter}
            onFocus={onFocus}
        >
            <span className="adminv2-nav-link__inner">{children}</span>
        </a>
    );
}
