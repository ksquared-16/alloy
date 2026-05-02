"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { shouldDisableAdminV2LinkPrefetch } from "@/app/adminV2/components/navigation/adminV2HeavyRoutePrefetch";

function hrefPathOnly(href: ComponentProps<typeof Link>["href"]): string | null {
    if (typeof href === "string") return href;
    if (href && typeof href === "object") {
        const p = (href as { pathname?: string | null }).pathname;
        if (typeof p === "string") return p;
    }
    return null;
}

function NavLinkInner({ children }: { children: ReactNode }) {
    const { pending } = useLinkStatus();
    return (
        <span
            data-adminv2-nav-pending={pending ? "true" : undefined}
            className={pending ? "adminv2-nav-link__inner adminv2-nav-link__inner--pending" : "adminv2-nav-link__inner"}
        >
            {children}
        </span>
    );
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
    const hrefStr = hrefPathOnly(rest.href);
    const resolvedPrefetch =
        prefetch !== undefined
            ? prefetch
            : hrefStr != null && shouldDisableAdminV2LinkPrefetch(hrefStr)
              ? false
              : undefined;
    const merged = ["adminv2-nav-link", active ? "adminv2-nav-link--active" : "", className].filter(Boolean).join(" ");
    return (
        <Link {...rest} prefetch={resolvedPrefetch} className={merged}>
            <NavLinkInner>{children}</NavLinkInner>
        </Link>
    );
}
