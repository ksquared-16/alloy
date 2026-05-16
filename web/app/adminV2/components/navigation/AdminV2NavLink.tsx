"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ComponentProps, type ReactNode } from "react";
import { shouldDisableAdminV2LinkPrefetch } from "@/app/adminV2/components/navigation/adminV2HeavyRoutePrefetch";

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

type NextLinkProps = ComponentProps<typeof Link>;

export type AdminV2NavLinkProps = NextLinkProps & {
    /** Marks the current route (or section) for persistent highlight. */
    active?: boolean;
};

/**
 * Next.js App Router link with optimistic pending feedback (`useLinkStatus`)
 * and pressed/active affordances via `adminv2-nav-link` styles.
 *
 * Heavy AdminV2 targets default to `prefetch={false}` (see `adminV2HeavyRoutePrefetch.ts`).
 * Pass `prefetch={true}` to opt into viewport prefetch for a specific link when intentional.
 */
export function AdminV2NavLink({ className, active, children, prefetch, ...rest }: AdminV2NavLinkProps) {
    const pathname = usePathname();
    const hrefStr = hrefPathOnly(rest.href);
    const hrefPath = hrefStr?.split(/[?#]/)[0] ?? null;
    const isCurrentRoute =
        hrefPath != null && normalizeNavPath(pathname) === normalizeNavPath(hrefPath);
    const resolvedPrefetch =
        prefetch !== undefined
            ? prefetch
            : hrefStr != null && shouldDisableAdminV2LinkPrefetch(hrefStr)
              ? false
              : undefined;
    const merged = ["adminv2-nav-link", active ? "adminv2-nav-link--active" : "", className].filter(Boolean).join(" ");
    if (active || isCurrentRoute) {
        return (
            <span className={merged} aria-current="page">
                <span className="adminv2-nav-link__inner">{children}</span>
            </span>
        );
    }
    return (
        <Link {...rest} prefetch={resolvedPrefetch === undefined ? false : resolvedPrefetch} className={merged}>
            <span className="adminv2-nav-link__inner">{children}</span>
        </Link>
    );
}
