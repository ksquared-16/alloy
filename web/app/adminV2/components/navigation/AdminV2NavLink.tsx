"use client";

import { usePathname, useRouter } from "next/navigation";
import { type CSSProperties, type FocusEvent, type MouseEvent, type ReactNode } from "react";
import { commitAdminV2NavLinkNavigation } from "@/lib/adminV2/navigation/adminV2SoftNavLinkCommit";
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
 * Shell navigation — soft orchestrated transition when `NEXT_PUBLIC_ADMIN_V2_SOFT_SIDEBAR_NAV=1`
 * and the target is an eligible workspace route; otherwise `adminV2CommitNavigation` (full document load).
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
        commitAdminV2NavLinkNavigation(href, { closeDrawer: adminDrawer?.closeDrawer, router });
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
            data-testid={dataTestId}
        >
            <span className="adminv2-nav-link__inner">{children}</span>
        </a>
    );
}
