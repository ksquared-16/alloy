"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { adminV2BeforeRouteNavigation } from "@/lib/adminV2/shellNavigation";
import { shouldDisableAdminV2LinkPrefetch } from "@/app/adminV2/components/navigation/adminV2HeavyRoutePrefetch";
import { useAdminDrawerOptional } from "@/contexts/AdminDrawerContext";

function normalizeNavPath(path: string): string {
    if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
    return path;
}

function hrefPathOnly(href: ComponentProps<typeof Link>["href"]): string | null {
    if (typeof href === "string") return href;
    if (href && typeof href === "object") {
        const p = (href as { pathname?: string | null }).pathname;
        if (typeof p === "string") return p;
    }
    return null;
}

function hrefString(href: ComponentProps<typeof Link>["href"]): string | null {
    if (typeof href === "string") return href;
    if (href && typeof href === "object") {
        const pathname = (href as { pathname?: string | null }).pathname ?? "";
        const search =
            typeof (href as { search?: string | null }).search === "string"
                ? (href as { search: string }).search
                : "";
        if (!pathname) return null;
        return search ? `${pathname}${search.startsWith("?") ? search : `?${search}`}` : pathname;
    }
    return null;
}

type NextLinkProps = ComponentProps<typeof Link>;

export type AdminV2NavLinkProps = NextLinkProps & {
    /** Marks the current route (or section) for persistent highlight. */
    active?: boolean;
};

/**
 * AdminV2 shell navigation — uses explicit `router.push` on primary click so route changes
 * commit reliably (avoids soft-nav cancellation when workspace RSC work is in flight).
 * Middle-click / modified clicks still use native Link behavior.
 */
export function AdminV2NavLink({
    className,
    active,
    children,
    prefetch,
    onClick,
    href,
    ...rest
}: AdminV2NavLinkProps) {
    const pathname = usePathname();
    const router = useRouter();
    const adminDrawer = useAdminDrawerOptional();
    const hrefStr = hrefString(href);
    const hrefPath = hrefStr?.split(/[?#]/)[0] ?? hrefPathOnly(href);
    const isCurrentRoute =
        hrefPath != null && normalizeNavPath(pathname) === normalizeNavPath(hrefPath);
    const isHighlighted = Boolean(active || isCurrentRoute);
    const resolvedPrefetch =
        prefetch !== undefined
            ? prefetch
            : hrefStr != null && shouldDisableAdminV2LinkPrefetch(hrefStr)
              ? false
              : undefined;
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
        if (!hrefStr) return;
        if (isCurrentRoute && !hrefStr.includes("?")) {
            e.preventDefault();
            return;
        }
        e.preventDefault();
        adminV2BeforeRouteNavigation({ closeDrawer: adminDrawer?.closeDrawer });
        router.push(hrefStr);
    };

    return (
        <Link
            {...rest}
            href={href}
            prefetch={resolvedPrefetch === undefined ? false : resolvedPrefetch}
            className={merged}
            aria-current={isHighlighted ? "page" : undefined}
            onClick={handleClick}
        >
            <span className="adminv2-nav-link__inner">{children}</span>
        </Link>
    );
}
