"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { AdminV2NavLink } from "@/app/adminV2/components/navigation/AdminV2NavLink";
import {
    normalizeToCanonicalAdminPath,
} from "@/lib/admin/canonicalAdminRoutes";

export type WorkspaceBreadcrumb = { href?: string | null; label: string };

function normalizedPathname(pathname: string): string {
    return normalizeToCanonicalAdminPath(pathname);
}

export function WorkspaceChrome({
    breadcrumbs,
    title,
    subtitle,
    variant = "default",
    children,
}: {
    breadcrumbs: WorkspaceBreadcrumb[];
    title: string;
    subtitle?: string;
    /** `bridge`: breadcrumbs only — main title/subtitle live in the Admin V2 department shell. */
    variant?: "default" | "bridge";
    children: ReactNode;
}) {
    const pathname = usePathname();
    const path = useMemo(() => normalizedPathname(pathname), [pathname]);

    const outer =
        variant === "bridge"
            ? "w-full max-w-none mx-0 px-0 pt-0 pb-0 space-y-1"
            : "max-w-6xl mx-auto px-4 py-6 space-y-6";

    return (
        <div className={outer}>
            <nav
                className={`${variant === "bridge" ? "adminv2-ws-inline-breadcrumb" : "text-sm"} text-alloy-midnight/60 flex flex-wrap items-center gap-1 px-1`}
                aria-label="Breadcrumb"
            >
                {breadcrumbs.map((b, i) => {
                    const isLast = i === breadcrumbs.length - 1;
                    const href = b.href?.trim() || null;
                    const showLink = Boolean(href) && !isLast;
                    const active = Boolean(
                        href && path.replace(/\/$/, "") === href.replace(/\/$/, "")
                    );

                    return (
                        <span key={`${b.label}-${i}`} className="flex items-center gap-1">
                            {i > 0 ? <span className="text-alloy-midnight/40" aria-hidden>/</span> : null}
                            {showLink && href ? (
                                <AdminV2NavLink
                                    href={href}
                                    active={active}
                                    className="px-1 -mx-0.5 py-0.5 text-alloy-midnight/75 hover:text-alloy-blue font-medium"
                                >
                                    {b.label}
                                </AdminV2NavLink>
                            ) : (
                                <span
                                    className={
                                        isLast
                                            ? "text-alloy-midnight/90 font-medium px-1 py-0.5 rounded"
                                            : "text-alloy-midnight/55 px-1 py-0.5"
                                    }
                                >
                                    {b.label}
                                </span>
                            )}
                        </span>
                    );
                })}
            </nav>
            {variant !== "bridge" ? (
                <header>
                    <p className="text-xs font-semibold tracking-wide text-alloy-forge/70">Workspace (V2 slice)</p>
                    <h1 className="text-2xl font-semibold text-alloy-midnight mt-1">{title}</h1>
                    {subtitle ? <p className="text-sm text-alloy-midnight/65 mt-2 max-w-3xl">{subtitle}</p> : null}
                </header>
            ) : null}
            {children}
        </div>
    );
}
