"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import type { ComponentProps, ReactNode } from "react";

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
 */
export function AdminV2NavLink({ className, active, children, ...rest }: AdminV2NavLinkProps) {
    const merged = ["adminv2-nav-link", active ? "adminv2-nav-link--active" : "", className].filter(Boolean).join(" ");
    return (
        <Link {...rest} className={merged}>
            <NavLinkInner>{children}</NavLinkInner>
        </Link>
    );
}
